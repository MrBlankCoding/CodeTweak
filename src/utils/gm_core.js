(function () {
  if (typeof window.GMBridge !== "undefined") {
    return;
  }

  class GMBridge {
    constructor(scriptId, extensionId) {
      this.scriptId = scriptId;
      this.extensionId = extensionId;
      this.messageIdCounter = 0;
      this.pendingPromises = new Map();

      this.setupMessageListener();
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
  }

  class GMValueManager {
    constructor(bridge) {
      this.bridge = bridge;
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
  }

  class ResourceManager {
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
  }

  class ExternalScriptLoader {
    constructor() {
      this.loadedScripts = new Set();
    }

    async loadScript(url) {
      if (this.loadedScripts.has(url)) return;
      await this.injectScriptTag(url);
      this.loadedScripts.add(url);
    }

    async loadScripts(urls) {
      if (!Array.isArray(urls)) return;
      for (const u of urls) {
        await this.loadScript(u);
      }
    }

    injectScriptTag(src) {
      return new Promise((resolve, reject) => {
        const el = document.createElement("script");

        // Handle Trusted Types enforcement for script URLs
        let trustedSrc = src;
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
          try {
            if (!window.__ctTrustedScriptURLPolicy) {
              window.__ctTrustedScriptURLPolicy = window.trustedTypes.createPolicy(
                "codetweak",
                {
                  createScriptURL: (input) => input,
                }
              );
            }
            trustedSrc = window.__ctTrustedScriptURLPolicy.createScriptURL(src);
          } catch (e) {
            console.error("Failed to create trusted script URL:", e);
            console.warn("Falling back to raw URL.");
            // If policy creation failed (likely already exists), fall back to raw URL.
            trustedSrc = src;
          }
        }

        el.src = trustedSrc;
        el.async = false; // preserve execution order
        el.onload = resolve;
        el.onerror = () => reject(new Error(`Failed to load script ${src}`));
        (document.head || document.documentElement).appendChild(el);
      });
    }
  }

  class GMAPIRegistry {
    constructor(bridge, valueManager, resourceManager) {
      this.bridge = bridge;
      this.valueManager = valueManager;
      this.resourceManager = resourceManager;
    }

    registerAll(enabled) {
      this._ensureGMNamespace();
      this._registerStorage(enabled);
      this._registerUI(enabled);
      this._registerResources(enabled);
      this._registerUtilities(enabled);
      this._registerNetwork(enabled);
    }

    _ensureGMNamespace() {
      if (typeof window.GM === "undefined") window.GM = {};
    }

    // ---- STORAGE ----
    _registerStorage(e) {
      if (e.gmSetValue) {
        const fn = (n, v) => this.valueManager.setValue(n, v);
        window.GM_setValue = window.GM.setValue = fn;
      }
      if (e.gmGetValue) {
        const fn = (n, d) => this.valueManager.getValue(n, d);
        window.GM_getValue = window.GM.getValue = fn;
      }
      if (e.gmDeleteValue) {
        const fn = (n) => this.valueManager.deleteValue(n);
        window.GM_deleteValue = window.GM.deleteValue = fn;
      }
      if (e.gmListValues) {
        const fn = () => this.valueManager.listValues();
        window.GM_listValues = window.GM.listValues = fn;
      }
    }

    // ---- UI ----
    _registerUI(e) {
      if (e.gmOpenInTab) {
        const fn = (url, opts = {}) => this.bridge.call("openInTab", { url, options: opts });
        window.GM_openInTab = window.GM.openInTab = fn;
      }
      if (e.gmNotification) {
        const fn = (textOrDetails, titleOrOnDone, image) => {
          const details = typeof textOrDetails === "object" ? { ...textOrDetails } : { text: textOrDetails, title: titleOrOnDone, image };
          const cloneable = Object.fromEntries(Object.entries(details).filter(([,v]) => typeof v !== "function"));
          return this.bridge.call("notification", { details: cloneable });
        };
        window.GM_notification = window.GM.notification = fn;
      }

      // ---- MENU COMMAND ----
      if (e.gmRegisterMenuCommand) {
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
    }

    // ---- RESOURCES ----
    _registerResources(e) {
      if (e.gmGetResourceText) {
        const fn = (name) => this.resourceManager.getText(name);
        window.GM_getResourceText = window.GM.getResourceText = fn;
      }
      if (e.gmGetResourceURL) {
        const fn = (name) => this.resourceManager.getURL(name);
        window.GM_getResourceURL = window.GM.getResourceURL = fn;
      }
    }

    // ---- UTILITIES ----
    _registerUtilities(e) {
      if (e.gmAddStyle) {
        const fn = (css) => {
          const style = document.createElement("style");
          style.textContent = css;
          (document.head || document.documentElement).appendChild(style);
          return style;
        };
        window.GM_addStyle = window.GM.addStyle = fn;
      }
      if (e.gmAddElement) {
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
              } catch (_e) {
                // Fallback to attribute if direct assignment fails
                try { el.setAttribute(k, String(v)); } catch (_e2) {}
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

    // ---- NETWORK ----
    _registerNetwork(e) {
      if (e.gmSetClipboard) {
        const fn = (data, type) => this.bridge.call("setClipboard", { data, type });
        window.GM_setClipboard = window.GM.setClipboard = fn;
      }
      if (e.gmXmlhttpRequest) {
        const fn = (details = {}) => {
          // Separate callbacks from cloneable details
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
        };
        window.GM_xmlhttpRequest = window.GM.xmlhttpRequest = fn;
      }
    }
  }

  // Helper to execute user code after ensuring @require dependencies are loaded.
  async function executeUserScriptWithDependencies(userCode, scriptId, requireUrls, loader) {
    try {
      await loader.loadScripts(requireUrls);
      const blob = new Blob([userCode], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);

      await new Promise((resolve, reject) => {
        const scriptEl = document.createElement("script");

        // Handle Trusted Types enforcement for script URLs
        let trustedSrc = blobUrl;
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
          try {
            if (!window.__ctTrustedScriptURLPolicy) {
              window.__ctTrustedScriptURLPolicy = window.trustedTypes.createPolicy(
                "codetweak",
                {
                  createScriptURL: (input) => input,
                }
              );
            }
            trustedSrc = window.__ctTrustedScriptURLPolicy.createScriptURL(blobUrl);
          } catch (e) {
            console.error("Failed to create trusted script URL:", e);
            console.warn("Falling back to raw URL.");
            // If policy creation failed (likely already exists), fall back to raw URL.
            trustedSrc = blobUrl;
          }
        }

        scriptEl.src = trustedSrc;
        scriptEl.async = false; // maintain order
        scriptEl.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        scriptEl.onerror = (event) => {
          URL.revokeObjectURL(blobUrl);
          reject(
            new Error(
              `Failed to execute user script ${scriptId}: ${event?.message || "unknown error"}`
            )
          );
        };
        (document.head || document.documentElement || document.body).appendChild(
          scriptEl
        );
      });
    } catch (err) {
      console.error(`CodeTweak: Error executing user script ${scriptId}:`, err);
    }
  }

  window.GMBridge = GMBridge;
  window.GMValueManager = GMValueManager;
  window.GMAPIRegistry = GMAPIRegistry;
  window.ResourceManager = ResourceManager;
  window.ExternalScriptLoader = ExternalScriptLoader;
  window.executeUserScriptWithDependencies = executeUserScriptWithDependencies;
})();
