import feather from "feather-icons";
import { applyTranslations, getMessageSync } from "../../utils/i18n.js";

class AISettings {
  constructor() {
    this.elements = this.initializeElements();
    this.apiConfigs = [];
    this.availableModels = [];
    this.currentConfigIndex = -1;
    this.isDraftProfile = false;
    this.isDirty = false;

    this.providerEndpoints = {
      openai: "https://api.openai.com/v1/chat/completions",
      anthropic: "https://api.anthropic.com/v1/messages",
      google:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
      mistral: "https://api.mistral.ai/v1/chat/completions",
      aimlapi: "https://api.aimlapi.com/v1/chat/completions",
      custom: "",
    };

    this.providerModels = {
      openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
      anthropic: [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ],
      google: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"],
      mistral: ["mistral-large-latest", "mistral-small-latest"],
      aimlapi: ["google/gemma-3-12b-it", "gemini-pro"],
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
      activeProfileText: document.getElementById("activeProfileText"),
      profileCount: document.getElementById("profileCount"),
    };
  }

  async init() {
    window.applyTheme();
    await applyTranslations();
    await this.loadSettings();
    this.setupEventListeners();
    feather.replace();
  }

  async loadSettings() {
    try {
      const { aiDomEditorConfigs = [], availableModels = [] } =
        await chrome.storage.local.get(["aiDomEditorConfigs", "availableModels"]);

      this.apiConfigs = Array.isArray(aiDomEditorConfigs) ? aiDomEditorConfigs : [];
      this.availableModels = Array.isArray(availableModels) ? availableModels : [];

      this.mergeFetchedModels();
      this.renderProfilesList();

      if (this.apiConfigs.length > 0) {
        this.loadConfig(0);
      } else {
        this.startNewProfile();
      }
    } catch (error) {
      console.error("Error loading AI settings:", error);
      this.showToast(this.t("aiSettingsToastLoadFailed", "Failed to load settings"), "error");
    }
  }

