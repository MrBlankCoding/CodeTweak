(() => {
  // src/utils/urlMatchPattern.js
  function urlMatchesPattern(url, pattern) {
    try {
      if (!url || !pattern)
        return false;
      if (pattern === url)
        return true;
      if (pattern === "*://*/*")
        return true;
      if (!pattern.includes("://")) {
        pattern = "*://" + pattern;
      }
      const [patternScheme, patternRest] = pattern.split("://");
      const [patternHost, ...pathParts] = patternRest.split("/");
      const patternPath = "/" + pathParts.join("/");
      const urlObj = new URL(url);
      const urlScheme = urlObj.protocol.slice(0, -1);
      const urlHost = urlObj.hostname;
      const urlPath = urlObj.pathname;
      const schemeRegex = new RegExp(
        "^" + patternScheme.replace(/\*/g, ".*") + "$"
      );
      if (!schemeRegex.test(urlScheme))
        return false;
      if (patternHost === "*") {
      } else if (patternHost.startsWith("*.")) {
        const domain = patternHost.slice(2);
        if (!(urlHost === domain || urlHost.endsWith("." + domain)))
          return false;
      } else if (patternHost.includes("*")) {
        const hostRegex = new RegExp(
          "^" + patternHost.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
        );
        if (!hostRegex.test(urlHost))
          return false;
      } else {
        if (urlHost !== patternHost)
          return false;
      }
      if (["/", "/*"].includes(patternPath))
        return true;
      if (patternPath.endsWith("/**")) {
        const base = patternPath.slice(0, -3);
        return urlPath === base || urlPath.startsWith(base);
      }
      const segments = patternPath.split("/").filter(Boolean);
      const regexParts = ["^"];
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment === "**") {
          regexParts.push("(?:\\/.*)?");
        } else {
          const segmentRegex = segment.replace(/\*/g, "[^/]*").replace(/\./g, "\\.");
          regexParts.push("\\/" + segmentRegex);
        }
      }
      regexParts.push("/?$");
      const pathRegex = new RegExp(regexParts.join(""));
      return pathRegex.test(urlPath);
    } catch (e) {
      console.warn("URL matching error:", e);
      return false;
    }
  }

  // src/utils/inject.js
  var INJECTION_TYPES = Object.freeze({
    DOCUMENT_START: "document_start",
    DOCUMENT_END: "document_end",
    DOCUMENT_IDLE: "document_idle"
  });
  var EXECUTION_WORLDS = Object.freeze({
    MAIN: "MAIN",
    ISOLATED: "ISOLATED"
  });
  var GMBridge = class {
    constructor(scriptId, extensionId) {
      this.scriptId = scriptId;
      this.extensionId = extensionId;
      this.messageIdCounter = 0;
      this.pendingPromises = /* @__PURE__ */ new Map();
      this.setupMessageListener();
    }
    setupMessageListener() {
      window.addEventListener("message", (event) => {
        if (!this.isValidResponse(event))
          return;
        const { messageId, error, result } = event.data;
        const promise = this.pendingPromises.get(messageId);
        if (!promise)
          return;
        if (error) {
          promise.reject(new Error(error));
        } else {
          promise.resolve(result);
        }
        this.pendingPromises.delete(messageId);
      });
    }
    isValidResponse(event) {
      return event.source === window && event.data?.type === "GM_API_RESPONSE" && event.data.extensionId === this.extensionId && this.pendingPromises.has(event.data.messageId);
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
            payload
          },
          "*"
        );
      });
    }
  };
  var GMValueManager = class {
    constructor(bridge) {
      this.bridge = bridge;
      this.cache = /* @__PURE__ */ new Map();
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
      this.bridge.call("getValue", { name, defaultValue }).then((value) => this.cache.set(name, value)).catch((err) => console.warn("Failed to fetch GM value:", err));
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
      Object.entries(initialValues).forEach(([key, value]) => {
        this.cache.set(key, value);
      });
    }
  };
  var GMAPIRegistry = class {
    constructor(bridge, valueManager, resourceManager) {
      this.bridge = bridge;
      this.valueManager = valueManager;
      this.resourceManager = resourceManager;
      this.menuCommands = [];
    }
    registerAll(enabledApis) {
      this.initializeGMNamespace();
      this.registerStorageAPIs(enabledApis);
      this.registerUIAPIs(enabledApis);
      this.registerNetworkAPIs(enabledApis);
      this.registerUtilityAPIs(enabledApis);
      this.registerResourceAPIs(enabledApis);
    }
    initializeGMNamespace() {
      if (typeof window.GM === "undefined") {
        window.GM = {};
      }
    }
    registerStorageAPIs(enabledApis) {
      if (enabledApis.gmSetValue) {
        const setValue = (name, value) => this.valueManager.setValue(name, value);
        window.GM_setValue = setValue;
        window.GM.setValue = setValue;
      }
      if (enabledApis.gmGetValue) {
        const getValue = (name, defaultValue) => this.valueManager.getValue(name, defaultValue);
        window.GM_getValue = getValue;
        window.GM.getValue = getValue;
      }
      if (enabledApis.gmDeleteValue) {
        const deleteValue = (name) => this.valueManager.deleteValue(name);
        window.GM_deleteValue = deleteValue;
        window.GM.deleteValue = deleteValue;
      }
      if (enabledApis.gmListValues) {
        const listValues = () => this.valueManager.listValues();
        window.GM_listValues = listValues;
        window.GM.listValues = listValues;
      }
    }
    registerUIAPIs(enabledApis) {
      if (enabledApis.gmOpenInTab) {
        const openInTab = (url, options = {}) => this.bridge.call("openInTab", { url, options });
        window.GM_openInTab = openInTab;
        window.GM.openInTab = openInTab;
      }
      if (enabledApis.gmNotification) {
        const notification = (textOrDetails, titleOrOnDone, image) => {
          const details = this.normalizeNotificationDetails(
            textOrDetails,
            titleOrOnDone,
            image
          );
          const cloneableDetails = this.removeNonCloneableProperties(details);
          return this.bridge.call("notification", { details: cloneableDetails });
        };
        window.GM_notification = notification;
        window.GM.notification = notification;
      }
      if (enabledApis.gmRegisterMenuCommand) {
        const registerMenuCommand = (caption, onClick, accessKey) => {
          return this.registerMenuCommand(caption, onClick, accessKey);
        };
        window.GM_registerMenuCommand = registerMenuCommand;
        window.GM.registerMenuCommand = registerMenuCommand;
      }
    }
    registerNetworkAPIs(enabledApis) {
      if (enabledApis.gmXmlhttpRequest) {
        const xmlhttpRequest = (details = {}) => this.createXMLhttpRequest(details);
        window.GM_xmlhttpRequest = xmlhttpRequest;
        window.GM.xmlhttpRequest = xmlhttpRequest;
      }
      if (enabledApis.gmSetClipboard) {
        const setClipboard = (data, type) => this.bridge.call("setClipboard", { data, type });
        window.GM_setClipboard = setClipboard;
        window.GM.setClipboard = setClipboard;
      }
    }
    registerUtilityAPIs(enabledApis) {
      if (enabledApis.gmAddStyle) {
        const addStyle = (css) => this.addStyleToDocument(css);
        window.GM_addStyle = addStyle;
        window.GM.addStyle = addStyle;
      }
      if (enabledApis.gmAddElement) {
        const addElement = (parent, tag, attributes = {}) => this.addElementToDocument(parent, tag, attributes);
        window.GM_addElement = addElement;
        window.GM.addElement = addElement;
      }
      this.setupTrustedTypesHelpers();
    }
    setupTrustedTypesHelpers() {
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
          if (!window.__ctUserScriptPolicy) {
            window.__ctUserScriptPolicy = window.trustedTypes.createPolicy("codetweak-userscript", {
              createHTML: (input) => {
                if (typeof input !== "string")
                  return "";
                return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/on\w+\s*=\s*["'][^"']*["']/gi, "").replace(/javascript:/gi, "");
              },
              createScript: (input) => input,
              createScriptURL: (input) => input
            });
          }
          window.GM_setInnerHTML = (element, html) => {
            if (!element || typeof html !== "string")
              return false;
            try {
              const trustedHTML = window.__ctUserScriptPolicy.createHTML(html);
              element.innerHTML = trustedHTML;
              return true;
            } catch (error) {
              console.warn("CodeTweak: Failed to set innerHTML with Trusted Types:", error);
              try {
                element.innerHTML = html;
                return true;
              } catch (fallbackError) {
                console.error("CodeTweak: innerHTML fallback also failed:", fallbackError);
                return false;
              }
            }
          };
          window.GM_createHTML = (html) => {
            try {
              return window.__ctUserScriptPolicy.createHTML(html);
            } catch (error) {
              console.warn("CodeTweak: Failed to create TrustedHTML:", error);
              return html;
            }
          };
          window.GM = window.GM || {};
          window.GM.setInnerHTML = window.GM_setInnerHTML;
          window.GM.createHTML = window.GM_createHTML;
        } catch (error) {
          console.warn("CodeTweak: Failed to create Trusted Types policy:", error);
          window.GM_setInnerHTML = (element, html) => {
            if (!element || typeof html !== "string")
              return false;
            try {
              element.innerHTML = html;
              return true;
            } catch (error2) {
              console.error("CodeTweak: innerHTML assignment failed:", error2);
              return false;
            }
          };
          window.GM_createHTML = (html) => html;
          window.GM = window.GM || {};
          window.GM.setInnerHTML = window.GM_setInnerHTML;
          window.GM.createHTML = window.GM_createHTML;
        }
      } else {
        window.GM_setInnerHTML = (element, html) => {
          if (!element || typeof html !== "string")
            return false;
          try {
            element.innerHTML = html;
            return true;
          } catch (error) {
            console.error("CodeTweak: innerHTML assignment failed:", error);
            return false;
          }
        };
        window.GM_createHTML = (html) => html;
        window.GM = window.GM || {};
        window.GM.setInnerHTML = window.GM_setInnerHTML;
        window.GM.createHTML = window.GM_createHTML;
      }
    }
    registerResourceAPIs(enabledApis) {
      if (enabledApis.gmGetResourceText) {
        const getResourceText = (resourceName) => this.resourceManager.getText(resourceName);
        window.GM_getResourceText = getResourceText;
        window.GM.getResourceText = getResourceText;
      }
      if (enabledApis.gmGetResourceURL) {
        const getResourceURL = (resourceName) => this.resourceManager.getURL(resourceName);
        window.GM_getResourceURL = getResourceURL;
        window.GM.getResourceURL = getResourceURL;
      }
    }
    // Helper methods
    normalizeNotificationDetails(textOrDetails, titleOrOnDone, image) {
      return typeof textOrDetails === "object" && textOrDetails !== null ? { ...textOrDetails } : { text: textOrDetails, title: titleOrOnDone, image };
    }
    removeNonCloneableProperties(obj) {
      return Object.fromEntries(
        Object.entries(obj).filter(([, value]) => typeof value !== "function")
      );
    }
    createXMLhttpRequest(details) {
      if (typeof details !== "object") {
        throw new Error("GM_xmlhttpRequest: details must be an object");
      }
      const { callbacks, cloneableDetails } = this.separateCallbacksFromDetails(details);
      return this.bridge.call("xmlhttpRequest", { details: cloneableDetails }).then((response) => {
        if (callbacks.onload) {
          try {
            callbacks.onload(response);
          } catch (error) {
            console.error("GM_xmlhttpRequest onload error:", error);
          }
        }
        return response;
      }).catch((error) => {
        if (callbacks.onerror) {
          try {
            callbacks.onerror(error);
          } catch (callbackError) {
            console.error(
              "GM_xmlhttpRequest onerror callback failed:",
              callbackError
            );
          }
        }
        throw error;
      });
    }
    separateCallbacksFromDetails(details) {
      const callbacks = {};
      const cloneableDetails = {};
      Object.entries(details).forEach(([key, value]) => {
        if (typeof value === "function") {
          callbacks[key] = value;
        } else {
          cloneableDetails[key] = value;
        }
      });
      return { callbacks, cloneableDetails };
    }
    addStyleToDocument(css) {
      if (typeof css !== "string")
        return null;
      const style = document.createElement("style");
      let trustedCSS = css;
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
          if (!window.__ctTrustedHTMLPolicy) {
            window.__ctTrustedHTMLPolicy = window.trustedTypes.createPolicy("codetweak-html", {
              createHTML: (input) => input,
              createScript: (input) => input,
              createScriptURL: (input) => input
            });
          }
          trustedCSS = css;
        } catch (e) {
          console.warn("CodeTweak: Failed to create trusted types policy for CSS:", e);
        }
      }
      style.textContent = trustedCSS;
      const target = document.head || document.documentElement || document.body;
      if (target) {
        target.appendChild(style);
      }
      return style;
    }
    addElementToDocument(parent, tag, attributes = {}) {
      if (!parent || typeof tag !== "string") {
        console.warn("GM_addElement: parent must be a valid DOM node and tag must be a string");
        return null;
      }
      try {
        const element = document.createElement(tag);
        if (attributes && typeof attributes === "object") {
          Object.entries(attributes).forEach(([key, value]) => {
            if (typeof key === "string" && value != null) {
              element.setAttribute(key, String(value));
            }
          });
        }
        parent.appendChild(element);
        return element;
      } catch (error) {
        console.error("GM_addElement: Failed to create or append element:", error);
        return null;
      }
    }
    registerMenuCommand(caption, onClick, accessKey) {
      if (typeof caption !== "string" || typeof onClick !== "function") {
        console.warn(
          "GM_registerMenuCommand: Expected (string caption, function onClick, [string accessKey])"
        );
        return null;
      }
      const commandId = this.generateCommandId();
      const command = { commandId, caption, onClick, accessKey };
      this.menuCommands.push(command);
      this.exposeMenuCommand(command);
      console.log(
        `CodeTweak: Registered GM menu command '${caption}' (id: ${commandId})`
      );
      return commandId;
    }
    generateCommandId() {
      return `gm_menu_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    exposeMenuCommand(command) {
      window.__gmMenuCommands = window.__gmMenuCommands || [];
      window.__gmMenuCommands.push(command);
    }
  };
  var ResourceManager = class _ResourceManager {
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
      return new _ResourceManager(script.resourceContents || {}, resourceURLs);
    }
  };
  var ExternalScriptLoader = class {
    constructor() {
      this.loadedScripts = /* @__PURE__ */ new Set();
    }
    async loadScript(url) {
      if (this.loadedScripts.has(url)) {
        return;
      }
      try {
        await this.injectScriptTag(url);
        this.loadedScripts.add(url);
      } catch (error) {
        console.error(`Failed to load external script: ${url}`, error);
        throw error;
      }
    }
    async loadScripts(urls) {
      if (!Array.isArray(urls) || urls.length === 0) {
        return;
      }
      for (const url of urls) {
        await this.loadScript(url);
      }
    }
    async injectScriptTag(url) {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        let trustedSrc = url;
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
          try {
            if (!window.__ctTrustedScriptURLPolicy) {
              window.__ctTrustedScriptURLPolicy = window.trustedTypes.createPolicy("codetweak", {
                createScriptURL: (input) => input
              });
            }
            trustedSrc = window.__ctTrustedScriptURLPolicy.createScriptURL(url);
          } catch (_e) {
            console.error("Failed to create trusted script URL:", _e);
            console.warn("Falling back to raw URL.");
            trustedSrc = url;
          }
        }
        script.src = trustedSrc;
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load external script: ${url}`));
        (document.head || document.documentElement || document.body).appendChild(
          script
        );
      });
    }
  };
  function createMainWorldExecutor(userCode, scriptId, enabledApis, resourceContents, resourceURLs, extensionId, initialValues, requiredUrls, gmInfo) {
    window._executedScriptIds = window._executedScriptIds || /* @__PURE__ */ new Set();
    if (window._executedScriptIds.has(scriptId)) {
      console.log(`CodeTweak: Script ${scriptId} already executed`);
      return;
    }
    window._executedScriptIds.add(scriptId);
    console.log(`CodeTweak: Executing script ${scriptId} in main world`);
    const bridge = new GMBridge(scriptId, extensionId);
    const valueManager = new GMValueManager(bridge);
    const resourceManager = new ResourceManager(resourceContents, resourceURLs);
    const apiRegistry = new GMAPIRegistry(bridge, valueManager, resourceManager);
    const scriptLoader = new ExternalScriptLoader();
    valueManager.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    try {
      window.setTimeout = window.setTimeout.bind(window);
      window.clearTimeout = window.clearTimeout.bind(window);
      window.setInterval = window.setInterval.bind(window);
      window.clearInterval = window.clearInterval.bind(window);
      if (typeof window.postMessage === "function") {
        window.postMessage = window.postMessage.bind(window);
      }
    } catch (e) {
      console.warn("CodeTweak: Failed to bind timers/postMessage:", e);
    }
    try {
      Object.defineProperty(window, "GM_info", {
        value: Object.freeze(gmInfo || {}),
        writable: false,
        configurable: false
      });
      window.GM = window.GM || {};
      window.GM.info = window.GM_info;
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
    executeUserScriptWithDependencies(
      userCode,
      scriptId,
      requiredUrls,
      scriptLoader
    );
  }
  function createIsolatedWorldExecutor(userCode, scriptId, enabledApis, resourceContents, resourceURLs, initialValues, requiredUrls, gmInfo) {
    window._executedScriptIds = window._executedScriptIds || /* @__PURE__ */ new Set();
    if (window._executedScriptIds.has(scriptId)) {
      console.log(`CodeTweak: Script ${scriptId} already executed (isolated)`);
      return;
    }
    window._executedScriptIds.add(scriptId);
    console.log(`CodeTweak: Executing script ${scriptId} in ISOLATED world`);
    const backgroundBridge = {
      call: (action, payload = {}) => {
        return new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(
              {
                type: "GM_API_REQUEST",
                payload: { action, ...payload }
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
    };
    const valueManager = new GMValueManager(backgroundBridge);
    const resourceManager = new ResourceManager(resourceContents, resourceURLs);
    const apiRegistry = new GMAPIRegistry(
      backgroundBridge,
      valueManager,
      resourceManager
    );
    const scriptLoader = new ExternalScriptLoader();
    valueManager.initializeCache(initialValues);
    apiRegistry.registerAll(enabledApis);
    try {
      window.setTimeout = window.setTimeout.bind(window);
      window.clearTimeout = window.clearTimeout.bind(window);
      window.setInterval = window.setInterval.bind(window);
      window.clearInterval = window.clearInterval.bind(window);
      if (typeof window.postMessage === "function") {
        window.postMessage = window.postMessage.bind(window);
      }
    } catch (e) {
      console.warn("CodeTweak: Failed to bind timers/postMessage (isolated):", e);
    }
    try {
      Object.defineProperty(window, "GM_info", {
        value: Object.freeze(gmInfo || {}),
        writable: false,
        configurable: false
      });
      window.GM = window.GM || {};
      window.GM.info = window.GM_info;
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
    executeUserScriptWithDependencies(
      userCode,
      scriptId,
      requiredUrls,
      scriptLoader
    );
  }
  async function executeUserScriptWithDependencies(userCode, scriptId, requiredUrls, scriptLoader) {
    try {
      await scriptLoader.loadScripts(requiredUrls);
      try {
        const wrappedCode = `
        try {
          ${userCode}
        } catch (error) {
          console.error('CodeTweak: User script execution error in ${scriptId}:', error);
          throw error;
        }
      `;
        const userFunction = new Function(wrappedCode);
        userFunction();
        console.log(`CodeTweak: Successfully executed script ${scriptId}`);
      } catch (error) {
        console.error(`CodeTweak: Error executing user script ${scriptId}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`CodeTweak: Error in executeUserScriptWithDependencies for ${scriptId}:`, error);
    }
  }
  var ScriptInjector = class {
    constructor() {
      this.executedScripts = /* @__PURE__ */ new Map();
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
        console.warn(
          `CodeTweak: Failed to inject script ${script?.name}:`,
          error
        );
        return false;
      }
    }
    async tryInjectInBothWorlds(tabId, config) {
      try {
        await this.injectInWorld(tabId, config, EXECUTION_WORLDS.MAIN);
        return true;
      } catch (error) {
        console.warn(
          `CodeTweak: MAIN world injection failed, trying ISOLATED world:`,
          error?.message
        );
      }
      try {
        await this.injectInWorld(tabId, config, EXECUTION_WORLDS.ISOLATED);
        return true;
      } catch (error) {
        console.error(`CodeTweak: ISOLATED world injection also failed:`, error);
        return false;
      }
    }
    async injectInWorld(tabId, config, world) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world,
        files: [
          "utils/gm_core.js"
        ]
      });
      const executor = world === EXECUTION_WORLDS.MAIN ? createMainWorldExecutor : createIsolatedWorldExecutor;
      await chrome.scripting.executeScript({
        target: { tabId },
        world,
        func: executor,
        args: [
          config.code,
          config.id,
          config.enabledApis,
          config.resourceContents,
          config.resourceURLs,
          chrome.runtime.id,
          config.initialValues,
          config.requires,
          config.gmInfo
        ]
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
        gmXmlhttpRequest: Boolean(script.gmXmlhttpRequest)
      };
      const resourceManager = ResourceManager.fromScript(script);
      return {
        code: script.code,
        id: scriptId,
        enabledApis,
        resourceContents: Object.fromEntries(resourceManager.contents),
        resourceURLs: Object.fromEntries(resourceManager.urls),
        initialValues: script.initialValues || {},
        requires: Array.isArray(script.requires) ? script.requires : [],
        gmInfo: {
          script: {
            id: scriptId,
            name: script.name,
            version: script.version,
            description: script.description,
            author: script.author,
            namespace: script.namespace || ""
          },
          scriptHandler: "CodeTweak",
          version: chrome.runtime?.getManifest?.().version || ""
        }
      };
    }
    async injectScriptsForStage(details, runAt, getFilteredScripts2) {
      if (details.frameId !== 0)
        return;
      try {
        const { settings = {} } = await chrome.storage.local.get("settings");
        const { url, tabId } = details;
        if (!this.executedScripts.has(tabId)) {
          this.executedScripts.set(tabId, /* @__PURE__ */ new Set());
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
          getFilteredScripts2,
          settings
        );
      } catch (error) {
        console.error("CodeTweak: Script injection error:", error);
      }
    }
    async injectMatchingScripts(url, runAt, tabId, tabScripts, getFilteredScripts2, settings) {
      const matchingScripts = await getFilteredScripts2(url, runAt);
      const newScripts = matchingScripts.filter(
        (script) => !tabScripts.has(script.id)
      );
      for (const script of newScripts) {
        tabScripts.add(script.id);
        await this.injectScript(tabId, script, settings);
      }
    }
    showNotification(tabId, scriptName) {
      chrome.scripting.executeScript({
        target: { tabId },
        world: EXECUTION_WORLDS.MAIN,
        func: this.createNotificationFunction(),
        args: [scriptName || "Unknown script"]
      }).catch((error) => {
        console.warn("CodeTweak: showNotification failed:", error);
      });
    }
    createNotificationFunction() {
      return function(scriptName) {
        const notification = document.createElement("div");
        notification.textContent = `\u2713 ${scriptName}`;
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
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
        });
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2e3);
      };
    }
  };
  var scriptInjector = new ScriptInjector();
  async function injectScriptsForStage(details, runAt, getFilteredScripts2) {
    return scriptInjector.injectScriptsForStage(
      details,
      runAt,
      getFilteredScripts2
    );
  }

  // src/background/background.js
  var BackgroundState = class {
    constructor() {
      this.scriptCache = null;
      this.lastCacheUpdate = 0;
      this.cacheTtl = 5e3;
      this.ports = /* @__PURE__ */ new Set();
      this.executedScripts = /* @__PURE__ */ new Map();
      this.creatingOffscreenDocument = null;
    }
    clearCache() {
      this.scriptCache = null;
      this.lastCacheUpdate = 0;
    }
    isCacheValid() {
      return this.scriptCache && Date.now() - this.lastCacheUpdate <= this.cacheTtl;
    }
  };
  var state = new BackgroundState();
  var OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
  function safeSetBadge(tabId, text = "", color = "#007bff") {
    chrome.action.setBadgeText({ tabId, text }).catch((err) => {
      if (!isIgnorableTabError(err)) {
        console.warn(`Error setting badge for tab ${tabId}:`, err.message);
      }
    });
    if (text) {
      chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {
      });
    }
  }
  function isIgnorableTabError(error) {
    const ignorableMessages = [
      "No tab with id",
      "Invalid tab ID",
      "Receiving end does not exist"
    ];
    return ignorableMessages.some((msg) => error.message?.includes(msg));
  }
  function notifyPorts(action) {
    const disconnectedPorts = [];
    for (const port of state.ports) {
      try {
        port.postMessage({ action });
      } catch (error) {
        console.warn("Failed to notify port:", error);
        disconnectedPorts.push(port);
      }
    }
    disconnectedPorts.forEach((port) => state.ports.delete(port));
  }
  async function getFilteredScripts(url, runAt = null) {
    if (!state.isCacheValid()) {
      await refreshScriptCache();
    }
    return state.scriptCache.filter(
      (script) => script.enabled && (!runAt || script.runAt === runAt) && script.targetUrls.some((target) => urlMatchesPattern(url, target))
    );
  }
  async function refreshScriptCache() {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    state.scriptCache = scripts.map((script) => ({
      ...script,
      id: script.id || crypto.randomUUID(),
      targetUrls: script.targetUrls || [script.targetUrl].filter(Boolean)
    }));
    await chrome.storage.local.set({ scripts: state.scriptCache });
    state.lastCacheUpdate = Date.now();
  }
  async function updateBadgeForTab(tabId, url) {
    if (!url?.startsWith("http")) {
      safeSetBadge(tabId);
      return;
    }
    try {
      const scriptsToRun = await getFilteredScripts(url);
      const count = scriptsToRun.length;
      safeSetBadge(tabId, count > 0 ? count.toString() : "");
    } catch (error) {
      console.error(`Error updating badge for tab ${tabId}:`, error);
      safeSetBadge(tabId);
    }
  }
  async function updateAllTabBadges() {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        if (tab.url) {
          updateBadgeForTab(tab.id, tab.url);
        } else {
          safeSetBadge(tab.id);
        }
      }
    });
  }
  var gmApiHandlers = {
    async setValue(message) {
      await chrome.storage.local.set({ [message.name]: message.value });
      return void 0;
    },
    async getValue(message) {
      const data = await chrome.storage.local.get(message.name);
      return data[message.name] === void 0 ? message.defaultValue : data[message.name];
    },
    async deleteValue(message) {
      await chrome.storage.local.remove(message.name);
      return void 0;
    },
    async listValues() {
      const allItems = await chrome.storage.local.get(null);
      return Object.keys(allItems);
    },
    async openInTab(message) {
      const tabOptions = { url: message.url };
      if (message.options) {
        if (typeof message.options.active === "boolean") {
          tabOptions.active = message.options.active;
        } else if (typeof message.options.loadInBackground === "boolean") {
          tabOptions.active = !message.options.loadInBackground;
        }
      }
      const newTab = await chrome.tabs.create(tabOptions);
      return { id: newTab.id, url: newTab.url };
    },
    async notification(message) {
      const options = {
        type: message.details.image ? "image" : "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: message.details.title || "Notification",
        message: message.details.text || ""
      };
      if (message.details.image) {
        options.imageUrl = message.details.image;
      }
      const notificationId = `gm_notification_${Date.now()}`;
      await chrome.notifications.create(notificationId, options);
      return notificationId;
    },
    async setClipboard(message) {
      return handleSetClipboard(message);
    },
    // Cross-origin XHR via fetch
    // Stay CSP complient
    async xmlhttpRequest(message) {
      const details = message.details || {};
      if (!details.url) {
        throw new Error("GM_xmlhttpRequest: 'url' is required");
      }
      const fetchInit = {
        method: details.method || "GET",
        headers: details.headers || {},
        credentials: details.synchronous ? "include" : "same-origin"
      };
      if (details.data !== void 0) {
        if (details.binary && details.data instanceof Blob) {
          fetchInit.body = details.data;
        } else {
          fetchInit.body = details.data;
        }
      }
      let timeoutId;
      const timeoutPromise = details.timeout && details.timeout > 0 ? new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("GM_xmlhttpRequest timed out"));
        }, details.timeout);
      }) : null;
      const fetchPromise = fetch(details.url, fetchInit).then(async (resp) => {
        if (timeoutId)
          clearTimeout(timeoutId);
        const headersArr = [];
        for (const [key, value] of resp.headers.entries()) {
          headersArr.push(`${key}: ${value}`);
        }
        let responseData;
        switch (details.responseType) {
          case "arraybuffer":
            responseData = await resp.arrayBuffer();
            break;
          case "blob":
            responseData = await resp.blob();
            break;
          case "json":
            responseData = await resp.json();
            break;
          case "text":
          case "":
          default:
            responseData = await resp.text();
            break;
        }
        return {
          readyState: 4,
          responseHeaders: headersArr.join("\r\n"),
          responseText: typeof responseData === "string" ? responseData : void 0,
          response: responseData,
          status: resp.status,
          statusText: resp.statusText,
          finalUrl: resp.url,
          context: details.context
        };
      });
      return timeoutPromise ? Promise.race([fetchPromise, timeoutPromise]) : fetchPromise;
    }
  };
  async function handleGmApiRequest(message, sender, sendResponse) {
    try {
      console.log("[CodeTweak] GM_API request:", message.action);
      const handler = gmApiHandlers[message.action];
      if (!handler) {
        throw new Error(`Unknown GM_API action: ${message.action}`);
      }
      const result = await handler(message);
      sendResponse({ result });
    } catch (error) {
      console.error(`Error handling GM_API action ${message.action}:`, error);
      sendResponse({ error: error.message || "An unexpected error occurred." });
    }
  }
  async function ensureOffscreenDocument() {
    if (state.creatingOffscreenDocument) {
      await state.creatingOffscreenDocument;
      return;
    }
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    if (contexts.length > 0)
      return;
    state.creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["CLIPBOARD"],
      justification: "Need to write to the clipboard for GM_setClipboard API."
    });
    await state.creatingOffscreenDocument;
    state.creatingOffscreenDocument = null;
  }
  async function handleSetClipboard(request) {
    await ensureOffscreenDocument();
    const requestId = `clipboard-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("Timeout waiting for clipboard response."));
      }, 5e3);
      const listener = (message) => {
        if (message.type === "offscreen-clipboard-response" && message.requestId === requestId) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          if (message.success) {
            resolve(void 0);
          } else {
            reject(new Error(message.error || "Failed to copy to clipboard."));
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "copy-to-clipboard",
        data: request.data,
        requestId
      });
    });
  }
  async function handleScriptCreation(url, template) {
    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      const existing = scripts.find(
        (s) => s.targetUrls?.some((t) => urlMatchesPattern(url, t))
      );
      if (existing) {
        const lines = existing.code.split("\n");
        let insertIndex = lines.length - 1;
        while (insertIndex > 0 && (!lines[insertIndex].trim() || lines[insertIndex].trim() === "})();")) {
          insertIndex--;
        }
        const newLines = [
          "",
          "  // Added by element selector",
          ...template.trim().split("\n").map((line) => "  " + line),
          ""
        ];
        lines.splice(insertIndex + 1, 0, ...newLines);
        existing.code = lines.join("\n");
        existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await chrome.storage.local.set({ scripts });
        chrome.runtime.sendMessage({ action: "scriptsUpdated" });
        chrome.tabs.create({
          url: `${chrome.runtime.getURL("editor.html")}?id=${existing.id}`
        });
      } else {
        const params = new URLSearchParams({ targetUrl: url, template });
        chrome.tabs.create({
          url: `${chrome.runtime.getURL("editor.html")}?${params}`
        });
      }
    } catch (error) {
      console.error("Script creation error:", error);
    }
  }
  async function handleGreasyForkInstall(url) {
    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`HTTP error ${response.status}`);
      const code = await response.text();
      const tempId = crypto.randomUUID();
      const key = `tempImport_${tempId}`;
      await chrome.storage.local.set({ [key]: { code, sourceUrl: url } });
      chrome.tabs.create({
        url: `${chrome.runtime.getURL("editor.html")}?importId=${tempId}`
      });
    } catch (err) {
      console.error("GreasyFork install fetch error:", err);
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[CodeTweak] Message received:", message.type || message.action);
    if (message.type === "GM_API_REQUEST") {
      handleGmApiRequest(message.payload, sender, sendResponse);
      return true;
    }
    if (message.type === "offscreen-clipboard-response") {
      return false;
    }
    const messageHandlers = {
      scriptsUpdated: () => {
        state.clearCache();
        notifyPorts("scriptsUpdated");
        updateAllTabBadges();
        sendResponse({ success: true });
      },
      createScript: () => {
        handleScriptCreation(message.data.url, message.data.template);
      },
      contentScriptReady: () => {
        if (sender.tab?.id) {
          state.executedScripts.set(sender.tab.id, /* @__PURE__ */ new Set());
        }
      },
      greasyForkInstall: () => {
        handleGreasyForkInstall(message.url);
      }
    };
    const handler = messageHandlers[message.action];
    if (handler) {
      handler();
      return false;
    }
    sendResponse({ error: "Unknown action" });
    return false;
  });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "selectElement",
      title: "Select Element for Script",
      contexts: ["page"]
    });
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "selectElement") {
      chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
    }
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "CodeTweak" || state.ports.has(port))
      return;
    state.ports.add(port);
    port.onDisconnect.addListener(() => state.ports.delete(port));
    port.onMessage.addListener(console.log);
  });
  var navigationEvents = ["onCommitted", "onDOMContentLoaded", "onCompleted"];
  navigationEvents.forEach((event, index) => {
    chrome.webNavigation[event].addListener(
      (details) => injectScriptsForStage(
        details,
        Object.values(INJECTION_TYPES)[index],
        getFilteredScripts,
        state.executedScripts
      )
    );
  });
  chrome.tabs.onRemoved.addListener(
    (tabId) => state.executedScripts.delete(tabId)
  );
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab?.url) {
      updateBadgeForTab(tabId, tab.url);
    }
  });
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      updateBadgeForTab(tab.id, tab.url);
    } catch (error) {
      if (!isIgnorableTabError(error)) {
        console.warn("Error getting activated tab:", error);
      }
    }
  });
  chrome.runtime.onInstalled.addListener(updateAllTabBadges);
  chrome.runtime.onStartup.addListener(updateAllTabBadges);
})();
