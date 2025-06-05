function checkForElement(selector, callback, options = {}) {
  const config = {
    initialDelay: 50,
    maxDelay: 1000,
    maxAttempts: 50,
    backoffFactor: 1.5,
    ...options,
  };

  let attempts = 0;
  let delay = config.initialDelay;

  const tryFindElement = () => {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
      return;
    }

    if (++attempts >= config.maxAttempts) {
      console.warn(
        `Element '${selector}' not found after ${attempts} attempts.`
      );
      return;
    }

    delay = Math.min(delay * config.backoffFactor, config.maxDelay);
    setTimeout(tryFindElement, delay);
  };

  // Start searching and observe DOM mutations
  tryFindElement();

  const observer = new MutationObserver(() => {
    const element = document.querySelector(selector);
    if (element) {
      observer.disconnect();
      callback(element);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Element watcher with batching logic
class ElementWatcher {
  constructor(timeout = 30000) {
    this.watchList = new Map();
    this.observer = null;
    this.timeout = timeout;
    this.executedScripts = new Set();
  }

  watch(selector, callback, scriptId) {
    if (this.executedScripts.has(scriptId)) return;
    this.executedScripts.add(scriptId);

    if (!this.watchList.has(selector)) {
      this.watchList.set(selector, []);
    }
    this.watchList.get(selector).push(callback);

    this.startObserver();
  }

  startObserver() {
    if (this.observer) return;

    this.observer = new MutationObserver(() => this.checkWatchList());
    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Final fallback to clean up
    setTimeout(() => this.disconnect(), this.timeout);

    // Initial check
    this.checkWatchList();
  }

  checkWatchList() {
    for (const [selector, callbacks] of this.watchList.entries()) {
      const element = document.querySelector(selector);
      if (element) {
        callbacks.forEach((cb) => cb(element));
        this.watchList.delete(selector);
      }
    }

    if (this.watchList.size === 0) {
      this.disconnect();
    }
  }

  disconnect() {
    this.observer?.disconnect();
    this.observer = null;
  }
}

// Single instance
const elementWatcher = new ElementWatcher();

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "waitForElements") {
    console.log("Received element-ready scripts:", message.scripts.length);

    message.scripts.forEach((script) => {
      if (
        !script.waitForSelector ||
        elementWatcher.executedScripts.has(script.id)
      )
        return;

      checkForElement(
        script.waitForSelector,
        () => {
          chrome.runtime.sendMessage({
            action: "elementFound",
            tabId: sender.tab?.id || null,
            scriptCode: script.code,
            scriptId: script.id,
          });
        },
        { maxAttempts: 75 }
      );
    });

    sendResponse({
      status: "watching_for_elements",
      count: message.scripts.length,
    });
  }

  return true;
});

// Notify background script content is ready
chrome.runtime.sendMessage({
  action: "contentScriptReady",
  url: window.location.href,
});
