if (typeof GM_listValues === 'undefined') {
  window.GM_listValues = async () => {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError) {
            console.error('GM_listValues error:', chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
          } else {
            resolve(Object.keys(items));
          }
        });
      } catch (e) {
        console.error('GM_listValues exception:', e);
        reject(e);
      }
    });
  };
}
