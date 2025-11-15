// AI DOM Editor - Main JavaScript
import feather from "feather-icons";
import { ChatManager } from "./helpers/chat_manager.js";
import { UIManager } from "./helpers/ui_manager.js";
import { ApiHandler } from "./helpers/api_handler.js";
import { EventHandler } from "./helpers/event_handler.js";
import { UserscriptHandler } from "./helpers/userscript_handler.js";

class AIDOMEditor {
  constructor() {
    this.selectedElement = null;
    this.currentScript = null;

    this.elements = {
      chatContainer: document.getElementById("chatContainer"),
      messages: document.getElementById("messages"),
      welcomeMessage: document.getElementById("welcomeMessage"),
      userInput: document.getElementById("userInput"),
      sendBtn: document.getElementById("sendBtn"),
      closeBtn: document.getElementById("closeBtn"),
      configBanner: document.getElementById("configBanner"),
      openSettingsBtn: document.getElementById("openSettingsBtn"),
      headerSettingsBtn: document.getElementById("headerSettingsBtn"),
      elementSelectorBtn: document.getElementById("elementSelectorBtn"),
      clearChatBtn: document.getElementById("clearChatBtn"),
      selectorActive: document.getElementById("selectorActive"),
      cancelSelector: document.getElementById("cancelSelector"),
      modelSelector: document.getElementById("modelSelector"),
      headerTitle: document.getElementById("headerTitle"),
      currentScriptDisplay: document.getElementById("currentScriptDisplay"),
      currentScriptName: document.getElementById("currentScriptName"),
    };

    this.chatManager = new ChatManager(this);
    this.uiManager = new UIManager(this);
    this.apiHandler = new ApiHandler(this);
    this.eventHandler = new EventHandler(this);
    this.userscriptHandler = new UserscriptHandler(this);

    this.init();
  }

  async init() {
    applyTheme();
    await this.initializeAI();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "aiElementSelected") {
        this.elements.userInput.value += ` ${message.selector} `;
        this.elements.userInput.focus();
        this.uiManager.deactivateElementSelector();
      }
    });
  }

  setCurrentScript(scriptName) {
    if (scriptName) {
      this.currentScript = { name: scriptName };
      this.elements.currentScriptName.textContent = scriptName;
      this.elements.currentScriptDisplay.style.display = "flex";
      this.elements.headerTitle.style.display = "none";
    } else {
      this.currentScript = null;
      this.elements.currentScriptDisplay.style.display = "none";
      this.elements.headerTitle.style.display = "block";
    }
    feather.replace();

    // Persist current script to storage
    this.saveCurrentScriptState();

    // Dispatch event to notify UI components of script change
    document.dispatchEvent(
      new CustomEvent("currentScriptChanged", {
        detail: { currentScript: this.currentScript },
      })
    );
  }

  async saveCurrentScriptState() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || !tab.url) return;

      const url = new URL(tab.url);
      const siteUrl = `${url.protocol}//${url.hostname}`;
      const storageKey = `aiCurrentScript_${siteUrl}`;

      if (this.currentScript) {
        await chrome.storage.local.set({
          [storageKey]: this.currentScript.name,
        });
      } else {
        await chrome.storage.local.remove(storageKey);
      }
    } catch (error) {
      console.error("Error saving current script state:", error);
    }
  }

  async restoreCurrentScriptState() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || !tab.url) return;

      const url = new URL(tab.url);
      const siteUrl = `${url.protocol}//${url.hostname}`;
      const storageKey = `aiCurrentScript_${siteUrl}`;

      const { [storageKey]: scriptName } = await chrome.storage.local.get(
        storageKey
      );
      if (scriptName) {
        // Verify the script actually exists before restoring
        const { scripts = [] } = await chrome.storage.local.get("scripts");
        const scriptExists = scripts.some((s) => s.name === scriptName);

        if (scriptExists) {
          this.setCurrentScript(scriptName);
        } else {
          // Script doesn't exist anymore, clear the stored state
          await chrome.storage.local.remove(storageKey);
        }
      }
    } catch (error) {
      console.error("Error restoring current script state:", error);
    }
  }

  async getUserLanguage() {
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const userLanguage = settings.language || "auto";

      if (userLanguage === "auto") {
        return chrome.i18n.getUILanguage().split("-")[0];
      }

      return userLanguage;
    } catch (error) {
      console.error("Error getting language:", error);
      return "en";
    }
  }

  async initializeAI() {
    try {
      const lang = await this.getUserLanguage();
      document.documentElement.setAttribute("lang", lang);
    } catch (error) {
      console.error("Error setting language:", error);
    }
    await this.apiHandler.loadAPIConfig();
    await this.apiHandler.loadAvailableModels();
    await this.chatManager.loadChatHistory();
    await this.restoreCurrentScriptState();
    this.eventHandler.setupEventListeners();
    this.eventHandler.setupMessageListener();
    feather.replace();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new AIDOMEditor();
});
