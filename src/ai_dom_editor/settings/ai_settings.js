import feather from "feather-icons";

class AISettings {
  constructor() {
    this.elements = this.initializeElements();
    this.apiConfigs = [];
    this.currentConfigIndex = 0;
    this.availableModels = [];
    this.isDirty = false;

    this.providerEndpoints = {
      openai: "https://api.openai.com/v1/chat/completions",
      anthropic: "https://api.anthropic.com/v1/messages",
      google:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      mistral: "https://api.mistral.ai/v1/chat/completions",
      aimlapi: "https://api.aimlapi.com/v1/chat/completions",
      custom: "",
    };

    this.providerModels = {
      openai: ["gpt-4", "gpt-4-turbo-preview", "gpt-3.5-turbo"],
      anthropic: [
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
      ],
      google: [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-pro",
        "gemini-pro-vision",
      ],
      aimlapi: [
        "gemini-pro",
        "gemini-pro-vision",
        "google/gemma-3-12b-it",
        "google/gemma-3n-e4b-it",
        "google/gemma-3-4b-it",
      ],
      mistral: [
        "mistral-large-latest",
        "mistral-small-latest",
        "open-mistral-7b",
        "open-mixtral-8x7b",
      ],
      custom: [],
    };

    this.init();
  }

  initializeElements() {
    return {
      form: document.getElementById("settingsForm"),
      provider: document.getElementById("provider"),
      apiKey: document.getElementById("apiKey"),
      endpoint: document.getElementById("endpoint"),
      endpointGroup: document.getElementById("endpointGroup"),
      model: document.getElementById("model"),
      modelGroup: document.getElementById("modelGroup"),
      temperature: document.getElementById("temperature"),
      temperatureValue: document.getElementById("temperatureValue"),
      maxTokens: document.getElementById("maxTokens"),
      toggleApiKey: document.getElementById("toggleApiKey"),
      testConnection: document.getElementById("testConnection"),
      resetBtn: document.getElementById("resetBtn"),
      saveBtn: document.getElementById("saveBtn"),
      fetchModelsBtn: document.getElementById("fetchModelsBtn"),
      toast: document.getElementById("toast"),
      toastMessage: document.getElementById("toastMessage"),
      apiKeysList: document.getElementById("apiKeysList"),
      addKeyBtn: document.getElementById("addKeyBtn"),
    };
  }

  async init() {
    window.applyTheme();
    await this.loadSettings();
    this.setupEventListeners();
    feather.replace();
  }

  async loadSettings() {
    try {
      const { aiDomEditorConfigs, availableModels } =
        await chrome.storage.local.get([
          "aiDomEditorConfigs",
          "availableModels",
        ]);

      if (aiDomEditorConfigs && Array.isArray(aiDomEditorConfigs)) {
        this.apiConfigs = aiDomEditorConfigs;
      }

      if (availableModels) {
        this.availableModels = availableModels;
      }

      if (this.apiConfigs.length > 0) {
        this.loadConfig(0);
      }

      this.renderAPIKeysList();
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }

  loadConfig(index) {
    const config = this.apiConfigs[index];
    if (!config) return;

    this.currentConfigIndex = index;

    this.elements.provider.value = config.provider || "";
    this.elements.apiKey.value = config.apiKey || "";
    this.elements.endpoint.value = config.endpoint || "";
    this.updateModelOptions();
    this.elements.model.value = config.model || "";
    this.elements.temperature.value = config.temperature || 0.7;
    this.elements.maxTokens.value = config.maxTokens || 2000;

    this.updateTemperatureValue();
    this.toggleEndpointField();
    this.renderAPIKeysList();
    this.isDirty = false;
  }


  renderAPIKeysList(isNew = false) {
    if (!this.elements.apiKeysList) return;

    this.elements.apiKeysList.innerHTML = "";
    const configs = [...this.apiConfigs];

    if (isNew) {
      configs.push({ provider: "New Key", model: "Not saved yet" });
    }

    configs.forEach((config, index) => {
      const item = this.createAPIKeyItem(
        config,
        index,
        index < this.apiConfigs.length
      );
      this.elements.apiKeysList.appendChild(item);

      if (index === this.currentConfigIndex) {
        item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    feather.replace();
  }

  createAPIKeyItem(config, index, isSaved) {
    const item = document.createElement("div");
    const isActive = index === this.currentConfigIndex;
    item.className = `api-key-item${isActive ? " active" : ""}`;

    const info = document.createElement("div");
    info.className = "api-key-info";
    info.innerHTML = `
      <strong>${config.provider || "Unnamed"}</strong>
      <span>${config.model || "No model"}</span>
    `;

    const actions = document.createElement("div");
    actions.className = "api-key-actions";

    if (isSaved) {
      actions.appendChild(this.createEditButton(index));
      actions.appendChild(this.createDeleteButton(index));
    }

    item.appendChild(info);
    item.appendChild(actions);

    if (isSaved) {
      item.addEventListener("click", () => this.loadConfig(index));
    }

    return item;
  }

  createEditButton(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-icon";
    button.title = "Edit";
    button.innerHTML = '<i data-feather="edit-2" width="14" height="14"></i>';
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.loadConfig(index);
    });
    return button;
  }

  createDeleteButton(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-icon btn-danger";
    button.title = "Delete";
    button.innerHTML = '<i data-feather="trash-2" width="14" height="14"></i>';
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteConfig(index);
    });
    return button;
  }