  setupEventListeners() {
    this.elements.form.addEventListener("input", () => {
      this.isDirty = true;
    });

    window.addEventListener("beforeunload", (e) => {
      if (!this.isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    });

    this.elements.provider.addEventListener("change", () => {
      this.updateModelOptions();
      this.toggleEndpointField();
      this.autoFillEndpoint();
    });

    this.elements.toggleApiKey.addEventListener("click", () => {
      const nextType = this.elements.apiKey.type === "password" ? "text" : "password";
      this.elements.apiKey.type = nextType;
    });

    this.elements.temperature.addEventListener("input", () => {
      this.elements.temperatureValue.textContent = this.elements.temperature.value;
    });

    this.elements.fetchModelsBtn.addEventListener("click", () => {
      this.fetchModelsFromAPI();
    });

    this.elements.testConnection.addEventListener("click", () => {
      this.testConnection();
    });

    this.elements.addKeyBtn.addEventListener("click", () => {
      this.startNewProfile();
    });

    this.elements.resetBtn.addEventListener("click", () => {
      this.resetSettings();
    });

    this.elements.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveSettings();
    });
  }

  renderProfilesList() {
    const list = this.elements.apiKeysList;
    list.replaceChildren();

    if (this.isDraftProfile) {
      list.appendChild(this.createDraftProfileItem());
    }

    this.apiConfigs.forEach((config, index) => {
      list.appendChild(this.createProfileItem(config, index));
    });

    if (list.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "profiles-empty";
      empty.textContent = this.t(
        "aiSettingsNoProfiles",
        "No profiles yet. Click New Profile."
      );
      list.appendChild(empty);
    }

    this.elements.profileCount.textContent = String(this.apiConfigs.length);
    feather.replace();
  }

  createDraftProfileItem() {
    const item = document.createElement("div");
    item.className = "api-key-item active";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = this.t("aiSettingsNewProfile", "New Profile");
    const subtitle = document.createElement("span");
    subtitle.textContent = this.t(
      "aiSettingsProfileHintNew",
      "New unsaved profile"
    );
    info.appendChild(title);
    info.appendChild(subtitle);

    item.appendChild(info);
    return item;
  }

  createProfileItem(config, index) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `api-key-item${index === this.currentConfigIndex ? " active" : ""}`;

    const info = document.createElement("div");
    const providerLabel = config.provider || "custom";
    const modelLabel = config.model || this.t("aiSettingsNoModel", "no model");
    const keySuffix = this.maskApiKey(config.apiKey || "");

    const providerStrong = document.createElement("strong");
    providerStrong.textContent = providerLabel;
    const modelSpan = document.createElement("span");
    modelSpan.textContent = `${modelLabel} ${keySuffix}`.trim();
    info.appendChild(providerStrong);
    info.appendChild(modelSpan);

    const actions = document.createElement("div");
    actions.className = "api-key-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-danger";
    deleteBtn.title = this.t("aiSettingsDeleteProfile", "Delete profile");
    deleteBtn.appendChild(this.createFeatherIcon("trash-2", 14));

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteConfig(index);
    });

    actions.appendChild(deleteBtn);
    item.appendChild(info);
    item.appendChild(actions);

    item.addEventListener("click", () => {
      this.loadConfig(index);
    });

    return item;
  }

  loadConfig(index) {
    const config = this.apiConfigs[index];
    if (!config) return;

    this.currentConfigIndex = index;
    this.isDraftProfile = false;
    this.elements.provider.value = config.provider || "";
    this.elements.apiKey.value = config.apiKey || "";
    this.elements.endpoint.value = config.endpoint || "";
    this.elements.temperature.value = String(config.temperature ?? 0.4);
    this.elements.maxTokens.value = String(config.maxTokens ?? 1800);

    this.updateModelOptions(config.model || "");
    this.toggleEndpointField();
    this.elements.temperatureValue.textContent = this.elements.temperature.value;

    this.elements.activeProfileText.textContent = `${this.t("aiSettingsEditingProfile", "Editing profile")} #${index + 1}`;
    this.isDirty = false;
    this.renderProfilesList();
  }

  startNewProfile() {
    this.currentConfigIndex = -1;
    this.isDraftProfile = true;
    this.elements.form.reset();
    this.elements.provider.value = "";
    this.elements.endpoint.value = "";
    this.elements.temperature.value = "0.4";
    this.elements.maxTokens.value = "1800";
    this.elements.temperatureValue.textContent = "0.4";
    this.elements.activeProfileText.textContent = this.t("aiSettingsProfileHintNew", "New unsaved profile");

    this.updateModelOptions();
    this.toggleEndpointField();
    this.isDirty = false;
    this.renderProfilesList();
    this.elements.provider.focus();
  }

  updateModelOptions(selectedModel = "") {
    const provider = this.elements.provider.value;
    const modelSelect = this.elements.model;
    modelSelect.replaceChildren();
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = this.t(
      "aiSettingsSelectModel",
      "Select model..."
    );
    modelSelect.appendChild(defaultOption);

    const staticModels = this.providerModels[provider] || [];
    const fetchedModels = this.availableModels
      .filter((m) => m.provider === provider)
      .map((m) => m.id);

    const merged = [...new Set([...staticModels, ...fetchedModels])];

    merged.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });

    if (provider === "custom") {
      const customOption = document.createElement("option");
      customOption.value = "custom";
      customOption.textContent = "custom";
      modelSelect.appendChild(customOption);
    }

    if (selectedModel) {
      modelSelect.value = selectedModel;
    }
  }

  toggleEndpointField() {
    this.elements.endpointGroup.style.display =
      this.elements.provider.value === "custom" ? "block" : "none";
  }

  autoFillEndpoint() {
    const provider = this.elements.provider.value;
    if (provider && provider !== "custom") {
      this.elements.endpoint.value = this.providerEndpoints[provider] || "";
    }
  }

  gatherSettings() {
    const provider = this.elements.provider.value;
    const model = this.elements.model.value;
    let endpoint = this.elements.endpoint.value.trim();

    if (provider !== "custom") {
      endpoint = this.providerEndpoints[provider] || endpoint;
      if (provider === "google" && model) {
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      }
    }

    return {
      provider,
      apiKey: this.elements.apiKey.value.trim(),
      endpoint,
      model,
      temperature: Number(this.elements.temperature.value || 0.4),
      maxTokens: Number(this.elements.maxTokens.value || 1800),
    };
  }

  validateConfig(config) {
    return !!(config.provider && config.apiKey && config.endpoint && config.model);
  }

  async saveSettings() {
    const config = this.gatherSettings();

    if (!this.validateConfig(config)) {
      this.showToast(
        this.t("aiSettingsToastRequiredFields", "Provider, key, endpoint, and model are required"),
        "error"
      );
      return;
    }

    try {
      if (this.currentConfigIndex >= 0 && this.currentConfigIndex < this.apiConfigs.length) {
        this.apiConfigs[this.currentConfigIndex] = config;
      } else {
        this.apiConfigs.push(config);
        this.currentConfigIndex = this.apiConfigs.length - 1;
      }
      this.isDraftProfile = false;

      await chrome.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });
      await this.rebuildAvailableModels();
      await chrome.runtime.sendMessage({ action: "aiSettingsUpdated" });

      this.isDirty = false;
      this.renderProfilesList();
      this.loadConfig(this.currentConfigIndex);
      this.showToast(this.t("aiSettingsToastSaved", "Profile saved"), "success");
    } catch (error) {
      console.error("Error saving AI settings:", error);
      this.showToast(this.t("aiSettingsToastSaveFailed", "Failed to save profile"), "error");
    }
  }

  async deleteConfig(index) {
    if (!confirm(this.t("aiSettingsConfirmDelete", "Delete this profile?"))) return;

    this.apiConfigs.splice(index, 1);
    await chrome.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });
    await this.rebuildAvailableModels();
    await chrome.runtime.sendMessage({ action: "aiSettingsUpdated" });

    if (this.apiConfigs.length === 0) {
      this.startNewProfile();
    } else {
      const nextIndex = Math.max(0, index - 1);
      this.loadConfig(nextIndex);
    }

    this.showToast(this.t("aiSettingsToastDeleted", "Profile deleted"), "success");
  }

  async resetSettings() {
    if (!confirm(this.t("aiSettingsConfirmReset", "Reset all AI profiles and model cache?"))) return;

    await chrome.storage.local.remove(["aiDomEditorConfigs", "availableModels"]);
    this.apiConfigs = [];
    this.availableModels = [];
    this.startNewProfile();
    this.showToast(this.t("aiSettingsToastReset", "All settings reset"), "success");
    await chrome.runtime.sendMessage({ action: "aiSettingsUpdated" });
  }

  async testConnection() {
    const config = this.gatherSettings();

    if (!config.apiKey || !config.endpoint || !config.model) {
      this.showToast(this.t("aiSettingsToastNeedConnectionFields", "Add key, endpoint, and model first"), "error");
      return;
    }

    this.setButtonState(this.elements.testConnection, true, this.t("aiSettingsTesting", "Testing..."));

    try {
      const response = await this.makeTestRequest(config);
      if (response.ok) {
        this.showToast(this.t("aiSettingsToastConnectionSuccess", "Connection successful"), "success");
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          errorData?.error?.message || errorData?.message || response.statusText;
        this.showToast(`${this.t("aiSettingsToastConnectionFailed", "Connection failed")}: ${errorMsg}`, "error");
      }
    } catch (error) {
      this.showToast(`${this.t("aiSettingsToastConnectionError", "Connection error")}: ${error.message}`, "error");
    } finally {
      this.setButtonState(this.elements.testConnection, false, this.t("aiSettingsTest", "Test"));
    }
  }

  async makeTestRequest(config) {
    const testMessage = 'Reply with exactly: OK';
    const headers = { "Content-Type": "application/json" };

    if (config.provider === "google" || config.model.includes("gemini")) {
      headers["x-goog-api-key"] = config.apiKey;
      return fetch(config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: testMessage }] }],
          generationConfig: { maxOutputTokens: 8, temperature: 0 },
        }),
      });
    }

    if (config.provider === "anthropic") {
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      return fetch(config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8,
          temperature: 0,
          messages: [{ role: "user", content: testMessage }],
        }),
      });
    }

    headers.Authorization = `Bearer ${config.apiKey}`;
    return fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: testMessage }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
  }

  async fetchModelsFromAPI() {
    const provider = this.elements.provider.value;
    const apiKey = this.elements.apiKey.value.trim();

    if (!provider || !apiKey) {
      this.showToast(this.t("aiSettingsToastNeedProviderKey", "Select provider and enter key first"), "error");
      return;
    }

    if (provider === "custom") {
      this.showToast(this.t("aiSettingsToastCustomSyncUnsupported", "Custom endpoint model sync is not supported"), "error");
      return;
    }

    this.setButtonState(this.elements.fetchModelsBtn, true, this.t("aiSettingsSyncing", "Syncing..."));

    try {
      const models = await this.fetchModelsForProvider(provider, apiKey);
      if (!models.length) {
        this.showToast(this.t("aiSettingsToastNoModels", "No models found"), "error");
        return;
      }

      this.providerModels[provider] = models;
      this.updateModelOptions();
      this.showToast(`${this.t("aiSettingsToastSyncedPrefix", "Synced")} ${models.length} ${this.t("aiSettingsToastSyncedSuffix", "models")}`, "success");
    } catch (error) {
      this.showToast(`${this.t("aiSettingsToastSyncFailed", "Model sync failed")}: ${error.message}`, "error");
    } finally {
      this.setButtonState(this.elements.fetchModelsBtn, false, this.t("aiSettingsSyncModels", "Sync Models"));
    }
  }

  async fetchModelsForProvider(provider, apiKey) {
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return data.data
        .map((m) => m.id)
        .filter((id) => /^gpt|^o\d|^text-embedding/i.test(id))
        .sort();
    }

    if (provider === "google") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .sort();
    }

    if (provider === "mistral") {
      const response = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return (data.data || []).map((m) => m.id).sort();
    }

    if (provider === "aimlapi") {
      const response = await fetch("https://api.aimlapi.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return (data.data || []).map((m) => m.id).sort();
    }

    if (provider === "anthropic") {
      return [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ];
    }

    return [];
  }

  async rebuildAvailableModels() {
    const merged = [];

    for (const cfg of this.apiConfigs) {
      const models = this.providerModels[cfg.provider] || [cfg.model];
      models.forEach((id) => {
        if (!id) return;
        if (merged.some((m) => m.id === id && m.provider === cfg.provider)) return;

        merged.push({
          id,
          provider: cfg.provider,
          apiKey: cfg.apiKey,
          endpoint: cfg.endpoint,
        });
      });
    }

    this.availableModels = merged;
    await chrome.storage.local.set({ availableModels: merged });
  }

  mergeFetchedModels() {
    this.availableModels.forEach((entry) => {
      if (!entry?.provider || !entry?.id) return;
      if (!this.providerModels[entry.provider]) {
        this.providerModels[entry.provider] = [];
      }
      if (!this.providerModels[entry.provider].includes(entry.id)) {
        this.providerModels[entry.provider].push(entry.id);
      }
    });
  }

  setButtonState(button, disabled, loadingText) {
    button.disabled = disabled;

    if (disabled) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      return;
    }

    if (button.id === "testConnection") {
      button.replaceChildren(
        this.createFeatherIcon("activity", 16),
        document.createTextNode(this.t("aiSettingsTest", "Test"))
      );
    } else if (button.id === "fetchModelsBtn") {
      button.replaceChildren(
        this.createFeatherIcon("refresh-cw", 14),
        document.createTextNode(
          this.t("aiSettingsSyncModels", "Sync Models")
        )
      );
    }

    feather.replace();
  }

  maskApiKey(key) {
    if (!key || key.length < 8) return "";
    return `••••${key.slice(-4)}`;
  }

  showToast(message, type = "success") {
    this.elements.toastMessage.textContent = message;
    this.elements.toast.className = `toast ${type}`;
    this.elements.toast.classList.add("show");

    setTimeout(() => {
      this.elements.toast.classList.remove("show");
    }, 2400);
  }

  t(key, fallback) {
    const value = getMessageSync(key);
    return value && value !== key ? value : fallback;
  }

  createFeatherIcon(name, size = 16) {
    const icon = document.createElement("i");
    icon.setAttribute("data-feather", name);
    icon.setAttribute("width", String(size));
    icon.setAttribute("height", String(size));
    return icon;
  }
}

let aiSettings; // eslint-disable-line no-unused-vars

document.addEventListener("DOMContentLoaded", () => {
  aiSettings = new AISettings();
});
