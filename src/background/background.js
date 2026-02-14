import { urlMatchesPattern } from "../utils/urls.js";
import {
  injectScriptsForStage,
  INJECTION_TYPES,
  clearInjectedCoreScriptsForTab,
} from "../utils/inject.js";
import { parseUserScriptMetadata } from "../utils/metadataParser.js";

class BackgroundState {
  constructor() {
    this.scriptCache = null;
    this.lastCacheUpdate = 0;
    this.cacheTtl = 5000;
    this.ports = new Set();
    this.executedScripts = new Map();
    this.creatingOffscreenDocument = null;
    this.valueChangeListeners = new Map();
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

  cleanupTab(tabId) {
    this.executedScripts.delete(tabId);
    clearInjectedCoreScriptsForTab(tabId);

    for (const listeners of this.valueChangeListeners.values()) {
      listeners.delete(tabId);
    }
  }
}

const state = new BackgroundState();

function isIgnorableTabError(error) {
  const ignorableMessages = [
    "No tab with id",
    "Invalid tab ID",
    "Receiving end does not exist",
  ];
  return ignorableMessages.some((msg) => error.message?.includes(msg));
}

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

async function setupOffscreenDocument() {
  const offscreenApi = chrome.offscreen;
  const hasDocumentFn = offscreenApi?.["hasDocument"];
  const createDocumentFn = offscreenApi?.["createDocument"];
  if (
    typeof hasDocumentFn !== "function" ||
    typeof createDocumentFn !== "function"
  ) {
    return;
  }

  if (await hasDocumentFn.call(offscreenApi)) {
    return;
  }

  if (state.creatingOffscreenDocument) {
    await state.creatingOffscreenDocument;
    return;
  }

  state.creatingOffscreenDocument = createDocumentFn.call(offscreenApi, {
    url: "offscreen/offscreen.html",
    reasons: ["CLIPBOARD"],
    justification: "Clipboard access",
  });

  await state.creatingOffscreenDocument;
  state.creatingOffscreenDocument = null;
}

function normalizeStackTrace(stack) {
  if (!stack) return "";
  return stack
    .replace(/blob:[^\s)]+/g, "blob:URL")
    .replace(/:\d+:\d+/g, "")
    .replace(/at\s+blob:URL/g, "at blob:URL")
    .trim();
}

async function getFilteredScripts(url, runAt = null) {
  if (!url?.startsWith("http")) {
    return [];
  }

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
    if (tab.id && tab.url) {
      updateBadgeForTab(tab.id, tab.url);
    } else if (tab.id) {
      safeSetBadge(tab.id);
    }
  });
}

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

async function storeScriptError(scriptId, error) {
  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    if (!settings.enhancedDebugging) {
      return;
    }

    const storageKey = `scriptErrors_${scriptId}`;
    const { [storageKey]: existingErrors = [] } =
      await chrome.storage.local.get(storageKey);
    const normalizedNewStack = normalizeStackTrace(error.stack);

    // Check for duplicates
    const isDuplicate = existingErrors.some((existingError) => {
      const normalizedExistingStack = normalizeStackTrace(existingError.stack);
      return (
        existingError.message === error.message &&
        normalizedExistingStack === normalizedNewStack
      );
    });

    if (isDuplicate) {
      return;
    }

    const updatedErrors = [error, ...existingErrors].slice(0, 50);
    await chrome.storage.local.set({ [storageKey]: updatedErrors });

    chrome.runtime
      .sendMessage({
        type: "SCRIPT_ERROR_UPDATE",
        scriptId,
        error,
      })
      .catch(() => {
        // Editor might not be open, ignore
      });
  } catch (err) {
    console.error("[CodeTweak] Failed to store script error:", err);
  }
}

async function clearScriptErrors(scriptId) {
  try {
    const storageKey = `scriptErrors_${scriptId}`;
    await chrome.storage.local.remove(storageKey);
  } catch (err) {
    console.error("Failed to clear script errors:", err);
  }
}


class GMAPIHandler {
  constructor(scriptId, sender) {
    this.scriptId = scriptId;
    this.sender = sender;
    this.storageKey = `script-values-${scriptId}`;
  }

