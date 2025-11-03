const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
});

// Maybe add a feature where the user can pick execution world
const EXECUTION_WORLDS = Object.freeze({
  MAIN: "MAIN",
  ISOLATED: "ISOLATED",
});

function createMainWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  script,
  extensionId,
  initialValues,
  requiredUrls,
  gmInfo
) {
  const MAX_RETRIES = 10;
  const RETRY_INTERVAL = 100;

  function waitForGMBridge(worldType, callback) {
    let retries = 0;

    function check() {
      const hasRequiredObjects = 
        window.GMBridge?.ResourceManager &&
        window.GMBridge?.GMAPIRegistry &&
        window.GMBridge?.ExternalScriptLoader &&
        window.GMBridge?.executeUserScriptWithDependencies;

      if (hasRequiredObjects) {
        callback();
        return;
      }

      if (retries < MAX_RETRIES) {
        retries++;
        setTimeout(check, RETRY_INTERVAL);
      } else {
        console.error(
          `CodeTweak: Timed out waiting for core script to load for script '${scriptId}'${worldType ? ` in ${worldType} world` : ''}.`
        );
      }
    }

    check();
  }

  function exposeGMInfo(info) {
    try {
      if (!Object.prototype.hasOwnProperty.call(window, "GM_info")) {
        Object.defineProperty(window, "GM_info", {
          value: Object.freeze(info || {}),
          writable: false,
          configurable: false,
        });
      }
      window.GM = window.GM || {};
      if (!window.GM.info) {
        window.GM.info = window.GM_info;
      }
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
  }

  function bindNativeFunctions() {
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

  function preventReExecution() {
    window._executedScriptIds = window._executedScriptIds || new Set();
    
    if (window._executedScriptIds.has(scriptId)) {
      return true;
    }
    
    window._executedScriptIds.add(scriptId);
    return false;
  }

  waitForGMBridge('MAIN', () => {
    if (preventReExecution()) return;

  

    const bridge = new window.GMBridge(scriptId, extensionId, 'MAIN');
    const resourceManager = window.GMBridge.ResourceManager.fromScript(script);
    const apiRegistry = new window.GMBridge.GMAPIRegistry(bridge, resourceManager);
    const scriptLoader = new window.GMBridge.ExternalScriptLoader();

    apiRegistry.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    bindNativeFunctions();
    exposeGMInfo(gmInfo);

    window.GMBridge.executeUserScriptWithDependencies(
      userCode,
      scriptId,
      requiredUrls,
      scriptLoader
    );
  });
}

function createIsolatedWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  script,
  initialValues,
  requiredUrls,
  gmInfo
) {
  const MAX_RETRIES = 10;
  const RETRY_INTERVAL = 100;

  function waitForGMBridge(worldType, callback) {
    let retries = 0;

    function check() {
      const hasRequiredObjects = 
        window.GMBridge?.ResourceManager &&
        window.GMBridge?.GMAPIRegistry &&
        window.GMBridge?.ExternalScriptLoader &&
        window.GMBridge?.executeUserScriptWithDependencies;

      if (hasRequiredObjects) {
        callback();
        return;
      }

      if (retries < MAX_RETRIES) {
        retries++;
        setTimeout(check, RETRY_INTERVAL);
      } else {
        console.error(
          `CodeTweak: Timed out waiting for core script to load for script '${scriptId}'${worldType ? ` in ${worldType} world` : ''}.`
        );
      }
    }

    check();
  }

  function exposeGMInfo(info) {
    try {
      if (!Object.prototype.hasOwnProperty.call(window, "GM_info")) {
        Object.defineProperty(window, "GM_info", {
          value: Object.freeze(info || {}),
          writable: false,
          configurable: false,
        });
      }
      window.GM = window.GM || {};
      if (!window.GM.info) {
        window.GM.info = window.GM_info;
      }
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
  }

  function preventReExecution() {
    window._executedScriptIds = window._executedScriptIds || new Set();
    
    if (window._executedScriptIds.has(scriptId)) {
      return true;
    }
    
    window._executedScriptIds.add(scriptId);
    return false;
  }

  waitForGMBridge('ISOLATED', () => {
    if (preventReExecution()) return;
    const bridge = new window.GMBridge(scriptId, chrome.runtime.id, 'ISOLATED');
    const resourceManager = window.GMBridge.ResourceManager.fromScript(script);
    const apiRegistry = new window.GMBridge.GMAPIRegistry(
      bridge,
      resourceManager
    );
    const scriptLoader = new window.GMBridge.ExternalScriptLoader();

    apiRegistry.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    exposeGMInfo(gmInfo);

    window.GMBridge.executeUserScriptWithDependencies(
      userCode,
      scriptId,
      requiredUrls,
      scriptLoader
    );
  });
}

class ScriptInjector {
  constructor() {
    this.executedScripts = new Map();
    this.injectedCoreScripts = new Map();
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
      console.warn(`CodeTweak: Failed to inject script ${script?.name}:`, error);
      return false;
    }
  }

  async tryInjectInBothWorlds(tabId, config) {
    try {
      await this.injectInWorld(tabId, config, EXECUTION_WORLDS.MAIN);
      return true;
    } catch (error) {
      console.warn(
        `CodeTweak: MAIN world injection failed for script '${config.id}', trying ISOLATED world:`,
        error?.message
      );
    }

    try {
      await this.injectInWorld(tabId, config, EXECUTION_WORLDS.ISOLATED);
      return true;
    } catch (error) {
      console.error(`CodeTweak: ISOLATED world injection also failed for script '${config.id}':`, error);
      return false;
    }
  }

  async injectInWorld(tabId, config, world) {
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

    const executor = world === EXECUTION_WORLDS.MAIN
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
        config.script,
        chrome.runtime.id,
        config.initialValues,
        config.requires,
        config.gmInfo,
      ],
    });
  }

  prepareScriptConfig(script) {
    const scriptId = script.id || script.name || `anonymous_script_${Date.now()}`;

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

    return {
      code: script.code,
      id: scriptId,
      enabledApis,
      script: script,
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
    if (details.frameId !== 0) return;

    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const { url, tabId } = details;

      if (!this.executedScripts.has(tabId)) {
        this.executedScripts.set(tabId, new Set());
      }
      
      const tabScripts = this.executedScripts.get(tabId);

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
      tabScripts.add(script.id);
      await this.injectScript(tabId, script, settings);
    }
  }

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

export async function injectScriptsForStage(details, runAt, getFilteredScripts) {
  return scriptInjector.injectScriptsForStage(details, runAt, getFilteredScripts);
}

export function showNotification(tabId, scriptName) {
  return scriptInjector.showNotification(tabId, scriptName);
}

export function clearInjectedCoreScriptsForTab(tabId) {
  return scriptInjector.clearInjectedCoreScriptsForTab(tabId);
}

export { INJECTION_TYPES, EXECUTION_WORLDS };