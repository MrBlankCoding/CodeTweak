import logger from '../utils/logger.js';
import { getBrowserApi, promisifyChromeCall } from '../shared/browserAdapter.js';

const REGISTRATION_PREFIX = 'ct-us-';
const REGISTRATION_STORE_KEY = 'userScriptRegistrationIds';

const GM_FLAG_KEYS = [
  'gmSetValue',
  'gmGetValue',
  'gmDeleteValue',
  'gmListValues',
  'gmAddValueChangeListener',
  'gmRemoveValueChangeListener',
  'gmOpenInTab',
  'gmNotification',
  'gmGetResourceText',
  'gmGetResourceURL',
  'gmSetClipboard',
  'gmDownload',
  'gmAddStyle',
  'gmAddElement',
  'gmRegisterMenuCommand',
  'gmUnregisterMenuCommand',
  'gmXmlhttpRequest',
  'unsafeWindow',
  'gmLog',
];

function normalizeRunAt(runAt) {
  if (!runAt) return 'document_idle';
  return runAt.replace(/-/g, '_');
}

function normalizeMatches(script) {
  const matches = Array.isArray(script.targetUrls)
    ? script.targetUrls
    : [script.targetUrl].filter(Boolean);

  return [...new Set(matches)].filter(Boolean);
}

function normalizeInjectInto(injectInto) {
  if (injectInto === 'isolated') return 'ISOLATED';
  return 'MAIN';
}

function getRegistrationId(scriptId) {
  return `${REGISTRATION_PREFIX}${scriptId}`;
}

function buildEnabledApis(script) {
  return Object.fromEntries(GM_FLAG_KEYS.map((key) => [key, Boolean(script[key])]));
}

function buildResourceMaps(script) {
  const resourceURLs = {};
  if (Array.isArray(script.resources)) {
    script.resources.forEach((resource) => {
      if (resource?.name && resource?.url) {
        resourceURLs[resource.name] = resource.url;
      }
    });
  }

  return {
    contents: script.resourceContents || {},
    urls: resourceURLs,
  };
}

function buildGmInfo(script, extensionVersion) {
  return {
    script: {
      id: script.id,
      name: script.name || '',
      version: script.version || '',
      description: script.description || '',
      author: script.author || '',
      namespace: script.namespace || '',
    },
    scriptHandler: 'CodeTweak',
    version: extensionVersion,
  };
}

