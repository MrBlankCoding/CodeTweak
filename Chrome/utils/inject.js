/* global chrome */

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

// ==================================================
// CORE CLASSES
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
      const registerMenuCommand = (caption, onClick, accessKey) => {
        return this.registerMenuCommand(caption, onClick, accessKey);
      };
      window.GM_registerMenuCommand = registerMenuCommand;
      window.GM.registerMenuCommand = registerMenuCommand;
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

    // Always provide Trusted Types helpers for user scripts
    this.setupTrustedTypesHelpers();
  }

  setupTrustedTypesHelpers() {
    // Create a comprehensive Trusted Types policy for user scripts
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        if (!window.__ctUserScriptPolicy) {
          window.__ctUserScriptPolicy = window.trustedTypes.createPolicy("codetweak-userscript", {
            createHTML: (input) => {
              // Basic sanitization - remove script tags and dangerous attributes
              if (typeof input !== 'string') return '';
              return input
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
                .replace(/javascript:/gi, '');
            },
            createScript: (input) => input,
            createScriptURL: (input) => input,
          });
        }

        // Provide helper functions for user scripts
        window.GM_setInnerHTML = (element, html) => {
          if (!element || typeof html !== 'string') return false;
          try {
            const trustedHTML = window.__ctUserScriptPolicy.createHTML(html);
            element.innerHTML = trustedHTML;
            return true;
          } catch (error) {
            console.warn('CodeTweak: Failed to set innerHTML with Trusted Types:', error);
            // Fallback for non-Trusted Types environments
            try {
              element.innerHTML = html;
              return true;
            } catch (fallbackError) {
              console.error('CodeTweak: innerHTML fallback also failed:', fallbackError);
              return false;
            }
          }
        };

        window.GM_createHTML = (html) => {
          try {
            return window.__ctUserScriptPolicy.createHTML(html);
          } catch (error) {
            console.warn('CodeTweak: Failed to create TrustedHTML:', error);
            return html; // Fallback
          }
        };

        // Make these available in GM namespace too
        window.GM = window.GM || {};
        window.GM.setInnerHTML = window.GM_setInnerHTML;
        window.GM.createHTML = window.GM_createHTML;

      } catch (error) {
        console.warn('CodeTweak: Failed to create Trusted Types policy:', error);
        
        // Provide fallback functions that work without Trusted Types
        window.GM_setInnerHTML = (element, html) => {
          if (!element || typeof html !== 'string') return false;
          try {
            element.innerHTML = html;
            return true;
          } catch (error) {
            console.error('CodeTweak: innerHTML assignment failed:', error);
            return false;
          }
        };

        window.GM_createHTML = (html) => html;
        
        window.GM = window.GM || {};
        window.GM.setInnerHTML = window.GM_setInnerHTML;
        window.GM.createHTML = window.GM_createHTML;
      }
    } else {
      // No Trusted Types support - provide basic fallbacks
      window.GM_setInnerHTML = (element, html) => {
        if (!element || typeof html !== 'string') return false;
        try {
          element.innerHTML = html;
          return true;
        } catch (error) {
          console.error('CodeTweak: innerHTML assignment failed:', error);
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
    
    // Handle Trusted Types for textContent
    let trustedCSS = css;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        if (!window.__ctTrustedHTMLPolicy) {
          window.__ctTrustedHTMLPolicy = window.trustedTypes.createPolicy("codetweak-html", {
            createHTML: (input) => input,
            createScript: (input) => input,
            createScriptURL: (input) => input,
          });
        }
        // For CSS, we can use textContent directly, but let's be safe
        trustedCSS = css; // textContent doesn't require TrustedHTML
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
    return `gm_menu_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;
  }

  exposeMenuCommand(command) {
    window.__gmMenuCommands = window.__gmMenuCommands || [];
    window.__gmMenuCommands.push(command);
  }
}

/**
 * Manages script resources (text content and URLs)
 */
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

/**
 * Handles external script loading with fallback strategies
 */
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
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
          if (!window.__ctTrustedScriptURLPolicy) {
            window.__ctTrustedScriptURLPolicy =
              window.trustedTypes.createPolicy("codetweak", {
                createScriptURL: (input) => input,
              });
          }
          trustedSrc = window.__ctTrustedScriptURLPolicy.createScriptURL(url);
        } catch (_e) {
          console.error("Failed to create trusted script URL:", _e);
          console.warn("Falling back to raw URL.");
          // ignore, fall back to raw URL
          trustedSrc = url;
        }
      }

      script.src = trustedSrc;
      script.async = false; // Preserve execution order
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error(`Failed to load external script: ${url}`));
      (document.head || document.documentElement || document.body).appendChild(
        script
      );
    });
  }
}

// ==================================================
// SCRIPT EXECUTORS
// ==================================================

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

  // Expose GM_info (read-only)
  try {
    Object.defineProperty(window, "GM_info", {
      value: Object.freeze(gmInfo || {}),
      writable: false,
      configurable: false,
    });
    window.GM = window.GM || {};
    window.GM.info = window.GM_info;
  } catch (e) {
    console.warn("CodeTweak: Unable to define GM_info", e);
  }

  // Execute user script
  executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requiredUrls,
    scriptLoader
  );
}

/**
 * Executes user scripts in the isolated world context
 */
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

  // Expose GM_info (read-only)
  try {
    Object.defineProperty(window, "GM_info", {
      value: Object.freeze(gmInfo || {}),
      writable: false,
      configurable: false,
    });
    window.GM = window.GM || {};
    window.GM.info = window.GM_info;
  } catch (e) {
    console.warn("CodeTweak: Unable to define GM_info", e);
  }

  // Execute user script
  executeUserScriptWithDependencies(
    userCode,
    scriptId,
    requiredUrls,
    scriptLoader
  );
}

/**
 * Executes user script with dependency loading
 */
async function executeUserScriptWithDependencies(
  userCode,
  scriptId,
  requiredUrls,
  scriptLoader
) {
  try {
    // Load external dependencies first
    await scriptLoader.loadScripts(requiredUrls);

    // Execute user script directly without blob URLs to avoid CSP violations
    // Use Function constructor with proper error handling
    try {
      // Create a wrapper function that provides better error context
      const wrappedCode = `
        try {
          ${userCode}
        } catch (error) {
          console.error('CodeTweak: User script execution error in ${scriptId}:', error);
          throw error;
        }
      `;
      
      // Execute directly using Function constructor (CSP-compliant)
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

// ==================================================
// INJECTION SYSTEM
// ==================================================

/**
 * Main script injection orchestrator
 */
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
    // Ensure core GM classes are available in the target execution world first
    await chrome.scripting.executeScript({
      target: { tabId },
      world,
      files: [
        "utils/gm_core.js", // contains GMBridge, GMValueManager, GMAPIRegistry, etc.
      ],
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
      gmRegisterMenuCommand: Boolean(script.gmRegisterMenuCommand),
      gmXmlhttpRequest: Boolean(script.gmXmlhttpRequest),
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

  showNotification(tabId, scriptName) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: EXECUTION_WORLDS.MAIN,
        func: this.createNotificationFunction(),
        args: [scriptName || "Unknown script"],
      })
      .catch((error) => {
        console.warn("CodeTweak: showNotification failed:", error);
      });
  }

  createNotificationFunction() {
    return function (scriptName) {
      const notification = document.createElement("div");
      notification.textContent = `✓ ${scriptName}`;

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
    };
  }
}

// ==================================================
// PUBLIC API
// ==================================================

// Create singleton instance
const scriptInjector = new ScriptInjector();

// Legacy function compatibility
export async function injectScriptDirectly(tabId, script, settings) {
  return scriptInjector.injectScript(tabId, script, settings);
}

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
