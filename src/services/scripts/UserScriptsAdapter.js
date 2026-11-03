import logger from '../../shared/utils/logger.js';
import {
  ERROR_BRIDGE_ID,
  normalizeRunAt,
  normalizeMatches,
  resolveWorld,
  getRegistrationId,
  buildEnabledApis,
  buildGmInfo,
  gateFor,
  excludeGlobsFor,
  matchPatternToRegexSource,
} from './adapter/scriptNormalizer.js';
import { buildRuntimeBootstrap, buildErrorBridgeCode } from './adapter/bootstrapBuilder.js';
import { DependencyCache } from './DependencyCache.js';

// scripts using eval
// this is dangerous...
// TODO

const USER_SCRIPT_WORLD_CONFIG = {
  messaging: true,
  csp: "script-src 'self' 'unsafe-eval'; object-src 'self'",
};

function registrationFingerprint(reg) {
  return JSON.stringify([
    [...(reg.matches || [])].sort(),
    [...(reg.excludeMatches || [])].sort(),
    [...(reg.excludeGlobs || [])].sort(),
    reg.runAt || 'document_idle',
    reg.world || 'USER_SCRIPT',
    Boolean(reg.allFrames),
    (reg.js || []).map((source) => source.code ?? source.file ?? ''),
  ]);
}

export class UserScriptsAdapter {
  constructor({ dependencyCache } = {}) {
    this.api = chrome;
    this.dependencies = dependencyCache || new DependencyCache(this.api.storage);
    this.syncLock = null;
    this.worldConfigured = false;
  }

  // chrome.userScripts throws on access until the user enables
  // "Allow user scripts", so every probe is wrapped.
  get userScripts() {
    try {
      return this.api.userScripts;
    } catch {
      return undefined;
    }
  }

  isSupported() {
    try {
      return typeof this.userScripts?.register === 'function';
    } catch {
      return false;
    }
  }

  canUseUserScripts(script) {
    if (!script?.enabled || typeof script?.code !== 'string') {
      return false;
    }

    return normalizeMatches(script).length > 0 || gateFor(script).includeRegexes.length > 0;
  }

  async configureWorld() {
    if (this.worldConfigured || typeof this.userScripts?.configureWorld !== 'function') return;
    try {
      await this.userScripts.configureWorld(USER_SCRIPT_WORLD_CONFIG);
      this.worldConfigured = true;
    } catch (error) {
      logger.warn('Failed to configure user script world:', error);
    }
  }

  async toRegistration(script) {
    const world = resolveWorld(script);
    const runtimeVersion = this.api.runtime?.getManifest?.().version || '';
    const deps = await this.dependencies.resolve(script);
    const targets = normalizeMatches(script);
    const { includeRegexes, excludeRegexes } = gateFor(script);

    // Regex @include can't be expressed as a match pattern: register broadly
    // and let the page-side gate decide, with the targets folded into it.
    const hasRegexInclude = includeRegexes.length > 0;
    const gate =
      hasRegexInclude || excludeRegexes.length > 0
        ? {
            include: hasRegexInclude
              ? [...includeRegexes, ...targets.map(matchPatternToRegexSource).filter(Boolean)]
              : null,
            exclude: excludeRegexes,
          }
        : null;

    const runtimeConfig = {
      scriptId: script.id,
      scriptName: script.name || script.id,
      world,
      gate,
      enabledApis: buildEnabledApis(script),
      resources: deps.resources,
      missingDependencies: deps.missing,
      gmInfo: buildGmInfo(script, runtimeVersion, world),
    };

    const registration = {
      id: getRegistrationId(script.id),
      matches: hasRegexInclude ? ['*://*/*'] : targets,
      runAt: normalizeRunAt(script.runAt, 'document_idle'),
      world,
      allFrames: script.noframes !== true,
      js: [{ code: buildRuntimeBootstrap(runtimeConfig, script.code, deps.requires) }],
    };
    const excludeGlobs = excludeGlobsFor(script);
    if (excludeGlobs.length > 0) registration.excludeGlobs = excludeGlobs;
    return registration;
  }

