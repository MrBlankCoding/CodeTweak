/**
 * Centralized GM API Definitions
 * 
 * This file contains all Greasemonkey API definitions used throughout the extension.
 * Each API includes:
 * - signature: TypeScript signature for editor autocomplete
 * - name: Standard GM API name
 * - el: HTML element ID for the checkbox
 * - tmName: Tampermonkey metadata header name (@grant)
 * - category: UI category grouping
 * - description: Brief description of what the API does
 */

export const GM_API_CATEGORIES = {
  STORAGE: 'Storage & Data',
  BROWSER_UI: 'Browser & UI',
  RESOURCES_NETWORK: 'Resources & Network',
  ADVANCED: 'Advanced'
};

export const GM_API_DEFINITIONS = {
  // Storage & Data APIs
  GM_setValue: {
    signature: "declare function GM_setValue(name: string, value: any): Promise<void>;",
    name: "GM_setValue",
    el: "gmSetValue",
    tmName: "GM_setValue",
    category: GM_API_CATEGORIES.STORAGE,
    description: "Stores a value that persists across page loads"
  },
  GM_getValue: {
    signature: "declare function GM_getValue(name: string, defaultValue?: any): Promise<any>;",
    name: "GM_getValue",
    el: "gmGetValue",
    tmName: "GM_getValue",
    category: GM_API_CATEGORIES.STORAGE,
    description: "Retrieves a value stored with GM_setValue"
  },
  GM_deleteValue: {
    signature: "declare function GM_deleteValue(name: string): Promise<void>;",
    name: "GM_deleteValue",
    el: "gmDeleteValue",
    tmName: "GM_deleteValue",
    category: GM_API_CATEGORIES.STORAGE,
    description: "Deletes a value stored with GM_setValue"
  },
  GM_listValues: {
    signature: "declare function GM_listValues(): Promise<string[]>;",
    name: "GM_listValues",
    el: "gmListValues",
    tmName: "GM_listValues",
    category: GM_API_CATEGORIES.STORAGE,
    description: "Lists all keys stored with GM_setValue"
  },

  // Browser & UI APIs
  GM_openInTab: {
    signature: "declare function GM_openInTab(url: string, options?: { active?: boolean, insert?: boolean, setParent?: boolean } | boolean): void;",
    name: "GM_openInTab",
    el: "gmOpenInTab",
    tmName: "GM_openInTab",
    category: GM_API_CATEGORIES.BROWSER_UI,
    description: "Opens a URL in a new browser tab"
  },
  GM_notification: {
    signature: "declare function GM_notification(details: { text?: string, title?: string, image?: string, highlight?: boolean, silent?: boolean, timeout?: number, ondone?: Function, onclick?: Function } | string, ondone?: Function): void;",
    name: "GM_notification",
    el: "gmNotification",
    tmName: "GM_notification",
    category: GM_API_CATEGORIES.BROWSER_UI,
    description: "Shows a desktop notification"
  },
  GM_addStyle: {
    signature: "declare function GM_addStyle(css: string): void;",
    name: "GM_addStyle",
    el: "gmAddStyle",
    tmName: "GM_addStyle",
    category: GM_API_CATEGORIES.BROWSER_UI,
    description: "Injects CSS styles into the page"
  },
  GM_addElement: {
    signature: "declare function GM_addElement(parent: Node, tag: string, attributes?: { [key: string]: string }): Node;",
    name: "GM_addElement",
    el: "gmAddElement",
    tmName: "GM_addElement",
    category: GM_API_CATEGORIES.BROWSER_UI,
    description: "Creates and appends a DOM element to the page"
  },
  GM_registerMenuCommand: {
    signature: "declare function GM_registerMenuCommand(caption: string, onClick: () => any, accessKey?: string): string;",
    name: "GM_registerMenuCommand",
    el: "gmRegisterMenuCommand",
    tmName: "GM_registerMenuCommand",
    category: GM_API_CATEGORIES.BROWSER_UI,
    description: "Adds a custom command to the userscript menu"
  },

  // Resources & Network APIs
  GM_getResourceText: {
    signature: "declare function GM_getResourceText(name: string): string;",
    name: "GM_getResourceText",
    el: "gmGetResourceText",
    tmName: "GM_getResourceText",
    category: GM_API_CATEGORIES.RESOURCES_NETWORK,
    description: "Gets the content of a resource as text"
  },
  GM_getResourceURL: {
    signature: "declare function GM_getResourceURL(name: string): string;",
    name: "GM_getResourceURL",
    el: "gmGetResourceURL",
    tmName: "GM_getResourceURL",
    category: GM_API_CATEGORIES.RESOURCES_NETWORK,
    description: "Gets the URL of a resource"
  },
  GM_xmlhttpRequest: {
    signature: "declare function GM_xmlhttpRequest(details: { method: string, url: string, data?: any, headers?: any, timeout?: number, responseType?: string, onload?: Function, onerror?: Function, onprogress?: Function }): void;",
    name: "GM_xmlhttpRequest",
    el: "gmXmlhttpRequest",
    tmName: "GM_xmlhttpRequest",
    category: GM_API_CATEGORIES.RESOURCES_NETWORK,
    description: "Makes cross-origin HTTP requests"
  },
  GM_setClipboard: {
    signature: "declare function GM_setClipboard(data: string, type?: string): Promise<void>;",
    name: "GM_setClipboard",
    el: "gmSetClipboard",
    tmName: "GM_setClipboard",
    category: GM_API_CATEGORIES.RESOURCES_NETWORK,
    description: "Copies data to the clipboard"
  },

  // Advanced APIs
  unsafeWindow: {
    signature: "declare const unsafeWindow: Window;",
    name: "unsafeWindow",
    el: "unsafeWindow",
    tmName: "unsafeWindow",
    category: GM_API_CATEGORIES.ADVANCED,
    description: "Direct access to the page's window object"
  }
};

