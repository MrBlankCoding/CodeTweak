import { urlMatchesPattern } from "../utils/urls.js";
import { injectScriptsForStage, INJECTION_TYPES, clearInjectedCoreScriptsForTab } from "../utils/inject.js";

// State management
class BackgroundState {
  constructor() {
    this.scriptCache = null;
    this.lastCacheUpdate = 0;
    this.cacheTtl = 5000;
    this.ports = new Set();
    this.executedScripts = new Map();
    this.creatingOffscreenDocument = null;
  }

  clearCache() {
    this.scriptCache = null;
    this.lastCacheUpdate = 0;
  }

  isCacheValid() {
    return (
      this.scriptCache && Date.now() - this.lastCacheUpdate <= this.cacheTtl
    );
  }
}

const state = new BackgroundState();

// Utility functions
// :)
function safeSetBadge(tabId, text = "", color = "#007bff") {
  chrome.action.setBadgeText({ tabId, text }).catch((err) => {
    if (!isIgnorableTabError(err)) {
      console.warn(`Error setting badge for tab ${tabId}:`, err.message);
    }
  });

  if (text) {
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  }
}

function isIgnorableTabError(error) {
  const ignorableMessages = [
    "No tab with id",
    "Invalid tab ID",
    "Receiving end does not exist",
  ];
  return ignorableMessages.some((msg) => error.message?.includes(msg));
}

function notifyPorts(action) {
  const disconnectedPorts = [];

  for (const port of state.ports) {
    try {
      port.postMessage({ action });
    } catch (error) {
      console.warn("Failed to notify port:", error);
      disconnectedPorts.push(port);
    }
  }

  disconnectedPorts.forEach((port) => state.ports.delete(port));
}

// Script management
async function getFilteredScripts(url, runAt = null) {
  if (!url?.startsWith("http")) {
    return [];
  }
  if (!state.isCacheValid()) {
    await refreshScriptCache();
  }

  const filteredScripts = state.scriptCache.filter(
    (script) =>
      script.enabled &&
      (!runAt || script.runAt === runAt) &&
      script.targetUrls.some((target) => urlMatchesPattern(url, target))
  );
  return filteredScripts;
}

async function refreshScriptCache() {
  const { scripts = [] } = await chrome.storage.local.get("scripts");

  state.scriptCache = scripts.map((script) => ({
    ...script,
    id: script.id || crypto.randomUUID(),
    targetUrls: script.targetUrls || [script.targetUrl].filter(Boolean),
  }));

  await chrome.storage.local.set({ scripts: state.scriptCache });
  state.lastCacheUpdate = Date.now();
}

async function updateBadgeForTab(tabId, url) {
  if (!url?.startsWith("http")) {
    safeSetBadge(tabId);
    return;
  }

  try {
    const scriptsToRun = await getFilteredScripts(url);
    const count = scriptsToRun.length;
    safeSetBadge(tabId, count > 0 ? count.toString() : "");
  } catch (error) {
    console.error(`Error updating badge for tab ${tabId}:`, error);
    safeSetBadge(tabId);
  }
}

async function updateAllTabBadges() {
  const tabs = await chrome.tabs.query({});

  tabs.forEach((tab) => {
    if (tab.id) {
      if (tab.url) {
        updateBadgeForTab(tab.id, tab.url);
      } else {
        safeSetBadge(tab.id);
      }
    }
  });
}

