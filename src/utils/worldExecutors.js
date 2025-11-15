export function createMainWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  script,
  extensionId,
  initialValues,
  requiredUrls,
  gmInfo,
  enhancedDebugging
) {
  // Helper functions must be defined here to be serialized with the executor
  function waitForGMBridge(callback) {
    if (window.GMBridge) {
      callback();
      return;
    }

    window.addEventListener("GMBridgeReady", callback, { once: true });
  }

  function preventReExecution(scriptId) {
    window._executedScriptIds = window._executedScriptIds || new Set();

    if (window._executedScriptIds.has(scriptId)) {
      return true;
    }

    window._executedScriptIds.add(scriptId);
    return false;
  }

  function bindNativeFunctions() {
    const nativeFunctions = [
      "fetch",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
    ];

    nativeFunctions.forEach((fnName) => {
      if (window[fnName]) {
        window[fnName] = window[fnName].bind(window);
      }
    });
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

  function executeUserscript(
    userCode,
    script,
    scriptId,
    requiredUrls,
    scriptLoader
  ) {
    const run = () => {
      window.GMBridge.executeUserScriptWithDependencies(
        userCode,
        scriptId,
        requiredUrls,
        scriptLoader
      );
    };

    const runAtHandlers = {
      document_end: () => {
        if (
          document.readyState === "interactive" ||
          document.readyState === "complete"
        ) {
          run();
          if (document.readyState !== "loading") {
            window.dispatchEvent(new Event("DOMContentLoaded"));
          }
        } else {
          window.addEventListener(
            "DOMContentLoaded",
            () => {
              run();
              window.dispatchEvent(new Event("DOMContentLoaded"));
            },
            { once: true }
          );
        }
      },
      document_idle: () => {
        if (document.readyState === "complete") {
          run();
          window.dispatchEvent(new Event("load"));
        } else {
          window.addEventListener(
            "load",
            () => {
              run();
              window.dispatchEvent(new Event("load"));
            },
            { once: true }
          );
        }
      },
      document_start: run,
    };

    const handler = runAtHandlers[script.runAt] || run;
    handler();
  }

  if (enhancedDebugging) {
    console.group(`[CodeTweak] Injecting script: ${script.name}`);
    console.log("  ID:", scriptId);
    console.log("  Run at:", script.runAt);
    console.log("  Inject into: Main World");
    console.log(
      "  Enabled APIs:",
      Object.keys(enabledApis).filter((api) => enabledApis[api])
    );
    console.log("  Requires:", requiredUrls || "none");
    console.log("  Resources:", script.resources || "none");
    console.groupEnd();
  }

  waitForGMBridge(() => {
    if (preventReExecution(scriptId)) return;

    const bridge = new window.GMBridge(scriptId, extensionId, "MAIN");
    const resourceManager = window.GMBridge.ResourceManager.fromScript(script);
    const apiRegistry = new window.GMBridge.GMAPIRegistry(
      bridge,
      resourceManager
    );
    const scriptLoader = new window.GMBridge.ExternalScriptLoader();

    apiRegistry.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    bindNativeFunctions();
    exposeGMInfo(gmInfo);

    executeUserscript(userCode, script, scriptId, requiredUrls, scriptLoader);
  });
}

export function createIsolatedWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  script,
  initialValues,
  requiredUrls,
  gmInfo,
  enhancedDebugging
) {
  // Helper functions must be defined here to be serialized with the executor
  function waitForGMBridge(callback) {
    if (window.GMBridge) {
      callback();
      return;
    }

    window.addEventListener("GMBridgeReady", callback, { once: true });
  }

  function preventReExecution(scriptId) {
    window._executedScriptIds = window._executedScriptIds || new Set();

    if (window._executedScriptIds.has(scriptId)) {
      return true;
    }

    window._executedScriptIds.add(scriptId);
    return false;
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

  function executeUserscript(
    userCode,
    script,
    scriptId,
    requiredUrls,
    scriptLoader
  ) {
    const run = () => {
      window.GMBridge.executeUserScriptWithDependencies(
        userCode,
        scriptId,
        requiredUrls,
        scriptLoader
      );
    };

    const runAtHandlers = {
      document_end: () => {
        if (
          document.readyState === "interactive" ||
          document.readyState === "complete"
        ) {
          run();
          if (document.readyState !== "loading") {
            window.dispatchEvent(new Event("DOMContentLoaded"));
          }
        } else {
          window.addEventListener(
            "DOMContentLoaded",
            () => {
              run();
              window.dispatchEvent(new Event("DOMContentLoaded"));
            },
            { once: true }
          );
        }
      },
      document_idle: () => {
        if (document.readyState === "complete") {
          run();
          window.dispatchEvent(new Event("load"));
        } else {
          window.addEventListener(
            "load",
            () => {
              run();
              window.dispatchEvent(new Event("load"));
            },
            { once: true }
          );
        }
      },
      document_start: run,
    };

    const handler = runAtHandlers[script.runAt] || run;
    handler();
  }

  if (enhancedDebugging) {
    console.group(`[CodeTweak] Injecting script: ${script.name}`);
    console.log("  ID:", scriptId);
    console.log("  Run at:", script.runAt);
    console.log("  Inject into: Isolated World");
    console.log(
      "  Enabled APIs:",
      Object.keys(enabledApis).filter((api) => enabledApis[api])
    );
    console.log("  Requires:", requiredUrls || "none");
    console.log("  Resources:", script.resources || "none");
    console.groupEnd();
  }

  waitForGMBridge(() => {
    if (preventReExecution(scriptId)) return;

    const bridge = new window.GMBridge(scriptId, chrome.runtime.id, "ISOLATED");
    const resourceManager = window.GMBridge.ResourceManager.fromScript(script);
    const apiRegistry = new window.GMBridge.GMAPIRegistry(
      bridge,
      resourceManager
    );
    const scriptLoader = new window.GMBridge.ExternalScriptLoader();

    apiRegistry.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    exposeGMInfo(gmInfo);

    executeUserscript(userCode, script, scriptId, requiredUrls, scriptLoader);
  });
}
