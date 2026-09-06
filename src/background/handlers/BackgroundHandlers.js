import logger from '../../shared/utils/logger.js';
import { parseUserScriptMetadata } from '../../services/scripts/MetadataParser.js';
import { storageService } from '../../services/storage/StorageService.js';

export function createMessageHandlers({
  state,
  scriptUpdater,
  userscriptAdapter,
  notifyPorts,
  updateAllTabBadges,
  handleScriptCreation,
  handleGreasyForkInstall,
  refreshScriptCache,
  syncUserscriptRegistrations,
  getFilteredScripts,
}) {
  const browser = globalThis.browser ?? globalThis.chrome;

  return {
    scriptsUpdated: async () => {
      state.clearCache();
      await refreshScriptCache();
      await syncUserscriptRegistrations();
      notifyPorts('scriptsUpdated');
      await updateAllTabBadges();
      return { success: true };
    },

    createScript: async (message) => {
      await handleScriptCreation(message.data.url, message.data.template);
      return { success: true };
    },

    contentScriptReady: (_message, _sender) => {
      return { success: true };
    },

    greasyForkInstall: async (message) => {
      await handleGreasyForkInstall(message.url);
      return { success: true };
    },

    openAISettings: async () => {
      await browser.tabs.create({
        url: browser.runtime.getURL('ai_dom_editor/settings/ai_settings.html'),
      });
      return { success: true };
    },

    createScriptFromAI: async (message) => {
      const scripts = await storageService.getAllScripts();
      const metadata = parseUserScriptMetadata(message.script);

      const newScript = {
        id: crypto.randomUUID(),
        code: message.script,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        targetUrls: metadata.matches || [message.url],
        runAt: metadata.runAt || 'document_idle',
        name: metadata.name || 'New AI Script',
      };

      scripts.push(newScript);
      await storageService.saveScripts(scripts);
      state.clearCache();
      await refreshScriptCache();
      await syncUserscriptRegistrations();
      notifyPorts('scriptsUpdated');
      await updateAllTabBadges();

      return { script: newScript };
    },

    aiSettingsUpdated: () => {
      browser.runtime.sendMessage({ action: 'aiConfigUpdated' }).catch(() => {});
      return { success: true };
    },

    getScriptContent: async (message) => {
      const script =
        (await storageService.getScript(message.scriptId)) ||
        (await storageService.getAllScripts()).find((s) => s.name === message.scriptName);

      if (script) {
        return { code: script.code };
      } else {
        return { error: `Script not found: ${message.scriptName || message.scriptId}` };
      }
    },

    getAllScripts: async () => {
      const scripts = await storageService.getAllScripts();
      return { scripts };
    },

    getCurrentTab: async (_message, _sender) => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        return { tab };
      } catch (error) {
        return { error: error.message };
      }
    },

    updateScript: async (message) => {
      const scripts = await storageService.getAllScripts();
      const list = Array.isArray(scripts) ? scripts : [];
      const scriptIndex = list.findIndex((s) => s.id === message.scriptId);

      if (scriptIndex === -1) {
        return { error: `Script with id ${message.scriptId} not found.` };
      }

      list[scriptIndex].code = message.code;
      list[scriptIndex].updatedAt = new Date().toISOString();
      // Normalize sensitive flags for legacy scripts: usage in code implies grant.
      // Users opt out by editing checkboxes in the editor.
      try {
        const ScriptAnalyzer = (await import('../../services/scripts/ScriptAnalyzer.js')).default;
        if (ScriptAnalyzer?.detectGMApiUsage) {
          const detected = ScriptAnalyzer.detectGMApiUsage(message.code);
          for (const flag of [
            'gmOpenInTab',
            'gmNotification',
            'gmSetClipboard',
            'gmDownload',
            'gmXmlhttpRequest',
          ]) {
            if (list[scriptIndex][flag] !== true && detected[flag] === true) {
              list[scriptIndex][flag] = true;
            }
          }
        }
      } catch {
        // Usage analysis is best-effort; explicit editor flags still win.
      }
      await storageService.saveScripts(list);

      state.clearCache();
      await refreshScriptCache();
      await syncUserscriptRegistrations();
      notifyPorts('scriptsUpdated');
      await updateAllTabBadges();

      // Reload tabs where the script is running
      const updatedScript = list[scriptIndex];
      const queryPatterns = (
        Array.isArray(updatedScript.targetUrls) ? updatedScript.targetUrls : []
      ).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
      if (queryPatterns.length > 0) {
        try {
          const tabs = await browser.tabs.query({ url: queryPatterns });
          await Promise.allSettled(
            (Array.isArray(tabs) ? tabs : []).map((tab) =>
              tab?.id !== undefined ? browser.tabs.reload(tab.id) : Promise.resolve()
            )
          );
        } catch (error) {
          logger.warn('Failed to reload tabs after update:', error.message);
        }
      }

      return { success: true };
    },

    checkUpdates: async () => {
      try {
        await scriptUpdater.checkAndPerformUpdates();
        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    },

    getScriptsForUrl: async (message) => {
      try {
        const scripts = await getFilteredScripts(message.url);
        const scriptRegistrations = await Promise.all(
          scripts.map(async (script) => {
            const reg = await userscriptAdapter.toRegistration(script);
            return {
              id: script.id,
              code: reg.js[0].code,
              injectInto: script.injectInto,
            };
          })
        );
        return { scripts: scriptRegistrations };
      } catch (error) {
        logger.error('Error getting scripts for URL:', error);
        return { scripts: [] };
      }
    },
  };
}