// Script creation
async function handleScriptCreation(url, template) {
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const existing = scripts.find((s) =>
      s.targetUrls?.some((t) => urlMatchesPattern(url, t))
    );

    if (existing) {
      const lines = existing.code.split("\n");
      let insertIndex = lines.length - 1;

      // Find insertion point (skip empty lines and closing IIFE)
      while (
        insertIndex > 0 &&
        (!lines[insertIndex].trim() || lines[insertIndex].trim() === "})();")
      ) {
        insertIndex--;
      }

      const newLines = [
        "",
        "  // Added by element selector",
        ...template
          .trim()
          .split("\n")
          .map((line) => "  " + line),
        "",
      ];

      lines.splice(insertIndex + 1, 0, ...newLines);
      existing.code = lines.join("\n");
      existing.updatedAt = new Date().toISOString();

      await chrome.storage.local.set({ scripts });
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor/editor.html")}?id=${existing.id}`,
      });
    } else {
      const params = new URLSearchParams({ targetUrl: url, template });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor/editor.html")}?${params}`,
      });
    }
  } catch (error) {
    console.error("Script creation error:", error);
  }
}
// Capture the greasyfork script
async function handleGreasyForkInstall(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const code = await response.text();

    const tempId = crypto.randomUUID();
    const key = `tempImport_${tempId}`;
    await chrome.storage.local.set({ [key]: { code, sourceUrl: url } });

    chrome.tabs.create({
      url: `${chrome.runtime.getURL("editor/editor.html")}?importId=${tempId}`,
    });
  } catch (err) {
    console.error("GreasyFork install fetch error:", err);
  }
}

async function handleCrossOriginXmlhttpRequest(details, tabId, sendResponse) {
  const { settings = {} } = await chrome.storage.local.get("settings");
  if (!settings.allowExternalResources) {
    sendResponse({ error: "Cross-origin requests are disabled by a security setting." });
    return;
  }

  const { url, method = "GET", headers, data } = details;

  if (!url) {
    console.error("CodeTweak: Cross-origin XMLHttprequest failed: No URL provided.");
    sendResponse({ error: "No URL provided." });
    return;
  }

  const requestOptions = {
    method,
    headers,
  };

  // Only add body for methods that support it
  if (data && !["GET", "HEAD"].includes(method.toUpperCase())) {
    requestOptions.body = data;
  }

  try {
    const response = await fetch(url, requestOptions);

    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });

    const responseType = details.responseType;
    let responseData;
    
    // Clone the response to be able to read the body twice
    const responseForText = response.clone();
    const responseText = await responseForText.text();

    if (responseType === "blob") {
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      responseData = await new Promise(resolve => {
        reader.onloadend = () => {
          resolve(reader.result);
        };
      });
    } else if (responseType === "arraybuffer") {
      responseData = await response.arrayBuffer();
    } else if (responseType === "json") {
      responseData = JSON.parse(responseText);
    } else { // text
      responseData = responseText;
    }

    const result = {
      readyState: 4,
      responseHeaders: Object.entries(responseHeaders).map(([name, value]) => `${name}: ${value}`).join("\n"),
      responseText: responseText,
      response: responseData,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      context: details.context,
    };
    sendResponse({ result });
  } catch (error) {
    console.error("CodeTweak: Cross-origin XMLHttprequest failed:", {
      error: error,
      url: url,
      method: method,
      headers: headers
    });
    sendResponse({ error: error.message });
  }
}
// hi.
function normalizeStackTrace(stack) {
  if (!stack) return '';
  return stack
    .replace(/blob:[^\s)]+/g, 'blob:URL')
    .replace(/:\d+:\d+/g, '')
    .replace(/at\s+blob:URL/g, 'at blob:URL')
    .trim();
}

// Script error handeling
// Needs a rework
async function storeScriptError(scriptId, error) {
  try {
    const storageKey = `scriptErrors_${scriptId}`;
    const { [storageKey]: existingErrors = [] } = await chrome.storage.local.get(storageKey);
    const normalizedNewStack = normalizeStackTrace(error.stack);
    
    // Check for dupes
    const isDuplicate = existingErrors.some(existingError => {
      const normalizedExistingStack = normalizeStackTrace(existingError.stack);
      return existingError.message === error.message && 
             normalizedExistingStack === normalizedNewStack;
    });
    
    if (isDuplicate) {
      return; 
    }
    
    const updatedErrors = [error, ...existingErrors];
    if (updatedErrors.length > 50) {
      updatedErrors.splice(50);
    }
    
    await chrome.storage.local.set({ [storageKey]: updatedErrors });
    chrome.runtime.sendMessage({
      type: 'SCRIPT_ERROR_UPDATE',
      scriptId: scriptId,
      error: error
    }).catch(() => {
      // Editor might not be open, ignore
    });
  } catch (err) {
    console.error('[CodeTweak Error Storage] Failed to store script error:', err);
  }
}

