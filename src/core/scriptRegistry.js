import { urlMatchesPattern, normalizeMatchPattern } from '../utils/urls.js';

function normalizeScript(script) {
  const targetUrls = (script.targetUrls || [script.targetUrl].filter(Boolean)).map(
    normalizeMatchPattern
  );

  return {
    ...script,
    id: script.id || crypto.randomUUID(),
    targetUrls,
  };
}

function normalizeRunAt(runAt) {
  if (!runAt) return null;
  return runAt.replace(/-/g, '_');
}

export class ScriptRegistry {
  constructor(storageApi, userscriptAdapter) {
    this.storageApi = storageApi;
    this.userscriptAdapter = userscriptAdapter;
    this.scripts = [];
    this.lastCacheUpdate = 0;
    this.cacheTtl = 5000;
  }

  clearCache() {
    this.scripts = [];
    this.lastCacheUpdate = 0;
  }

  isCacheValid() {
    return this.lastCacheUpdate > 0 && Date.now() - this.lastCacheUpdate <= this.cacheTtl;
  }

  async refresh() {
    const { scripts = [] } = await this.storageApi.local.get('scripts');
    this.scripts = scripts.map(normalizeScript);
    await this.storageApi.local.set({ scripts: this.scripts });
    this.lastCacheUpdate = Date.now();
    return this.scripts;
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