/**
 * Get all API element IDs for caching
 * @returns {string[]} Array of element IDs
 */
export function getApiElementIds() {
  return Object.values(GM_API_DEFINITIONS).map(api => api.el);
}

/**
 * Get APIs grouped by category
 * @returns {Object} APIs organized by category
 */
export function getApisByCategory() {
  const grouped = {};
  
  Object.entries(GM_API_DEFINITIONS).forEach(([key, api]) => {
    if (!grouped[api.category]) {
      grouped[api.category] = [];
    }
    grouped[api.category].push({ key, ...api });
  });
  
  return grouped;
}

/**
 * Get API definition by element ID
 * @param {string} elementId - The element ID to search for
 * @returns {Object|null} API definition or null if not found
 */
export function getApiByElementId(elementId) {
  return Object.values(GM_API_DEFINITIONS).find(api => api.el === elementId) || null;
}

/**
 * Get all Tampermonkey grant names for enabled APIs
 * @param {Object} enabledApis - Object with API element IDs as keys and boolean values
 * @returns {string[]} Array of @grant names
 */
export function getGrantNames(enabledApis) {
  const grantNames = [];
  
  Object.entries(enabledApis).forEach(([key, enabled]) => {
    if (enabled) {
      const api = Object.values(GM_API_DEFINITIONS).find(api => api.el === key);
      if (api && api.tmName) {
        grantNames.push(api.tmName);
      }
    }
  });
  
  return grantNames;
}

/**
 * Get TypeScript signatures for enabled APIs
 * @param {Object} enabledApis - Object with API element IDs as keys and boolean values
 * @returns {string[]} Array of TypeScript signatures
 */
export function getTypeScriptSignatures(enabledApis) {
  const signatures = [];
  
  Object.entries(enabledApis).forEach(([key, enabled]) => {
    if (enabled) {
      const api = Object.values(GM_API_DEFINITIONS).find(api => api.el === key);
      if (api && api.signature) {
        signatures.push(api.signature);
      }
    }
  });
  
  return signatures;
}

export default GM_API_DEFINITIONS;