async function clearScriptErrors(scriptId) {
  try {
    const storageKey = `scriptErrors_${scriptId}`;
    await chrome.storage.local.remove(storageKey);
  } catch (err) {
    console.error('Failed to clear script errors:', err);
  }
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[CodeTweak] Message received:", message.type || message.action);

  if (message.type === "GM_API_REQUEST") {
    if (!message.payload) {
      console.error("[CodeTweak] GM_API_REQUEST received with no payload.");
      sendResponse({ error: "Request payload is missing." });
      return true;
    }
    const { action, ...payload } = message.payload;

    if (action === "getSettings") {
      chrome.storage.local.get("settings").then(({ settings = {} }) => {
        sendResponse({ result: settings });
      });
      return true;
    } else if (action === "xmlhttpRequest") {
      // Still not working properly....
      handleCrossOriginXmlhttpRequest(payload.details, sender.tab.id, sendResponse);
      return true;
    } else {
      chrome.tabs.sendMessage(sender.tab.id, message, sendResponse);
      return true; // Async response
    }
  }
  // Some errors around here.... not all errors being captured 
  if (message.type === "SCRIPT_ERROR") {
    storeScriptError(message.scriptId, message.error);
    sendResponse({ success: true });
    return false;
  }

  if (message.type === "CLEAR_SCRIPT_ERRORS") {
    clearScriptErrors(message.scriptId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_SCRIPT_ERRORS") {
    const storageKey = `scriptErrors_${message.scriptId}`;
    chrome.storage.local.get(storageKey).then((result) => {
      const errors = result[storageKey] || [];
      sendResponse({ errors });
    });
    return true;
  }

  if (message.type === "offscreen-clipboard-response") {
    return false; // Handled by promise in handleSetClipboard
  }

  const messageHandlers = {
    scriptsUpdated: () => {
      state.clearCache();
      notifyPorts("scriptsUpdated");
      updateAllTabBadges();
      sendResponse({ success: true });
    },

    createScript: () => {
      handleScriptCreation(message.data.url, message.data.template);
    },

    contentScriptReady: () => {
      if (sender.tab?.id) {
        state.executedScripts.set(sender.tab.id, new Set());
      }
    },

    greasyForkInstall: () => {
      handleGreasyForkInstall(message.url);
    },
  };

  const handler = messageHandlers[message.action];
  if (handler) {
    handler();
    return false;
  }

  sendResponse({ error: "Unknown action" });
  return false;
});

// Context menu
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: "selectElement",
    title: "Select Element for Script",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "selectElement") {
    chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
  }
});

// Port connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "CodeTweak" || state.ports.has(port)) return;

  state.ports.add(port);
  port.onDisconnect.addListener(() => state.ports.delete(port));
  port.onMessage.addListener(console.log);
});

// Web navigation injection
const navigationEvents = ["onCommitted", "onDOMContentLoaded", "onCompleted"];
navigationEvents.forEach((event, index) => {
  chrome.webNavigation[event].addListener((details) => {
    if (event === "onCommitted" && details.frameId === 0) {
      clearInjectedCoreScriptsForTab(details.tabId);
    }
    injectScriptsForStage(
      details,
      Object.values(INJECTION_TYPES)[index],
      getFilteredScripts,
      state.executedScripts
    )
  });
});

// Event listners for tab actions
chrome.tabs.onRemoved.addListener((tabId) => {
  state.executedScripts.delete(tabId);
  clearInjectedCoreScriptsForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateBadgeForTab(tab.id, tab.url);
  } catch (error) {
    // Tab could of been closed
    if (!isIgnorableTabError(error)) {
      console.warn("Error getting activated tab:", error);
    }
  }
});

// Lifecycle stuff
chrome.runtime.onInstalled.addListener(updateAllTabBadges);
chrome.runtime.onStartup.addListener(updateAllTabBadges);
