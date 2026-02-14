export class ResourceManager {
  constructor(resourceContents = {}, resourceURLs = {}) {
    this.contents = new Map(Object.entries(resourceContents));
    this.urls = new Map(Object.entries(resourceURLs));
  }

  getText(resourceName) {
    return this.contents.get(resourceName) ?? null;
  }

  getURL(resourceName) {
    const originalUrl = this.urls.get(resourceName) ?? null;
    const text = this.contents.get(resourceName);

    if (typeof text === "string") {
      const mime = this._inferMimeType(originalUrl);
      const encoded = btoa(unescape(encodeURIComponent(text)));
      return `data:${mime};base64,${encoded}`;
    }

    return originalUrl;
  }

  _inferMimeType(url) {
    if (!url || typeof url !== "string") return "text/plain";
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith(".css")) return "text/css";
    if (lowerUrl.endsWith(".js")) return "application/javascript";
    if (lowerUrl.endsWith(".json")) return "application/json";
    if (lowerUrl.endsWith(".svg")) return "image/svg+xml";
    if (lowerUrl.endsWith(".html") || lowerUrl.endsWith(".htm")) {
      return "text/html";
    }
    if (lowerUrl.endsWith(".txt")) return "text/plain";
    return "application/octet-stream";
  }

  static fromScript(script) {
    const resourceURLs = {};

    if (Array.isArray(script.resources)) {
      script.resources.forEach((resource) => {
        resourceURLs[resource.name] = resource.url;
      });
    }

    return new ResourceManager(script.resourceContents || {}, resourceURLs);
  }
}

export class GMBridge {
  static ResourceManager = ResourceManager;

  constructor(scriptId, extensionId, worldType = "MAIN") {
    this.scriptId = scriptId;
    this.extensionId = extensionId;
    this.worldType = worldType;
    this.messageIdCounter = 0;
    this.pendingPromises = new Map();

    if (this.worldType === "MAIN") {
      this.setupMessageListener();
    }
  }

  setupMessageListener() {
    window.addEventListener("message", (event) => {
      if (!this.isValidResponse(event)) return;

      const { messageId, error, result } = event.data;
      const promise = this.pendingPromises.get(messageId);

      if (!promise) return;

      if (error) {
        promise.reject(new Error(error));
      } else {
        promise.resolve(result);
      }

      this.pendingPromises.delete(messageId);
    });
  }

  isValidResponse(event) {
    return (
      event.source === window &&
      event.data?.type === "GM_API_RESPONSE" &&
      event.data.extensionId === this.extensionId &&
      this.pendingPromises.has(event.data.messageId)
    );
  }

  call(action, payload = {}) {
    const enrichedPayload = { ...payload, scriptId: this.scriptId };

    // Use direct chrome.runtime API if available (ISOLATED world)
    if (
      this.worldType === "ISOLATED" &&
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return this.callIsolated(action, enrichedPayload);
    }

    // Fallback to postMessage (MAIN world)
    return this.callMain(action, enrichedPayload);
  }

  callMain(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const messageId = `gm_${this.scriptId}_${this.messageIdCounter++}`;
      this.pendingPromises.set(messageId, { resolve, reject });

      window.postMessage(
        {
          type: "GM_API_REQUEST",
          extensionId: this.extensionId,
          messageId,
          action,
          payload,
        },
        "*"
      );
    });
  }

  callIsolated(action, payload = {}) {
    return new Promise((resolve, reject) => {
      // Defensive: ensure chrome.runtime.sendMessage still available
      if (
        !(
          typeof chrome !== "undefined" &&
          chrome.runtime &&
          typeof chrome.runtime.sendMessage === "function"
        )
      ) {
        reject(new Error("chrome.runtime.sendMessage is not available"));
        return;
      }

      try {
        chrome.runtime.sendMessage(
          {
            type: "GM_API_REQUEST",
            payload: { action, ...payload },
          },
          (response) => {
            if (
              typeof chrome !== "undefined" &&
              chrome.runtime &&
              chrome.runtime.lastError
            ) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response?.error) {
              reject(new Error(response.error));
              return;
            }

            resolve(response?.result);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
}
