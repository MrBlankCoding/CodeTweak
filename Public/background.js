// Define injection types
const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
  ELEMENT_READY: "element_ready",
});

// Cache and state management
let scriptCache = null;
let lastCacheUpdate = 0;
const CACHE_LIFETIME = 5000;
let isRunning = false;
let activeRules = new Set();
let ports = new Set();
let executedScripts = new Map(); // Track executed scripts by tab and script ID

/**
 * Message handling for script updates
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "scriptsUpdated":
      scriptCache = null; // Invalidate cache to force refresh
      lastCacheUpdate = 0;
      sendResponse({ success: true });

      // Notify any connected ports
      ports.forEach((port) => {
        try {
          port.postMessage({ action: "scriptsUpdated" });
        } catch (error) {
          console.warn("Failed to notify port:", error);
          ports.delete(port);
        }
      });
      return false;

    case "createScript":
      const { template, url: scriptUrl } = message.data;
      handleScriptCreation(scriptUrl, template).catch(console.error);
      return false;

    case "elementFound":
      if (message.tabId) {
        chrome.tabs
          .get(message.tabId)
          .then((tab) => {
            if (tab && message.scriptCode && message.scriptId) {
              // Check if this script has already been executed on this tab
              const tabScripts =
                executedScripts.get(message.tabId) || new Set();
              if (!tabScripts.has(message.scriptId)) {
                injectScriptDirectly(
                  tab.id,
                  message.scriptCode,
                  "Element Ready Script",
                  {},
                  message.requiresCSP || false,
                  message.scriptId
                );
              }
            }
          })
          .catch(() => {
            console.warn("Target tab no longer exists");
          });
      }
      return false;

    case "cspStateChanged":
      const { url, enabled } = message.data;
      if (!enabled) {
        cleanupCSPRules(url).catch(console.error);
      }
      sendResponse({ success: true });
      return false;

    case "contentScriptReady":
      // Reset executed scripts when content script loads
      if (sender.tab && sender.tab.id) {
        executedScripts.set(sender.tab.id, new Set());
      }
      return false;

    default:
      return false;
  }
});

/**
 * Context menu functionality
 */
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "selectElement",
      title: "Select Element for Script",
      contexts: ["page"],
    });
  });
}

// Create context menu when extension loads
createContextMenu();

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "selectElement") {
    chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
  }
});

/**
 * Port connection management
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "CodeTweak") {
    if (ports.has(port)) {
      console.warn("Port already connected:", port.name);
      return;
    }

    ports.add(port);

    port.onDisconnect.addListener(() => {
      ports.delete(port);
      console.log("Port disconnected:", port.name);
    });

    port.onMessage.addListener((message) => {
      try {
        console.log("Port message received:", message);
        // Handle specific port messages if needed
      } catch (error) {
        console.error("Port message error:", error);
        port.disconnect();
      }
    });
  }
});

/**
 * Rule and tab management
 */
// Generate a unique rule ID
const generateUniqueRuleId = () => Math.floor(Math.random() * 100000000);

// Retrieve the current active tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}

/**
 * CSP handling
 */
// Disable CSP for a given tab and URL
async function disableCSP(tabId, url) {
  if (isRunning) return;
  isRunning = true;

  try {
    const existingRules = await chrome.declarativeNetRequest.getSessionRules();
    const staleRules = existingRules.filter(
      (rule) => rule.condition.urlFilter === url
    );

    if (staleRules.length) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: staleRules.map((rule) => rule.id),
      });
    }

    const newRuleId = generateUniqueRuleId();
    activeRules.add(newRuleId);

    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id: newRuleId,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "content-security-policy", operation: "remove" },
              {
                header: "content-security-policy-report-only",
                operation: "remove",
              },
            ],
          },
          condition: {
            urlFilter: url,
            resourceTypes: ["main_frame", "sub_frame"],
          },
        },
      ],
    });
  } catch (error) {
    console.error("Failed to disable CSP:", error);
    activeRules.clear();
  } finally {
    isRunning = false;
  }
}

// Cleanup CSP rules for a specific URL
async function cleanupCSPRules(url) {
  if (isRunning) return;
  isRunning = true;

  try {
    const existingRules = await chrome.declarativeNetRequest.getSessionRules();
    const staleRules = existingRules.filter(
      (rule) => rule.condition.urlFilter === url
    );

    if (staleRules.length) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: staleRules.map((rule) => rule.id),
      });

      activeRules = new Set(
        [...activeRules].filter(
          (id) => !staleRules.some((rule) => rule.id === id)
        )
      );
    }
  } catch (error) {
    console.error("Failed to cleanup CSP rules:", error);
  } finally {
    isRunning = false;
  }
}

