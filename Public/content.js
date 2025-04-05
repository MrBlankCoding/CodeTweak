//ONLY FOR CHECKING IF ELEMENTS EXIST
// WHYYYYYYYYYYYYYYY

//The vibes got this one :D
function checkForElement(selector, callback, options = {}) {
  const config = {
    initialDelay: 50,
    maxDelay: 1000,
    maxAttempts: 50,
    backoffFactor: 1.5,
    ...options,
  };

  const element = document.querySelector(selector);
  if (element) {
    callback(element);
    return;
  }

  const observer = new MutationObserver((mutations, obs) => {
    const element = document.querySelector(selector);
    if (element) {
      obs.disconnect();
      callback(element);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  let attempts = 0;
  let currentDelay = config.initialDelay;

  const checkElement = () => {
    attempts++;

    if (attempts >= config.maxAttempts) {
      console.warn(
        `Element '${selector}' not found after ${config.maxAttempts} attempts`
      );
      observer.disconnect();
      return;
    }

    currentDelay = Math.min(
      currentDelay * config.backoffFactor,
      config.maxDelay
    );
    setTimeout(checkElement, currentDelay);
  };

  setTimeout(checkElement, config.initialDelay);
}

// watch changess
class ElementWatcher {
  constructor() {
    this.watchList = new Map();
    this.isWatching = false;
    this.observer = null;
    this.processedScripts = new Set(); // track processed scripts
  }

  watch(selector, callback, scriptId) {
    // dont process the same script multiple times
    if (this.processedScripts.has(scriptId)) {
      return;
    }

    this.processedScripts.add(scriptId);

    if (!this.watchList.has(selector)) {
      this.watchList.set(selector, []);
    }

    this.watchList.get(selector).push(callback);

    if (!this.isWatching) {
      this.startWatching();
    }
  }

  startWatching() {
    if (this.isWatching) return;
    this.isWatching = true;

    this.observer = new MutationObserver(() => this.checkElements());

    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    this.checkElements();

    setTimeout(() => this.stopWatching(), 30000);
  }

  checkElements() {
    for (const [selector, callbacks] of this.watchList.entries()) {
      const element = document.querySelector(selector);

      if (element) {
        callbacks.forEach((callback) => callback(element));
        this.watchList.delete(selector);
      }
    }

    if (this.watchList.size === 0) {
      this.stopWatching();
    }
  }

  stopWatching() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.isWatching = false;
  }
}

// create watcher (I need a init function)
const elementWatcher = new ElementWatcher();
const executedScripts = new Set(); 

// Get messages from the background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "waitForElements") {
    console.log("Received element-ready scripts:", message.scripts.length);

    message.scripts.forEach((script) => {
      if (executedScripts.has(script.id)) {
        return;
      }

      if (script.waitForSelector) {
        checkForElement(
          script.waitForSelector,
          () => {
            executedScripts.add(script.id);
            chrome.runtime.sendMessage({
              action: "elementFound",
              tabId: sender.tab ? sender.tab.id : null,
              scriptCode: script.code,
              scriptId: script.id,
              requiresCSP: script.permissions?.cspDisabled || false,
            });
          },
          {
            maxAttempts: 75,
          }
        );
      }
    });

    sendResponse({
      status: "watching_for_elements",
      count: message.scripts.length,
    });
  }

  return true;
});

// Notif 
chrome.runtime.sendMessage({
  action: "contentScriptReady",
  url: window.location.href,
});