function buildRuntimeBootstrap(config, userCode) {
  const configJson = JSON.stringify(config);
  const userCodePlaceholder = '/*__CODETWEAK_USER_CODE__*/';

  const bootstrap = `
(() => {
  const __ct = ${configJson};
  const __ctCache = new Map(Object.entries(__ct.initialValues || {}));
  const __ctValueListeners = new Map();
  let __ctMessageCounter = 0;
  let __ctListenerCounter = 0;

  function __ctToCloneable(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof value === 'function') return undefined;
    if (Array.isArray(value)) return value.map((item) => __ctToCloneable(item));
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested !== 'function') {
        output[key] = __ctToCloneable(nested);
      }
    }
    return output;
  }

  function __ctPostBackground(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const messageId = 'ct_' + __ct.scriptId + '_' + (__ctMessageCounter++);
      const safePayload = __ctToCloneable({
        scriptId: __ct.scriptId,
        ...payload,
      });
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('GM bridge timeout'));
      }, 10000);

      function onMessage(event) {
        if (event.source !== window || !event.data) return;
        if (event.data.type !== 'GM_API_RESPONSE') return;
        if (event.data.extensionId !== __ct.extensionId) return;
        if (event.data.messageId !== messageId) return;

        clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);

        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }

        resolve(event.data.result);
      }

      window.addEventListener('message', onMessage);
      window.postMessage(
        {
          type: 'GM_API_REQUEST',
          extensionId: __ct.extensionId,
          messageId,
          action,
          payload: safePayload,
        },
        '*'
      );
    });
  }

  function __ctReportScriptError(error, type = 'error') {
    const message = error?.message || String(error) || 'Unknown error';
    const stack = error?.stack || '';

    window.postMessage(
      {
        type: 'SCRIPT_ERROR',
        scriptId: __ct.scriptId,
        error: {
          message,
          stack,
          timestamp: new Date().toISOString(),
          type,
        },
      },
      '*'
    );
  }

  async function __ctLoadRequires(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    for (const rawUrl of urls) {
      const url = String(rawUrl || '').replace(/^http:\\/\\//i, 'https://');
      await new Promise((resolve, reject) => {
        const scriptElement = document.createElement('script');
        scriptElement.src = url;
        scriptElement.async = false;
        scriptElement.onload = resolve;
        scriptElement.onerror = () => reject(new Error('Failed to load @require: ' + url));
        (document.head || document.documentElement).appendChild(scriptElement);
      });
    }
  }

  function __ctInferMime(url) {
    if (!url || typeof url !== 'string') return 'text/plain';
    const lower = url.toLowerCase();
    if (lower.endsWith('.css')) return 'text/css';
    if (lower.endsWith('.js')) return 'application/javascript';
    if (lower.endsWith('.json')) return 'application/json';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
    if (lower.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
  }

  function __ctGetResourceText(name) {
    const text = __ct.resourceContents?.[name];
    return text == null ? null : String(text);
  }

  function __ctGetResourceURL(name) {
    const originalUrl = __ct.resourceURLs?.[name] ?? null;
    const text = __ct.resourceContents?.[name];

    if (typeof text === 'string') {
      const mime = __ctInferMime(originalUrl);
      const encoded = btoa(unescape(encodeURIComponent(text)));
      return 'data:' + mime + ';base64,' + encoded;
    }

    return originalUrl;
  }

  function __ctDefineGM() {
    const enabled = __ct.enabledApis || {};
    const GM = window.GM || {};

    const setValue = async (name, value) => {
      if (typeof name !== 'string') return;
      const resolved = value instanceof Promise ? await value : value;
      const clone = __ctToCloneable(resolved);
      __ctCache.set(name, clone);
      await __ctPostBackground('setValue', { name, value: clone });
    };

    const getValue = (name, defaultValue) => {
      if (typeof name !== 'string') return defaultValue;
      if (__ctCache.has(name)) return __ctCache.get(name);
      __ctPostBackground('getValue', { name, defaultValue: __ctToCloneable(defaultValue) })
        .then((value) => __ctCache.set(name, value))
        .catch(() => {});
      return defaultValue;
    };

    const getValueAsync = async (name, defaultValue) => {
      if (typeof name !== 'string') return defaultValue;
      if (__ctCache.has(name)) return __ctCache.get(name);
      try {
        const value = await __ctPostBackground('getValue', {
          name,
          defaultValue: __ctToCloneable(defaultValue),
        });
        __ctCache.set(name, value);
        return value;
      } catch {
        return defaultValue;
      }
    };

    const deleteValue = async (name) => {
      if (typeof name !== 'string') return;
      __ctCache.delete(name);
      await __ctPostBackground('deleteValue', { name });
    };

    const listValues = () => Array.from(__ctCache.keys()).filter((key) => typeof key === 'string');

    if (enabled.gmSetValue) {
      window.GM_setValue = setValue;
      GM.setValue = setValue;
    }

    if (enabled.gmGetValue) {
      window.GM_getValue = getValue;
      GM.getValue = getValueAsync;
    }

    if (enabled.gmDeleteValue) {
      window.GM_deleteValue = deleteValue;
      GM.deleteValue = deleteValue;
    }

    if (enabled.gmListValues) {
      window.GM_listValues = listValues;
      GM.listValues = async () => __ctPostBackground('listValues');
    }

    if (enabled.gmAddValueChangeListener) {
      const addFn = (name, callback) => {
        if (typeof name !== 'string' || typeof callback !== 'function') return undefined;

        const listenerId = __ctListenerCounter++;
        if (!__ctValueListeners.has(name)) {
          __ctValueListeners.set(name, new Map());
        }

        __ctValueListeners.get(name).set(listenerId, callback);
        __ctPostBackground('addValueChangeListener', { name }).catch(() => {});
        return listenerId;
      };

      window.GM_addValueChangeListener = addFn;
      GM.addValueChangeListener = addFn;
    }

    if (enabled.gmRemoveValueChangeListener) {
      const removeFn = (listenerId) => {
        for (const [name, listeners] of __ctValueListeners.entries()) {
          if (listeners.has(listenerId)) {
            listeners.delete(listenerId);
            if (listeners.size === 0) {
              __ctValueListeners.delete(name);
              __ctPostBackground('removeValueChangeListener', { name }).catch(() => {});
            }
            break;
          }
        }
      };

      window.GM_removeValueChangeListener = removeFn;
      GM.removeValueChangeListener = removeFn;
    }

    if (enabled.gmOpenInTab) {
      const openFn = (url, options = {}) => __ctPostBackground('openInTab', { url, options });
      window.GM_openInTab = openFn;
      GM.openInTab = openFn;
    }

    if (enabled.gmNotification) {
      const notifyFn = (details) => __ctPostBackground('notification', { details });
      window.GM_notification = notifyFn;
      GM.notification = notifyFn;
    }

    if (enabled.gmGetResourceText) {
      window.GM_getResourceText = __ctGetResourceText;
      GM.getResourceText = (name) => Promise.resolve(__ctGetResourceText(name));
    }

    if (enabled.gmGetResourceURL) {
      window.GM_getResourceURL = __ctGetResourceURL;
      GM.getResourceURL = (name) => Promise.resolve(__ctGetResourceURL(name));
    }

    if (enabled.gmSetClipboard) {
      const setClipboard = (data) => __ctPostBackground('setClipboard', { data });
      window.GM_setClipboard = setClipboard;
      GM.setClipboard = setClipboard;
    }

    if (enabled.gmDownload) {
      const download = (url, name) => __ctPostBackground('download', { url, name });
      window.GM_download = download;
      GM.download = download;
    }

    if (enabled.gmXmlhttpRequest) {
      const xhr = (details = {}) => {
        __ctPostBackground('xmlhttpRequest', { details })
          .then((response) => {
            if (typeof details.onload === 'function') {
              details.onload(response);
            }
          })
          .catch((error) => {
            if (typeof details.onerror === 'function') {
              details.onerror({ error: error.message });
            }
          });
      };

      window.GM_xmlhttpRequest = xhr;
      GM.xmlHttpRequest = (details = {}) =>
        __ctPostBackground('xmlhttpRequest', { details: __ctToCloneable(details) });
    }

    if (enabled.gmAddStyle) {
      const addStyle = (css) => {
        if (css == null) return null;
        const style = document.createElement('style');
        style.textContent = String(css);
        (document.head || document.documentElement).appendChild(style);
        return style;
      };

      window.GM_addStyle = addStyle;
      GM.addStyle = addStyle;
    }

    if (enabled.gmAddElement) {
      const addElement = (parent, tag, attributes = {}) => {
        const resolvedParent =
          typeof tag === 'string'
            ? parent
            : document.head || document.body || document.documentElement;
        const resolvedTag = typeof tag === 'string' ? tag : parent;

        if (!resolvedParent || !resolvedTag) return null;

        const element = document.createElement(String(resolvedTag));
        Object.entries(attributes || {}).forEach(([key, value]) => {
          try {
            element[key] = value;
          } catch {
            element.setAttribute(key, String(value));
          }
        });

        resolvedParent.appendChild(element);
        return element;
      };

      window.GM_addElement = addElement;
      GM.addElement = addElement;
    }

    if (enabled.gmRegisterMenuCommand) {
      const registerMenuCommand = (caption, onClick, accessKey) => {
        if (typeof caption !== 'string' || typeof onClick !== 'function') {
          return null;
        }

        const commandId = 'gm_menu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        window.__gmMenuCommands = window.__gmMenuCommands || [];
        window.__gmMenuCommands.push({ commandId, caption, onClick, accessKey });
        return commandId;
      };

      window.GM_registerMenuCommand = registerMenuCommand;
      GM.registerMenuCommand = registerMenuCommand;
    }

    if (enabled.gmUnregisterMenuCommand) {
      const unregisterMenuCommand = (commandId) => {
        if (!window.__gmMenuCommands) return;
        const index = window.__gmMenuCommands.findIndex((cmd) => cmd.commandId === commandId);
        if (index !== -1) window.__gmMenuCommands.splice(index, 1);
      };

      window.GM_unregisterMenuCommand = unregisterMenuCommand;
      GM.unregisterMenuCommand = unregisterMenuCommand;
    }

    if (enabled.gmLog) {
      const gmLog = (...args) => console.log('[GM_log]', ...args);
      window.GM_log = gmLog;
      GM.log = gmLog;
    }

    if (enabled.unsafeWindow) {
      window.unsafeWindow = window;
    }

    window.GM = GM;
    window.GM_info = Object.freeze(__ct.gmInfo || {});
    if (!window.GM.info) {
      window.GM.info = window.GM_info;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'GM_VALUE_CHANGED') return;
    const payload = event.data.payload || {};
    const listeners = __ctValueListeners.get(payload.name);
    if (!listeners) return;

    for (const callback of listeners.values()) {
      try {
        callback(payload.name, payload.oldValue, payload.newValue, payload.remote);
      } catch (error) {
        console.error('CodeTweak GM listener error', error);
      }
    }
  });

  (async () => {
    try {
      __ctDefineGM();
      await __ctLoadRequires(__ct.requires || []);
      (function () {
${userCodePlaceholder}
      }).call(window);
    } catch (error) {
      __ctReportScriptError(error, 'execution');
      console.error('Userscript execution failed:', error);
    }
  })();
})();
`;

  return bootstrap.replace(userCodePlaceholder, String(userCode ?? ''));
}

