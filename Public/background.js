import { urlMatchesPattern } from "./utils/urlMatchPattern.js";
import {
  injectScriptsForStage,
  handleElementFound as handleElementFoundInjection,
  INJECTION_TYPES,
} from "./utils/inject.js";

let scriptCache = null;
let lastCacheUpdate = 0;
const CACHE_LIFETIME = 5000;
const ports = new Set();
const executedScripts = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "scriptsUpdated":
      scriptCache = null;
      lastCacheUpdate = 0;
      sendResponse({ success: true });
      notifyPorts("scriptsUpdated");
      return false;

    case "createScript":
      handleScriptCreation(message.data.url, message.data.template).catch(
        console.error
      );
      return false;

    case "elementFound":
      handleElementFound(message);
      return false;

    case "contentScriptReady":
      if (sender.tab?.id) executedScripts.set(sender.tab.id, new Set());
      return false;

    default:
      return false;
  }
});

function notifyPorts(action) {
  for (const port of ports) {
    try {
      port.postMessage({ action });
    } catch (error) {
      console.warn("Failed to notify port:", error);
      ports.delete(port);
    }
  }
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "selectElement",
      title: "Select Element for Script",
      contexts: ["page"],
    });
  });
}
createContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "selectElement") {
    chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "CodeTweak" || ports.has(port)) return;
  ports.add(port);

  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(console.log);
});

async function getFilteredScripts(url, runAt) {
  const now = Date.now();
  if (!scriptCache || now - lastCacheUpdate > CACHE_LIFETIME) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    scriptCache = scripts.map((s) => ({
      ...s,
      id: s.id || crypto.randomUUID(),
      targetUrls: s.targetUrls || [s.targetUrl].filter(Boolean),
    }));
    await chrome.storage.local.set({ scripts: scriptCache });
    lastCacheUpdate = now;
  }

  return scriptCache.filter(
    (script) =>
      script.enabled &&
      (!runAt || script.runAt === runAt) &&
      script.targetUrls.some((target) => urlMatchesPattern(url, target))
  );
}

async function handleScriptCreation(url, template) {
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const existing = scripts.find((s) =>
      s.targetUrls?.some((t) => urlMatchesPattern(url, t))
    );

    if (existing) {
      const lines = existing.code.split("\n");
      let i = lines.length - 1;
      while (i > 0 && (!lines[i].trim() || lines[i].trim() === "})();")) i--;

      const indent = "  ";
      const newLines = [
        "",
        `${indent}// Added by element selector`,
        ...template
          .trim()
          .split("\n")
          .map((line) => indent + line),
        "",
      ];

      lines.splice(i + 1, 0, ...newLines);
      existing.code = lines.join("\n");
      existing.updatedAt = new Date().toISOString();

      await chrome.storage.local.set({ scripts });
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor.html")}?id=${existing.id}`,
      });
    } else {
      const urlParams = new URLSearchParams({ targetUrl: url, template });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor.html")}?${urlParams}`,
      });
    }
  } catch (e) {
    console.error("Script creation error:", e);
  }
}

function handleElementFound(message) {
  handleElementFoundInjection(message, executedScripts);
}

// Web navigation event handlers
["onCommitted", "onDOMContentLoaded", "onCompleted"].forEach((event, index) => {
  chrome.webNavigation[event].addListener((details) =>
    injectScriptsForStage(
      details,
      Object.values(INJECTION_TYPES)[index],
      getFilteredScripts,
      executedScripts
    )
  );
});

chrome.tabs.onRemoved.addListener((tabId) => executedScripts.delete(tabId));
