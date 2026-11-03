import logger from '../../shared/utils/logger.js';
import {
  urlMatchesPattern,
  normalizeMatchPattern,
  normalizeRunAt,
} from '../../shared/utils/urls.js';
import { gateFor } from './adapter/scriptNormalizer.js';
import { withScriptsLock } from '../storage/StorageService.js';

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'ALREADY_EXISTS' ||
    /quota|exceeded/i.test(error?.message || '')
  );
}

// persist to storage.local
// handle errors
async function persistScripts(storageApi, scripts) {
  try {
    await storageApi.local.set({ scripts });
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      await storageApi.local
        .set({
          storageWarning: {
            message:
              'Extension storage is full. Recent changes were NOT saved. Delete or export some scripts to free space.',
            at: Date.now(),
          },
        })
        .catch(() => {});
      logger.error('Storage quota exceeded while saving scripts; changes were not applied.', error);
      return false;
    }
    throw error;
  }
}

function normalizeScript(script) {
  if (!script || typeof script !== 'object') return null;
  const targetUrls = (Array.isArray(script.targetUrls) ? script.targetUrls : [])
    .filter((u) => typeof u === 'string')
    .map(normalizeMatchPattern);

  return {
    ...script,
    id: script.id || crypto.randomUUID(),
    targetUrls,
  };
}

export class ScriptRegistry {
  constructor(storageApi, userscriptAdapter) {
    this.storageApi = storageApi;
    this.userscriptAdapter = userscriptAdapter;
    this.scripts = [];
    this.lastCacheUpdate = 0;
    this.cacheTtl = 5000;
    this.refreshLock = null;
  }

  clearCache() {
    this.scripts = [];
    this.lastCacheUpdate = 0;
  }

  isCacheValid() {
    return this.lastCacheUpdate > 0 && Date.now() - this.lastCacheUpdate <= this.cacheTtl;
  }

  async refresh() {
    if (this.refreshLock) {
      try {
        await this.refreshLock;
      } catch {
        // Ignore; fall through to fresh state below.
      }
      return this.scripts;
    }
    let resolveLock;
    this.refreshLock = new Promise((resolve) => {
      resolveLock = resolve;
    });
    try {
      const { scripts } = await this.storageApi.local.get('scripts');
      if (!Array.isArray(scripts)) {
        await this.storageApi.local.set({ corruptScriptsBackup: scripts ?? null });
        this.scripts = [];
        this.lastCacheUpdate = Date.now();
        return this.scripts;
      }

      this.scripts = scripts.map(normalizeScript).filter(Boolean);
      // only write when something was changed
      if (JSON.stringify(scripts) !== JSON.stringify(this.scripts)) {
        // re-read under the shared lock so a concurrent save isn't clobbered
        await withScriptsLock(async () => {
          const { scripts: latest } = await this.storageApi.local.get('scripts');
          if (!Array.isArray(latest)) return;
          this.scripts = latest.map(normalizeScript).filter(Boolean);
          await persistScripts(this.storageApi, this.scripts);
        });
      }
      this.lastCacheUpdate = Date.now();
      return this.scripts;
    } finally {
      this.refreshLock = null;
      resolveLock();
    }
  }

  async ensureLoaded() {
    if (!this.isCacheValid()) {
      await this.refresh();
    }

    return this.scripts;
  }

  async syncRuntimeRegistration() {
    await this.ensureLoaded();
    return this.userscriptAdapter.syncEnabledScripts(this.scripts);
  }

  async getFilteredScripts(url, runAt = null) {
    if (!url?.startsWith('http')) {
      return [];
    }

    await this.ensureLoaded();

    const normalizedRunAt = normalizeRunAt(runAt);

    return this.scripts.filter((script) => {
      if (!script.enabled) return false;
      if (normalizedRunAt && normalizeRunAt(script.runAt) !== normalizedRunAt) return false;

      const targetsMatch = script.targetUrls.some((target) => urlMatchesPattern(url, target));
      const gate = gateFor(script);
      const regexMatch = gate.includeRegexes.some((source) => testRegexSource(source, url));
      if (!targetsMatch && !regexMatch) return false;
      if (gate.excludeRegexes.some((source) => testRegexSource(source, url))) return false;

      return true;
    });
  }
}

function testRegexSource(source, url) {
  try {
    return new RegExp(source, 'i').test(url);
  } catch {
    return false;
  }
}
