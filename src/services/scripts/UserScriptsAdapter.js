import logger from '../../shared/utils/logger.js';
import { getBrowserApi } from '../../shared/browserAdapter.js';
import {
  REGISTRATION_PREFIX,
  normalizeRunAt,
  normalizeMatches,
  normalizeInjectInto,
  getRegistrationId,
  buildEnabledApis,
  buildResourceMaps,
  buildGmInfo,
} from './adapter/scriptNormalizer.js';
import { buildRuntimeBootstrap } from './adapter/bootstrapBuilder.js';
import { ScriptingEngine } from '../scriptingEngine.js';

const REGISTRATION_STORE_KEY = 'userScriptRegistrationIds';

export class UserScriptsAdapter {
  constructor() {
    this.api = getBrowserApi();
    this.engine = new ScriptingEngine(this.api);
    this.syncLock = null;
  }

  isSupported() {
    const userScriptsApi = this.api.userScripts;
    const scriptingApi = this.api.scripting;

    const hasUserScripts = Boolean(
      userScriptsApi &&
      typeof userScriptsApi.register === 'function' &&
      typeof userScriptsApi.unregister === 'function'
    );

    const hasScripting = Boolean(
      scriptingApi &&
      typeof scriptingApi.registerContentScripts === 'function' &&
      typeof scriptingApi.unregisterContentScripts === 'function'
    );

    return hasUserScripts || hasScripting;
  }

  canUseUserScripts(script) {
    if (!script?.enabled || typeof script?.code !== 'string') {
      return false;
    }

    return normalizeMatches(script).length > 0;
  }

  async getStoredRegistrationIds() {
    const result = await this.api.storage.local.get(REGISTRATION_STORE_KEY);
    const stored = result[REGISTRATION_STORE_KEY];
    if (!Array.isArray(stored)) return new Set();
    return new Set(
      stored.filter((id) => typeof id === 'string' && id.startsWith(REGISTRATION_PREFIX))
    );
  }

  async setStoredRegistrationIds(ids) {
    await this.api.storage.local.set({
      [REGISTRATION_STORE_KEY]: [...ids],
    });
  }

  async toRegistration(script) {
    const storageKey = `script-values-${script.id}`;
    const valuesResult = await this.api.storage.local.get(storageKey);
    const resources = buildResourceMaps(script);

    const runtimeVersion = this.api.runtime?.getManifest?.().version || '';

    const runtimeConfig = {
      scriptId: script.id,
      scriptName: script.name || script.id,
      extensionId: this.api.runtime?.id || '',
      enabledApis: buildEnabledApis(script),
      initialValues: valuesResult[storageKey] || {},
      requires: Array.isArray(script.requires) ? script.requires : [],
      resourceContents: resources.contents,
      resourceURLs: resources.urls,
      gmInfo: buildGmInfo(script, runtimeVersion),
    };

    return {
      id: getRegistrationId(script.id),
      matches: normalizeMatches(script),
      runAt: normalizeRunAt(script.runAt, 'document_idle'),
      world: normalizeInjectInto(script.injectInto),
      js: [
        {
          code: buildRuntimeBootstrap(runtimeConfig, script.code),
        },
      ],
    };
  }

  async syncEnabledScripts(scripts) {
    if (this.syncLock) {
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

  async _doSyncEnabledScripts(scripts) {
    const enabledScripts = scripts.filter((script) => script.enabled);

    if (!this.isSupported()) {
      logger.error('Neither userScripts nor scripting API is available.');
      return {
        usingUserScripts: false,
      };
    }

    const effectiveApi = await this.engine.getEffectiveApi();
    const previousIds = await this.getStoredRegistrationIds();

    const eligible = enabledScripts.filter((script) => this.canUseUserScripts(script));
    const registrations = await Promise.all(eligible.map((script) => this.toRegistration(script)));

    // Filter out duplicates by ID before processing.
    const uniqueRegistrations = [];
    const seenIds = new Set();
    for (const reg of registrations) {
      if (!seenIds.has(reg.id)) {
        uniqueRegistrations.push(reg);
        seenIds.add(reg.id);
      }
    }

    const nextIds = new Set(uniqueRegistrations.map((entry) => entry.id));

    const idsToRemove = [...previousIds];
    const registrationsToAdd = uniqueRegistrations;

    try {
      if (idsToRemove.length > 0) {
        try {
          await this.engine.unregister(effectiveApi, idsToRemove);
        } catch (e) {
          logger.debug('Cleanup failed:', e);
        }
      }

      if (registrationsToAdd.length > 0) {
        let succeededIds = nextIds;
        try {
          await this.engine.register(effectiveApi, registrationsToAdd);
        } catch (error) {
          logger.warn('Batch registration failed, trying individually:', error);
          succeededIds = new Set();
          for (const reg of registrationsToAdd) {
            try {
              await this.engine.register(effectiveApi, [reg]);
              succeededIds.add(reg.id);
            } catch (regError) {
              logger.error(`Skipping script ${reg.id}:`, regError);
            }
          }
        }

        await this.setStoredRegistrationIds(succeededIds);

        return {
          usingUserScripts: succeededIds.size > 0,
        };
      }

      await this.setStoredRegistrationIds(nextIds);

      return {
        usingUserScripts: true,
      };
    } catch (error) {
      logger.error('Failed to sync registrations:', error);

      try {
        if (previousIds.size > 0) {
          await this.engine.unregister(effectiveApi, [...previousIds]);
        }
      } catch (cleanupError) {
        logger.debug('Cleanup unregister failed:', cleanupError);
      }

      await this.setStoredRegistrationIds(new Set());

      return {
        usingUserScripts: false,
      };
    }
  }
}
