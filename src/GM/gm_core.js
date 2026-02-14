"use strict";

import { GMBridge } from "./gm_bridge.js";
import { ExternalScriptLoader } from "./helpers/external_script_loader.js";

// Prevent multiple initializations
if (window.GMBridge === undefined) {
  function ensureEventListenerProtection(scriptId) {
    if (window._codetweak_listeners_protected) {
      return; // Already protected
    }
    window._codetweak_listeners_protected = true;

    const userScriptListeners = new Map();
    const protectedEventTypes = [
      "DOMContentLoaded",
      "load",
      "readystatechange",
    ];

    // Store original methods
    const originalMethods = {
      documentAddEventListener: Document.prototype.addEventListener,
      windowAddEventListener: Window.prototype.addEventListener,
      documentRemoveEventListener: Document.prototype.removeEventListener,
      windowRemoveEventListener: Window.prototype.removeEventListener,
    };

    function createListenerTracker(isWindow) {
      const addFn = isWindow
        ? originalMethods.windowAddEventListener
        : originalMethods.documentAddEventListener;

      return function addEventListener(type, listener, options) {
        if (protectedEventTypes.includes(type) && typeof listener === "function") {
          const trackedOptions = { ...options, capture: true };
          const key = `${
            isWindow ? "window" : "document"
          }_${type}_${scriptId}`;

          if (!userScriptListeners.has(key)) {
            userScriptListeners.set(key, []);
          }

          userScriptListeners.get(key).push({
            listener,
            originalOptions: options,
          });

          // If the event has already passed, simulate it for the new listener
          if (
            type === "DOMContentLoaded" &&
            !isWindow &&
            (document.readyState === "interactive" ||
              document.readyState === "complete")
          ) {
            setTimeout(
              () => listener.call(document, new Event("DOMContentLoaded")),
              0
            );
          } else if (
            type === "load" &&
            isWindow &&
            document.readyState === "complete"
          ) {
            setTimeout(() => listener.call(window, new Event("load")), 0);
          } else if (
            type === "readystatechange" &&
            !isWindow &&
            document.readyState !== "loading"
          ) {
            // Fire for current state, the listener should check readyState
            setTimeout(
              () => listener.call(document, new Event("readystatechange")),
              0
            );
          }

          return addFn.call(this, type, listener, trackedOptions);
        }

        // For other events, use normal binding
        return addFn.call(this, type, listener, options);
      };
    }

    Document.prototype.addEventListener = createListenerTracker(false);
    Window.prototype.addEventListener = createListenerTracker(true);

    // --- Intercept property assignments ---
    const defineProtectedProperty = (target, propertyName, eventName) => {
      let currentListener = null;
      Object.defineProperty(target, propertyName, {
        configurable: true,
        get() {
          return currentListener;
        },
        set(listener) {
          if (currentListener) {
            target.removeEventListener(eventName, currentListener);
          }
          if (typeof listener === "function") {
            target.addEventListener(eventName, listener);
            currentListener = listener;
          } else {
            currentListener = null;
          }
        },
      });
    };

    defineProtectedProperty(window, "onload", "load");
    defineProtectedProperty(document, "onreadystatechange", "readystatechange");

    // Watch for DOM mutations and restore listeners if needed
    if (typeof MutationObserver !== "undefined") {
      let isRestoring = false;

      const observer = new MutationObserver(() => {
        if (isRestoring) return;

        // Check if document is being replaced
        if (document.documentElement?.childNodes.length === 0) {
          isRestoring = true;

          // Re-register listeners
          userScriptListeners.forEach((listeners, key) => {
            const [target, eventType] = key.split("_");

            listeners.forEach(({ listener, originalOptions }) => {
              const options = { ...originalOptions, capture: true };

              if (target === "document") {
                originalMethods.documentAddEventListener.call(
                  document,
                  eventType,
                  listener,
                  options
                );
              } else {
                originalMethods.windowAddEventListener.call(
                  window,
                  eventType,
                  listener,
                  options
                );
              }
            });
          });

          isRestoring = false;
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  function reportScriptError(scriptId, error, type = "error") {
    const message = error?.message || String(error) || "Unknown error";
    const stack = error?.stack || "";

    try {
      window.postMessage(
        {
          type: "SCRIPT_ERROR",
          scriptId,
          error: {
            message,
            stack,
            timestamp: new Date().toISOString(),
            type,
          },
        },
        "*"
      );
    } catch (postError) {
      console.error("[GMBridge] Failed to report script error:", postError);
    }
  }

  async function executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requireUrls,
    loader
  ) {
    // Set up error handlers
    const errorHandler = (event) => {
      const message = event.error?.message || event.message || "Unknown error";
      const stack = event.error?.stack || "";

      console.error(
        `[GMBridge] Error in user script (ID: ${scriptId})`,
        `\nMessage: ${message}`,
        `\nStack: ${stack}`
      );

      reportScriptError(scriptId, { message, stack }, "error");
    };

    const rejectionHandler = (event) => {
      const message =
        event.reason?.message ||
        String(event.reason) ||
        "Unhandled promise rejection";
      const stack = event.reason?.stack || "";

      console.error(
        `[GMBridge] Unhandled rejection in user script (ID: ${scriptId})`,
        `\nMessage: ${message}`,
        `\nStack: ${stack}`
      );

      reportScriptError(scriptId, { message, stack }, "rejection");
    };

    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    try {
      // Protect event listeners before executing user code
      ensureEventListenerProtection(scriptId);

      // Load external dependencies
      await loader.loadScripts(requireUrls);

      // Execute in the current world directly to avoid page-level DOM sink restrictions.
      const injectViaScriptTag = () => {
        const script = document.createElement("script");
        const code = `(function(unsafeWindow) { \n${userCode}\n })(window);`;
        
        // Try inline textContent first (most reliable if no CSP or 'unsafe-inline' allowed)
        try {
          script.textContent = code;
          (document.head || document.documentElement).appendChild(script);
          script.remove();
          return;
        } catch (e) {
          console.warn("[GMBridge] Inline script textContent failed, trying Blob URL...");
        }

        // Fallback to Blob URL
        const blob = new Blob([code], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const blobScript = document.createElement("script");
        blobScript.src = url;
        
        blobScript.onload = () => {
          URL.revokeObjectURL(url);
          blobScript.remove();
        };
        blobScript.onerror = (err) => {
          console.error(`[GMBridge] Both inline and Blob injection failed for ${scriptId}. This site's CSP is too strict for direct injection.`, err);
          URL.revokeObjectURL(url);
          blobScript.remove();
        };

        (document.head || document.documentElement).appendChild(blobScript);
      };

      // Firefox strictly forbids Function() in MV3. 
      // Chrome allows it if 'unsafe-eval' is in extension CSP, but not on page CSP.
      if (typeof browser !== 'undefined' || /Firefox/.test(navigator.userAgent)) {
        injectViaScriptTag();
      } else {
        try {
          const run = new Function("unsafeWindow", userCode);
          run.call(window, window);
        } catch (e) {
          injectViaScriptTag();
        }
      }
    } catch (error) {
      console.error(
        `[GMBridge] Error executing user script ${scriptId}:`,
        error
      );
      reportScriptError(scriptId, error, "execution");
    } finally {
      // Clean up event listeners
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    }
  }

  // Expose GMBridge and utilities
  window.GMBridge = GMBridge;
  GMBridge.ExternalScriptLoader = ExternalScriptLoader;
  GMBridge.executeUserScriptWithDependencies =
    executeUserScriptWithDependencies;

  // Signal initialization complete
  window.postMessage({ type: "GM_CORE_EXECUTED" }, "*");
  window.dispatchEvent(new CustomEvent("GMBridgeReady"));
}
