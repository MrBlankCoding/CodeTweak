export function createWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  script,
  extensionId,
  initialValues,
  requiredUrls,
  gmInfo,
  enhancedDebugging,
  worldType = "MAIN"
) {
  function waitForGMBridge(callback) {
    if (window.GMBridge) {
      callback();
      return;
    }

    window.addEventListener("GMBridgeReady", callback, { once: true });
  }

  function preventReExecution(currentScriptId) {
    window._executedScriptIds = window._executedScriptIds || new Set();

    if (window._executedScriptIds.has(currentScriptId)) {
      return true;
    }

    window._executedScriptIds.add(currentScriptId);
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
    } catch (error) {
      console.warn("CodeTweak: Unable to define GM_info", error);
    }
  }

  function executeUserscript(
    userscriptCode,
    userscript,
    userscriptId,
    requires,
    scriptLoader
  ) {
    const run = () => {
      window.GMBridge.executeUserScriptWithDependencies(
        userscriptCode,
        userscriptId,
        requires,
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
        } else {
          window.addEventListener("DOMContentLoaded", () => run(), {
            once: true,
          });
        }
      },
      document_idle: () => {
        if (document.readyState === "complete") {
          run();
        } else {
          window.addEventListener("load", () => run(), { once: true });
        }
      },
      document_start: run,
    };

    const handler = runAtHandlers[userscript.runAt] || run;
    handler();
  }

  if (enhancedDebugging) {
    console.group(`[CodeTweak] Injecting script: ${script.name}`);
    console.log("  ID:", scriptId);
    console.log("  Run at:", script.runAt);
    console.log(
      "  Inject into:",
      worldType === "ISOLATED" ? "Isolated World" : "Main World"
    );
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

    const bridge = new window.GMBridge(
      scriptId,
      extensionId,
      worldType === "ISOLATED" ? "ISOLATED" : "MAIN"
    );
    const resourceManager = window.GMBridge.ResourceManager.fromScript(script);
    const apiRegistry = new window.GMBridge.GMAPIRegistry(
      bridge,
      resourceManager
    );
    const scriptLoader = new window.GMBridge.ExternalScriptLoader();

    apiRegistry.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    if (worldType === "MAIN") {
      bindNativeFunctions();
    }
    exposeGMInfo(gmInfo);

    executeUserscript(
      userCode,
      script,
      scriptId,
      requiredUrls,
      scriptLoader
    );
  });
}