async function callUserScriptsMethod(userScriptsApi, methodName, args = []) {
  const method = userScriptsApi?.[methodName];
  if (typeof method !== 'function') {
    return;
  }

  if (typeof browser !== 'undefined') {
    await method.apply(userScriptsApi, args);
    return;
  }

  await promisifyChromeCall(method, userScriptsApi, ...args);
}

export class UserScriptsAdapter {
  constructor() {
    this.api = getBrowserApi();
  }

  isSupported() {
    const userScriptsApi = this.api.userScripts;
    return Boolean(
      userScriptsApi &&
      typeof userScriptsApi.register === 'function' &&
      typeof userScriptsApi.unregister === 'function'
    );
  }

  canUseUserScripts(script) {
    if (!script?.enabled || typeof script?.code !== 'string') {
      return false;
    }

    return normalizeMatches(script).length > 0;
  }

  async getStoredRegistrationIds() {
    const result = await this.api.storage.local.get(REGISTRATION_STORE_KEY);
    return new Set(
      Array.isArray(result[REGISTRATION_STORE_KEY]) ? result[REGISTRATION_STORE_KEY] : []
    );
  }

  async setStoredRegistrationIds(ids) {
    await this.api.storage.local.set({
      [REGISTRATION_STORE_KEY]: [...ids],
    });
  }

