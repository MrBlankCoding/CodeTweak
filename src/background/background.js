import logger from '../shared/utils/logger.js';
import { ScriptRegistry } from '../services/scripts/ScriptRegistry.js';
import { UserScriptsAdapter } from '../services/scripts/UserScriptsAdapter.js';
import { ScriptUpdater } from '../services/scripts/ScriptUpdater.js';

import { updateBadgeForTab, updateAllTabBadges, isIgnorableTabError } from './badgeManager.js';
import { createMessageHandlers } from './handlers/BackgroundHandlers.js';
import { DisplayService } from '../services/DisplayService.js';
import { ScriptInstaller } from '../services/scripts/ScriptInstaller.js';
import { MessageRouter } from './handlers/MessageRouter.js';
import { PushService } from './pushService.js';
import { DependencyCache } from '../services/scripts/DependencyCache.js';
import { ensurePageTools } from '../shared/utils/pageTools.js';
import { NotificationService } from '../services/NotificationService.js';

class BackgroundState {
  constructor() {
    this.push = new PushService(chrome);
  }

  clearCache() {
    scriptRegistry.clearCache();
  }

  cleanupTab(tabId) {
    this.push.removeTab(tabId).catch(() => {});
  }
}

const state = new BackgroundState();
const dependencyCache = new DependencyCache(chrome.storage);
const userscriptAdapter = new UserScriptsAdapter({ dependencyCache });
const scriptRegistry = new ScriptRegistry(chrome.storage, userscriptAdapter);
// For changes made here (auto-update, element selector): runtime.sendMessage
// never reaches this worker's own listener, so sync directly, then tell any
// open extension pages to refresh.
async function onBackgroundScriptsChange() {
  await messageHandlers.scriptsUpdated();
  chrome.runtime.sendMessage({ action: 'scriptsUpdated' })?.catch?.(() => {});
}

const scriptUpdater = new ScriptUpdater(chrome.storage, {
  dependencyCache,
  onScriptsUpdated: onBackgroundScriptsChange,
});
const displayService = new DisplayService();
const scriptInstaller = new ScriptInstaller({ onScriptsUpdated: onBackgroundScriptsChange });
const notificationService = new NotificationService();

scriptUpdater.setupAlarm();

async function getFilteredScripts(url, runAt = null) {
  return scriptRegistry.getFilteredScripts(url, runAt);
}

async function refreshScriptCache() {
  await scriptRegistry.refresh();
}

async function syncUserscriptRegistrations() {
  await scriptRegistry.ensureLoaded();
  const result = await scriptRegistry.syncRuntimeRegistration();
  logger.info('Runtime sync:', {
    usingUserScripts: result.usingUserScripts,
  });
}

const messageHandlers = createMessageHandlers({
  state,
  updateAllTabBadges: () =>
    updateAllTabBadges((tabId, url) => updateBadgeForTab(tabId, url, getFilteredScripts)),
  handleScriptCreation: (url, template) => scriptInstaller.handleScriptCreation(url, template),
  handleGreasyForkInstall: (url) => scriptInstaller.handleGreasyForkInstall(url),
  notificationService,
  refreshScriptCache,
  syncUserscriptRegistrations,
});

const messageRouter = new MessageRouter({
  state,
  scriptRegistry,
  messageHandlers,
  displayService,
});

// Event Listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return messageRouter.handleMessage(message, sender, sendResponse);
});

// GM API calls arrive only from the USER_SCRIPT world, which page scripts
// cannot reach.
chrome.runtime.onUserScriptMessage?.addListener((message, sender, sendResponse) => {
  return messageRouter.handleUserScriptMessage(message, sender, sendResponse);
});

chrome.notifications?.onClicked?.addListener((notificationId) => {
  state.push.notificationEvent(notificationId, 'click').catch(() => {});
  chrome.notifications.clear(notificationId, () => {});
});

chrome.notifications?.onClosed?.addListener((notificationId) => {
  state.push.notificationEvent(notificationId, 'done').catch(() => {});
});

chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'selectElement',
    title: 'Select Element for Script',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'selectElement' || typeof tab?.id !== 'number') return;
  try {
    await ensurePageTools(tab.id);
  } catch (error) {
    logger.warn('Cannot inject element selector:', error?.message);
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  state.cleanupTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    updateBadgeForTab(tabId, tab.url, getFilteredScripts);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateBadgeForTab(tab.id, tab.url, getFilteredScripts);
  } catch (error) {
    if (!isIgnorableTabError(error)) {
      logger.warn('Error getting activated tab:', error);
    }
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await refreshScriptCache();
  await syncUserscriptRegistrations();
  await updateAllTabBadges((tabId, url) => updateBadgeForTab(tabId, url, getFilteredScripts));
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshScriptCache();
  await syncUserscriptRegistrations();
  await updateAllTabBadges((tabId, url) => updateBadgeForTab(tabId, url, getFilteredScripts));
});

// Initialization routine
(async () => {
  try {
    await refreshScriptCache();
    await syncUserscriptRegistrations();
  } catch (error) {
    logger.error('Initial runtime registration sync failed:', error);
  }
})();