// Bypass Trusted Types restrictions
function bypassTrustedTypes(tabId) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        try {
          window.trustedTypes.createPolicy = () => ({
            createHTML: (input) => input,
            createScript: (input) => input,
            createScriptURL: (input) => input,
          });
        } catch (error) {
          console.error("Failed to bypass Trusted Types:", error);
        }
      },
    })
    .catch(console.warn);
}

/**
 * Script handling and injection
 */
// Get filtered scripts based on URL and run-at stage
async function getFilteredScripts(url, runAt) {
  const currentTime = Date.now();
  if (!scriptCache || currentTime - lastCacheUpdate > CACHE_LIFETIME) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    scriptCache = scripts.map((script) => ({
      ...script,
      id: script.id || crypto.randomUUID(),
      targetUrls:
        script.targetUrls || (script.targetUrl ? [script.targetUrl] : []),
    }));
    await chrome.storage.local.set({ scripts: scriptCache });
    lastCacheUpdate = currentTime;
  }

  const matchingScripts = scriptCache.filter(
    (script) =>
      script.enabled &&
      (!runAt || script.runAt === runAt) &&
      script.targetUrls.some((targetUrl) => urlMatchesPattern(url, targetUrl))
  );

  // Separate scripts based on CSP requirement
  return {
    normalScripts: matchingScripts.filter(
      (script) => !script.permissions?.cspDisabled
    ),
    cspDisabledScripts: matchingScripts.filter(
      (script) => script.permissions?.cspDisabled
    ),
  };
}

// Inject scripts for a specific stage
async function injectScriptsForStage(details, runAt) {
  if (details.frameId !== 0) return;

  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const url = details.url;

    // Clear executed scripts for this tab on new navigation
    if (runAt === INJECTION_TYPES.DOCUMENT_START) {
      executedScripts.set(details.tabId, new Set());
    }

    // Initialize tracking for this tab if needed
    if (!executedScripts.has(details.tabId)) {
      executedScripts.set(details.tabId, new Set());
    }

    const tabExecutedScripts = executedScripts.get(details.tabId);
    const { normalScripts, cspDisabledScripts } = await getFilteredScripts(
      url,
      runAt
    );

    // Filter out already executed scripts by script ID
    const newNormalScripts = normalScripts.filter(
      (script) => !tabExecutedScripts.has(script.id)
    );
    const newCspScripts = cspDisabledScripts.filter(
      (script) => !tabExecutedScripts.has(script.id)
    );

    // Handle normal scripts
    if (newNormalScripts.length) {
      newNormalScripts.forEach((script) => {
        tabExecutedScripts.add(script.id);
        injectScriptDirectly(
          details.tabId,
          script.code,
          script.name,
          settings,
          false,
          script.id
        );
      });
    }

    // Handle CSP-disabled scripts
    if (newCspScripts.length) {
      await disableCSP(details.tabId, url);
      bypassTrustedTypes(details.tabId);

      newCspScripts.forEach((script) => {
        tabExecutedScripts.add(script.id);
        injectScriptDirectly(
          details.tabId,
          script.code,
          script.name,
          settings,
          true,
          script.id
        );
      });
    }

    // Handle element-ready scripts only during DOCUMENT_IDLE
    if (runAt === INJECTION_TYPES.DOCUMENT_IDLE) {
      const {
        normalScripts: elementReadyNormalScripts,
        cspDisabledScripts: elementReadyCspScripts,
      } = await getFilteredScripts(url, INJECTION_TYPES.ELEMENT_READY);

      if (elementReadyNormalScripts.length || elementReadyCspScripts.length) {
        const elementReadyScripts = [
          ...elementReadyNormalScripts,
          ...elementReadyCspScripts,
        ].filter((script) => !tabExecutedScripts.has(script.id));

        if (elementReadyScripts.length) {
          chrome.tabs
            .sendMessage(details.tabId, {
              action: "waitForElements",
              scripts: elementReadyScripts,
            })
            .catch(console.warn);
        }
      }
    }
  } catch (error) {
    console.error("Error injecting scripts:", error);
  }
}

