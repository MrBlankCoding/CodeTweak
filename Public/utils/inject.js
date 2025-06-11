const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
});

/**
 * Main world execution function that sets up GM APIs and executes user scripts
 */
function createMainWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  resourceContents,
  resourceURLs,
  extensionId,
  initialValues = {}
) {
  // Helper: Creates a bridge for GM API communication between main world and content scripts
  function createGMBridge(scriptId, extensionId) {
    let messageIdCounter = 0;
    const pendingPromises = {};

    // Listen for responses from content bridge
    window.addEventListener("message", (event) => {
      if (
        event.source === window &&
        event.data?.type === "GM_API_RESPONSE" &&
        event.data.extensionId === extensionId &&
        pendingPromises[event.data.messageId]
      ) {
        const { messageId, error, result } = event.data;
        const promise = pendingPromises[messageId];

        if (error) {
          promise.reject(new Error(error));
        } else {
          promise.resolve(result);
        }
        delete pendingPromises[messageId];
      }
    });

    return function callGmBridge(action, payload) {
      return new Promise((resolve, reject) => {
        const messageId = `gm_${scriptId}_${messageIdCounter++}`;
        pendingPromises[messageId] = { resolve, reject };

        window.postMessage(
          {
            type: "GM_API_REQUEST",
            extensionId,
            messageId,
            action,
            payload,
          },
          "*"
        );
      });
    };
  }

  // GM apis
  function registerGMAPIs(
    enabledApis,
    gmBridge,
    resourceContents,
    resourceURLs,
    valueCache
  ) {
    const GM = window.GM;

    // Local cache for GM_*Value APIs to enable synchronous reads
    valueCache = valueCache || {};

    // Storage APIs
    if (enabledApis.gmSetValue) {
      const setValue = async (name, value) => {
        if (value instanceof Promise) {
          value = await value;
        }
        valueCache[name] = value;
        gmBridge("setValue", { name, value });
      };
      window.GM_setValue = setValue;
      GM.setValue = setValue;
    }

    if (enabledApis.gmGetValue) {
      const getValue = (name, defaultValue) => {
        if (Object.prototype.hasOwnProperty.call(valueCache, name)) {
          return valueCache[name];
        }
        // Fire async fetch to update cache for next call
        gmBridge("getValue", { name, defaultValue }).then((val) => {
          valueCache[name] = val;
        });
        return defaultValue;
      };
      window.GM_getValue = getValue;
      GM.getValue = getValue;
    }

    if (enabledApis.gmDeleteValue) {
      const deleteValue = async (name) => {
        delete valueCache[name];
        gmBridge("deleteValue", { name });
      };
      window.GM_deleteValue = deleteValue;
      GM.deleteValue = deleteValue;
    }

    if (enabledApis.gmListValues) {
      const listValues = () => Object.keys(valueCache);
      window.GM_listValues = listValues;
      GM.listValues = listValues;
    }

    // Tab and UI APIs
    if (enabledApis.gmOpenInTab) {
      const openInTab = (url, options = {}) =>
        gmBridge("openInTab", { url, options });
      window.GM_openInTab = openInTab;
      GM.openInTab = openInTab;
    }

    if (enabledApis.gmNotification) {
      const notification = (textOrDetails, titleOrOnDone, image) => {
        const details =
          typeof textOrDetails === "object" && textOrDetails !== null
            ? { ...textOrDetails }
            : { text: textOrDetails, title: titleOrOnDone, image };

        // Remove non clonable properties
        const cloneableDetails = Object.fromEntries(
          Object.entries(details).filter(
            ([, value]) => typeof value !== "function"
          )
        );

        return gmBridge("notification", { details: cloneableDetails });
      };
      window.GM_notification = notification;
      GM.notification = notification;
    }

    if (enabledApis.gmSetClipboard) {
      const setClipboard = (data, type) =>
        gmBridge("setClipboard", { data, type });
      window.GM_setClipboard = setClipboard;
      GM.setClipboard = setClipboard;
    }

    // GM_xmlHttpRequest (privileged)
    if (enabledApis.gmXmlHttpRequest) {
      const xmlHttpRequest = (details = {}) => {
        if (typeof details !== "object") {
          throw new Error("GM_xmlHttpRequest: details must be an object");
        }

        // Separate callbacks from cloneable data
        const callbackFns = {};
        const cloneableDetails = {};
        for (const [key, value] of Object.entries(details)) {
          if (typeof value === "function") {
            callbackFns[key] = value;
          } else {
            cloneableDetails[key] = value;
          }
        }

        return gmBridge("xmlHttpRequest", { details: cloneableDetails })
          .then((response) => {
            // Invoke onload if provided
            if (callbackFns.onload) {
              try {
                callbackFns.onload(response);
              } catch {
                console.error("GM_xmlHttpRequest onload error:");
              }
            }
            return response;
          })
          .catch((err) => {
            if (callbackFns.onerror) {
              try {
                callbackFns.onerror(err);
              } catch {
                // ignore
              }
            }
            throw err;
          });
      };

      // Expose both namespace and legacy name
      window.GM_xmlHttpRequest = xmlHttpRequest;
      GM.xmlHttpRequest = xmlHttpRequest;
    }

    // Style injection API (no privileges required)
    if (enabledApis.gmAddStyle) {
      const addStyle = (css) => {
        if (typeof css !== "string") return null;
        const style = document.createElement("style");
        style.textContent = css;
        (
          document.head ||
          document.documentElement ||
          document.body
        ).appendChild(style);
        return style;
      };
      window.GM_addStyle = addStyle;
      GM.addStyle = addStyle;
    }

    // Menu command API (no privileges required)
    if (enabledApis.gmRegisterMenuCommand) {
      const registerMenuCommand = (caption, onClick, accessKey) => {
        if (typeof caption !== "string" || typeof onClick !== "function") {
          console.warn(
            "GM_registerMenuCommand: Expected (string caption, function onClick, [string accessKey])"
          );
          return null;
        }

        // Store commands in a global registry for potential future use (e.g., custom UI)
        window.__gmMenuCommands = window.__gmMenuCommands || [];
        const commandId = `gm_menu_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 8)}`;
        window.__gmMenuCommands.push({
          commandId,
          caption,
          onClick,
          accessKey,
        });

        // For now just log registration – future enhancement could expose a UI
        console.log(
          `CodeTweak: Registered GM menu command '${caption}' (id: ${commandId})`
        );
        return commandId;
      };
      window.GM_registerMenuCommand = registerMenuCommand;
      GM.registerMenuCommand = registerMenuCommand;
    }

    // No privlages -> Handle directly
    if (enabledApis.gmGetResourceText) {
      const getResourceText = (resourceName) =>
        resourceContents[resourceName] || null;
      window.GM_getResourceText = getResourceText;
      GM.getResourceText = getResourceText;
    }

    if (enabledApis.gmGetResourceURL) {
      const getResourceURL = (resourceName) =>
        resourceURLs[resourceName] || null;
      window.GM_getResourceURL = getResourceURL;
      GM.getResourceURL = getResourceURL;
    }
  }

  // For error handeling
  function executeUserScript(userCode, scriptId) {
    try {
      new Function(userCode)();
    } catch (error) {
      console.error(
        `CodeTweak: Error executing user script ${scriptId}:`,
        error
      );
    }
  }

  // Prevent re-execution
  window._executedScriptIds = window._executedScriptIds || new Set();
  if (window._executedScriptIds.has(scriptId)) {
    console.log(`CodeTweak: Script ${scriptId} already executed`);
    return;
  }
  window._executedScriptIds.add(scriptId);
  console.log(`CodeTweak: Executing script ${scriptId} in main world`);

  // Initialize GM namespace
  if (typeof window.GM === "undefined") window.GM = {};

  // Setup GM API bridge
  const gmBridge = createGMBridge(scriptId, extensionId);

  // Register GM APIs
  registerGMAPIs(
    enabledApis,
    gmBridge,
    resourceContents,
    resourceURLs,
    initialValues
  );

  // Execute user script
  executeUserScript(userCode, scriptId);
}

