(function () {
  'use strict';

  if (typeof window.GMBridge === "undefined" || typeof window.GMBridge.GMAPIRegistry !== "undefined") {
    return;
  }

  // Handeling GM APIS
  class GMAPIRegistry {
    constructor(bridge, resourceManager) {
      this.bridge = bridge;
      this.resourceManager = resourceManager;
      this.cache = new Map();
      this.valueChangeListeners = new Map();
      this.listenerIdCounter = 0;

      window.addEventListener("message", (event) => {
        if (event.source === window && event.data?.type === "GM_VALUE_CHANGED") {
          const { name, oldValue, newValue, remote } = event.data.payload;
          const listeners = this.valueChangeListeners.get(name);
          if (listeners) {
            for (const listener of listeners.values()) {
              try {
                listener(name, oldValue, newValue, remote);
              } catch (e) {
                console.error("Error in value change listener:", e);
              }
            }
          }
        }
      });
    }

    async setValue(name, value) {
      if (typeof name !== 'string' || name === '') {
        console.warn('GM_setValue: name must be a non-empty string');
        return;
      }
      const resolvedValue = value instanceof Promise ? await value : value;
      this.cache.set(name, resolvedValue);
      return this.bridge.call("setValue", { name, value: resolvedValue });
    }

    getValue(name, defaultValue) {
      if (typeof name !== 'string' || name === '') {
        console.warn('GM_getValue: name must be a non-empty string');
        return defaultValue;
      }
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

    async getValueAsync(name, defaultValue) {
      if (typeof name !== 'string' || name === '') {
        console.warn('GM.getValue: name must be a non-empty string');
        return defaultValue;
      }
      if (this.cache.has(name)) {
        return this.cache.get(name);
      }
      try {
        const value = await this.bridge.call("getValue", { name, defaultValue });
        this.cache.set(name, value);
        return value;
      } catch {
        return defaultValue;
      }
    }

    async deleteValue(name) {
      if (typeof name !== 'string' || name === '') {
        console.warn('GM_deleteValue: name must be a non-empty string');
        return;
      }
      this.cache.delete(name);
      return this.bridge.call("deleteValue", { name });
    }

    listValues() {
      return Array.from(this.cache.keys()).filter(key => typeof key === 'string' && key !== '');
    }

    initializeCache(initialValues = {}) {
      this.cache.clear();
      Object.entries(initialValues).forEach(([k, v]) => {
        if (typeof k === 'string' && k !== '') {
          this.cache.set(k, v);
        }
      });
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
        const syncFn = (name, defaultValue) => this.getValue(name, defaultValue);
        const asyncFn = (name, defaultValue) => this.getValueAsync(name, defaultValue);
        window.GM_getValue = syncFn;
        window.GM.getValue = asyncFn;
      }

      if (enabled.gmDeleteValue) {
        const fn = (name) => this.deleteValue(name);
        window.GM_deleteValue = window.GM.deleteValue = fn;
      }

      if (enabled.gmListValues) {
        const syncFn = () => Array.from(this.cache.keys()).filter(key => typeof key === 'string' && key !== '');
        const asyncFn = () => this.bridge.call("listValues");
        window.GM_listValues = syncFn;
        window.GM.listValues = asyncFn;
      }

      if (enabled.gmAddValueChangeListener) {
        const addFn = (name, callback) => {
          if (typeof name !== 'string' || typeof callback !== 'function') return;
          const listenerId = this.listenerIdCounter++;
          if (!this.valueChangeListeners.has(name)) {
            this.valueChangeListeners.set(name, new Map());
          }
          this.valueChangeListeners.get(name).set(listenerId, callback);
          this.bridge.call("addValueChangeListener", { name });
          return listenerId;
        };
        window.GM_addValueChangeListener = window.GM.addValueChangeListener = addFn;

        const removeFn = (listenerId) => {
          for (const [name, listeners] of this.valueChangeListeners.entries()) {
            if (listeners.has(listenerId)) {
              listeners.delete(listenerId);
              if (listeners.size === 0) {
                this.valueChangeListeners.delete(name);
                this.bridge.call("removeValueChangeListener", { name });
              }
              break;
            }
          }
        };
        window.GM_removeValueChangeListener = window.GM.removeValueChangeListener = removeFn;
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
        const fn = async (name) => {
          if (typeof name !== 'string' || name === '') {
            console.warn('GM_getResourceText: resource name must be a non-empty string');
            return '';
          }
          const text = this.resourceManager.getText(name);
          // Ensure we always return a string, never null or undefined
          return (text != null) ? String(text) : '';
        };
        window.GM_getResourceText = window.GM.getResourceText = fn;
      }

      if (enabled.gmGetResourceURL) {
        const fn = async (name) => {
          if (typeof name !== 'string' || name === '') {
            console.warn('GM_getResourceURL: resource name must be a non-empty string');
            return '';
          }
          const url = this.resourceManager.getURL(name);
          // Ensure we always return a string, never null or undefined
          return (url != null) ? String(url) : '';
        };
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

      if (enabled.gmDownload) {
        const fn = (urlOrDetails, name) => {
          const details = typeof urlOrDetails === 'object' ? urlOrDetails : { url: urlOrDetails, name: name };
          const cloneableDetails = Object.fromEntries(
            Object.entries(details).filter(([, v]) => typeof v !== 'function')
          );
          return this.bridge.call("download", cloneableDetails);
        };
        window.GM_download = window.GM.download = fn;
      }

      // GM_xmlhttpRequest
      if (enabled.gmXmlhttpRequest) {
        const fn = (details = {}) => {
          if (!details.url) {
            throw new Error("GM_xmlhttpRequest: 'url' is required");
          }

          try {
            new URL(details.url);
          } catch {
            console.error(`CodeTweak: GM_xmlhttpRequest failed due to an invalid URL: "${details.url}"`);
            if (details.onerror) {
              details.onerror(new TypeError(`Invalid URL: ${details.url}`));
            }
            return;
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
      if (details.onreadystatechange) {
         xhr.onreadystatechange = details.onreadystatechange;
       }

       if (details.onprogress) {
         xhr.onprogress = details.onprogress;
       }

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
      };

      xhr.onerror = () => {
        const error = new Error("Network error");
        if (details.onerror) {
          details.onerror(error);
        }
      };

      xhr.ontimeout = () => {
        const error = new Error("Timeout");
        if (details.ontimeout) {
          details.ontimeout(error);
        }
      };

      // Send request
      xhr.send(details.data);

      return {
        abort: () => xhr.abort()
      };
    }
    // NEEDS HELP!
    _handleCrossOriginXmlhttpRequest(details) {
      // Assume cross-origin requests are allowed (settings check handled by bridge)
      const callbacks = {};
      const cloneableDetails = {};

      Object.entries(details).forEach(([key, value]) => {
        if (typeof value === 'function') {
          callbacks[key] = value;
        } else {
          cloneableDetails[key] = value;
        }
      });

      let timeoutId;
      let onloadCalled = false;
      let aborted = false;

      if (details.timeout) {
        timeoutId = setTimeout(() => {
          if (!onloadCalled && !aborted) {
            onloadCalled = true;
            if (callbacks.ontimeout) {
              try {
                callbacks.ontimeout(new Error("Timeout"));
              } catch (error) {
                console.error("GM_xmlhttpRequest ontimeout error:", error);
              }
            }
          }
        }, details.timeout);
      }

      // Start the request asynchronously
      this.bridge.call("xmlhttpRequest", { details: cloneableDetails })
        .then(async (response) => {
          if (onloadCalled || aborted) return;
          onloadCalled = true;
          clearTimeout(timeoutId);

          if (response && cloneableDetails.responseType === 'blob' && response.response && typeof response.response === 'string' && response.response.startsWith('data:')) {
            try {
              const res = await fetch(response.response);
              const blob = await res.blob();
              response.response = blob;
            } catch (e) {
              console.error("CodeTweak: Failed to reconstruct blob from data URL.", e);
            }
          }

          if (response && cloneableDetails.responseType === 'arraybuffer' && response.response && typeof response.response === 'string' && response.response.startsWith('data:')) {
            try {
              const res = await fetch(response.response);
              const arrayBuffer = await res.arrayBuffer();
              response.response = arrayBuffer;
            } catch (e) {
              console.error("CodeTweak: Failed to reconstruct arraybuffer from data URL.", e);
            }
          }

          // Handle responseType conversion if not properly set
          if (response && cloneableDetails.responseType === 'arraybuffer' && !(response.response instanceof ArrayBuffer)) {
            if (typeof response.response === 'string') {
              const encoder = new TextEncoder();
              response.response = encoder.encode(response.response).buffer;
            } else if (typeof response.response === 'object') {
              const str = JSON.stringify(response.response);
              const encoder = new TextEncoder();
              response.response = encoder.encode(str).buffer;
            }
          }

          if (response && cloneableDetails.responseType === 'blob' && !(response.response instanceof Blob)) {
            if (typeof response.response === 'string') {
              try {
                const res = await fetch('data:text/plain;base64,' + btoa(response.response));
                response.response = await res.blob();
              } catch (e) {
                console.error("CodeTweak: Failed to convert string to blob.", e);
              }
            }
          }

          // Call onreadystatechange with readyState 4
          if (callbacks.onreadystatechange) {
            try {
              callbacks.onreadystatechange({
                readyState: 4,
                responseHeaders: response.responseHeaders,
                responseText: response.responseText,
                response: response.response,
                status: response.status,
                statusText: response.statusText,
                finalUrl: response.finalUrl,
                context: details.context,
              });
            } catch (error) {
              console.error("GM_xmlhttpRequest onreadystatechange error:", error);
            }
          }

          // Call onprogress with some progress info
          if (callbacks.onprogress) {
            try {
              callbacks.onprogress({
                loaded: response.responseText ? response.responseText.length : 0,
                total: 0,
                lengthComputable: false,
                context: details.context,
              });
            } catch (error) {
              console.error("GM_xmlhttpRequest onprogress error:", error);
            }
          }

          if (callbacks.onload) {
            try {
              callbacks.onload(response);
            } catch (error) {
              console.error("GM_xmlhttpRequest onload error:", error);
            }
          }
        })
        .catch((error) => {
          if (onloadCalled || aborted) return;
          onloadCalled = true;
          clearTimeout(timeoutId);
          if (callbacks.onerror) {
            try {
              callbacks.onerror(error);
            } catch (callbackError) {
              console.error("GM_xmlhttpRequest onerror callback failed:", callbackError);
            }
          }
        });

      return {
        abort: () => {
          aborted = true;
          onloadCalled = true; // Prevent any further callbacks
          clearTimeout(timeoutId);
        }
      };
    }

    _registerAdvanced(enabled) {
      if (enabled.unsafeWindow) {
        try {
          Object.defineProperty(window, "unsafeWindow", {
            value: window,
            writable: false,
            configurable: false,
          });
        } catch {
          window.unsafeWindow = window;
        }
      }

      if (enabled.gmLog) {
        const fn = (...args) => console.log(...args);
        window.GM_log = window.GM.log = fn;
      }
    }
  }

  window.GMBridge.GMAPIRegistry = GMAPIRegistry;
})();
