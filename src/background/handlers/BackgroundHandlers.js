import { scriptMatchesUrl } from '../gmApiHandler.js';

export function createMessageHandlers({
  state,
  updateAllTabBadges,
  handleScriptCreation,
  handleGreasyForkInstall,
  refreshScriptCache,
  syncUserscriptRegistrations,
  refreshBadgeColor,
  notificationService,
  scriptUpdater,
}) {
  return {
    scriptsUpdated: async () => {
      state.clearCache();
      await refreshScriptCache();
      const syncResult = await syncUserscriptRegistrations();
      if (syncResult?.usingUserScripts === false) {
        throw new Error('Could not synchronize userscript registrations.');
      }
      await updateAllTabBadges();
      return { success: true };
    },

    settingsUpdated: async () => {
      await refreshBadgeColor();
      await updateAllTabBadges();
      return { success: true };
    },

    createScript: async (message) => {
      await handleScriptCreation(message.data.url, message.data.template);
      return { success: true };
    },

    greasyForkInstall: async (message) => {
      await handleGreasyForkInstall(message.url);
      return { success: true };
    },

    scriptFirstRun: async (message, sender) => {
      if (
        typeof message?.scriptId !== 'string' ||
        typeof sender?.documentId !== 'string' ||
        typeof sender?.tab?.id !== 'number'
      ) {
        return { result: null };
      }

      const { scripts = [] } = await chrome.storage.local.get('scripts');
      const script = Array.isArray(scripts)
        ? scripts.find((candidate) => candidate?.id === message.scriptId && candidate.enabled)
        : null;
      const url = sender.url || sender.tab.url;
      if (!script || typeof url !== 'string' || !scriptMatchesUrl(script, url)) {
        return { result: null };
      }

      return notificationService.showFirstRunNotification(script);
    },

    applyScriptUpdate: async (message) => {
      if (!scriptUpdater) throw new Error('Update service unavailable.');
      const result = await scriptUpdater.applyPendingUpdate(message?.scriptId);
      if (!result.ok) throw new Error(result.error);
      return { success: true, version: result.version };
    },

    rejectScriptUpdate: async (message) => {
      if (!scriptUpdater) throw new Error('Update service unavailable.');
      const result = await scriptUpdater.rejectPendingUpdate(message?.scriptId);
      if (!result.ok) throw new Error(result.error);
      return { success: true };
    },
  };
}