// Inject a script
export async function injectScriptDirectly(tabId, script, settings) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !chrome.runtime?.id) {
      console.warn(
        `CodeTweak: Tab or extension runtime not available for ${script?.name}`
      );
      return;
    }

    const scriptConfig = prepareScriptConfig(script);

    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: createMainWorldExecutor,
      args: [
        scriptConfig.code,
        scriptConfig.id,
        scriptConfig.enabledApis,
        scriptConfig.resourceContents,
        scriptConfig.resourceURLs,
        chrome.runtime.id,
        scriptConfig.initialValues,
      ],
    });

    if (settings.showNotifications) {
      showNotification(tabId, script.name);
    }
  } catch (error) {
    console.warn(`CodeTweak: Failed to inject script ${script?.name}:`, error);
  }
}

//GM api preperation
function prepareScriptConfig(script) {
  const scriptId = script.id || script.name || `anonymous_script_${Date.now()}`;

  const enabledApis = {
    gmSetValue: script.gmSetValue,
    gmGetValue: script.gmGetValue,
    gmDeleteValue: script.gmDeleteValue,
    gmListValues: script.gmListValues,
    gmOpenInTab: script.gmOpenInTab,
    gmNotification: script.gmNotification,
    gmGetResourceText: script.gmGetResourceText,
    gmGetResourceURL: script.gmGetResourceURL,
    gmSetClipboard: script.gmSetClipboard,
    gmAddStyle: true,
    gmRegisterMenuCommand: script.gmRegisterMenuCommand || false,
    gmXmlHttpRequest: script.gmXmlHttpRequest || false,
  };

  const resourceContents = script.resourceContents || {};
  const resourceURLs = {};

  if (Array.isArray(script.resources)) {
    script.resources.forEach((resource) => {
      resourceURLs[resource.name] = resource.url;
    });
  }

  const initialValues = script.initialValues || {};

  return {
    code: script.code,
    id: scriptId,
    enabledApis,
    resourceContents,
    resourceURLs,
    initialValues,
  };
}

