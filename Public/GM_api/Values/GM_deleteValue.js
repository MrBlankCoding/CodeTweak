if (typeof GM_deleteValue === 'undefined') {
  window.GM_deleteValue = async (name) => {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove(name, () => {
          if (chrome.runtime.lastError) {
            console.error('GM_deleteValue error:', chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (e) {
        console.error('GM_deleteValue exception:', e);
        reject(e);
      }
    });
  };
}
