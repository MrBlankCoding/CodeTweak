import ScriptAnalyzer from "../../../utils/scriptAnalyzer.js";

export class EventHandler {
  constructor(editor) {
    this.editor = editor;
    this.lastUserPrompt = "";
  }

  setupEventListeners() {
    const { elements } = this.editor;

    elements.userInput.addEventListener("input", (e) => {
      this.editor.uiManager.autoResize(elements.userInput);
      elements.sendBtn.disabled = !elements.userInput.value.trim();

      const value = e.target.value;
      if (value.endsWith("@")) {
        this.editor.uiManager.showScriptSelector(e.target);
      } else if (!value.includes("@")) {
        this.editor.uiManager.hideScriptSelector();
      }
    });

    elements.userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!elements.sendBtn.disabled) {
          this.handleSendMessage();
        }
      }
    });

    elements.sendBtn.addEventListener("click", () => this.handleSendMessage());
    elements.closeBtn.addEventListener("click", () => this.closeEditor());
    elements.openSettingsBtn.addEventListener("click", () => this.openSettings());
    elements.headerSettingsBtn.addEventListener("click", () => this.openSettings());

    elements.elementSelectorBtn.addEventListener("click", () => {
      this.editor.uiManager.activateElementSelector();
    });

    elements.clearChatBtn.addEventListener("click", () => {
      this.editor.chatManager.clearChat();
    });

    elements.cancelSelector.addEventListener("click", () => {
      this.editor.uiManager.deactivateElementSelector();
    });

    elements.modelSelector.addEventListener("change", (e) => {
      this.editor.apiHandler.handleModelChange(e);
    });

    document.querySelectorAll(".example-prompt").forEach((prompt) => {
      prompt.addEventListener("click", () => {
        elements.userInput.value = prompt.textContent
          .replace(/^[^a-zA-Z]+/, "")
          .trim();
        this.editor.uiManager.autoResize(elements.userInput);
        elements.sendBtn.disabled = !elements.userInput.value.trim();
        elements.userInput.focus();
      });
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "aiSettingsUpdated") {
        this.editor.apiHandler.loadAPIConfig();
        this.editor.apiHandler.loadAvailableModels();
      }

      if (
        message.action === "aiElementSelected" ||
        message.action === "elementSelected"
      ) {
        this.handleElementSelected(message.selector);
      }
    });
  }

  async handleSendMessage() {
    const rawMessage = this.editor.elements.userInput.value.trim();
    if (!rawMessage) return;

    if (!this._hasUsableAIConfig()) {
      this.editor.chatManager.addMessage(
        "assistant",
        "Please configure your AI API settings first.",
        { type: "text" }
      );
      return;
    }

    this.editor.uiManager.hideWelcomeMessage();

    const history = [...this.editor.chatManager.messages];
    this.editor.chatManager.addMessage("user", rawMessage, { type: "text" });
    this.lastUserPrompt = rawMessage;

    this.editor.elements.userInput.value = "";
    this.editor.uiManager.autoResize(this.editor.elements.userInput);
    this.editor.elements.sendBtn.disabled = true;

    const loadingId = this.editor.uiManager.addLoadingMessage();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("No active tab found.");
      }

      const resolved = await this._resolveScriptReference(rawMessage);
      const domSummary = await this._collectDOMSummary(tab.id);

      const aiResponse = await this.editor.apiHandler.callAIAPI(
        resolved.userMessage,
        domSummary,
        resolved.previousCode,
        history
      );

      this.editor.chatManager.removeMessage(loadingId);
      this.handleAIResponse(aiResponse);
    } catch (error) {
      this.editor.chatManager.removeMessage(loadingId);
      this.editor.chatManager.addMessage(
        "assistant",
        `Error: ${error.message}`,
        { error: true }
      );
    }
  }

  handleAIResponse(response) {
    if (response?.type === "code") {
      this.editor.chatManager.addMessage(
        "assistant",
        response.explanation || "Generated script ready.",
        response
      );
      return;
    }

    if (response?.type === "text") {
      this.editor.chatManager.addMessage("assistant", response.message, response);
      return;
    }

    this.editor.chatManager.addMessage(
      "assistant",
      "Unexpected response format from AI.",
      { error: true }
    );
  }

  async _collectDOMSummary(tabId) {
    const response = await this._sendTabMessage(tabId, { action: "collectDOMSummary" });

    if (!response?.success && !response?.summary) {
      throw new Error(
        "Could not access page context. Refresh the page and try again."
      );
    }

    return response.summary || "";
  }

  async _resolveScriptReference(message) {
    const previousCode = this.editor.chatManager.getPreviousCode();

    if (!message.includes("@")) {
      return { userMessage: message, previousCode };
    }

    const allScripts = await this.editor.userscriptHandler.getAllScripts();
    const atIndex = message.lastIndexOf("@");
    const suffix = message.substring(atIndex + 1).trimStart();

    let matched = null;
    for (const script of allScripts || []) {
      if (suffix.startsWith(script.name)) {
        if (!matched || script.name.length > matched.name.length) {
          matched = script;
        }
      }
    }

    if (!matched) {
      return { userMessage: message, previousCode };
    }

    const fullCode = await this.editor.userscriptHandler.getScriptContent(matched.name);
    const extracted = ScriptAnalyzer.extractCodeFromIIFE(fullCode);

    const promptWithoutRef =
      message.substring(0, atIndex) + suffix.substring(matched.name.length);

    this.editor.setCurrentScript(matched);

    return {
      userMessage: promptWithoutRef.trim(),
      previousCode: extracted,
    };
  }

  _sendTabMessage(tabId, payload) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  _hasUsableAIConfig() {
    const selected = this.editor.apiHandler.selectedModel || {};
    const fallback = this.editor.apiHandler.apiConfig || {};

    const endpoint = selected.endpoint || fallback.endpoint;
    const apiKey = selected.apiKey || selected.key || fallback.apiKey || fallback.key;
    const model = selected.id || selected.model || fallback.id || fallback.model;

    return !!(endpoint && apiKey && model);
  }

  handleElementSelected(selector) {
    this.editor.uiManager.deactivateElementSelector();
    this.editor.selectedElement = selector;

    const currentValue = this.editor.elements.userInput.value.trim();
    const updated = currentValue
      ? `${currentValue} (element: ${selector})`
      : `Modify the element: ${selector}`;

    this.editor.elements.userInput.value = updated;
    this.editor.uiManager.autoResize(this.editor.elements.userInput);
    this.editor.elements.sendBtn.disabled = false;
    this.editor.elements.userInput.focus();
  }

  closeEditor() {
    window.parent.postMessage({ action: "closeAIEditor" }, "*");
  }

  openSettings() {
    chrome.runtime.sendMessage({ action: "openAISettings" });
  }
}
