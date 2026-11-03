import logger from '../../shared/utils/logger.js';
import { urlMatchesPattern } from '../../shared/utils/urls.js';
import { mutateScripts } from '../storage/StorageService.js';

export class ScriptInstaller {
  constructor({ onScriptsUpdated } = {}) {
    this.onScriptsUpdated = onScriptsUpdated;
  }

  async handleScriptCreation(url, template) {
    try {
      const existing = await mutateScripts(chrome.storage, (list) => {
        const script = list.find((s) => s.targetUrls?.some((t) => urlMatchesPattern(url, t)));
        if (!script) return false;

        const lines = String(script.code ?? '').split('\n');
        let insertIndex = lines.length - 1;
        while (
          insertIndex > 0 &&
          (!lines[insertIndex].trim() || lines[insertIndex].trim() === '})();')
        ) {
          insertIndex--;
        }

        const newLines = [
          '',
          '  // Added by element selector',
          ...String(template ?? '')
            .trim()
            .split('\n')
            .map((line) => '  ' + line),
          '',
        ];

        lines.splice(insertIndex + 1, 0, ...newLines);
        script.code = lines.join('\n');
        script.updatedAt = new Date().toISOString();
        return script;
      });

      if (existing) {
        await this.onScriptsUpdated?.();
        chrome.tabs.create({
          url: `${chrome.runtime.getURL('editor/editor.html')}?id=${existing.id}`,
        });
      } else {
        const params = new URLSearchParams({ targetUrl: url, template });
        chrome.tabs.create({
          url: `${chrome.runtime.getURL('editor/editor.html')}?${params}`,
        });
      }
    } catch (error) {
      logger.error('Script creation error:', error);
    }
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
