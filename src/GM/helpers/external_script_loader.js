import { getTrustedTypesPolicy } from "./trusted_types.js";

export class ExternalScriptLoader {
  constructor() {
    this.loadedScripts = new Set();
  }

  async loadScript(url) {
    if (this.loadedScripts.has(url)) {
      return;
    }

    // Auto-upgrade HTTP to HTTPS
    const upgradedUrl = url.replace(/^http:\/\//i, "https://");
    if (upgradedUrl !== url) {
      console.info(`[GMBridge] Auto-upgraded ${url} to HTTPS`);
    }

    await this.injectScriptTag(upgradedUrl);
    this.loadedScripts.add(url);
  }

  async loadScripts(urls) {
    if (!Array.isArray(urls)) return;

    for (const url of urls) {
      await this.loadScript(url);
    }
  }

  injectScriptTag(src) {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement("script");

      // Apply Trusted Types if available
      const policy = getTrustedTypesPolicy();
      let trustedSrc = src;

      if (policy) {
        try {
          trustedSrc = policy.createScriptURL(src);
        } catch (error) {
          console.error(
            "[GMBridge] Failed to create trusted script URL:",
            error
          );
        }
      }

      scriptElement.src = trustedSrc;
      scriptElement.async = false; // Preserve execution order
      scriptElement.onload = resolve;
      scriptElement.onerror = () => {
        const error = new Error(`Failed to load script: ${src}`);
        console.error("[GMBridge]", error.message);
        reject(error);
      };

      (document.head || document.documentElement).appendChild(scriptElement);
    });
  }
}
