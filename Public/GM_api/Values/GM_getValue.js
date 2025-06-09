if (typeof GM_getValue === 'undefined') {
  window.GM_getValue = async (name, defaultValue) => {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(name, (items) => {
          if (chrome.runtime.lastError) {
            console.error('GM_getValue error:', chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
          } else {
            resolve(items[name] === undefined ? defaultValue : items[name]);
          }
        });
      } catch (e) {
        console.error('GM_getValue exception:', e);
        reject(e);
      }
    });
  };
}
