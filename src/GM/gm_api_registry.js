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
            const absoluteURL = new URL(details.url, window.location.href);
            const normalizedDetails = {
              ...details,
              url: absoluteURL.toString(),
              method: (details.method || "GET").toUpperCase(),
            };

            if (absoluteURL.origin === window.location.origin) {
              return this._handleSameOriginXmlhttpRequest(normalizedDetails);
            }
            return this._handleCrossOriginXmlhttpRequest(normalizedDetails);
          } catch (error) {
            console.error(
              `CodeTweak: GM_xmlhttpRequest failed due to an invalid URL: "${details.url}"`,
              error
            );
            this._invokeCallback(
              details.onerror,
              "onerror",
              new TypeError(`Invalid URL: ${details.url}`)
            );
            return {
              abort: () => {},
            };
          }
        };
        window.GM_xmlhttpRequest = window.GM.xmlhttpRequest = fn;
      }
    }

    _extractCallbacks(details) {
      const callbacks = {};
      const requestDetails = {};

      Object.entries(details).forEach(([key, value]) => {
        if (typeof value === "function") {
          callbacks[key] = value;
        } else {
          requestDetails[key] = value;
        }
      });

      return { callbacks, requestDetails };
    }

    _invokeCallback(callback, callbackName, payload) {
      if (typeof callback !== "function") {
        return;
      }
      try {
        callback(payload);
      } catch (error) {
        console.error(`GM_xmlhttpRequest ${callbackName} callback failed:`, error);
      }
    }

    async _normalizeResponseData(response, responseType) {
      if (!response || typeof response !== "object") {
        return {
          readyState: 4,
          responseHeaders: "",
          responseText: "",
          response: null,
          status: 0,
          statusText: "",
          finalUrl: "",
          context: undefined,
        };
      }

      if (!responseType) {
        return response;
      }

      const normalized = { ...response };
      if (responseType === "arraybuffer" && !(normalized.response instanceof ArrayBuffer)) {
        try {
          if (typeof normalized.response === "string") {
            if (normalized.response.startsWith("data:")) {
              const res = await fetch(normalized.response);
              normalized.response = await res.arrayBuffer();
            } else {
              normalized.response = new TextEncoder().encode(normalized.response).buffer;
            }
          } else if (normalized.response instanceof Blob) {
            normalized.response = await normalized.response.arrayBuffer();
          } else if (normalized.response != null) {
            const serialized = JSON.stringify(normalized.response);
            normalized.response = new TextEncoder().encode(serialized).buffer;
          }
        } catch (error) {
          console.error("CodeTweak: Failed to normalize arraybuffer response.", error);
        }
      }

      if (responseType === "blob" && !(normalized.response instanceof Blob)) {
        try {
          if (typeof normalized.response === "string" && normalized.response.startsWith("data:")) {
            const res = await fetch(normalized.response);
            normalized.response = await res.blob();
          } else if (typeof normalized.response === "string") {
            normalized.response = new Blob([normalized.response], { type: "text/plain" });
          } else if (normalized.response instanceof ArrayBuffer) {
            normalized.response = new Blob([normalized.response]);
          } else if (normalized.response != null) {
            normalized.response = new Blob([JSON.stringify(normalized.response)], {
              type: "application/json",
            });
          }
        } catch (error) {
          console.error("CodeTweak: Failed to normalize blob response.", error);
        }
      }

      return normalized;
    }

    _notifyCompletion(callbacks, response, context) {
      const safeResponse = response || {
        readyState: 4,
        responseHeaders: "",
        responseText: "",
        response: null,
        status: 0,
        statusText: "",
        finalUrl: "",
      };

      this._invokeCallback(callbacks.onreadystatechange, "onreadystatechange", {
        readyState: 4,
        responseHeaders: safeResponse.responseHeaders,
        responseText: safeResponse.responseText,
        response: safeResponse.response,
        status: safeResponse.status,
        statusText: safeResponse.statusText,
        finalUrl: safeResponse.finalUrl,
        context,
      });

      this._invokeCallback(callbacks.onprogress, "onprogress", {
        loaded: safeResponse.responseText ? safeResponse.responseText.length : 0,
        total: 0,
        lengthComputable: false,
        context,
      });

      this._invokeCallback(callbacks.onload, "onload", safeResponse);
    }

    _buildXhrResponse(xhr, context) {
      let responseText = "";
      try {
        responseText = xhr.responseText ?? "";
      } catch {
        responseText = "";
      }

      return {
        readyState: xhr.readyState,
        responseHeaders: xhr.getAllResponseHeaders(),
        responseText,
        response: xhr.response,
        status: xhr.status,
        statusText: xhr.statusText,
        finalUrl: xhr.responseURL,
        context,
      };
    }

    _handleSameOriginXmlhttpRequest(details) {
      const { callbacks, requestDetails } = this._extractCallbacks(details);
      const xhr = new XMLHttpRequest();
      xhr.open(requestDetails.method || "GET", requestDetails.url);

      if (requestDetails.headers) {
        for (const header in requestDetails.headers) {
          xhr.setRequestHeader(header, requestDetails.headers[header]);
        }
      }

      if (requestDetails.responseType) {
        xhr.responseType = requestDetails.responseType;
      }

      if (requestDetails.timeout) {
        xhr.timeout = requestDetails.timeout;
      }

      xhr.onreadystatechange = () => {
        this._invokeCallback(
          callbacks.onreadystatechange,
          "onreadystatechange",
          this._buildXhrResponse(xhr, requestDetails.context)
        );
      };

      xhr.onprogress = (event) => {
        this._invokeCallback(callbacks.onprogress, "onprogress", {
          loaded: event.loaded,
          total: event.total,
          lengthComputable: event.lengthComputable,
          context: requestDetails.context,
        });
      };

      xhr.onload = async () => {
        const normalizedResponse = await this._normalizeResponseData(
          this._buildXhrResponse(xhr, requestDetails.context),
          requestDetails.responseType
        );
        this._invokeCallback(callbacks.onload, "onload", normalizedResponse);
      };

      xhr.onerror = () => {
        this._invokeCallback(callbacks.onerror, "onerror", new Error("Network error"));
      };

      xhr.ontimeout = () => {
        this._invokeCallback(callbacks.ontimeout, "ontimeout", new Error("Timeout"));
      };

      xhr.send(requestDetails.data);

      return {
        abort: () => xhr.abort(),
      };
    }

    _handleCrossOriginXmlhttpRequest(details) {
      const { callbacks, requestDetails } = this._extractCallbacks(details);

      let timeoutId;
      let completed = false;
      let aborted = false;

      if (requestDetails.timeout) {
        timeoutId = setTimeout(() => {
          if (!completed && !aborted) {
            completed = true;
            this._invokeCallback(callbacks.ontimeout, "ontimeout", new Error("Timeout"));
          }
        }, requestDetails.timeout);
      }

      this.bridge
        .call("xmlhttpRequest", { details: requestDetails })
        .then(async (response) => {
          if (completed || aborted) return;
          completed = true;
          clearTimeout(timeoutId);

          const normalizedResponse = await this._normalizeResponseData(
            response,
            requestDetails.responseType
          );
          this._notifyCompletion(
            callbacks,
            normalizedResponse,
            requestDetails.context
          );
        })
        .catch((error) => {
          if (completed || aborted) return;
          completed = true;
          clearTimeout(timeoutId);
          this._invokeCallback(callbacks.onerror, "onerror", error);
        });

      return {
        abort: () => {
          aborted = true;
          completed = true;
          clearTimeout(timeoutId);
        },
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
