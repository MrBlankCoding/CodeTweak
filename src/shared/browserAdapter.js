export function getBrowserApi() {
  if (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime) {
    return globalThis.browser;
  }

  if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.runtime) {
    return globalThis.chrome;
  }

  if (typeof globalThis.browser !== 'undefined') return globalThis.browser;
  if (typeof globalThis.chrome !== 'undefined') return globalThis.chrome;

  return globalThis.browser ?? globalThis.chrome ?? {};
}

export function getStorageApi() {
  return getBrowserApi().storage;
}

export function promisifyChromeCall(fn, context, ...args) {
  if (typeof fn !== 'function') {
    return Promise.reject(new Error('API function is not available'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const settleReject = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    let result;
    try {
      result = fn.apply(context, [
        ...args,
        (value) => {
          const api = globalThis.browser ?? globalThis.chrome;
          if (api?.runtime?.lastError) {
            settleReject(new Error(api.runtime.lastError.message));
            return;
          }
          settleResolve(value);
        },
      ]);
    } catch (error) {
      settleReject(error);
      return;
    }

    if (result && typeof result.then === 'function') {
      result.then(settleResolve, settleReject);
    }
  });
}

// Live binding: resolves the API on each access so late-set globals
// (and test mocks) are picked up. Importers keep `import { browser }`.
export const browser = new Proxy(
  {},
  {
    get: (_target, prop) => getBrowserApi()[prop],
    set: (_target, prop, value) => {
      getBrowserApi()[prop] = value;
      return true;
    },
    has: (_target, prop) => prop in getBrowserApi(),
  }
);
