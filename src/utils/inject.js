import {
  createWorldExecutor,
} from "./worldExecutors.js";

const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
});

const EXECUTION_WORLDS = Object.freeze({
  MAIN: "MAIN",
  ISOLATED: "ISOLATED",
});


class ScriptInjector {
  constructor() {
    this.executedScripts = new Map();
    this.injectedCoreScripts = new Map();
  }

  prepareScriptConfig(script, enhancedDebugging) {
    const scriptId =
      script.id || script.name || `anonymous_script_${Date.now()}`;

    const apiKeys = [
      "gmSetValue",
      "gmGetValue",
      "gmDeleteValue",
      "gmListValues",
      "gmAddValueChangeListener",
      "gmRemoveValueChangeListener",
      "gmOpenInTab",
      "gmNotification",
      "gmGetResourceText",
      "gmGetResourceURL",
      "gmSetClipboard",
      "gmDownload",
      "gmAddStyle",
      "gmAddElement",
      "gmRegisterMenuCommand",
      "gmUnregisterMenuCommand",
      "gmXmlhttpRequest",
      "unsafeWindow",
      "gmLog",
    ];

    const enabledApis = Object.fromEntries(
      apiKeys.map((key) => [key, Boolean(script[key])])
    );

    return {
      code: script.code,
      id: scriptId,
      enabledApis,
      script,
      initialValues: script.initialValues || {},
      requires: Array.isArray(script.requires) ? script.requires : [],
      gmInfo: {
        script: {
          id: scriptId,
          name: script.name,
          version: script.version,
          description: script.description,
          author: script.author,
          namespace: script.namespace || "",
        },
        scriptHandler: "CodeTweak",
        version: chrome.runtime?.getManifest?.().version || "",
      },
      enhancedDebugging,
    };
  }

