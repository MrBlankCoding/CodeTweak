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


// Watch for element changes in the DOM
class ElementWatcher {
  constructor() {
    this.watchList = new Map();
    this.isWatching = false;
    this.observer = null;
  }


  watch(selector, callback) {
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

// Create the ElementWatcher 
const elementWatcher = new ElementWatcher();

// Get messages from the background 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "waitForElements") {
    console.log("Received element-ready scripts:", message.scripts.length);

    message.scripts.forEach((script) => {
      if (script.waitForSelector) {
        checkForElement(
          script.waitForSelector,
          () => {
            // When the element is found, notif background
            chrome.runtime.sendMessage({
              action: "elementFound",
              tabId: sender.tab?.id,
              scriptCode: script.code,
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

chrome.runtime.sendMessage({
  action: "contentScriptReady",
  url: window.location.href,
});
