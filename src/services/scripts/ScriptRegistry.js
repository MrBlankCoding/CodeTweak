import {
  urlMatchesPattern,
  normalizeMatchPattern,
  normalizeRunAt,
} from '../../shared/utils/urls.js';

function normalizeScript(script) {
  if (!script || typeof script !== 'object') return null;
  const raw = script.targetUrls || [script.targetUrl].filter(Boolean);
  const targetUrls = (Array.isArray(raw) ? raw : [raw])
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
      await this.storageApi.local.set({ scripts: this.scripts });
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
      if (!script.targetUrls.some((target) => urlMatchesPattern(url, target))) return false;
      return true;
    });
  }
}
