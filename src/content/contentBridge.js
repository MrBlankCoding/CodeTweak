import logger from '../shared/utils/logger.js';

const browserAPI = globalThis.browser ?? globalThis.chrome;
const extensionId = browserAPI?.runtime?.id;

async function injectScriptsFallback() {
  if (browserAPI?.userScripts) return;

  try {
    const response = await new Promise((resolve) => {
      browserAPI.runtime.sendMessage(
        {
          action: 'getScriptsForUrl',
          url: window.location.href,
        },
        resolve
      );
    });

    if (response?.scripts && Array.isArray(response.scripts)) {
      // MV3 extension CSP bans eval()/new Function in content scripts, so true
      // isolated execution is impossible without the userScripts API. Fall back
      // to page script-tag injection so scripts run instead of throwing EvalError.
      let warnedIsolation = false;
      for (const script of response.scripts) {
        if (!script.code) continue;

        if (script.injectInto && script.injectInto !== 'main' && !warnedIsolation) {
          warnedIsolation = true;
          logger.warn(
            'Isolated execution needs the userScripts API; running fallback scripts in page context.'
          );
        }

        try {
          const scriptEl = document.createElement('script');
          scriptEl.textContent = script.code;
          (document.head || document.documentElement).appendChild(scriptEl);
          scriptEl.remove();
        } catch (e) {
          logger.error(`Error injecting fallback script ${script.id}:`, e);
        }
      }
    }
  } catch (error) {
    logger.debug('Script injection fallback failed:', error);
  }
}

if (extensionId) {
  injectScriptsFallback();
}

function toCloneable(value) {
  return JSON.parse(JSON.stringify(value));
}

if (
  typeof chrome !== 'undefined' &&
  (globalThis.browser ?? globalThis.chrome).runtime &&
  typeof (globalThis.browser ?? globalThis.chrome).runtime.onMessage?.addListener === 'function'
) {
  (globalThis.browser ?? globalThis.chrome).runtime.onMessage.addListener((message) => {
    if (message?.type === 'GM_VALUE_CHANGED') {
      window.postMessage(
        {
          type: 'GM_VALUE_CHANGED',
          payload: message.payload,
        },
        '*'
      );
    }
    return false;
  });
}

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) {
    return;
  }

  if (event.data.type === 'SCRIPT_ERROR') {
    if (
      typeof chrome !== 'undefined' &&
      (globalThis.browser ?? globalThis.chrome).runtime &&
      typeof (globalThis.browser ?? globalThis.chrome).runtime.sendMessage === 'function'
    ) {
      (globalThis.browser ?? globalThis.chrome).runtime.sendMessage(
        {
          type: 'SCRIPT_ERROR',
          scriptId: event.data.scriptId,
          error: event.data.error,
        },
        () => {
          if (
            (globalThis.browser ?? globalThis.chrome).runtime &&
            (globalThis.browser ?? globalThis.chrome).runtime.lastError
          ) {
            logger.error(
              '[CodeTweak Content Bridge] Error forwarding SCRIPT_ERROR:',
              (globalThis.browser ?? globalThis.chrome).runtime.lastError
            );
          }
        }
      );
    }
    return;
  }

  if (event.data.type !== 'GM_API_REQUEST' || event.data.extensionId !== extensionId) {
    return;
  }

  const { messageId, action, payload: originalPayload } = event.data;
  if (typeof messageId !== 'string' || typeof action !== 'string') {
    return;
  }

  if (
    !(
      typeof chrome !== 'undefined' &&
      (globalThis.browser ?? globalThis.chrome).runtime &&
      typeof (globalThis.browser ?? globalThis.chrome).runtime.sendMessage === 'function'
    )
  ) {
    logger.error(
      'CodeTweak: (globalThis.browser ?? globalThis.chrome).runtime.sendMessage is not available. Cannot bridge GM_API request.'
    );
    window.postMessage(
      {
        type: 'GM_API_RESPONSE',
        extensionId: extensionId,
        messageId: messageId,
        error: 'Extension context has been invalidated. Please reload the page.',
      },
      '*'
    );
    return;
  }

  let payload;
  try {
    payload = toCloneable({
      action: action,
      ...originalPayload,
    });
    if (payload === undefined || typeof payload.action !== 'string') {
      throw new Error('invalid payload shape');
    }
  } catch {
    window.postMessage(
      {
        type: 'GM_API_RESPONSE',
        extensionId: extensionId,
        messageId,
        error: 'Request payload is not serializable.',
      },
      '*'
    );
    return;
  }

  // create the payload for the background
  (globalThis.browser ?? globalThis.chrome).runtime.sendMessage(
    {
      type: 'GM_API_REQUEST',
      payload,
    },
    (_response) => {
      let responsePayload = {};
      if ((globalThis.browser ?? globalThis.chrome).runtime.lastError) {
        logger.error(
          `CodeTweak: Error in background for GM_API action ${action}:`,
          (globalThis.browser ?? globalThis.chrome).runtime.lastError.message
        );
        responsePayload.error = (globalThis.browser ?? globalThis.chrome).runtime.lastError.message;
      } else if (_response && _response.error) {
        logger.error(
          `CodeTweak: Error from background for GM_API action ${action}:`,
          _response.error
        );
        responsePayload.error = _response.error;
      } else {
        responsePayload.result = _response ? _response.result : undefined;
      }

      window.postMessage(
        {
          type: 'GM_API_RESPONSE',
          extensionId: extensionId,
          messageId,
          ...responsePayload,
        },
        '*'
      ); // post back to main world
    }
  );
});
