export function getBrowserApi() {
  if (typeof browser !== 'undefined') {
    return browser;
  }

  if (typeof chrome !== 'undefined') {
    return chrome;
  }

  throw new Error('No browser extension API available');
}

export function getRuntimeApi() {
  return getBrowserApi().runtime;
}

export function getStorageApi() {
  return getBrowserApi().storage;
}

export function promisifyChromeCall(fn, context, ...args) {
  if (typeof fn !== 'function') {
    return Promise.reject(new Error('API function is not available'));
  }

  try {
    const result = fn.apply(context, args);
    if (result && typeof result.then === 'function') {
      return result;
    }
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    fn.call(context, ...args, (value) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(value);
    });
  });
}