  async getStorage() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || {};
  }

  async setStorage(values) {
    await chrome.storage.local.set({ [this.storageKey]: values });
  }

  async setValue({ name, value }) {
    if (typeof name !== 'string') return { error: "Name must be a string" };
    const values = await this.getStorage();
    const oldValue = values[name];
    values[name] = value;
    await this.setStorage(values);

    this.notifyValueChange(name, oldValue, value);
    return { result: null };
  }

  async getValue({ name, defaultValue }) {
    if (typeof name !== 'string') return { result: defaultValue };
    const values = await this.getStorage();
    return { result: values[name] ?? defaultValue };
  }

  async deleteValue({ name }) {
    if (typeof name !== 'string') return { error: "Name must be a string" };
    const values = await this.getStorage();
    const oldValue = values[name];
    delete values[name];
    await this.setStorage(values);

    this.notifyValueChange(name, oldValue, undefined);
    return { result: null };
  }

  async listValues() {
    const values = await this.getStorage();
    return { result: Object.keys(values) };
  }

  addValueChangeListener({ name }) {
    const tabId = this.sender?.tab?.id;
    if (!tabId || typeof name !== "string") {
      return { result: null };
    }

    if (!state.valueChangeListeners.has(name)) {
      state.valueChangeListeners.set(name, new Set());
    }
    state.valueChangeListeners.get(name).add(tabId);
    return { result: null };
  }

  removeValueChangeListener({ name }) {
    const tabId = this.sender?.tab?.id;
    if (!tabId || typeof name !== "string") {
      return { result: null };
    }

    const listeners = state.valueChangeListeners.get(name);
    if (listeners) {
      listeners.delete(tabId);
      if (listeners.size === 0) {
        state.valueChangeListeners.delete(name);
      }
    }
    return { result: null };
  }

  notifyValueChange(name, oldValue, newValue) {
    const sourceTabId = this.sender?.tab?.id;
    const listeners = state.valueChangeListeners.get(name);
    if (!listeners) return;

    for (const tabId of listeners) {
      chrome.tabs
        .sendMessage(tabId, {
          type: "GM_VALUE_CHANGED",
          payload: {
            name,
            oldValue,
            newValue,
            remote: tabId !== sourceTabId,
          },
        })
        .catch(() => {}); // Ignore errors if tab is closed
    }
  }

  async getSettings() {
    const { settings = {} } = await chrome.storage.local.get("settings");
    return { result: settings };
  }

  async xmlhttpRequest({ details }) {
    // Standardize URL to absolute
    try {
      if (!details.url.startsWith('http')) {
        return { error: `Invalid URL: ${details.url}` };
      }
    } catch {
      return { error: `Invalid URL: ${details.url}` };
    }
    
    return await handleCrossOriginXmlhttpRequest(details, this.sender.tab.id);
  }

  async notification({ details }) {
    const baseOptions = {
      type: "basic",
      title: details.title || "CodeTweak Notification",
      message: details.text || "",
    };

    const defaultIconUrl = chrome.runtime.getURL("assets/icons/icon128.png");
    const createNotification = () =>
      new Promise((resolve) => {
        chrome.notifications.create({ ...baseOptions, iconUrl: defaultIconUrl }, () => {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          resolve({ ok: true });
        });
      });

    const result = await createNotification();

    if (!result.ok) {
      console.warn("[CodeTweak] Notification creation failed:", result.error);
    }

    return { result: null };
  }

  async setClipboard({ data }) {
    const text = typeof data === "string" ? data : String(data ?? "");

    if (chrome.offscreen?.["createDocument"] && chrome.offscreen?.["hasDocument"]) {
      await setupOffscreenDocument();
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "copy-to-clipboard",
        data: text,
      });
      return { result: null };
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { result: null };
    }

    return { error: "Clipboard API is unavailable in this browser." };
  }

  async download({ url, name }) {
    return new Promise((resolve) => {
      chrome.downloads.download({ url, filename: name }, (downloadId) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve({ result: { downloadId } });
        }
      });
    });
  }
}


async function handleCrossOriginXmlhttpRequest(details) {
  const { settings = {} } = await chrome.storage.local.get("settings");

  if (!settings.allowExternalResources) {
    return {
      error: "Cross-origin requests are disabled by a security setting.",
    };
  }

  const { url, method = "GET", headers, data, responseType } = details;

  if (!url) {
    console.error("CodeTweak: Cross-origin request failed: No URL provided.");
    return { error: "No URL provided." };
  }

  const requestOptions = { method, headers };

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

    // Clone response to read body multiple times
    const responseClone = response.clone();
    const responseText = await responseClone.text();

    let responseData;
    if (responseType === "blob") {
      const blob = await response.blob();
      responseData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else if (responseType === "arraybuffer") {
      responseData = await response.arrayBuffer();
    } else if (responseType === "json") {
      responseData = JSON.parse(responseText);
    } else {
      responseData = responseText;
    }

    return {
      result: {
        readyState: 4,
        responseHeaders: Object.entries(responseHeaders)
          .map(([name, value]) => `${name}: ${value}`)
          .join("\n"),
        responseText,
        response: responseData,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        context: details.context,
      },
    };
  } catch (error) {
    console.error("CodeTweak: Cross-origin request failed:", {
      error,
      url,
      method,
      headers,
    });

    let errorMessage = error.message;
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      errorMessage = `Network request failed. This could be due to a CORS issue, network error, or invalid URL. URL: ${url}`;
    }

    return { error: errorMessage };
  }
}

