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
      // If in the ISOLATED world, use the direct chrome.runtime.sendMessage
      if (this.worldType === 'ISOLATED' && typeof chrome?.runtime?.sendMessage === 'function') {
        return this.callIsolated(action, payload);
      }
      // Otherwise, fallback to the MAIN world postMessage mechanism
      return this.callMain(action, payload);
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

  // Handeling GM APIS
  class GMAPIRegistry {
    constructor(bridge, resourceManager) {
      this.bridge = bridge;
      this.resourceManager = resourceManager;
      this.cache = new Map();
    }

    async setValue(name, value) {
      const resolvedValue = value instanceof Promise ? await value : value;
      this.cache.set(name, resolvedValue);
      return this.bridge.call("setValue", { name, value: resolvedValue });
    }

    getValue(name, defaultValue) {
      if (this.cache.has(name)) {
        return this.cache.get(name);
      }

      // Populate cache asynchronously
      this.bridge
        .call("getValue", { name, defaultValue })
        .then((value) => this.cache.set(name, value))
        .catch(() => {});

      return defaultValue;
    }

    async deleteValue(name) {
      this.cache.delete(name);
      return this.bridge.call("deleteValue", { name });
    }

    listValues() {
      return Array.from(this.cache.keys());
    }

    initializeCache(initialValues = {}) {
      this.cache.clear();
      Object.entries(initialValues).forEach(([k, v]) => this.cache.set(k, v));
    }

    // Main registraction
    // As a whole the GM system could be a bit nicer
    registerAll(enabled) {
      this._ensureGMNamespace();
      this._registerStorage(enabled);
      this._registerUI(enabled);
      this._registerResources(enabled);
      this._registerUtilities(enabled);
      this._registerNetwork(enabled);
      this._registerAdvanced(enabled);
    }

    _ensureGMNamespace() {
      if (typeof window.GM === "undefined") {
        window.GM = {};
      }
    }

    _registerStorage(enabled) {
      if (enabled.gmSetValue) {
        const fn = (name, value) => this.setValue(name, value);
        window.GM_setValue = window.GM.setValue = fn;
      }
      
      if (enabled.gmGetValue) {
        const fn = (name, defaultValue) => this.getValue(name, defaultValue);
        window.GM_getValue = window.GM.getValue = fn;
      }
      
      if (enabled.gmDeleteValue) {
        const fn = (name) => this.deleteValue(name);
        window.GM_deleteValue = window.GM.deleteValue = fn;
      }
      
      if (enabled.gmListValues) {
        const fn = () => this.listValues();
        window.GM_listValues = window.GM.listValues = fn;
      }
    }

    _registerUI(enabled) {
      // GM_openInTab
      if (enabled.gmOpenInTab) {
        const fn = (url, opts = {}) => {
          return this.bridge.call("openInTab", { url, options: opts });
        };
        window.GM_openInTab = window.GM.openInTab = fn;
      }

      // GM_notification
      if (enabled.gmNotification) {
        const fn = (textOrDetails, titleOrOnDone, image) => {
          const details = typeof textOrDetails === "object" 
            ? { ...textOrDetails } 
            : { text: textOrDetails, title: titleOrOnDone, image };
          
          // Filter out functions
          const cloneable = Object.fromEntries(
            Object.entries(details).filter(([, v]) => typeof v !== "function")
          );
          
          return this.bridge.call("notification", { details: cloneable });
        };
        window.GM_notification = window.GM.notification = fn;
      }

      // GM_registerMenuCommand
      if (enabled.gmRegisterMenuCommand) {
        const fn = (caption, onClick, accessKey) => {
          if (typeof caption !== "string" || typeof onClick !== "function") {
            console.warn(
              "GM_registerMenuCommand: Expected (string caption, function onClick, [string accessKey])"
            );
            return null;
          }
          
          const commandId = `gm_menu_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 8)}`;
          
          const command = { commandId, caption, onClick, accessKey };
          
          window.__gmMenuCommands = window.__gmMenuCommands || [];
          window.__gmMenuCommands.push(command);
          
          return commandId;
        };
        window.GM_registerMenuCommand = window.GM.registerMenuCommand = fn;
      }

      // GM_unregisterMenuCommand
      if (enabled.gmUnregisterMenuCommand) {
        const fn = (commandId) => {
          if (typeof commandId !== "string") {
            console.warn("GM_unregisterMenuCommand: Expected string commandId");
            return;
          }
          
          if (window.__gmMenuCommands) {
            const index = window.__gmMenuCommands.findIndex(
              (cmd) => cmd.commandId === commandId
            );
            if (index !== -1) {
              window.__gmMenuCommands.splice(index, 1);
            }
          }
        };
        window.GM_unregisterMenuCommand = window.GM.unregisterMenuCommand = fn;
      }
    }

    _registerResources(enabled) {
      if (enabled.gmGetResourceText) {
        const fn = (name) => this.resourceManager.getText(name);
        window.GM_getResourceText = window.GM.getResourceText = fn;
      }
      
      if (enabled.gmGetResourceURL) {
        const fn = (name) => this.resourceManager.getURL(name);
        window.GM_getResourceURL = window.GM.getResourceURL = fn;
      }
    }

    _registerUtilities(enabled) {
      // GM_addStyle
      if (enabled.gmAddStyle) {
        const fn = (css) => {
          const style = document.createElement("style");
          style.textContent = css;
          (document.head || document.documentElement).appendChild(style);
          return style;
        };
        window.GM_addStyle = window.GM.addStyle = fn;
      }

      // GM_addElement
      if (enabled.gmAddElement) {
        const fn = (arg1, arg2, arg3 = {}) => {
          try {
            let parent;
            let tag;
            let attributes;

            // Support both signatures:
            // 1) GM_addElement(tag, attributes)
            // 2) GM_addElement(parent, tag, attributes)
            if (typeof arg1 === 'string') {
              tag = arg1;
              attributes = (arg2 && typeof arg2 === 'object') ? arg2 : {};
              
              // Default parent by tag
              const lower = tag.toLowerCase();
              parent = (lower === 'style' || lower === 'script' || lower === 'link')
                ? (document.head || document.documentElement || document.body)
                : (document.body || document.documentElement || document.head);
            } else {
              parent = arg1;
              tag = arg2;
              attributes = (arg3 && typeof arg3 === 'object') ? arg3 : {};
            }

            if (!parent || typeof parent.appendChild !== 'function' || typeof tag !== 'string') {
              console.warn('GM_addElement: parent must be a valid DOM node and tag must be a string');
              return null;
            }

            const el = document.createElement(tag);

            // Apply attributes and direct properties
            Object.entries(attributes).forEach(([k, v]) => {
              if (v == null) return;
              
              try {
                if (k === 'style' && typeof v === 'string') {
                  el.style.cssText = v;
                } else if (k in el) {
                  el[k] = v;
                } else {
                  el.setAttribute(k, String(v));
                }
              } catch {
                try { 
                  el.setAttribute(k, String(v)); 
                } catch {
                  // Ignore errors
                }
              }
            });

            parent.appendChild(el);
            return el;
          } catch (err) {
            console.error('GM_addElement: Failed to create or append element:', err);
            return null;
          }
        };
        window.GM_addElement = window.GM.addElement = fn;
      }
    }

    _registerNetwork(enabled) {
      // GM_setClipboard
      if (enabled.gmSetClipboard) {
        const fn = (data, type) => {
          return this.bridge.call("setClipboard", { data, type });
        };
        window.GM_setClipboard = window.GM.setClipboard = fn;
      }

      // GM_xmlhttpRequest
      if (enabled.gmXmlhttpRequest) {
        const fn = (details = {}) => {
          if (!details.url) {
            throw new Error("GM_xmlhttpRequest: 'url' is required");
          }

          const currentOrigin = window.location.origin;
          const requestOrigin = new URL(details.url, window.location.href).origin;

          if (requestOrigin === currentOrigin) {
            return this._handleSameOriginXmlhttpRequest(details);
          } else {
            return this._handleCrossOriginXmlhttpRequest(details);
          }
        };
        window.GM_xmlhttpRequest = window.GM.xmlhttpRequest = fn;
      }
    }

    // Duplicate from inject...
    // Ill fix it later
    _handleSameOriginXmlhttpRequest(details) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(details.method || "GET", details.url);

        // Set headers
        if (details.headers) {
          for (const header in details.headers) {
            xhr.setRequestHeader(header, details.headers[header]);
          }
        }

        // Set responseType
        if (details.responseType) {
          xhr.responseType = details.responseType;
        }

        // Set timeout
        if (details.timeout) {
          xhr.timeout = details.timeout;
        }

        // Event listeners
        xhr.onload = () => {
          const response = {
            readyState: xhr.readyState,
            responseHeaders: xhr.getAllResponseHeaders(),
            responseText: xhr.responseText,
            response: xhr.response,
            status: xhr.status,
            statusText: xhr.statusText,
            finalUrl: xhr.responseURL,
            context: details.context,
          };
          
          if (details.onload) {
            details.onload(response);
          }
          
          resolve(response);
        };

        xhr.onerror = () => {
          const error = new Error("Network error");
          if (details.onerror) {
            details.onerror(error);
          }
          reject(error);
        };

        xhr.ontimeout = () => {
          const error = new Error("Timeout");
          if (details.ontimeout) {
            details.ontimeout(error);
          }
          reject(error);
        };

        // Send request
        xhr.send(details.data);
      });
    }
    // NEEDS HELP!
    _handleCrossOriginXmlhttpRequest(details) {
      const callbacks = {};
      const cloneableDetails = {};
      
      Object.entries(details).forEach(([key, value]) => {
        if (typeof value === 'function') {
          callbacks[key] = value;
        } else {
          cloneableDetails[key] = value;
        }
      });

      return this.bridge.call("xmlhttpRequest", { details: cloneableDetails })
        .then((response) => {
          if (callbacks.onload) {
            try {
              callbacks.onload(response);
            } catch (error) {
              console.error("GM_xmlhttpRequest onload error:", error);
            }
          }
          return response;
        })
        .catch((error) => {
          if (callbacks.onerror) {
            try {
              callbacks.onerror(error);
            } catch (callbackError) {
              console.error("GM_xmlhttpRequest onerror callback failed:", callbackError);
            }
          }
          throw error;
        });
    }

    _registerAdvanced(enabled) {
      if (enabled.unsafeWindow) {
        try {
          Object.defineProperty(window, "unsafeWindow", {
            value: window,
            writable: false,
            configurable: false,
          });
        } catch (e) {
          window.unsafeWindow = window;
        }
      }
    }
  }

  // I feel like we could move this to its own independent file
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
      
      const blob = new Blob([userCode], { type: "text/javascript" });
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
  window.GMBridge.GMAPIRegistry = GMAPIRegistry;
  window.GMBridge.executeUserScriptWithDependencies = executeUserScriptWithDependencies;

  window.postMessage({ type: "GM_CORE_EXECUTED" }, "*");
})();

// Crazy !