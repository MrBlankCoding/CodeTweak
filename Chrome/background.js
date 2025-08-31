import { urlMatchesPattern } from "./utils/urlMatchPattern.js";
import { injectScriptsForStage, INJECTION_TYPES } from "./utils/inject.js";

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
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

// Utility functions
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
  if (!state.isCacheValid()) {
    await refreshScriptCache();
  }

  return state.scriptCache.filter(
    (script) =>
      script.enabled &&
      (!runAt || script.runAt === runAt) &&
      script.targetUrls.some((target) => urlMatchesPattern(url, target))
  );
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

// GM API handlers
const gmApiHandlers = {
  async setValue(message) {
    await chrome.storage.local.set({ [message.name]: message.value });
    return undefined;
  },

  async getValue(message) {
    const data = await chrome.storage.local.get(message.name);
    return data[message.name] === undefined
      ? message.defaultValue
      : data[message.name];
  },

  async deleteValue(message) {
    await chrome.storage.local.remove(message.name);
    return undefined;
  },

  async listValues() {
    const allItems = await chrome.storage.local.get(null);
    return Object.keys(allItems);
  },

  async openInTab(message) {
    const tabOptions = { url: message.url };

    if (message.options) {
      if (typeof message.options.active === "boolean") {
        tabOptions.active = message.options.active;
      } else if (typeof message.options.loadInBackground === "boolean") {
        tabOptions.active = !message.options.loadInBackground;
      }
    }

    const newTab = await chrome.tabs.create(tabOptions);
    return { id: newTab.id, url: newTab.url };
  },

  async notification(message) {
    const options = {
      type: message.details.image ? "image" : "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: message.details.title || "Notification",
      message: message.details.text || "",
    };

    if (message.details.image) {
      options.imageUrl = message.details.image;
    }

    const notificationId = `gm_notification_${Date.now()}`;
    await chrome.notifications.create(notificationId, options);
    return notificationId;
  },

  async setClipboard(message) {
    return handleSetClipboard(message);
  },

  // Cross-origin XHR via fetch
  async xmlhttpRequest(message) {
    const details = message.details || {};

    if (!details.url) {
      throw new Error("GM_xmlhttpRequest: 'url' is required");
    }

    const fetchInit = {
      method: details.method || "GET",
      headers: details.headers || {},
      // Allow sending cookies for same-origin if desired
      credentials: details.synchronous ? "include" : "same-origin",
    };

    // Request body
    if (details.data !== undefined) {
      if (details.binary && details.data instanceof Blob) {
        fetchInit.body = details.data;
      } else {
        fetchInit.body = details.data;
      }
    }

    // Timeout handling
    let timeoutId;
    const timeoutPromise =
      details.timeout && details.timeout > 0
        ? new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error("GM_xmlhttpRequest timed out"));
            }, details.timeout);
          })
        : null;

    const fetchPromise = fetch(details.url, fetchInit).then(async (resp) => {
      if (timeoutId) clearTimeout(timeoutId);

      // Headers string
      const headersArr = [];
      for (const [key, value] of resp.headers.entries()) {
        headersArr.push(`${key}: ${value}`);
      }

      // Select response based on responseType
      let responseData;
      switch (details.responseType) {
        case "arraybuffer":
          responseData = await resp.arrayBuffer();
          break;
        case "blob":
          responseData = await resp.blob();
          break;
        case "json":
          responseData = await resp.json();
          break;
        case "text":
        case "":
        default:
          responseData = await resp.text();
          break;
      }

      return {
        readyState: 4,
        responseHeaders: headersArr.join("\r\n"),
        responseText:
          typeof responseData === "string" ? responseData : undefined,
        response: responseData,
        status: resp.status,
        statusText: resp.statusText,
        finalUrl: resp.url,
        context: details.context,
      };
    });

    return timeoutPromise ? Promise.race([fetchPromise, timeoutPromise]) : fetchPromise;
  },
};

async function handleGmApiRequest(message, sender, sendResponse) {
  try {
    console.log("[CodeTweak] GM_API request:", message.action);

    const handler = gmApiHandlers[message.action];
    if (!handler) {
      throw new Error(`Unknown GM_API action: ${message.action}`);
    }

    const result = await handler(message);
    sendResponse({ result });
  } catch (error) {
    console.error(`Error handling GM_API action ${message.action}:`, error);
    sendResponse({ error: error.message || "An unexpected error occurred." });
  }
}

// Clipboard handling
async function ensureOffscreenDocument() {
  if (state.creatingOffscreenDocument) {
    await state.creatingOffscreenDocument;
    return;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
  });

  if (contexts.length > 0) return;

  state.creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["CLIPBOARD"],
    justification: "Need to write to the clipboard for GM_setClipboard API.",
  });

  await state.creatingOffscreenDocument;
  state.creatingOffscreenDocument = null;
}

async function handleSetClipboard(request) {
  await ensureOffscreenDocument();

  const requestId = `clipboard-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error("Timeout waiting for clipboard response."));
    }, 5000);

    const listener = (message) => {
      if (
        message.type === "offscreen-clipboard-response" &&
        message.requestId === requestId
      ) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);

        if (message.success) {
          resolve(undefined);
        } else {
          reject(new Error(message.error || "Failed to copy to clipboard."));
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "copy-to-clipboard",
      data: request.data,
      requestId,
    });
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
        url: `${chrome.runtime.getURL("editor.html")}?id=${existing.id}`,
      });
    } else {
      const params = new URLSearchParams({ targetUrl: url, template });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor.html")}?${params}`,
      });
    }
  } catch (error) {
    console.error("Script creation error:", error);
  }
}

async function handleGreasyForkInstall(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const code = await response.text();

    const tempId = crypto.randomUUID();
    const key = `tempImport_${tempId}`;
    await chrome.storage.local.set({ [key]: { code, sourceUrl: url } });

    chrome.tabs.create({
      url: `${chrome.runtime.getURL("editor.html")}?importId=${tempId}`,
    });
  } catch (err) {
    console.error("GreasyFork install fetch error:", err);
  }
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[CodeTweak] Message received:", message.type || message.action);

  if (message.type === "GM_API_REQUEST") {
    handleGmApiRequest(message.payload, sender, sendResponse);
    return true; // Async response
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
  chrome.webNavigation[event].addListener((details) =>
    injectScriptsForStage(
      details,
      Object.values(INJECTION_TYPES)[index],
      getFilteredScripts,
      state.executedScripts
    )
  );
});

// Tab event listeners
chrome.tabs.onRemoved.addListener((tabId) =>
  state.executedScripts.delete(tabId)
);

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
    // Tab may have been closed
    if (!isIgnorableTabError(error)) {
      console.warn("Error getting activated tab:", error);
    }
  }
});

// Extension lifecycle
chrome.runtime.onInstalled.addListener(updateAllTabBadges);
chrome.runtime.onStartup.addListener(updateAllTabBadges);