const messageHandlers = {
  scriptsUpdated: async () => {
    state.clearCache();
    notifyPorts("scriptsUpdated");
    updateAllTabBadges();
    return { success: true };
  },

  createScript: async (message) => {
    await handleScriptCreation(message.data.url, message.data.template);
    return { success: true };
  },

  contentScriptReady: (message, sender) => {
    if (sender.tab?.id) {
      state.executedScripts.set(sender.tab.id, new Set());
    }
    return { success: true };
  },

  greasyForkInstall: async (message) => {
    await handleGreasyForkInstall(message.url);
    return { success: true };
  },

  openAISettings: async () => {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("ai_dom_editor/settings/ai_settings.html"),
    });
    return { success: true };
  },

  createScriptFromAI: async (message) => {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const metadata = parseUserScriptMetadata(message.script);

    const newScript = {
      id: crypto.randomUUID(),
      code: message.script,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetUrls: metadata.matches || [message.url],
      runAt: metadata.runAt || "document_idle",
      name: metadata.name || "New AI Script",
    };

    scripts.push(newScript);
    await chrome.storage.local.set({ scripts });
    state.clearCache();
    notifyPorts("scriptsUpdated");
    updateAllTabBadges();

    return { script: newScript };
  },

  aiSettingsUpdated: () => {
    chrome.runtime.sendMessage({ action: "aiConfigUpdated" }).catch(() => {});
    return { success: true };
  },

  getScriptContent: async (message) => {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const script = scripts.find((s) => s.name === message.scriptName);

    if (script) {
      return { code: script.code };
    } else {
      return { error: `Script not found: ${message.scriptName}` };
    }
  },

  getAllScripts: async () => {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    return { scripts };
  },

  getCurrentTab: async (_message, _sender) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { tab };
    } catch (error) {
      return { error: error.message };
    }
  },

  updateScript: async (message) => {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const scriptIndex = scripts.findIndex((s) => s.id === message.scriptId);

    if (scriptIndex === -1) {
      return { error: `Script with id ${message.scriptId} not found.` };
    }

    scripts[scriptIndex].code = message.code;
    scripts[scriptIndex].updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ scripts });

    state.clearCache();
    notifyPorts("scriptsUpdated");
    updateAllTabBadges();

    // Reload tabs where the script is running
    const updatedScript = scripts[scriptIndex];
    const tabs = await chrome.tabs.query({
      url: updatedScript.targetUrls,
    });

    for (const tab of tabs) {
      chrome.tabs.reload(tab.id);
    }

    return { success: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[CodeTweak] Message received:", message.type || message.action);

  // Handle GM API requests
  if (message.type === "GM_API_REQUEST") {
    if (!message.payload) {
      console.error("[CodeTweak] GM_API_REQUEST received with no payload.");
      sendResponse({ error: "Request payload is missing." });
      return false;
    }

    const { action, scriptId, ...payload } = message.payload;
    const handler = new GMAPIHandler(scriptId, sender);

    if (typeof handler[action] === "function") {
      Promise.resolve()
        .then(() => handler[action](payload))
        .then((response) => {
          sendResponse(response ?? { result: null });
        })
        .catch((error) => {
          console.error(`GM API error [${action}]:`, error);
          sendResponse({ error: error.message });
        });
      return true;
    }

    sendResponse({ error: `Unknown GM API action: ${action}` });
    return false;
  }

  // Handle script errors
  if (message.type === "SCRIPT_ERROR") {
    storeScriptError(message.scriptId, message.error).then(() => {
      sendResponse({ success: true });
    });
    return true;
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
      sendResponse({ errors: result[storageKey] || [] });
    });
    return true;
  }

  // Handle standard messages
  const handler = messageHandlers[message.action];
  if (handler) {
    Promise.resolve(handler(message, sender))
      .then(sendResponse)
      .catch((error) => {
        console.error(`Message handler error [${message.action}]:`, error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  // Only send "Unknown action" if we didn't handle it above
  if (message.type !== "offscreen-clipboard-response") {
    sendResponse({ error: "Unknown action" });
  }
  return false;
});


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


chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "CodeTweak" || state.ports.has(port)) return;

  state.ports.add(port);
  port.onDisconnect.addListener(() => state.ports.delete(port));
  port.onMessage.addListener(console.log);
});


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
    );
  });
});


chrome.tabs.onRemoved.addListener((tabId) => {
  state.cleanupTab(tabId);
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
    if (!isIgnorableTabError(error)) {
      console.warn("Error getting activated tab:", error);
    }
  }
});


chrome.runtime.onInstalled.addListener(updateAllTabBadges);
chrome.runtime.onStartup.addListener(updateAllTabBadges);
