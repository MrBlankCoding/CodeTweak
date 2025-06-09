import { urlMatchesPattern } from "./utils/urlMatchPattern.js";
import {
  injectScriptsForStage,
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
      sendResponse({ success: true }); // This is synchronous
      notifyPorts("scriptsUpdated");
      // Update badges for all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id && tab.url) {
            updateBadgeForTab(tab.id, tab.url);
          } else if (tab.id) { // Tab exists but no URL (e.g. chrome://newtab or internal pages)
            chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(e => {
              if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
                console.warn("Error clearing badge on script update:", e.message);
              }
            });
          }
        });
      });
      return false; // Stays false as sendResponse was synchronous and further async work is fire-and-forget

    case "createScript":
      handleScriptCreation(message.data.url, message.data.template).catch(
        console.error
      );
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

// Function to update the badge for a specific tab
async function updateBadgeForTab(tabId, url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    try {
      await chrome.action.setBadgeText({ tabId: tabId, text: '' });
    } catch (e) {
      // Ignore errors if tabId is no longer valid or port disconnected
      if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
        console.warn(`Error clearing badge for non-http tab ${tabId}:`, e.message);
      }
    }
    return;
  }

  try {
    const scriptsToRun = await getFilteredScripts(url); // Assumes getFilteredScripts can be called with just URL
    const count = scriptsToRun.length;

    await chrome.action.setBadgeText({
      tabId: tabId,
      text: count > 0 ? count.toString() : '',
    });

    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#007bff' });
    } 
    // If count is 0, badge text is empty, effectively hiding it. Background color doesn't matter then.
  } catch (error) {
    console.error(`Error updating badge for tab ${tabId} (${url}):`, error);
    try {
      await chrome.action.setBadgeText({ tabId: tabId, text: '' }); // Clear badge on error
    } catch (e) {
      // Ignore errors if tabId is no longer valid or port disconnected
      if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
         console.warn(`Error clearing badge on error for tab ${tabId}:`, e.message);
      }
    }
  }
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

// Listeners for tab updates and activation to manage badge text
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Update badge when a tab finishes loading or its URL changes significantly
  if (changeInfo.status === 'complete' && tab && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  } else if (changeInfo.status === 'complete' && tab && (!tab.url || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")))) {
    // Tab completed loading but it's not an http/https page (e.g., chrome://extensions)
    chrome.action.setBadgeText({ tabId: tabId, text: '' }).catch(e => {
      if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
        console.warn("Error clearing badge for non-http onUpdated:", e.message);
      }
    });
  }
});

chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) { // Check if tab exists
      if (tab.url) {
        updateBadgeForTab(tab.id, tab.url);
      } else {
        // Tab exists but no URL (e.g. chrome://newtab or internal pages)
        chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(e => {
          if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
            console.warn("Error clearing badge onActivated:", e.message);
          }
        });
      }
    }
  });
});

// Initial badge setup on extension install/update or browser startup
chrome.runtime.onInstalled.addListener((details) => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id && tab.url) {
        updateBadgeForTab(tab.id, tab.url);
      } else if (tab.id) {
         chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(e => {
           if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
             console.warn("Error clearing badge onInstalled:", e.message);
           }
         });
      }
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id && tab.url) {
        updateBadgeForTab(tab.id, tab.url);
      } else if (tab.id) {
         chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(e => {
           if (!e.message.includes("No tab with id") && !e.message.includes("Invalid tab ID") && !e.message.includes("Receiving end does not exist")) {
             console.warn("Error clearing badge onStartup:", e.message);
           }
         });
      }
    });
  });
});
