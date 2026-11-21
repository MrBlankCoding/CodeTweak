import logger from '../../shared/utils/logger.js';
import { generateUrlMatchPattern, isValidWebpage } from '../../shared/utils/urls.js';

export class ScriptInstaller {
  constructor({ onScriptsUpdated } = {}) {
    this.onScriptsUpdated = onScriptsUpdated;
  }

  // Element picker: always opens a new, unsaved script for the current site,
  // so nothing changes until the user reviews and saves it.
  async handleScriptCreation(url, template) {
    const params = new URLSearchParams({ template: String(template ?? '') });
    const pattern = generateUrlMatchPattern(url, 'domain');
    if (pattern && isValidWebpage(url)) params.set('targetUrl', pattern);
    await chrome.tabs.create({
      url: `${chrome.runtime.getURL('editor/editor.html')}?${params}`,
    });
  }

  async handleGreasyForkInstall(url) {
    try {
      if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
        throw new Error('Only https URLs may be installed.');
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const code = await response.text();
      const tempId = crypto.randomUUID();
      const key = `tempImport_${tempId}`;

      await chrome.storage.local.set({ [key]: { code, sourceUrl: url } });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL('editor/editor.html')}?importId=${tempId}`,
      });
    } catch (err) {
      logger.error('GreasyFork install fetch error:', err);
    }
  }
}
