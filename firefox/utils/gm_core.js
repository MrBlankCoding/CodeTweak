(function () {
  // Prevent redefining if already injected
  if (typeof window.GMBridge !== "undefined") {
    return;
  }

  // ==================================================
  // CORE CLASSES & HELPERS
  // ==================================================

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

      // Populate cache asynchronously for future calls
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
          const commandId = `gm_menu_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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
    }

    // ---- NETWORK ----
    _registerNetwork(e) {
      if (e.gmSetClipboard) {
        const fn = (data, type) => this.bridge.call("setClipboard", { data, type });
        window.GM_setClipboard = window.GM.setClipboard = fn;
      }
      if (e.gmXmlHttpRequest) {
        const fn = (details = {}) => {
          const cloneableDetails = { ...details };
          delete cloneableDetails.onload;
          delete cloneableDetails.onerror;
          const onload = details.onload;
          const onerror = details.onerror;
          return this.bridge.call("xmlHttpRequest", { details: cloneableDetails })
            .then((response) => {
              if (typeof onload === "function") {
                try { onload(response); } catch (e) { console.error("GM_xmlHttpRequest onload error:", e); }
              }
              return response;
            })
            .catch((error) => {
              if (typeof onerror === "function") {
                try { onerror(error); } catch (e) { console.error("GM_xmlHttpRequest onerror error:", e); }
              }
              throw error;
            });
        };
        window.GM_xmlHttpRequest = window.GM.xmlHttpRequest = fn;
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

  // Expose to window so executor functions can use them
  window.GMBridge = GMBridge;
  window.GMValueManager = GMValueManager;
  window.GMAPIRegistry = GMAPIRegistry;
  window.ResourceManager = ResourceManager;
  window.ExternalScriptLoader = ExternalScriptLoader;
  window.executeUserScriptWithDependencies = executeUserScriptWithDependencies;
})();