  async injectCoreScripts(tabId, world) {
    if (!this.injectedCoreScripts.has(tabId)) {
      this.injectedCoreScripts.set(tabId, new Set());
    }

    const tabCoreScripts = this.injectedCoreScripts.get(tabId);

    if (tabCoreScripts.has(world)) {
      return;
    }

    if (world === EXECUTION_WORLDS.MAIN) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: EXECUTION_WORLDS.MAIN,
        func: () => {
          if (typeof unsafeWindow === "undefined") {
            Object.defineProperty(window, "unsafeWindow", {
              value: window,
              writable: false,
              configurable: false,
            });
          }
        },
      });
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      world,
      files: ["GM/gm_core.js", "GM/gm_api_registry.js"],
    });

    tabCoreScripts.add(world);
  }

  async injectInWorld(tabId, config, world) {
    await this.injectCoreScripts(tabId, world);

    const args = [
      config.code,
      config.id,
      config.enabledApis,
      config.script,
      chrome.runtime.id,
      config.initialValues,
      config.requires,
      config.gmInfo,
      config.enhancedDebugging,
      world,
    ];

    await chrome.scripting.executeScript({
      target: { tabId },
      world,
      func: createWorldExecutor,
      args,
    });
  }

  async tryInjectInBothWorlds(tabId, config, injectInto) {
    if (injectInto === "default") {
      try {
        await this.injectInWorld(tabId, config, EXECUTION_WORLDS.MAIN);
        return true;
      } catch (error) {
        console.warn(
          `CodeTweak: MAIN world injection failed for script '${config.id}', trying ISOLATED world:`,
          error?.message
        );
        try {
          await this.injectInWorld(tabId, config, EXECUTION_WORLDS.ISOLATED);
          return true;
        } catch (isolatedError) {
          console.error(
            `CodeTweak: ISOLATED world injection also failed for script '${config.id}':`,
            isolatedError
          );
          return false;
        }
      }
    }

    const world =
      injectInto === "main" ? EXECUTION_WORLDS.MAIN : EXECUTION_WORLDS.ISOLATED;
    try {
      await this.injectInWorld(tabId, config, world);
      return true;
    } catch (error) {
      console.error(
        `CodeTweak: ${world} world injection failed for script '${config.id}':`,
        error
      );
      return false;
    }
  }

  async injectScript(tabId, script, settings = {}) {
    try {
      const tab = await chrome.tabs.get(tabId);

      if (!tab || !chrome.runtime?.id) {
        console.warn(
          `CodeTweak: Tab or extension runtime not available for ${script?.name}`
        );
        return false;
      }

      const storageKey = `script-values-${script.id}`;
      const result = await chrome.storage.local.get(storageKey);
      script.initialValues = result[storageKey] || {};

      const { settings: storedSettings = {} } = await chrome.storage.local.get(
        "settings"
      );
      const config = this.prepareScriptConfig(
        script,
        storedSettings.enhancedDebugging
      );

      const injected = await this.tryInjectInBothWorlds(
        tabId,
        config,
        script.injectInto
      );

      if (injected && settings.showNotifications) {
        this.showNotification(tabId, script.name);
      }

      return injected;
    } catch (error) {
      console.warn(
        `CodeTweak: Failed to inject script ${script?.name}:`,
        error
      );
      return false;
    }
  }

  async askForConfirmation(tabId, scriptName, domain) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (scriptName, domain) => {
        return new Promise((resolve) => {
          const container = document.createElement("div");
          container.id = "codetweak-confirm-container";

          const shadow = container.attachShadow({ mode: "open" });

          const style = document.createElement("style");
          style.textContent = `
            :host {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0, 0, 0, 0.5);
              z-index: 2147483647;
              display: flex;
              justify-content: center;
              align-items: center;
              font-family: sans-serif;
            }
            .modal {
              background: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
              width: 400px;
              max-width: 90%;
            }
            h3 {
              margin-top: 0;
              color: #333;
            }
            p {
              color: #555;
            }
            .buttons {
              text-align: right;
              margin-top: 20px;
            }
            button {
              padding: 10px 20px;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              margin-left: 10px;
            }
            #allow-btn {
              background-color: #28a745;
              color: white;
            }
            #deny-btn {
              background-color: #dc3545;
              color: white;
            }
          `;

          const modal = document.createElement("div");
          modal.className = "modal";
          modal.innerHTML = `
            <h3>CodeTweak Script Confirmation</h3>
            <p>Allow "<strong></strong>" to run on <strong></strong>?</p>
            <div class="buttons">
              <button id="deny-btn">Deny</button>
              <button id="allow-btn">Allow</button>
            </div>
          `;

          const strongs = modal.querySelectorAll("strong");
          strongs[0].textContent = scriptName;
          strongs[1].textContent = domain;

          shadow.appendChild(style);
          shadow.appendChild(modal);
          document.body.appendChild(container);

          const cleanup = () => {
            if (container.parentNode) {
              container.parentNode.removeChild(container);
            }
          };

          shadow.getElementById("allow-btn").addEventListener("click", () => {
            cleanup();
            resolve(true);
          });

          shadow.getElementById("deny-btn").addEventListener("click", () => {
            cleanup();
            resolve(false);
          });
        });
      },
      args: [scriptName, domain],
    });

    return results[0].result;
  }

  async injectMatchingScripts(
    url,
    runAt,
    tabId,
    tabScripts,
    getFilteredScripts,
    settings
  ) {
    const matchingScripts = await getFilteredScripts(url, runAt);
    const newScripts = matchingScripts.filter(
      (script) => !tabScripts.has(script.id)
    );

    if (settings.confirmFirstRun) {
      const { scriptPermissions = {} } = await chrome.storage.local.get(
        "scriptPermissions"
      );
      const domain = new URL(url).hostname;

      for (const script of newScripts) {
        const allowedDomains = scriptPermissions[script.id] || [];

        if (allowedDomains.includes(domain)) {
          tabScripts.add(script.id);
          await this.injectScript(tabId, script, settings);
        } else {
          const confirmed = await this.askForConfirmation(
            tabId,
            script.name,
            domain
          );

          if (confirmed) {
            allowedDomains.push(domain);
            scriptPermissions[script.id] = allowedDomains;
            await chrome.storage.local.set({ scriptPermissions });
            tabScripts.add(script.id);
            await this.injectScript(tabId, script, settings);
          }
        }
      }
    } else {
      for (const script of newScripts) {
        tabScripts.add(script.id);
        await this.injectScript(tabId, script, settings);
      }
    }
  }

  async injectScriptsForStage(details, runAt, getFilteredScripts) {
    if (details.frameId !== 0) return;

    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const { url, tabId } = details;

      if (!this.executedScripts.has(tabId)) {
        this.executedScripts.set(tabId, new Set());
      }

      const tabScripts = this.executedScripts.get(tabId);

      if (runAt === INJECTION_TYPES.DOCUMENT_START) {
        tabScripts.clear();
      }

      await this.injectMatchingScripts(
        url,
        runAt,
        tabId,
        tabScripts,
        getFilteredScripts,
        settings
      );
    } catch (error) {
      console.error("CodeTweak: Script injection error:", error);
    }
  }

  showNotification(tabId, scriptName) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: EXECUTION_WORLDS.MAIN,
        func: (name) => {
          const notification = document.createElement("div");
          notification.textContent = `✓ ${name}`;

          Object.assign(notification.style, {
            position: "fixed",
            bottom: "16px",
            right: "16px",
            zIndex: "999999",
            background: "rgba(33, 150, 243, 0.95)",
            color: "white",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "system-ui, sans-serif",
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
          });

          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 2000);
        },
        args: [scriptName || "Unknown script"],
      })
      .catch((error) => {
        console.error("CodeTweak: showNotification failed:", error);
      });
  }

  clearInjectedCoreScriptsForTab(tabId) {
    this.injectedCoreScripts.delete(tabId);
  }
}

const scriptInjector = new ScriptInjector();

export async function injectScriptsForStage(
  details,
  runAt,
  getFilteredScripts
) {
  return scriptInjector.injectScriptsForStage(
    details,
    runAt,
    getFilteredScripts
  );
}

export function showNotification(tabId, scriptName) {
  return scriptInjector.showNotification(tabId, scriptName);
}

export function clearInjectedCoreScriptsForTab(tabId) {
  return scriptInjector.clearInjectedCoreScriptsForTab(tabId);
}

export { INJECTION_TYPES, EXECUTION_WORLDS };