  // Main World scripts can only report errors through postMessage; this
  // registration relays them from the USER_SCRIPT world to the background.
  buildErrorBridge(registrations) {
    const matches = new Set();
    for (const reg of registrations) {
      if (reg.world === 'MAIN') reg.matches.forEach((match) => matches.add(match));
    }
    if (matches.size === 0) return null;
    return {
      id: ERROR_BRIDGE_ID,
      matches: [...matches].sort(),
      runAt: 'document_start',
      world: 'USER_SCRIPT',
      allFrames: true,
      js: [{ code: buildErrorBridgeCode() }],
    };
  }

  async syncEnabledScripts(scripts) {
    while (this.syncLock) {
      try {
        await this.syncLock;
      } catch {
        // Ignore
      }
    }

    let resolveLock;
    this.syncLock = new Promise((resolve) => {
      resolveLock = resolve;
    });

    try {
      return await this._doSyncEnabledScripts(scripts);
    } finally {
      this.syncLock = null;
      resolveLock();
    }
  }

  async registerEach(registrations) {
    const failed = [];
    for (const reg of registrations) {
      try {
        await this.userScripts.register([reg]);
      } catch (error) {
        logger.error(`Skipping script ${reg.id}:`, error);
        failed.push(reg.id);
      }
    }
    return failed;
  }

  async _doSyncEnabledScripts(scripts) {
    if (!this.isSupported()) {
      logger.warn('userScripts API unavailable; enable "Allow user scripts" for CodeTweak.');
      return { usingUserScripts: false };
    }

    let existing;
    try {
      existing = await this.userScripts.getScripts();
    } catch (error) {
      logger.warn('userScripts API unavailable:', error);
      return { usingUserScripts: false };
    }

    await this.configureWorld();

    const desired = new Map();
    for (const script of scripts.filter((s) => this.canUseUserScripts(s))) {
      try {
        const reg = await this.toRegistration(script);
        if (!desired.has(reg.id)) desired.set(reg.id, reg);
      } catch (error) {
        logger.error(`Failed to build registration for ${script.id}:`, error);
      }
    }
    const bridge = this.buildErrorBridge([...desired.values()]);
    if (bridge) desired.set(bridge.id, bridge);

    const existingById = new Map((existing || []).map((reg) => [reg.id, reg]));
    const toRemove = [...existingById.keys()].filter((id) => !desired.has(id));
    const toAdd = [];
    const toUpdate = [];
    for (const reg of desired.values()) {
      const current = existingById.get(reg.id);
      if (!current) toAdd.push(reg);
      else if (registrationFingerprint(current) !== registrationFingerprint(reg))
        toUpdate.push(reg);
    }

    try {
      if (toRemove.length > 0) {
        await this.userScripts.unregister({ ids: toRemove });
      }

      if (toUpdate.length > 0) {
        try {
          await this.userScripts.update(toUpdate);
        } catch (error) {
          logger.warn('Batch update failed, re-registering individually:', error);
          await this.userScripts.unregister({ ids: toUpdate.map((reg) => reg.id) }).catch(() => {});
          toAdd.push(...toUpdate);
        }
      }

      if (toAdd.length > 0) {
        try {
          await this.userScripts.register(toAdd);
        } catch (error) {
          logger.warn('Batch registration failed, trying individually:', error);
          await this.registerEach(toAdd);
        }
      }
    } catch (error) {
      logger.error('Failed to sync registrations:', error);
      return { usingUserScripts: false };
    }

    this.dependencies.prune(scripts).catch((error) => {
      logger.debug('Dependency cache prune failed:', error);
    });

    return {
      usingUserScripts: true,
      added: toAdd.length,
      updated: toUpdate.length,
      removed: toRemove.length,
    };
  }
}
