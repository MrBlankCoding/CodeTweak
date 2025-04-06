const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
  ELEMENT_READY: "element_ready",
});

let scriptCache = null;
let lastCacheUpdate = 0;
const CACHE_LIFETIME = 5000;
let isRunning = false;
let activeRules = new Set();
let ports = new Set();
let executedScripts = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "scriptsUpdated":
      scriptCache = null;
      lastCacheUpdate = 0;
      sendResponse({ success: true });

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
      if (sender.tab && sender.tab.id) {
        executedScripts.set(sender.tab.id, new Set());
      }
      return false;

    default:
      return false;
  }
});

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
      } catch (error) {
        console.error("Port message error:", error);
        port.disconnect();
      }
    });
  }
});

const generateUniqueRuleId = () => Math.floor(Math.random() * 100000000);

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}

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

  return {
    normalScripts: matchingScripts.filter(
      (script) => !script.permissions?.cspDisabled
    ),
    cspDisabledScripts: matchingScripts.filter(
      (script) => script.permissions?.cspDisabled
    ),
  };
}

async function injectScriptsForStage(details, runAt) {
  if (details.frameId !== 0) return;

  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const url = details.url;

    if (runAt === INJECTION_TYPES.DOCUMENT_START) {
      executedScripts.set(details.tabId, new Set());
    }

    if (!executedScripts.has(details.tabId)) {
      executedScripts.set(details.tabId, new Set());
    }

    const tabExecutedScripts = executedScripts.get(details.tabId);
    const { normalScripts, cspDisabledScripts } = await getFilteredScripts(
      url,
      runAt
    );

    const newNormalScripts = normalScripts.filter(
      (script) => !tabExecutedScripts.has(script.id)
    );
    const newCspScripts = cspDisabledScripts.filter(
      (script) => !tabExecutedScripts.has(script.id)
    );

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

    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (code, scriptName, hasCSPDisabled, scriptId) => {
        try {
          window._executedScripts = window._executedScripts || new Set();
          window._executedScriptIds = window._executedScriptIds || new Set();

          if (window._executedScriptIds.has(scriptId)) {
            return;
          }

          window._executedScriptIds.add(scriptId);
          window._executedScripts.add(code);

          window._codeScriptCSPDisabled = hasCSPDisabled;

          eval(code);
        } catch (error) {
          console.error("Script execution error:", error);
        }
      },
      args: [
        code,
        scriptName,
        requiresCSP,
        scriptId || code.substring(0, 100),
      ],
    });

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

async function handleScriptCreation(url, template) {
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");

    const existingScript = scripts.find((script) =>
      script.targetUrls?.some((targetUrl) => urlMatchesPattern(url, targetUrl))
    );

    if (existingScript) {
      const codeLines = existingScript.code.split("\n");
      let insertIndex = codeLines.length - 1;

      while (insertIndex > 0) {
        const line = codeLines[insertIndex].trim();
        if (line && !line.startsWith("//") && line !== "})();") {
          break;
        }
        insertIndex--;
      }

      const indentation = "  ";
      const newCode = [
        "",
        `${indentation}// Added by element selector`,
        `${indentation}${template.trim().split("\n").join(`\n${indentation}`)}`,
        "",
      ];

      codeLines.splice(insertIndex + 1, 0, ...newCode);
      existingScript.code = codeLines.join("\n");
      existingScript.updatedAt = new Date().toISOString();

      await chrome.storage.local.set({ scripts });
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });

      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor.html")}?id=${existingScript.id}`,
      });
    } else {
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

["onCommitted", "onDOMContentLoaded", "onCompleted"].forEach((event, index) => {
  chrome.webNavigation[event].addListener((details) =>
    injectScriptsForStage(details, Object.values(INJECTION_TYPES)[index])
  );
});

function urlMatchesPattern(url, pattern) {
  try {
    // Handle edge cases
    if (pattern === url) return true;
    if (!url || !pattern) return false;

    // Normalize pattern if missing scheme
    if (!pattern.includes("://")) {
      pattern = "*://" + pattern;
    }

    // Extract scheme, host, and path from pattern
    let [schemeHostPart, ...patternPathParts] = pattern.split("/");
    let patternPath =
      patternPathParts.length > 0 ? "/" + patternPathParts.join("/") : "/";

    // Fix handling of the scheme/host part
    let [patternScheme, ...hostParts] = schemeHostPart.split("://");
    let patternHost = hostParts.join("://"); // In case there's :// in the hostname (unlikely but safe)

    // Create URL object for the input URL
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    // Handle scheme matching
    if (
      patternScheme !== "*" &&
      patternScheme !== urlObj.protocol.slice(0, -1)
    ) {
      return false;
    }

    // Handle host matching with wildcards
    if (patternHost.startsWith("*.")) {
      // *.domain.com pattern - match domain or any subdomain
      const domain = patternHost.slice(2);
      if (
        !(urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain))
      ) {
        return false;
      }
    } else if (patternHost.includes("*")) {
      // Handle other wildcards in hostname
      const hostRegex = new RegExp(
        "^" + patternHost.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
      );
      if (!hostRegex.test(urlObj.hostname)) {
        return false;
      }
    } else if (patternHost !== "*" && patternHost !== urlObj.hostname) {
      // Direct hostname match
      return false;
    }

    // If pattern path is empty or just "/" or "/*", match any path
    if (patternPath === "/" || patternPath === "/*") {
      return true;
    }

    // Handle special case for /** at the end
    if (patternPath.endsWith("/**")) {
      const basePath = patternPath.slice(0, -3);
      return urlPath === basePath || urlPath.startsWith(basePath);
    }

    // Handle path matching with both * and ** wildcards
    const pathSegments = patternPath
      .split("/")
      .filter((segment) => segment !== "");
    const urlSegments = urlPath.split("/").filter((segment) => segment !== "");

    // Simple case: if pattern is just /* match any single-level path
    if (pathSegments.length === 1 && pathSegments[0] === "*") {
      return true;
    }

    let pathRegexParts = ["^"];
    let i = 0;

    for (i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i];

      // Handle ** wildcard (matches across multiple path segments)
      if (segment === "**") {
        // If this is the last segment, match anything that follows
        if (i === pathSegments.length - 1) {
          pathRegexParts.push(".*");
          break;
        }

        // Otherwise, match anything until we find the next segment
        const nextSegment = pathSegments[i + 1];
        const nextSegmentRegex = nextSegment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");

        pathRegexParts.push(`(?:.*?\\/)?${nextSegmentRegex}`);
        i++; // Skip the next segment as we've already included it
      } else {
        // Handle regular segment with potential * wildcards
        const segmentRegex = segment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");
        if (i === 0) {
          pathRegexParts.push(`\\/?${segmentRegex}`); // Make the first slash optional
        } else {
          pathRegexParts.push(`\\/${segmentRegex}`);
        }
      }
    }

    pathRegexParts.push("$");
    const pathRegex = new RegExp(pathRegexParts.join(""));

    return pathRegex.test(urlPath);
  } catch (error) {
    console.warn("URL matching error:", error);
    return false;
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  executedScripts.delete(tabId);
});