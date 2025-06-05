import { urlMatchesPattern } from "./utils/urlMatchPattern.js";

const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
  ELEMENT_READY: "element_ready",
});

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

async function injectScriptsForStage(details, runAt) {
  if (details.frameId !== 0) return;
  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const url = details.url;

    const tabId = details.tabId;
    if (!executedScripts.has(tabId)) executedScripts.set(tabId, new Set());
    const tabScripts = executedScripts.get(tabId);

    if (runAt === INJECTION_TYPES.DOCUMENT_START) tabScripts.clear();

    const matching = await getFilteredScripts(url, runAt);
    const newScripts = matching.filter((s) => !tabScripts.has(s.id));

    if (newScripts.length) bypassTrustedTypes(tabId);

    for (const script of newScripts) {
      tabScripts.add(script.id);
      injectScriptDirectly(
        tabId,
        script.code,
        script.name,
        settings,
        script.id
      );
    }

    if (runAt === INJECTION_TYPES.DOCUMENT_IDLE) {
      const readyScripts = await getFilteredScripts(
        url,
        INJECTION_TYPES.ELEMENT_READY
      );
      const newReady = readyScripts.filter((s) => !tabScripts.has(s.id));
      if (newReady.length) {
        chrome.tabs
          .sendMessage(tabId, { action: "waitForElements", scripts: newReady })
          .catch(console.warn);
      }
    }
  } catch (err) {
    console.error("Injection error:", err);
  }
}

async function injectScriptDirectly(
  tabId,
  code,
  scriptName,
  settings,
  scriptId
) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (code, scriptId) => {
        try {
          window._executedScriptIds = window._executedScriptIds || new Set();
          if (window._executedScriptIds.has(scriptId)) return;
          window._executedScriptIds.add(scriptId);
          eval(code);
        } catch (e) {
          console.error("Script error:", e);
        }
      },
      args: [code, scriptId || code.slice(0, 100)],
    });

    if (settings.showNotifications) showNotification(tabId, scriptName);
  } catch (err) {
    console.warn("Direct injection failed:", err);
  }
}

function showNotification(tabId, scriptName) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (name) => {
      const div = document.createElement("div");
      div.textContent = `\u2713 ${name}`;
      Object.assign(div.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 999999,
        background: "rgba(33, 150, 243, 0.95)",
        color: "white",
        padding: "6px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "none",
      });
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 2000);
    },
    args: [scriptName || "Unknown script"],
  });
}

function bypassTrustedTypes(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      try {
        window.trustedTypes.createPolicy = () => ({
          createHTML: (x) => x,
          createScript: (x) => x,
          createScriptURL: (x) => x,
        });
      } catch (e) {
        console.error("Bypass failed:", e);
      }
    },
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
  const { tabId, scriptCode, scriptId } = message;
  if (!tabId) return;
  chrome.tabs
    .get(tabId)
    .then((tab) => {
      if (!tab || !scriptCode || !scriptId) return;
      const tabScripts = executedScripts.get(tabId) || new Set();
      if (!tabScripts.has(scriptId)) {
        injectScriptDirectly(
          tab.id,
          scriptCode,
          "Element Ready Script",
          {},
          scriptId
        );
      }
    })
    .catch(() => console.warn("Tab not found for elementFound"));
}

["onCommitted", "onDOMContentLoaded", "onCompleted"].forEach((event, index) => {
  chrome.webNavigation[event].addListener((details) =>
    injectScriptsForStage(details, Object.values(INJECTION_TYPES)[index])
  );
});

chrome.tabs.onRemoved.addListener((tabId) => executedScripts.delete(tabId));