  setupEventListeners() {
    this.elements.form.addEventListener("input", () => {
      this.isDirty = true;
    });

    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    this.elements.provider.addEventListener("change", () => {
      this.updateModelOptions();
      this.toggleEndpointField();
      this.updateEndpoint();
    });

    this.elements.toggleApiKey.addEventListener("click", () => {
      const type =
        this.elements.apiKey.type === "password" ? "text" : "password";
      this.elements.apiKey.type = type;
    });

    this.elements.temperature.addEventListener("input", () => {
      this.updateTemperatureValue();
    });

    this.elements.testConnection.addEventListener("click", () => {
      this.testConnection();
    });

    this.elements.resetBtn.addEventListener("click", () => {
      this.resetSettings();
    });

    if (this.elements.fetchModelsBtn) {
      this.elements.fetchModelsBtn.addEventListener("click", () => {
        this.fetchModelsFromAPI();
      });
    }

    if (this.elements.addKeyBtn) {
      this.elements.addKeyBtn.addEventListener("click", () => {
        this.addNewConfig();
      });
    }

    this.elements.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveSettings();
    });
  }

  updateModelOptions() {
    const provider = this.elements.provider.value;
    const models = this.providerModels[provider] || [];

    this.elements.model.innerHTML =
      '<option value="">Select a model...</option>';

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      this.elements.model.appendChild(option);
    });

    if (provider === "custom") {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = "Custom Model";
      this.elements.model.appendChild(option);
    }
  }

  toggleEndpointField() {
    const provider = this.elements.provider.value;
    const shouldShow = provider === "custom";
    this.elements.endpointGroup.style.display = shouldShow ? "block" : "none";
  }

  updateEndpoint() {
    const provider = this.elements.provider.value;
    if (provider !== "custom" && this.providerEndpoints[provider]) {
      this.elements.endpoint.value = this.providerEndpoints[provider];
    }
  }

  updateTemperatureValue() {
    this.elements.temperatureValue.textContent =
      this.elements.temperature.value;
  }

  async testConnection() {
    const config = this.gatherSettings();

    if (config.provider === "aimlapi") {
      config.endpoint = this.providerEndpoints.aimlapi;
    }

    if (!config.apiKey || !config.endpoint) {
      this.showToast("Please fill in all required fields", "error");
      return;
    }

    this.setTestButtonState(true);

    try {
      const response = await this.makeTestRequest(config);

      if (response.ok) {
        this.showToast("Connection successful! ✓", "success");
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = this.formatErrorMessage(errorData, response);
        this.showToast(`Connection failed: ${errorMsg}`, "error");
      }
    } catch (error) {
      this.showToast(`Connection error: ${error.message}`, "error");
    } finally {
      this.setTestButtonState(false);
    }
  }

  async makeTestRequest(config) {
    const testMessage =
      'Hello, this is a test message. Please respond with "OK".';
    const model = config.model || "gpt-3.5-turbo";
    const headers = { "Content-Type": "application/json" };
    let requestBody;

    if (config.provider === "google" || model.includes("gemini")) {
      requestBody = {
        contents: [{ parts: [{ text: testMessage }] }],
      };
      headers["x-goog-api-key"] = config.apiKey;
    } else {
      requestBody = {
        model,
        messages: [{ role: "user", content: testMessage }],
        max_tokens: 50,
      };
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }
    }

    return fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
  }

  formatErrorMessage(errorData, response) {
    let errorMsg =
      errorData.message || errorData.error?.message || response.statusText;
    if (errorData.statusCode) {
      errorMsg = `[${errorData.statusCode}] ${errorMsg}`;
    }
    return errorMsg;
  }

  setTestButtonState(isTesting) {
    this.elements.testConnection.disabled = isTesting;

    if (isTesting) {
      this.elements.testConnection.textContent = "Testing...";
    } else {
      this.elements.testConnection.innerHTML = `
        <i data-feather="activity" width="16" height="16"></i>
        Test Connection
      `;
      feather.replace();
    }
  }

  gatherSettings() {
    const provider = this.elements.provider.value;
    const model = this.elements.model.value;
    let endpoint = this.elements.endpoint.value;

    if (provider !== "custom" && this.providerEndpoints[provider]) {
      endpoint = this.providerEndpoints[provider];

      if (provider === "google" && model) {
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      }
    }

    return {
      provider,
      apiKey: this.elements.apiKey.value.trim(),
      endpoint,
      model,
      temperature: parseFloat(this.elements.temperature.value),
      maxTokens: parseInt(this.elements.maxTokens.value),
    };
  }

  async saveSettings() {
    const config = this.gatherSettings();

    if (!this.validateConfig(config)) {
      this.showToast("Please fill in all required fields", "error");
      return;
    }

    try {
      if (this.currentConfigIndex < this.apiConfigs.length) {
        this.apiConfigs[this.currentConfigIndex] = config;
      } else {
        this.apiConfigs.push(config);
        this.currentConfigIndex = this.apiConfigs.length - 1;
      }

      await chrome.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });

      this.renderAPIKeysList();
      this.showToast("Settings saved successfully! ✓", "success");
      this.isDirty = false;

      await this.updateAvailableModels();

      chrome.runtime.sendMessage({ action: "aiSettingsUpdated" });
    } catch (error) {
      this.showToast(`Error saving settings: ${error.message}`, "error");
    }
  }

  validateConfig(config) {
    return config.apiKey && config.endpoint && config.model;
  }

  async updateAvailableModels() {
    const fetchedModels = await this.fetchAllModels();

    if (!fetchedModels || fetchedModels.length === 0) {
      const basicModels = this.createBasicModelsFromConfigs();
      await chrome.storage.local.set({ availableModels: basicModels });
    }
  }

  createBasicModelsFromConfigs() {
    const basicModels = [];

    this.apiConfigs.forEach((cfg) => {
      const modelsForProvider = this.providerModels[cfg.provider] || [];
      modelsForProvider.forEach((modelId) => {
        if (
          !basicModels.find(
            (m) => m.id === modelId && m.provider === cfg.provider
          )
        ) {
          basicModels.push({
            id: modelId,
            provider: cfg.provider,
            apiKey: cfg.apiKey,
            endpoint: cfg.endpoint,
          });
        }
      });
    });

    return basicModels;
  }

  addNewConfig() {
    this.currentConfigIndex = this.apiConfigs.length;
    this.elements.form.reset();
    this.elements.provider.value = "";
    this.updateModelOptions();
    this.toggleEndpointField();
    this.updateTemperatureValue();
    this.elements.temperature.value = 0.7;
    this.elements.maxTokens.value = 2000;

    this.renderAPIKeysList(true);
    this.elements.provider.focus();
  }

  async deleteConfig(index) {
    if (
      !confirm("Are you sure you want to delete this API key configuration?")
    ) {
      return;
    }

    this.apiConfigs.splice(index, 1);
    await chrome.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });

    if (this.apiConfigs.length > 0) {
      this.loadConfig(0);
    } else {
      this.currentConfigIndex = 0;
      this.elements.form.reset();
      this.updateModelOptions();
    }

    this.renderAPIKeysList();
    await this.updateModelsAfterDeletion();

    this.showToast("API key configuration deleted", "success");
    chrome.runtime.sendMessage({ action: "aiSettingsUpdated" });
  }

  async updateModelsAfterDeletion() {
    const fetchedModels = await this.fetchAllModels();

    if (
      (!fetchedModels || fetchedModels.length === 0) &&
      this.apiConfigs.length > 0
    ) {
      const basicModels = this.createBasicModelsFromConfigs();
      await chrome.storage.local.set({ availableModels: basicModels });
    } else if (this.apiConfigs.length === 0) {
      await chrome.storage.local.set({ availableModels: [] });
    }
  }

  resetSettings() {
    if (!confirm("Are you sure you want to reset all settings?")) {
      return;
    }

    this.elements.form.reset();
    this.elements.provider.value = "";
    this.updateModelOptions();
    this.toggleEndpointField();
    this.updateTemperatureValue();

    chrome.storage.local.remove(["aiDomEditorConfigs", "availableModels"]);
    this.showToast("Settings reset", "success");
  }

  showToast(message, type = "success") {
    this.elements.toastMessage.textContent = message;
    this.elements.toast.className = `toast ${type}`;
    this.elements.toast.classList.add("show");

    setTimeout(() => {
      this.elements.toast.classList.remove("show");
    }, 3000);
  }

  async fetchModelsFromAPI() {
    const config = this.gatherSettings();

    if (!config.apiKey || !config.provider) {
      this.showToast("Please enter API key and select provider first", "error");
      return;
    }

    this.setFetchButtonState(true);

    try {
      const models = await this.fetchModelsForProvider(config);

      if (models.length > 0) {
        this.providerModels[config.provider] = models;
        this.updateModelOptions();
        this.showToast(`Found ${models.length} models!`, "success");
      } else {
        this.showToast("No models found", "error");
      }
    } catch (error) {
      this.showToast(`Error fetching models: ${error.message}`, "error");
    } finally {
      this.setFetchButtonState(false);
    }
  }

  async fetchModelsForProvider(config) {
    switch (config.provider) {
      case "openai":
        return this.fetchOpenAIModels(config.apiKey);
      case "anthropic":
        return this.fetchAnthropicModels();
      case "google":
        return this.fetchGoogleModels(config.apiKey);
      case "mistral":
        return this.fetchMistralModels(config.apiKey);
      case "aimlapi":
        return this.fetchAIMLAPIModels(config.apiKey);
      case "custom":
        this.showToast(
          "Custom endpoints do not support model fetching",
          "error"
        );
        return [];
      default:
        return [];
    }
  }

  setFetchButtonState(isFetching) {
    this.elements.fetchModelsBtn.disabled = isFetching;
    this.elements.fetchModelsBtn.textContent = isFetching
      ? "Fetching..."
      : "Fetch Available Models";
  }

  async fetchOpenAIModels(apiKey) {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data
      .filter((model) => model.id.includes("gpt"))
      .map((model) => model.id)
      .sort();
  }

  async fetchMistralModels(apiKey) {
    const response = await fetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.map((model) => model.id).sort();
  }

  async fetchAnthropicModels() {
    return [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ];
  }

  async fetchGoogleModels(apiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.models
      .filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent")
      )
      .map((model) => model.name.replace("models/", ""))
      .sort();
  }

  async fetchAIMLAPIModels(apiKey) {
    try {
      const response = await fetch("https://api.aimlapi.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.map((model) => model.id).sort();
    } catch {
      return this.providerModels.aimlapi;
    }
  }

  async fetchAllModels() {
    const allModels = [];

    for (const config of this.apiConfigs) {
      try {
        const models = await this.fetchModelsForProvider(config);

        models.forEach((model) => {
          if (!allModels.find((m) => m.id === model && m.provider === config.provider)) {
            allModels.push({
              id: model,
              provider: config.provider,
              apiKey: config.apiKey,
              endpoint: config.endpoint,
            });
          }
        });
      } catch (error) {
        console.error(`Error fetching models for ${config.provider}:`, error);
      }
    }

    this.availableModels = allModels;
    await chrome.storage.local.set({ availableModels: allModels });

    return allModels;
  }
}

let aiSettings; // eslint-disable-line no-unused-vars

document.addEventListener("DOMContentLoaded", () => {
  aiSettings = new AISettings();
});