// Directly inject a script into a tab
async function injectScriptDirectly(
  tabId,
  code,
  scriptName,
  settings,
  requiresCSP = false,
  scriptId = null
) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      console.warn("Target tab no longer exists");
      return;
    }

    // Single script injection
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (code, scriptName, hasCSPDisabled, scriptId) => {
        try {
          // Initialize execution tracking
          window._executedScripts = window._executedScripts || new Set();
          window._executedScriptIds = window._executedScriptIds || new Set();

          // Skip if already executed
          if (window._executedScriptIds.has(scriptId)) {
            return;
          }

          // Mark as executed
          window._executedScriptIds.add(scriptId);
          window._executedScripts.add(code);

          window._codeScriptCSPDisabled = hasCSPDisabled;

          // Execute script once
          eval(code);
        } catch (error) {
          console.error("Script execution error:", error);
        }
      },
      args: [
        code,
        scriptName,
        requiresCSP,
        scriptId || code.substring(0, 100), // Use scriptId if provided, otherwise hash the code
      ],
    });

    // Show notification if enabled
    if (settings.showNotifications) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (scriptName) => {
          const notification = document.createElement("div");
          notification.style.cssText = `
            position: fixed;
            bottom: 16px;
            right: 16px;
            z-index: 999999;
            display: inline-flex;
            align-items: center;
            background: linear-gradient(to right, rgba(33, 150, 243, 0.95), rgba(25, 118, 210, 0.95));
            color: white;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 500;
            opacity: 0;
            transform: translateY(8px);
            animation: notifyIn 0.3s ease forwards;
            pointer-events: none;
            font-family: system-ui, -apple-system, sans-serif;
          `;

          const text = document.createElement("span");
          text.textContent = "✓ " + scriptName;
          text.style.cssText = `
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          `;

          notification.appendChild(text);
          document.body.appendChild(notification);

          setTimeout(() => {
            notification.style.animation = "notifyOut 0.2s ease forwards";
            setTimeout(() => notification.remove(), 200);
          }, 1500);

          if (!document.getElementById("_scriptNotificationStyles")) {
            const style = document.createElement("style");
            style.id = "_scriptNotificationStyles";
            style.innerHTML = `
              @keyframes notifyIn {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes notifyOut {
                to { opacity: 0; transform: translateY(8px); }
              }
            `;
            document.head.appendChild(style);
          }
        },
        args: [scriptName || "Unknown script"],
      });
    }
  } catch (error) {
    console.warn("Script injection error:", error);
  }
}

// Handle script creation
async function handleScriptCreation(url, template) {
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");

    const existingScript = scripts.find((script) =>
      script.targetUrls?.some((targetUrl) => urlMatchesPattern(url, targetUrl))
    );

    if (existingScript) {
      // Find the last meaningful code line before the closing IIFE
      const codeLines = existingScript.code.split("\n");
      let insertIndex = codeLines.length - 1;

      // Look for the last non-empty, non-comment line before closing IIFE
      while (insertIndex > 0) {
        const line = codeLines[insertIndex].trim();
        if (line && !line.startsWith("//") && line !== "})();") {
          break;
        }
        insertIndex--;
      }

      // Insert new code with proper formatting
      const indentation = "  "; // Match existing code indentation
      const newCode = [
        "",
        `${indentation}// Added by element selector`,
        `${indentation}${template.trim().split("\n").join(`\n${indentation}`)}`,
        "",
      ];

      // Insert the new code while maintaining structure
      codeLines.splice(insertIndex + 1, 0, ...newCode);
      existingScript.code = codeLines.join("\n");
      existingScript.updatedAt = new Date().toISOString();

      await chrome.storage.local.set({ scripts });
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });

      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor.html")}?id=${existingScript.id}`,
      });
    } else {
      // Create new script
      const editorUrl =
        chrome.runtime.getURL("editor.html") +
        `?targetUrl=${encodeURIComponent(url)}&template=${encodeURIComponent(
          template
        )}`;
      chrome.tabs.create({ url: editorUrl });
    }
  } catch (error) {
    console.error("Error handling script creation:", error);
  }
}

// Register navigation event listeners
["onCommitted", "onDOMContentLoaded", "onCompleted"].forEach((event, index) => {
  chrome.webNavigation[event].addListener((details) =>
    injectScriptsForStage(details, Object.values(INJECTION_TYPES)[index])
  );
});

/**
 * Utility functions
 */
// Efficient URL pattern matching
function urlMatchesPattern(url, pattern) {
  try {
    if (pattern === url) return true;
    if (
      pattern.startsWith("*.") &&
      new URL(url).hostname.endsWith(pattern.slice(2))
    )
      return true;

    return new RegExp(
      `^${pattern.replace(/\*/g, ".*").replace(/\./g, "\\.")}$`,
      "i"
    ).test(url);
  } catch (error) {
    console.warn("URL matching error:", error);
    return false;
  }
}

// Add cleanup for tab tracking when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  executedScripts.delete(tabId);
});