  async toRegistration(script) {
    const storageKey = `script-values-${script.id}`;
    const valuesResult = await this.api.storage.local.get(storageKey);
    const resources = buildResourceMaps(script);

    const runtimeVersion = this.api.runtime?.getManifest?.().version || '';

    const runtimeConfig = {
      scriptId: script.id,
      scriptName: script.name || script.id,
      extensionId: this.api.runtime?.id || '',
      enabledApis: buildEnabledApis(script),
      initialValues: valuesResult[storageKey] || {},
      requires: Array.isArray(script.requires) ? script.requires : [],
      resourceContents: resources.contents,
      resourceURLs: resources.urls,
      gmInfo: buildGmInfo(script, runtimeVersion),
    };

    return {
      id: getRegistrationId(script.id),
      matches: normalizeMatches(script),
      runAt: normalizeRunAt(script.runAt),
      world: normalizeInjectInto(script.injectInto),
      js: [
        {
          code: buildRuntimeBootstrap(runtimeConfig, script.code),
        },
      ],
    };
  }

  async syncEnabledScripts(scripts) {
    const enabledScripts = scripts.filter((script) => script.enabled);

    if (!this.isSupported()) {
      logger.error('Make sure to go to extension settings and enable allow user scrupts.');
      return {
        usingUserScripts: false,
      };
    }

    const userScriptsApi = this.api.userScripts;
    const previousIds = await this.getStoredRegistrationIds();

    const userScriptsEligible = enabledScripts.filter((script) => this.canUseUserScripts(script));
    const registrations = await Promise.all(
      userScriptsEligible.map((script) => this.toRegistration(script))
    );
    const nextIds = new Set(registrations.map((entry) => entry.id));

    const idsToRemove = [...previousIds].filter((id) => !nextIds.has(id));
    const registrationsToAdd = registrations.filter((entry) => !previousIds.has(entry.id));
    const registrationsToUpdate = registrations.filter((entry) => previousIds.has(entry.id));

    try {
      if (idsToRemove.length > 0) {
        await callUserScriptsMethod(userScriptsApi, 'unregister', [{ ids: idsToRemove }]);
      }

      if (registrationsToAdd.length > 0) {
        await callUserScriptsMethod(userScriptsApi, 'register', [registrationsToAdd]);
      }

      if (registrationsToUpdate.length > 0 && typeof userScriptsApi.update === 'function') {
        await callUserScriptsMethod(userScriptsApi, 'update', [registrationsToUpdate]);
      } else if (registrationsToUpdate.length > 0) {
        const ids = registrationsToUpdate.map((entry) => entry.id);
        await callUserScriptsMethod(userScriptsApi, 'unregister', [{ ids }]);
        await callUserScriptsMethod(userScriptsApi, 'register', [registrationsToUpdate]);
      }

      await this.setStoredRegistrationIds(nextIds);

      return {
        usingUserScripts: true,
      };
    } catch (error) {
      logger.error('Failed to sync userScripts registrations.', error);

      try {
        if (previousIds.size > 0) {
          await callUserScriptsMethod(userScriptsApi, 'unregister', [{ ids: [...previousIds] }]);
        }
      } catch {
        // Ignore cleanup errors.
      }

      await this.setStoredRegistrationIds(new Set());

      return {
        usingUserScripts: false,
      };
    }
  }
}
