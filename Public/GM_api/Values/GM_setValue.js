if (typeof GM_setValue === 'undefined') {
  window.GM_setValue = async (name, value) => {
    return new Promise((resolve, reject) => {
      try {
        const items = {};
        items[name] = value;
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            console.error('GM_setValue error:', chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (e) {
        console.error('GM_setValue exception:', e);
        reject(e);
      }
    });
  };
}
