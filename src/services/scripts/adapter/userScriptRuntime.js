// builds the GM API for the userscript
// can acess pages window and content
export function createUserScriptApi(config) {
  const global = globalThis;
  const isUserScriptWorld = config.world === 'USER_SCRIPT';
  const runtime = isUserScriptWorld ? global.chrome?.runtime : null;
  const enabled = config.enabledApis || {};
  const scriptId = config.scriptId;
  const cache = new Map();
  const valueListeners = new Map();
  const notificationCallbacks = new Map();
  let counter = 0;

  // @include regexes / @exclude rules that match patterns can't express.
  const gate = config.gate;
  if (gate) {
    const test = (source) => {
      try {
        return new RegExp(source, 'i').test(location.href);
      } catch {
        return false;
      }
    };
    const included = !gate.include || gate.include.some(test);
    if (!included || (gate.exclude || []).some(test)) {
      return { scope: {}, reportError() {}, run() {} };
    }
  }

  const toCloneable = (value) => {
    if (value === undefined || typeof value === 'function') return undefined;
    if (value === null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  };

  const copy = (value) =>
    value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;

  const call = (fn, ...args) => {
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch (error) {
      console.error(`[CodeTweak] ${config.scriptName} callback error`, error);
    }
  };

  const send = (action, payload = {}) => {
    if (!runtime?.sendMessage) {
      return Promise.reject(new Error(`CodeTweak: ${action} is unavailable in this context.`));
    }
    return runtime
      .sendMessage({
        type: 'GM_API_REQUEST',
        payload: { ...toCloneable(payload), action, scriptId },
      })
      .then((response) => {
        if (response?.error) throw new Error(response.error);
        return response?.result;
      });
  };

  const reportError = (error, type = 'execution') => {
    const details = {
      message: error?.message || String(error) || 'Unknown error',
      stack: error?.stack || '',
      timestamp: new Date().toISOString(),
      type,
    };
    if (isUserScriptWorld) {
      send('reportError', { error: details }).catch(() => {});
    } else {
      window.postMessage({ type: 'CODETWEAK_SCRIPT_ERROR', scriptId, error: details }, '*');
    }
  };

  const reportFirstRun = () => {
    if (isUserScriptWorld) {
      runtime
        ?.sendMessage({ type: 'CODETWEAK_FIRST_RUN', scriptId })
        .catch((error) => console.warn('[CodeTweak] Failed to report first run', error));
    } else {
      window.postMessage({ type: 'CODETWEAK_FIRST_RUN', scriptId }, '*');
    }
  };

  let registry = null;
  if (isUserScriptWorld) {
    if (!global.__codetweak) {
      Object.defineProperty(global, '__codetweak', {
        value: {
          handlers: new Map(),
          menu: new Map(),
          dispatch(id, type, data) {
            const handler = this.handlers.get(id);
            if (handler) handler(type, data);
          },
        },
      });
    }
    registry = global.__codetweak;
  }

  const emitValueChange = (name, oldValue, newValue, remote) => {
    for (const listener of valueListeners.values()) {
      if (listener.name === name) call(listener.callback, name, oldValue, newValue, remote);
    }
  };

  registry?.handlers.set(scriptId, (type, data = {}) => {
    if (type === 'valueChanged') {
      const oldValue = cache.get(data.name);
      if (data.deleted) cache.delete(data.name);
      else cache.set(data.name, data.newValue);
      emitValueChange(data.name, oldValue, data.newValue, data.remote !== false);
    } else if (type === 'notification') {
      const callbacks = notificationCallbacks.get(data.callbackId);
      if (!callbacks) return;
      if (data.event === 'click') call(callbacks.onclick);
      if (data.event === 'done') {
        notificationCallbacks.delete(data.callbackId);
        call(callbacks.ondone);
      }
    }
  });

  const usesValues = [
    'gmSetValue',
    'gmGetValue',
    'gmDeleteValue',
    'gmListValues',
    'gmAddValueChangeListener',
  ].some((flag) => enabled[flag]);

  const ready =
    usesValues && isUserScriptWorld
      ? send('getAllValues')
          .then((values) => {
            for (const [name, value] of Object.entries(values || {})) cache.set(name, value);
          })
          .catch((error) => console.warn('[CodeTweak] Failed to load stored values', error))
      : Promise.resolve();

  const setValue = (name, value) => {
    if (typeof name !== 'string') return Promise.resolve();
    const clone = toCloneable(value);
    const oldValue = cache.get(name);
    cache.set(name, clone);
    emitValueChange(name, oldValue, clone, false);
    return send('setValue', { name, value: clone }).then(() => undefined);
  };

  const getValue = (name, defaultValue) => {
    if (typeof name !== 'string' || !cache.has(name)) return defaultValue;
    return copy(cache.get(name));
  };

  const deleteValue = (name) => {
    if (typeof name !== 'string') return Promise.resolve();
    const oldValue = cache.get(name);
    cache.delete(name);
    emitValueChange(name, oldValue, undefined, false);
    return send('deleteValue', { name }).then(() => undefined);
  };

  const listValues = () => Array.from(cache.keys());

  const addValueChangeListener = (name, callback) => {
    if (typeof name !== 'string' || typeof callback !== 'function') return undefined;
    const id = ++counter;
    valueListeners.set(id, { name, callback });
    return id;
  };

  const removeValueChangeListener = (id) => {
    valueListeners.delete(id);
  };

  const openInTab = (url, options = {}) => {
    const normalized = typeof options === 'boolean' ? { active: !options } : options || {};
    return send('openInTab', {
      url: String(url),
      options: {
        active: normalized.active,
        insert: normalized.insert,
        setParent: normalized.setParent,
      },
    });
  };

  // Supports both GM_notification(details, ondone) and the legacy
  // GM_notification(text, title, image, onclick) signature.
  const notification = (details, ...rest) => {
    const options =
      details && typeof details === 'object'
        ? details
        : { text: String(details ?? ''), title: rest[0], image: rest[1], onclick: rest[2] };
    const ondone = typeof rest[0] === 'function' ? rest[0] : options.ondone;
    let callbackId = null;
    if (typeof options.onclick === 'function' || typeof ondone === 'function') {
      callbackId = `n${++counter}`;
      notificationCallbacks.set(callbackId, { onclick: options.onclick, ondone });
    }
    return send('notification', {
      details: {
        title: typeof options.title === 'string' ? options.title : undefined,
        text: options.text,
        silent: options.silent,
        timeout: options.timeout,
      },
      callbackId,
    });
  };

  const setClipboard = (data) => send('setClipboard', { data: String(data ?? '') });

  const download = (details, name) => {
    const opts = details && typeof details === 'object' ? details : { url: details, name };
    return send('download', { url: opts.url, name: opts.name }).then(
      (result) => {
        call(opts.onload, result);
        return result;
      },
      (error) => {
        call(opts.onerror, { error: error.message });
        throw error;
      }
    );
  };

  const base64ToBuffer = (base64) => {
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  const decodeResponse = (raw, responseType, context) => {
    const response = { ...raw, context };
    delete response.responseBase64;
    if (responseType === 'arraybuffer') {
      response.response = base64ToBuffer(raw.responseBase64);
    } else if (responseType === 'blob') {
      response.response = new Blob([base64ToBuffer(raw.responseBase64)], {
        type: raw.mime || '',
      });
    } else if (responseType === 'document') {
      response.response = new DOMParser().parseFromString(
        raw.responseText || '',
        raw.mime || 'text/html'
      );
    }
    return response;
  };

  const xmlhttpRequest = (details = {}) => {
    const requestId = `x${++counter}`;
    let aborted = false;
    const context = details.context;
    const request = toCloneable({
      method: details.method,
      url: String(details.url ?? ''),
      headers: details.headers,
      data: typeof details.data === 'string' ? details.data : undefined,
      timeout: details.timeout,
      responseType: details.responseType,
      anonymous: details.anonymous,
    });

    const promise = send('xmlhttpRequest', { details: request, requestId }).then(
      (raw) => {
        const response = decodeResponse(raw || {}, details.responseType, context);
        if (!aborted) {
          call(details.onreadystatechange, response);
          call(details.onload, response);
          call(details.onloadend, response);
        }
        return response;
      },
      (error) => {
        const response = {
          error: error.message,
          status: 0,
          readyState: 4,
          responseText: '',
          finalUrl: request.url,
          context,
        };
        if (!aborted) {
          const isTimeout = /timed out/i.test(error.message);
          call(isTimeout && details.ontimeout ? details.ontimeout : details.onerror, response);
          call(details.onloadend, response);
        }
        throw error;
      }
    );

    const abort = () => {
      if (aborted) return;
      aborted = true;
      send('xhrAbort', { requestId }).catch(() => {});
      call(details.onabort, { status: 0, readyState: 4, context });
    };

    return { promise, abort };
  };

  const addStyle = (css) => {
    if (css == null) return null;
    const style = document.createElement('style');
    style.textContent = String(css);
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

  // GM_addElement(tag, attributes) or GM_addElement(parent, tag, attributes).
  const addElement = (...args) => {
    const [parent, tag, attributes] =
      typeof args[0] === 'string'
        ? [document.head || document.body || document.documentElement, args[0], args[1]]
        : args;
    if (!parent || typeof tag !== 'string') return null;
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes || {})) {
      if (key === 'textContent' || key === 'innerText') element.textContent = String(value);
      else element.setAttribute(key, String(value));
    }
    parent.appendChild(element);
    return element;
  };

  const registerMenuCommand = (caption, onClick, options) => {
    if (typeof caption !== 'string' || typeof onClick !== 'function') return null;
    const opts = options && typeof options === 'object' ? options : { accessKey: options };
    const commandId = opts.id != null ? `${scriptId}:${opts.id}` : `${scriptId}:${++counter}`;
    registry.menu.set(commandId, {
      scriptId,
      scriptName: config.scriptName,
      caption,
      accessKey: typeof opts.accessKey === 'string' ? opts.accessKey : undefined,
      onClick,
    });
    return opts.id ?? commandId;
  };

  const unregisterMenuCommand = (commandId) => {
    registry.menu.delete(commandId);
    registry.menu.delete(`${scriptId}:${commandId}`);
  };

  const decodeText = (resource) => {
    if (typeof resource.text === 'string') return resource.text;
    return new TextDecoder().decode(base64ToBuffer(resource.base64));
  };

  const getResourceText = (name) => {
    const resource = config.resources?.[name];
    return resource ? decodeText(resource) : null;
  };

  const getResourceURL = (name) => {
    const resource = config.resources?.[name];
    if (!resource) return null;
    const base64 =
      typeof resource.base64 === 'string'
        ? resource.base64
        : btoa(unescape(encodeURIComponent(resource.text)));
    return `data:${resource.mime || 'application/octet-stream'};base64,${base64}`;
  };

  const log = (...args) => console.log('[GM_log]', ...args);

  const unavailable = (name) => () => {
    throw new Error(
      `CodeTweak: ${name} is not available when a script runs in the page (Main World). ` +
        'Set Execution Context to Default or Isolated World.'
    );
  };

  const PRIVILEGED = {
    gmSetValue: ['GM_setValue', 'setValue'],
    gmGetValue: ['GM_getValue', 'getValue'],
    gmDeleteValue: ['GM_deleteValue', 'deleteValue'],
    gmListValues: ['GM_listValues', 'listValues'],
    gmAddValueChangeListener: ['GM_addValueChangeListener', 'addValueChangeListener'],
    gmRemoveValueChangeListener: ['GM_removeValueChangeListener', 'removeValueChangeListener'],
    gmOpenInTab: ['GM_openInTab', 'openInTab'],
    gmNotification: ['GM_notification', 'notification'],
    gmSetClipboard: ['GM_setClipboard', 'setClipboard'],
    gmDownload: ['GM_download', 'download'],
    gmXmlhttpRequest: ['GM_xmlhttpRequest', 'xmlHttpRequest'],
    gmRegisterMenuCommand: ['GM_registerMenuCommand', 'registerMenuCommand'],
    gmUnregisterMenuCommand: ['GM_unregisterMenuCommand', 'unregisterMenuCommand'],
  };

  const implementations = {
    gmSetValue: [
      (name, value) => {
        setValue(name, value).catch((error) => console.warn('[CodeTweak] GM_setValue', error));
      },
      setValue,
    ],
    gmGetValue: [getValue, (name, defaultValue) => Promise.resolve(getValue(name, defaultValue))],
    gmDeleteValue: [
      (name) => {
        deleteValue(name).catch((error) => console.warn('[CodeTweak] GM_deleteValue', error));
      },
      deleteValue,
    ],
    gmListValues: [listValues, () => Promise.resolve(listValues())],
    gmAddValueChangeListener: [addValueChangeListener, addValueChangeListener],
    gmRemoveValueChangeListener: [removeValueChangeListener, removeValueChangeListener],
    gmOpenInTab: [openInTab, openInTab],
    gmNotification: [notification, notification],
    gmSetClipboard: [setClipboard, setClipboard],
    gmDownload: [download, download],
    gmXmlhttpRequest: [
      (details) => {
        const request = xmlhttpRequest(details);
        request.promise.catch(() => {});
        return { abort: request.abort };
      },
      (details) => {
        const request = xmlhttpRequest(details);
        const promise = request.promise;
        promise.abort = request.abort;
        return promise;
      },
    ],
    gmRegisterMenuCommand: [registerMenuCommand, registerMenuCommand],
    gmUnregisterMenuCommand: [unregisterMenuCommand, unregisterMenuCommand],
  };

  const GM = {};
  const scope = { GM, unsafeWindow: window };

  for (const [flag, [legacyName, modernName]] of Object.entries(PRIVILEGED)) {
    if (!enabled[flag]) continue;
    if (isUserScriptWorld) {
      [scope[legacyName], GM[modernName]] = implementations[flag];
    } else {
      scope[legacyName] = unavailable(legacyName);
      GM[modernName] = async () => unavailable(legacyName)();
    }
  }

  if (enabled.gmAddStyle) {
    scope.GM_addStyle = addStyle;
    GM.addStyle = (css) => Promise.resolve(addStyle(css));
  }
  if (enabled.gmAddElement) {
    scope.GM_addElement = addElement;
    GM.addElement = (...args) => Promise.resolve(addElement(...args));
  }
  if (enabled.gmGetResourceText) {
    scope.GM_getResourceText = getResourceText;
    GM.getResourceText = (name) => Promise.resolve(getResourceText(name));
  }
  if (enabled.gmGetResourceURL) {
    scope.GM_getResourceURL = getResourceURL;
    GM.getResourceURL = (name) => Promise.resolve(getResourceURL(name));
    GM.getResourceUrl = GM.getResourceURL;
  }
  if (enabled.gmLog) {
    scope.GM_log = log;
    GM.log = log;
  }

  const info = Object.freeze({ ...(config.gmInfo || {}) });
  scope.GM_info = info;
  GM.info = info;

  return {
    scope,
    reportError,
    run(main) {
      if (Array.isArray(config.missingDependencies) && config.missingDependencies.length > 0) {
        const error = new Error(
          `Missing dependencies, script not started: ${config.missingDependencies.join(', ')}`
        );
        reportError(error, 'dependency');
        console.error(`[CodeTweak] ${config.scriptName}:`, error.message);
        return;
      }
      ready.then(() => {
        try {
          const result = main.apply(
            window,
            config.apiNames.map((name) => scope[name])
          );
          if (result && typeof result.catch === 'function') {
            result.catch((error) => reportError(error));
          }
        } catch (error) {
          reportError(error);
          console.error(`[CodeTweak] ${config.scriptName} failed:`, error);
        } finally {
          reportFirstRun();
        }
      });
    },
  };
}

// Runs in the USER_SCRIPT world on pages with Main World scripts and relays
// their error reports (which can only use postMessage) to the background.
export function createErrorBridge() {
  if (globalThis.__codetweakErrorBridge) return;
  Object.defineProperty(globalThis, '__codetweakErrorBridge', { value: true });
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || typeof data?.scriptId !== 'string') return;
    if (data.type === 'CODETWEAK_FIRST_RUN') {
      chrome.runtime.sendMessage(data).catch(() => {});
    } else if (data.type === 'CODETWEAK_SCRIPT_ERROR' && data.error) {
      chrome.runtime
        .sendMessage({
          type: 'GM_API_REQUEST',
          payload: { action: 'reportError', scriptId: data.scriptId, error: data.error },
        })
        .catch(() => {});
    }
  });
}
