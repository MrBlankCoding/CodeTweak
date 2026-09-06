import logger from '../shared/utils/logger.js';
import { ScriptRegistry } from '../services/scripts/ScriptRegistry.js';
import { UserScriptsAdapter } from '../services/scripts/UserScriptsAdapter.js';
import { browser } from '../shared/browserAdapter.js';
import { ScriptUpdater } from '../services/scripts/ScriptUpdater.js';

import { updateBadgeForTab, updateAllTabBadges, isIgnorableTabError } from './badgeManager.js';
import { createMessageHandlers } from './handlers/BackgroundHandlers.js';
import { DisplayService } from '../services/DisplayService.js';
import { ScriptInstaller } from '../services/scripts/ScriptInstaller.js';
import { MessageRouter } from './handlers/MessageRouter.js';

class BackgroundState {
  constructor() {
    this.ports = new Set();
    this.valueChangeListeners = new Map();
  }

  clearCache() {
    scriptRegistry.clearCache();
  }

  cleanupTab(tabId) {
    for (const listeners of this.valueChangeListeners.values()) {
      listeners.delete(tabId);
    }
  }
}

const state = new BackgroundState();
const userscriptAdapter = new UserScriptsAdapter();
const scriptRegistry = new ScriptRegistry(browser.storage, userscriptAdapter);
const scriptUpdater = new ScriptUpdater(browser.storage);
const displayService = new DisplayService();
const scriptInstaller = new ScriptInstaller();

scriptUpdater.setupAlarm();

function notifyPorts(action) {
  const disconnectedPorts = [];
  for (const port of state.ports) {
    try {
      port.postMessage({ action });
    } catch (error) {
      logger.warn('Failed to notify port:', error);
      disconnectedPorts.push(port);
    }
  }
  disconnectedPorts.forEach((port) => state.ports.delete(port));
}

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
  scriptRegistry,
  scriptUpdater,
  userscriptAdapter,
  notifyPorts,
  updateAllTabBadges: () =>
    updateAllTabBadges((tabId, url) => updateBadgeForTab(tabId, url, getFilteredScripts)),
  handleScriptCreation: (url, template) => scriptInstaller.handleScriptCreation(url, template),
  handleGreasyForkInstall: (url) => scriptInstaller.handleGreasyForkInstall(url),
  refreshScriptCache,
  syncUserscriptRegistrations,
  getFilteredScripts,
});

const messageRouter = new MessageRouter({
  state,
  scriptRegistry,
  messageHandlers,
  displayService,
});

// Event Listeners
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return messageRouter.handleMessage(message, sender, sendResponse);
});

browser.contextMenus.removeAll(() => {
  browser.contextMenus.create({
    id: 'selectElement',
    title: 'Select Element for Script',
    contexts: ['page'],
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'selectElement') {
    browser.tabs.sendMessage(tab.id, { action: 'startSelection' });
  }
});

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'CodeTweak' || state.ports.has(port)) return;

  state.ports.add(port);
  port.onDisconnect.addListener(() => state.ports.delete(port));
  port.onMessage.addListener(logger.info);
});

browser.tabs.onRemoved.addListener((tabId) => {
  state.cleanupTab(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    updateBadgeForTab(tabId, tab.url, getFilteredScripts);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    updateBadgeForTab(tab.id, tab.url, getFilteredScripts);
  } catch (error) {
    if (!isIgnorableTabError(error)) {
      logger.warn('Error getting activated tab:', error);
    }
  }
});

browser.runtime.onInstalled.addListener(async () => {
  await refreshScriptCache();
  await syncUserscriptRegistrations();
  await updateAllTabBadges((tabId, url) => updateBadgeForTab(tabId, url, getFilteredScripts));
});

browser.runtime.onStartup.addListener(async () => {
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
