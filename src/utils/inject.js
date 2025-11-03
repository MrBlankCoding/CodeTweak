// Constants
const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
});

const EXECUTION_WORLDS = Object.freeze({
  MAIN: "MAIN",
  ISOLATED: "ISOLATED",
});


// Communitcation between content script and background
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

// Managees GM API values
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

    // Async fetch to update cache for next call
    this.bridge
      .call("getValue", { name, defaultValue })
      .then((value) => this.cache.set(name, value))
      .catch((err) => console.warn("Failed to fetch GM value:", err));

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
}

// Manages resouces -> Urls
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

// Registers APIs to window so we can use them
class GMAPIRegistry {
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
    this.registerUnsafeWindow(enabledApis);
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
      const getValue = (name, defaultValue) =>
        this.valueManager.getValue(name, defaultValue);
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
      const openInTab = (url, options = {}) =>
        this.bridge.call("openInTab", { url, options });
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
      const registerMenuCommand = (caption, onClick, accessKey) =>
        this.registerMenuCommand(caption, onClick, accessKey);
      window.GM_registerMenuCommand = registerMenuCommand;
      window.GM.registerMenuCommand = registerMenuCommand;
    }

    if (enabledApis.gmUnregisterMenuCommand) {
      const unregisterMenuCommand = (commandId) =>
        this.unregisterMenuCommand(commandId);
      window.GM_unregisterMenuCommand = unregisterMenuCommand;
      window.GM.unregisterMenuCommand = unregisterMenuCommand;
    }
  }

  registerNetworkAPIs(enabledApis) {
    if (enabledApis.gmXmlhttpRequest) {
      const xmlhttpRequest = (details = {}) =>
        this.createXMLhttpRequest(details);
      window.GM_xmlhttpRequest = xmlhttpRequest;
      window.GM.xmlhttpRequest = xmlhttpRequest;
    }

    if (enabledApis.gmSetClipboard) {
      const setClipboard = (data, type) =>
        this.bridge.call("setClipboard", { data, type });
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
      const addElement = (parent, tag, attributes = {}) =>
        this.addElementToDocument(parent, tag, attributes);
      window.GM_addElement = addElement;
      window.GM.addElement = addElement;
    }

    // Always provide Trusted Types helpers for user scripts
    // Could change this later? 
    this.setupTrustedTypesHelpers();
  }

  registerUnsafeWindow(enabledApis) {
    if (enabledApis.unsafeWindow) {
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

  registerResourceAPIs(enabledApis) {
    if (enabledApis.gmGetResourceText) {
      const getResourceText = (resourceName) =>
        this.resourceManager.getText(resourceName);
      window.GM_getResourceText = getResourceText;
      window.GM.getResourceText = getResourceText;
    }

    if (enabledApis.gmGetResourceURL) {
      const getResourceURL = (resourceName) =>
        this.resourceManager.getURL(resourceName);
      window.GM_getResourceURL = getResourceURL;
      window.GM.getResourceURL = getResourceURL;
    }
  }

  setupTrustedTypesHelpers() {
    const createFallbackHelpers = () => {
      window.GM_setInnerHTML = (element, html) => {
        if (!element || typeof html !== "string") return false;
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
    };

    // No Trusted Types support
    if (!window.trustedTypes?.createPolicy) {
      createFallbackHelpers();
      return;
    }

    try {
      if (!window.__ctUserScriptPolicy) {
        window.__ctUserScriptPolicy = window.trustedTypes.createPolicy(
          "codetweak-userscript",
          {
            createHTML: (input) => {
              if (typeof input !== "string") return "";
              // Basic sanitization
              return input
                .replace(
                  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                  ""
                )
                .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
                .replace(/javascript:/gi, "");
            },
            createScript: (input) => input,
            createScriptURL: (input) => input,
          }
        );
      }

      window.GM_setInnerHTML = (element, html) => {
        if (!element || typeof html !== "string") return false;
        try {
          const trustedHTML = window.__ctUserScriptPolicy.createHTML(html);
          element.innerHTML = trustedHTML;
          return true;
        } catch (error) {
          console.warn(
            "CodeTweak: Failed to set innerHTML with Trusted Types:",
            error
          );
          // Fallback for non-Trusted Types environments
          try {
            element.innerHTML = html;
            return true;
          } catch (fallbackError) {
            console.error(
              "CodeTweak: innerHTML fallback also failed:",
              fallbackError
            );
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
      createFallbackHelpers();
    }
  }

  // Helper methods
  normalizeNotificationDetails(textOrDetails, titleOrOnDone, image) {
    return typeof textOrDetails === "object" && textOrDetails !== null
      ? { ...textOrDetails }
      : { text: textOrDetails, title: titleOrOnDone, image };
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

    const { callbacks, cloneableDetails } =
      this.separateCallbacksFromDetails(details);

    return this.bridge
      .call("xmlhttpRequest", { details: cloneableDetails })
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
    if (typeof css !== "string") return null;

    const style = document.createElement("style");
    style.textContent = css;

    const target = document.head || document.documentElement || document.body;
    if (target) {
      target.appendChild(style);
    }

    return style;
  }

  addElementToDocument(parent, tag, attributes = {}) {
    if (!parent || typeof tag !== "string") {
      console.warn(
        "GM_addElement: parent must be a valid DOM node and tag must be a string"
      );
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
      console.error(
        "GM_addElement: Failed to create or append element:",
        error
      );
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

    const commandId = `gm_menu_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;
    const command = { commandId, caption, onClick, accessKey };

    this.menuCommands.push(command);
    this.exposeMenuCommand(command);

    console.log(
      `CodeTweak: Registered GM menu command '${caption}' (id: ${commandId})`
    );
    return commandId;
  }

  unregisterMenuCommand(commandId) {
    if (typeof commandId !== "string") {
      console.warn(
        "GM_unregisterMenuCommand: Expected string commandId"
      );
      return;
    }

    // Remove from internal array
    const index = this.menuCommands.findIndex(
      (cmd) => cmd.commandId === commandId
    );
    if (index !== -1) {
      const removedCommand = this.menuCommands.splice(index, 1)[0];
      console.log(
        `CodeTweak: Unregistered GM menu command '${removedCommand.caption}' (id: ${commandId})`
      );
    }

    // Remove from window.__gmMenuCommands
    if (window.__gmMenuCommands) {
      const windowIndex = window.__gmMenuCommands.findIndex(
        (cmd) => cmd.commandId === commandId
      );
      if (windowIndex !== -1) {
        window.__gmMenuCommands.splice(windowIndex, 1);
      }
    }
  }

  exposeMenuCommand(command) {
    window.__gmMenuCommands = window.__gmMenuCommands || [];
    window.__gmMenuCommands.push(command);
  }
}

// Load external scripts -> Being a bit problamatic righ now, might need some changes
class ExternalScriptLoader {
  constructor() {
    this.loadedScripts = new Set();
  }

  async loadScript(url) {
    if (this.loadedScripts.has(url)) {
      return; // Already loaded
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

      // Trusted Types compliance
      let trustedSrc = url;
      if (window.trustedTypes?.createPolicy) {
        try {
          if (!window.__ctTrustedScriptURLPolicy) {
            window.__ctTrustedScriptURLPolicy =
              window.trustedTypes.createPolicy("codetweak", {
                createScriptURL: (input) => input,
              });
          }
          trustedSrc = window.__ctTrustedScriptURLPolicy.createScriptURL(url);
        } catch (e) {
          console.error("Failed to create trusted script URL:", e);
          console.warn("Falling back to raw URL.");
        }
      }

      script.src = trustedSrc;
      script.async = false; // Preserve execution order
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error(`Failed to load external script: ${url}`));

      const target = document.head || document.documentElement || document.body;
      target.appendChild(script);
    });
  }
}


// load dependencies then exec
async function executeUserScriptWithDependencies(
  userCode,
  scriptId,
  requiredUrls,
  scriptLoader
) {
  try {
    await scriptLoader.loadScripts(requiredUrls);

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
    console.error(
      `CodeTweak: Error executing user script ${scriptId}:`,
      error
    );
  }
}

// In the name
function createMainWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  resourceContents,
  resourceURLs,
  extensionId,
  initialValues,
  requiredUrls,
  gmInfo
) {
  // Define exposeGMInfo inside the main world context
  function exposeGMInfo(gmInfo) {
    try {
      // Check if GM_info already exists
      if (!window.hasOwnProperty('GM_info')) {
        Object.defineProperty(window, "GM_info", {
          value: Object.freeze(gmInfo || {}),
          writable: false,
          configurable: false,
        });
      }
      // Always ensure GM.info is set
      window.GM = window.GM || {};
      if (!window.GM.info) {
        window.GM.info = window.GM_info;
      }
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
  }

  // Define bindNativeFunctions inside the main world context
  function bindNativeFunctions() {
    // Bind common native functions to prevent "Illegal invocation" errors
    const nativeFunctions = [
      'fetch',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback'
    ];

    nativeFunctions.forEach(fnName => {
      if (window[fnName]) {
        window[fnName] = window[fnName].bind(window);
      }
    });
  }

  // Prevent re-execution
  window._executedScriptIds = window._executedScriptIds || new Set();
  if (window._executedScriptIds.has(scriptId)) {
    console.log(`CodeTweak: Script ${scriptId} already executed`);
    return;
  }
  window._executedScriptIds.add(scriptId);

  console.log(`CodeTweak: Executing script ${scriptId} in main world`);

  // Initialize components
  const bridge = new GMBridge(scriptId, extensionId);
  const valueManager = new GMValueManager(bridge);
  const resourceManager = new ResourceManager(resourceContents, resourceURLs);
  const apiRegistry = new GMAPIRegistry(bridge, valueManager, resourceManager);
  const scriptLoader = new ExternalScriptLoader();

  // Setup
  valueManager.initializeCache(initialValues);
  apiRegistry.registerAll(enabledApis);
  bindNativeFunctions();

  exposeGMInfo(gmInfo);

  // Execute user script
  executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requiredUrls,
    scriptLoader
  );
}

// oooh isolated world... sneaky sneaky
function createIsolatedWorldExecutor(
  userCode,
  scriptId,
  enabledApis,
  resourceContents,
  resourceURLs,
  initialValues,
  requiredUrls,
  gmInfo
) {
  // Define exposeGMInfo inside the isolated world context
  function exposeGMInfo(gmInfo) {
    try {
      // Check if GM_info already exists
      if (!window.hasOwnProperty('GM_info')) {
        Object.defineProperty(window, "GM_info", {
          value: Object.freeze(gmInfo || {}),
          writable: false,
          configurable: false,
        });
      }
      // Always ensure GM.info is set
      window.GM = window.GM || {};
      if (!window.GM.info) {
        window.GM.info = window.GM_info;
      }
    } catch (e) {
      console.warn("CodeTweak: Unable to define GM_info", e);
    }
  }

  // Prevent re-execution
  window._executedScriptIds = window._executedScriptIds || new Set();
  if (window._executedScriptIds.has(scriptId)) {
    console.log(`CodeTweak: Script ${scriptId} already executed (isolated)`);
    return;
  }
  window._executedScriptIds.add(scriptId);

  console.log(`CodeTweak: Executing script ${scriptId} in ISOLATED world`);

  // Create direct background bridge
  const backgroundBridge = {
    call: (action, payload = {}) => {
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
    },
  };

  // Initialize components
  const valueManager = new GMValueManager(backgroundBridge);
  const resourceManager = new ResourceManager(resourceContents, resourceURLs);
  const apiRegistry = new GMAPIRegistry(
    backgroundBridge,
    valueManager,
    resourceManager
  );
  const scriptLoader = new ExternalScriptLoader();

  // Setup
  valueManager.initializeCache(initialValues);
  apiRegistry.registerAll(enabledApis);
  exposeGMInfo(gmInfo);

  // Execute user script
  executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requiredUrls,
    scriptLoader
  );
}

// The actual injector. Could move all of the other logic into another file
class ScriptInjector {
  constructor() {
    this.executedScripts = new Map();
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
    // Try MAIN world first (preferred)
    try {
      await this.injectInWorld(tabId, config, EXECUTION_WORLDS.MAIN);
      return true;
    } catch (error) {
      console.warn(
        `CodeTweak: MAIN world injection failed, trying ISOLATED world:`,
        error?.message
      );
    }

    // Fallback to ISOLATED world
    try {
      await this.injectInWorld(tabId, config, EXECUTION_WORLDS.ISOLATED);
      return true;
    } catch (error) {
      console.error(`CodeTweak: ISOLATED world injection also failed:`, error);
      return false;
    }
  }

  async injectInWorld(tabId, config, world) {
    // Inject core GM classes first
    await chrome.scripting.executeScript({
      target: { tabId },
      world,
      files: ["GM/gm_core.js"],
    });

    const executor =
      world === EXECUTION_WORLDS.MAIN
        ? createMainWorldExecutor
        : createIsolatedWorldExecutor;

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
        config.gmInfo,
      ],
    });
  }

  prepareScriptConfig(script) {
    const scriptId =
      script.id || script.name || `anonymous_script_${Date.now()}`;

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
      gmUnregisterMenuCommand: Boolean(script.gmUnregisterMenuCommand),
      gmXmlhttpRequest: Boolean(script.gmXmlhttpRequest),
      unsafeWindow: Boolean(script.unsafeWindow),
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
          namespace: script.namespace || "",
        },
        scriptHandler: "CodeTweak",
        version: chrome.runtime?.getManifest?.().version || "",
      },
    };
  }

  async injectScriptsForStage(details, runAt, getFilteredScripts) {
    // Only inject in top frame
    if (details.frameId !== 0) return;

    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const { url, tabId } = details;

      // Initialize or get executed scripts for this tab
      if (!this.executedScripts.has(tabId)) {
        this.executedScripts.set(tabId, new Set());
      }
      const tabScripts = this.executedScripts.get(tabId);

      // Clear executed scripts on navigation start
      if (runAt === INJECTION_TYPES.DOCUMENT_START) {
        tabScripts.clear();
      }

      await this.injectMatchingScripts(
        url,
        runAt,
        tabId,
        tabScripts,
        getFilteredScripts,
        settings
      );
    } catch (error) {
      console.error("CodeTweak: Script injection error:", error);
    }
  }

  async injectMatchingScripts(
    url,
    runAt,
    tabId,
    tabScripts,
    getFilteredScripts,
    settings
  ) {
    const matchingScripts = await getFilteredScripts(url, runAt);
    const newScripts = matchingScripts.filter(
      (script) => !tabScripts.has(script.id)
    );

    for (const script of newScripts) {
      tabScripts.add(script.id); // Prevent race conditions
      await this.injectScript(tabId, script, settings);
    }
  }
  // No thanks
  showNotification(tabId, scriptName) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: EXECUTION_WORLDS.MAIN,
        func: (name) => {
          const notification = document.createElement("div");
          notification.textContent = `✓ ${name}`;

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
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          });

          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 2000);
        },
        args: [scriptName || "Unknown script"],
      })
      .catch((error) => {
        console.error("CodeTweak: showNotification failed:", error);
      });
  }
}

const scriptInjector = new ScriptInjector();


export async function injectScriptsForStage(
  details,
  runAt,
  getFilteredScripts
) {
  return scriptInjector.injectScriptsForStage(
    details,
    runAt,
    getFilteredScripts
  );
}

export function showNotification(tabId, scriptName) {
  return scriptInjector.showNotification(tabId, scriptName);
}

export { INJECTION_TYPES, EXECUTION_WORLDS };
