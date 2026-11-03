import { scriptMatchesUrl } from '../gmApiHandler.js';

export function createMessageHandlers({
  state,
  updateAllTabBadges,
  handleScriptCreation,
  handleGreasyForkInstall,
  refreshScriptCache,
  syncUserscriptRegistrations,
  notificationService,
}) {
  return {
    scriptsUpdated: async () => {
      state.clearCache();
      await refreshScriptCache();
      await syncUserscriptRegistrations();
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
  };
}
