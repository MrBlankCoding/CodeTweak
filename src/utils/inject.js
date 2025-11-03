// Constants
const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
});

const EXECUTION_WORLDS = Object.freeze({
  MAIN: "MAIN",
  ISOLATED: "ISOLATED",
});

// In the name
function createMainWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  resourceContents,
  resourceURLs,
  extensionId,
  initialValues,
  requiredUrls,
  gmInfo
) {
  // Define exposeGMInfo inside the main world context
  function exposeGMInfo(gmInfo) {
    try {
      // Check if GM_info already exists
      if (!Object.prototype.hasOwnProperty.call(window, "GM_info")) {
        Object.defineProperty(window, "GM_info", {
          value: Object.freeze(gmInfo || {}),
          writable: false,
          configurable: false,
        });
      }
      // Always ensure GM.info is set
      window.GM = window.GM || {};
      if (!window.GM.info) {
        window.GM.info = window.GM_info;
      }
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
  }

  // Define bindNativeFunctions inside the main world context
  function bindNativeFunctions() {
    // Bind common native functions to prevent "Illegal invocation" errors
    const nativeFunctions = [
      'fetch',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback'
    ];

    nativeFunctions.forEach(fnName => {
      if (window[fnName]) {
        window[fnName] = window[fnName].bind(window);
      }
    });
  }

  // Prevent re-execution
  window._executedScriptIds = window._executedScriptIds || new Set();
  if (window._executedScriptIds.has(scriptId)) {
    console.log(`CodeTweak: Script ${scriptId} already executed`);
    return;
  }
  window._executedScriptIds.add(scriptId);

  console.log(`CodeTweak: Executing script ${scriptId} in main world`);

  // Initialize components
  const bridge = new window.GMBridge(scriptId, extensionId);
  const resourceManager = new window.ResourceManager(resourceContents, resourceURLs);
  const apiRegistry = new window.GMAPIRegistry(bridge, resourceManager);
  const scriptLoader = new window.ExternalScriptLoader();

  // Setup
  apiRegistry.initializeCache(initialValues);
  apiRegistry.registerAll(enabledApis);
  bindNativeFunctions();

  exposeGMInfo(gmInfo);

  // Execute user script
  window.executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requiredUrls,
    scriptLoader
  );
}

// oooh isolated world... sneaky sneaky
function createIsolatedWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  resourceContents,
  resourceURLs,
  initialValues,
  requiredUrls,
  gmInfo
) {
  // Define exposeGMInfo inside the isolated world context
  function exposeGMInfo(gmInfo) {
    try {
      // Use Object.prototype.hasOwnProperty.call to avoid shadowing issues
      if (!Object.prototype.hasOwnProperty.call(window, "GM_info")) {
        Object.defineProperty(window, "GM_info", {
          value: Object.freeze(gmInfo || {}),
          writable: false,
          configurable: false,
        });
      }

      // Always ensure GM.info is set
      window.GM = window.GM || {};
      if (!window.GM.info) {
        window.GM.info = window.GM_info;
      }
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
  }

  // Prevent re-execution
  window._executedScriptIds = window._executedScriptIds || new Set();
  if (window._executedScriptIds.has(scriptId)) {
    console.log(`CodeTweak: Script ${scriptId} already executed (isolated)`);
    return;
  }
  window._executedScriptIds.add(scriptId);

  console.log(`CodeTweak: Executing script ${scriptId} in ISOLATED world`);

  // Create direct background bridge
  const backgroundBridge = {
    call: (action, payload = {}) => {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(
            {
              type: "GM_API_REQUEST",
              payload: { action, ...payload },
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response?.error) {
                reject(new Error(response.error));
              } else {
                resolve(response?.result);
              }
            }
          );
        } catch (error) {
          reject(error);
        }
      });
    },
  };

  // Initialize components
  const resourceManager = new window.ResourceManager(resourceContents, resourceURLs);
  const apiRegistry = new window.GMAPIRegistry(
    backgroundBridge,
    resourceManager
  );
  const scriptLoader = new window.ExternalScriptLoader();

  // Setup
  apiRegistry.initializeCache(initialValues);
  apiRegistry.registerAll(enabledApis);
  exposeGMInfo(gmInfo);

  // Execute user script
  window.executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requiredUrls,
    scriptLoader
  );
}

// The actual injector. Could move all of the other logic into another file
class ScriptInjector {
  constructor() {
    this.executedScripts = new Map();
    this.injectedCoreScripts = new Map(); // Map<tabId, Set<world>>
  }

