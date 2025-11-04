(function () {
  'use strict';

  // Prevent multiple initializations
  if (typeof window.GMBridge !== "undefined") {
    return;
  }

  // Lets start with trusted types
  // Is this allowed on the web store?
  let ctTrustedTypesPolicy = null;

  function getTrustedTypesPolicy() {
    if (ctTrustedTypesPolicy) {
      return ctTrustedTypesPolicy;
    }

    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        ctTrustedTypesPolicy = window.trustedTypes.createPolicy(
          "codetweak-gm-apis",
          {
            createHTML: (input) => {
              if (typeof input !== "string") return "";
              return input
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
                .replace(/javascript:/gi, "");
            },
            createScript: (input) => input,
            createScriptURL: (input) => input,
          }
        );
        return ctTrustedTypesPolicy;
      } catch (e) {
        console.error("Failed to create Trusted Types policy:", e);
      }
    }
    return null;
  }

  // Very important
  // Optamised from last version where there was 2 dif bridges
  class GMBridge {
    static ResourceManager = class ResourceManager {
      constructor(resourceContents = {}, resourceURLs = {}) {
        this.contents = new Map(Object.entries(resourceContents));
        this.urls = new Map(Object.entries(resourceURLs));
      }
  
      getText(resourceName) {
         return this.contents.get(resourceName) || null;
       }

       getURL(resourceName) {
         return this.urls.get(resourceName) || null;
       }
  
      static fromScript(script) {
        const resourceURLs = {};
    
        if (Array.isArray(script.resources)) {
          script.resources.forEach((resource) => {
            resourceURLs[resource.name] = resource.url;
          });
        }
    
        return new ResourceManager(script.resourceContents || {}, resourceURLs);
      }
    }

    constructor(scriptId, extensionId, worldType = 'MAIN') {
      this.scriptId = scriptId;
      this.extensionId = extensionId;
      this.worldType = worldType;
      this.messageIdCounter = 0;
      this.pendingPromises = new Map();

      if (this.worldType === 'MAIN') {
        this.setupMessageListener();
      }
    }

    setupMessageListener() {
      window.addEventListener("message", (event) => {
        if (!this.isValidResponse(event)) return;

        const { messageId, error, result } = event.data;
        const promise = this.pendingPromises.get(messageId);
        if (!promise) return;

        if (error) {
          promise.reject(new Error(error));
        } else {
          promise.resolve(result);
        }

        this.pendingPromises.delete(messageId);
      });
    }

    isValidResponse(event) {
      return (
        event.source === window &&
        event.data?.type === "GM_API_RESPONSE" &&
        event.data.extensionId === this.extensionId &&
        this.pendingPromises.has(event.data.messageId)
      );
    }

    call(action, payload = {}) {
      const newPayload = { ...payload, scriptId: this.scriptId };
      // If in the ISOLATED world, use the direct chrome.runtime.sendMessage
      if (this.worldType === 'ISOLATED' && typeof chrome?.runtime?.sendMessage === 'function') {
        return this.callIsolated(action, newPayload);
      }
      // Otherwise, fallback to the MAIN world postMessage mechanism
      return this.callMain(action, newPayload);
    }

    callMain(action, payload = {}) {
      return new Promise((resolve, reject) => {
        const messageId = `gm_${this.scriptId}_${this.messageIdCounter++}`;
        this.pendingPromises.set(messageId, { resolve, reject });

        window.postMessage(
          {
            type: "GM_API_REQUEST",
            extensionId: this.extensionId,
            messageId,
            action,
            payload,
          },
          "*"
        );
      });
    }

    callIsolated(action, payload = {}) {
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
    }
  }

  window.GMBridge = GMBridge;

  // Needs work, extenal script loading is getting blocked by CORS
  class ExternalScriptLoader {
    constructor() {
      this.loadedScripts = new Set();
    }

    async loadScript(url) {
      if (this.loadedScripts.has(url)) {
        return;
      }
      await this.injectScriptTag(url);
      this.loadedScripts.add(url);
    }

    async loadScripts(urls) {
      if (!Array.isArray(urls)) return;
      for (const url of urls) {
        await this.loadScript(url);
      }
    }

    injectScriptTag(src) {
      return new Promise((resolve, reject) => {
        const el = document.createElement("script");

        const policy = getTrustedTypesPolicy();
        let trustedSrc = src;
        if (policy) {
          try {
            trustedSrc = policy.createScriptURL(src);
          } catch (e) {
            console.error("Failed to create trusted script URL:", e);
            console.warn("Falling back to raw URL.");
          }
        }

        el.src = trustedSrc;
        el.async = false; // preserve execution order
        el.onload = resolve;
        el.onerror = () => {
          console.error(`CodeTweak: Failed to load script ${src}`);
          reject(new Error(`Failed to load script ${src}`));
        }
        (document.head || document.documentElement).appendChild(el);
      });
    }
  }



  async function executeUserScriptWithDependencies(userCode, scriptId, requireUrls, loader) {
    // Set up error collection
    const errorHandler = (event) => {
      const stack = event.error?.stack || event.reason?.stack || '';
      const message = event.error?.message || event.reason?.message || event.message || 'Unknown error';
      
      console.error(`CodeTweak: Error in script ${scriptId}:`, message, stack);
      // Send to editor
      try {
        window.postMessage({
          type: 'SCRIPT_ERROR',
          scriptId: scriptId,
          error: {
            message: message,
            stack: stack,
            timestamp: new Date().toISOString(),
            type: 'error'
          }
        }, '*');
      } catch (e) {
        console.error('[CodeTweak Error Capture] Failed to report script error:', e);
      }
    };

    const rejectionHandler = (event) => {
      const message = event.reason?.message || String(event.reason) || 'Unhandled promise rejection';
      const stack = event.reason?.stack || '';
      
      console.error(`CodeTweak: Unhandled promise rejection in script ${scriptId}:`, message, stack);
      try {
        window.postMessage({
          type: 'SCRIPT_ERROR',
          scriptId: scriptId,
          error: {
            message: message,
            stack: stack,
            timestamp: new Date().toISOString(),
            type: 'error'
          }
        }, '*');
      } catch (e) {
        console.error('[CodeTweak Error Capture] Failed to report script error:', e);
      }
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    try {
      await loader.loadScripts(requireUrls);
      
      const wrappedCode = `(async function() {\n'use strict';\n${userCode}\n})();`;
      const blob = new Blob([wrappedCode], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);

      await new Promise((resolve, reject) => {
        const scriptEl = document.createElement("script");

        const policy = getTrustedTypesPolicy();
        let trustedSrc = blobUrl;
        if (policy) {
          try {
            trustedSrc = policy.createScriptURL(blobUrl);
          } catch (e) {
            console.error("Failed to create trusted script URL:", e);
            console.warn("Falling back to raw URL.");
          }
        }

        scriptEl.src = trustedSrc;
        scriptEl.async = false; // maintain execution order
        scriptEl.setAttribute('data-script-id', scriptId);
        
        scriptEl.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        
        scriptEl.onerror = (event) => {
          URL.revokeObjectURL(blobUrl);
          const error = new Error(
            `Failed to execute user script ${scriptId}: ${event?.message || "unknown error"}`
          );
          
          console.error(`CodeTweak: Failed to execute user script ${scriptId}:`, event);
          // Report load error
          try {
            window.postMessage({
              type: 'SCRIPT_ERROR',
              scriptId: scriptId,
              error: {
                message: error.message,
                stack: error.stack || '',
                timestamp: new Date().toISOString(),
                type: 'error'
              }
            }, '*');
          } catch (e) {
            console.error('Failed to report script load error:', e);
          }
          
          reject(error);
        };
        
        (document.head || document.documentElement || document.body).appendChild(scriptEl);
      });
    } catch (err) {
      console.error(`CodeTweak: Error executing user script ${scriptId}:`, err);
      
      // Report execution error
      try {
        window.postMessage({
          type: 'SCRIPT_ERROR',
          scriptId: scriptId,
          error: {
            message: err.message || 'Script execution failed',
            stack: err.stack || '',
            timestamp: new Date().toISOString(),
            type: 'error'
          }
        }, '*');
      } catch (e) {
        console.error('Failed to report script execution error:', e);
      }
    }
  }

  window.GMBridge.ExternalScriptLoader = ExternalScriptLoader;
  window.GMBridge.executeUserScriptWithDependencies = executeUserScriptWithDependencies;

  window.postMessage({ type: "GM_CORE_EXECUTED" }, "*");
})();

// Crazy !