export async function injectScriptsForStage(
  details,
  runAt,
  getFilteredScripts,
  executedScripts
) {
  if (details.frameId !== 0) return; // ONLY INJECT IN TOP FRAME

  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const { url, tabId } = details;

    // init or get already exacuted
    if (!executedScripts.has(tabId)) {
      executedScripts.set(tabId, new Set());
    }
    const tabScripts = executedScripts.get(tabId);

    // Clear on new nav
    if (runAt === INJECTION_TYPES.DOCUMENT_START) {
      tabScripts.clear();
    }

    await injectMatchingScripts(
      url,
      runAt,
      tabId,
      tabScripts,
      getFilteredScripts,
      settings
    );
  } catch (error) {
    console.error("CodeTweak: Script injection error:", error);
  }
}

// inject based on URL
async function injectMatchingScripts(
  url,
  runAt,
  tabId,
  tabScripts,
  getFilteredScripts,
  settings
) {
  const matchingScripts = await getFilteredScripts(url, runAt);
  const newScripts = matchingScripts.filter(
    (script) => !tabScripts.has(script.id)
  );

  for (const script of newScripts) {
    tabScripts.add(script.id); // Prevent race conditions
    await injectScriptDirectly(tabId, script, settings);
  }
}

// show notif on exacute
export function showNotification(tabId, scriptName) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: (name) => {
        const notification = document.createElement("div");
        notification.textContent = `✓ ${name}`;

        Object.assign(notification.style, {
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: "999999",
          background: "rgba(33, 150, 243, 0.95)",
          color: "white",
          padding: "6px 12px",
          borderRadius: "8px",
          fontSize: "12px",
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
        });

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
      },
      args: [scriptName || "Unknown script"],
    })
    .catch((error) =>
      console.warn("CodeTweak: showNotification failed:", error)
    );
}

export { INJECTION_TYPES };