  async injectScript(tabId, script, settings = {}) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !chrome.runtime?.id) {
        console.warn(
          `CodeTweak: Tab or extension runtime not available for ${script?.name}`
        );
        return false;
      }

      const config = this.prepareScriptConfig(script);
      const injected = await this.tryInjectInBothWorlds(tabId, config);

      if (injected && settings.showNotifications) {
        this.showNotification(tabId, script.name);
      }

      return injected;
    } catch (error) {
      console.warn(
        `CodeTweak: Failed to inject script ${script?.name}:`,
        error
      );
      return false;
    }
  }

  async tryInjectInBothWorlds(tabId, config) {
    // Try MAIN world first (preferred)
    try {
      await this.injectInWorld(tabId, config, EXECUTION_WORLDS.MAIN);
      return true;
    } catch (error) {
      console.warn(
        `CodeTweak: MAIN world injection failed, trying ISOLATED world:`,
        error?.message
      );
    }

    // Fallback to ISOLATED world
    try {
      await this.injectInWorld(tabId, config, EXECUTION_WORLDS.ISOLATED);
      return true;
    } catch (error) {
      console.error(`CodeTweak: ISOLATED world injection also failed:`, error);
      return false;
    }
  }

  async injectInWorld(tabId, config, world) {
    // Ensure gm_core.js is injected only once per tab and world
    if (!this.injectedCoreScripts.has(tabId)) {
      this.injectedCoreScripts.set(tabId, new Set());
    }
    const tabCoreScripts = this.injectedCoreScripts.get(tabId);

    if (!tabCoreScripts.has(world)) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world,
        files: ["GM/gm_core.js"],
      });
      tabCoreScripts.add(world);
    }

    const executor =
      world === EXECUTION_WORLDS.MAIN
        ? createMainWorldExecutor
        : createIsolatedWorldExecutor;

    await chrome.scripting.executeScript({
      target: { tabId },
      world,
      func: executor,
      args: [
        config.code,
        config.id,
        config.enabledApis,
        config.resourceContents,
        config.resourceURLs,
        chrome.runtime.id,
        config.initialValues,
        config.requires,
        config.gmInfo,
      ],
    });
  }

  prepareScriptConfig(script) {
    const scriptId =
      script.id || script.name || `anonymous_script_${Date.now()}`;

    const enabledApis = {
      gmSetValue: Boolean(script.gmSetValue),
      gmGetValue: Boolean(script.gmGetValue),
      gmDeleteValue: Boolean(script.gmDeleteValue),
      gmListValues: Boolean(script.gmListValues),
      gmOpenInTab: Boolean(script.gmOpenInTab),
      gmNotification: Boolean(script.gmNotification),
      gmGetResourceText: Boolean(script.gmGetResourceText),
      gmGetResourceURL: Boolean(script.gmGetResourceURL),
      gmSetClipboard: Boolean(script.gmSetClipboard),
      gmAddStyle: Boolean(script.gmAddStyle),
      gmAddElement: Boolean(script.gmAddElement),
      gmRegisterMenuCommand: Boolean(script.gmRegisterMenuCommand),
      gmUnregisterMenuCommand: Boolean(script.gmUnregisterMenuCommand),
      gmXmlhttpRequest: Boolean(script.gmXmlhttpRequest),
      unsafeWindow: Boolean(script.unsafeWindow),
    };

    const resourceManager = new window.ResourceManager.fromScript(script);

    return {
      code: script.code,
      id: scriptId,
      enabledApis,
      resourceContents: Object.fromEntries(resourceManager.contents),
      resourceURLs: Object.fromEntries(resourceManager.urls),
      initialValues: script.initialValues || {},
      requires: Array.isArray(script.requires) ? script.requires : [],
      gmInfo: {
        script: {
          id: scriptId,
          name: script.name,
          version: script.version,
          description: script.description,
          author: script.author,
          namespace: script.namespace || "",
        },
        scriptHandler: "CodeTweak",
        version: chrome.runtime?.getManifest?.().version || "",
      },
    };
  }

  async injectScriptsForStage(details, runAt, getFilteredScripts) {
    // Only inject in top frame
    if (details.frameId !== 0) return;

    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const { url, tabId } = details;

      // Initialize or get executed scripts for this tab
      if (!this.executedScripts.has(tabId)) {
        this.executedScripts.set(tabId, new Set());
      }
      const tabScripts = this.executedScripts.get(tabId);

      // Clear executed scripts on navigation start
      if (runAt === INJECTION_TYPES.DOCUMENT_START) {
        tabScripts.clear();
      }

      await this.injectMatchingScripts(
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

  async injectMatchingScripts(
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
      await this.injectScript(tabId, script, settings);
    }
  }
  // No thanks
  showNotification(tabId, scriptName) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: EXECUTION_WORLDS.MAIN,
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
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          });

          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 2000);
        },
        args: [scriptName || "Unknown script"],
      })
      .catch((error) => {
        console.error("CodeTweak: showNotification failed:", error);
      });
  }
  clearInjectedCoreScriptsForTab(tabId) {
    this.injectedCoreScripts.delete(tabId);
  }
}

const scriptInjector = new ScriptInjector();


export async function injectScriptsForStage(
  details,
  runAt,
  getFilteredScripts
) {
  return scriptInjector.injectScriptsForStage(
    details,
    runAt,
    getFilteredScripts
  );
}

export function showNotification(tabId, scriptName) {
  return scriptInjector.showNotification(tabId, scriptName);
}

export function clearInjectedCoreScriptsForTab(tabId) {
  return scriptInjector.clearInjectedCoreScriptsForTab(tabId);
}

export { INJECTION_TYPES, EXECUTION_WORLDS };
