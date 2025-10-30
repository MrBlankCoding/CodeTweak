(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/utils/urlMatchPattern.js
  function generateUrlMatchPattern(baseUrl, scope = "domain") {
    try {
      if (!baseUrl)
        return null;
      if (!/^https?:\/\//i.test(baseUrl)) {
        baseUrl = "https://" + baseUrl.replace(/^\/*/, "");
      }
      const { protocol, hostname } = new URL(baseUrl);
      const scheme = protocol.replace(":", "");
      let hostPart = hostname;
      switch (scope) {
        case "exact":
          return `${scheme}://${hostPart}`;
        case "domain":
          return `${scheme}://${hostPart}/*`;
        case "subdomain": {
          const parts = hostPart.split(".");
          if (parts.length > 2) {
            hostPart = parts.slice(-2).join(".");
          }
          return `${scheme}://*.${hostPart}/*`;
        }
        default:
          return `${scheme}://${hostPart}/*`;
      }
    } catch (e) {
      console.warn("Failed to generate match pattern:", e);
      return null;
    }
  }

  // src/utils/editor_managers.js
  var BaseUIComponent = class {
    constructor(elements, eventBus) {
      this.elements = elements;
      this.eventBus = eventBus;
      this.eventListeners = [];
    }
    addEventListener(element, event, handler, options = {}) {
      if (element) {
        element.addEventListener(event, handler, options);
        this.eventListeners.push({ element, event, handler });
      }
    }
    destroy() {
      this.eventListeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.eventListeners = [];
    }
    emit(eventName, data = {}) {
      this.eventBus.emit(eventName, data);
    }
    on(eventName, handler) {
      this.eventBus.on(eventName, handler);
    }
  };
  var ModalManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.setupEventListeners();
    }
    setupEventListeners() {
      if (this.elements.settingsBtn) {
        this.addEventListener(this.elements.settingsBtn, "click", () => {
          this.showModal("settings");
        });
        this.addEventListener(this.elements.closeSettings, "click", () => {
          this.hideModal("settings");
        });
      }
      if (this.elements.helpButton) {
        this.addEventListener(this.elements.helpButton, "click", (e) => {
          e.stopPropagation();
          this.hideModal("settings");
          setTimeout(() => this.showModal("help"), 200);
        });
        const closeHelpButton = document.querySelector(".close-help-modal");
        if (closeHelpButton) {
          this.addEventListener(closeHelpButton, "click", (e) => {
            e.stopPropagation();
            this.hideModal("help");
          });
        }
      }
      this.addEventListener(document, "click", (e) => {
        if (e.target.classList.contains("modal") && e.target.classList.contains("show")) {
          const modalType = e.target.id.replace("Modal", "");
          this.hideModal(modalType);
        }
      });
      this.addEventListener(document, "keydown", (e) => {
        if (e.key === "Escape") {
          const openModal = document.querySelector(".modal.show");
          if (openModal) {
            const modalType = openModal.id.replace("Modal", "");
            this.hideModal(modalType);
          }
        }
      });
    }
    showModal(modalType) {
      const modal = document.getElementById(`${modalType}Modal`);
      if (modal) {
        document.body.style.overflow = "hidden";
        modal.classList.add("show");
        modal.style.display = "flex";
        document.body.classList.add("modal-open");
        const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable)
          focusable.focus();
        this.emit("modalOpened", { type: modalType });
      }
    }
    hideModal(modalType) {
      const modal = document.getElementById(`${modalType}Modal`);
      if (modal && modal.classList.contains("show")) {
        const openModals = document.querySelectorAll(".modal.show");
        if (openModals.length <= 1) {
          document.body.style.overflow = "";
          document.body.classList.remove("modal-open");
        }
        modal.classList.remove("show");
        setTimeout(() => {
          modal.style.display = "none";
        }, 200);
        this.emit("modalClosed", { type: modalType });
      }
    }
  };
  var SidebarManager = class extends BaseUIComponent {
    constructor(elements, eventBus, config) {
      super(elements, eventBus);
      this.config = config;
      this.setupEventListeners();
    }
    setupEventListeners() {
      this.addEventListener(window, "resize", () => {
        this.handleResize();
      });
    }
    handleResize() {
      setTimeout(() => {
        this.emit("layoutChanged");
      }, 100);
    }
  };
  var StatusManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.setupEventListeners();
    }
    setupEventListeners() {
      this.on("scriptStatusChanged", ({ hasUnsavedChanges }) => {
        this.updateScriptStatus(hasUnsavedChanges);
      });
    }
    updateScriptStatus(hasUnsavedChanges) {
      const badge = this.elements.scriptStatusBadge;
      if (!badge)
        return;
      if (hasUnsavedChanges) {
        badge.textContent = "Unsaved Changes";
        badge.style.backgroundColor = "#4B5563";
        badge.style.color = "#D1D5DB";
      } else {
        badge.textContent = "Saved";
        badge.style.backgroundColor = "#065F46";
        badge.style.color = "#A7F3D0";
      }
    }
    showMessage(message, type = "success", duration = 3e3) {
      const { statusMessage } = this.elements;
      if (!statusMessage)
        return;
      statusMessage.textContent = message;
      statusMessage.className = `status-message ${type}`;
      statusMessage.style.display = "block";
      if (duration > 0) {
        setTimeout(() => this.clearMessage(), duration);
      }
    }
    clearMessage() {
      const { statusMessage } = this.elements;
      if (!statusMessage)
        return;
      statusMessage.textContent = "";
      statusMessage.className = "status-message";
      statusMessage.style.display = "none";
    }
    showError(message) {
      this.showMessage(message, "error", 5e3);
    }
    showSuccess(message) {
      this.showMessage(message, "success", 3e3);
    }
  };
  var SettingsManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.settingsInputs = this.getSettingsInputs();
      this.setupEventListeners();
    }
    getSettingsInputs() {
      return {
        theme: document.getElementById("editorTheme"),
        fontSize: document.getElementById("fontSize"),
        tabSize: document.getElementById("tabSize"),
        lineNumbers: document.getElementById("lineNumbers"),
        lineWrapping: document.getElementById("lineWrapping"),
        matchBrackets: document.getElementById("matchBrackets"),
        minimap: document.getElementById("minimap"),
        lintingEnabled: document.getElementById("lintingEnabled"),
        autosaveEnabled: document.getElementById("autosaveEnabled")
      };
    }
    setupEventListeners() {
      this.setupInstantApplyListeners();
      this.setupModalListeners();
      this.setupActionButtons();
    }
    setupInstantApplyListeners() {
      const { settingsInputs } = this;
      if (settingsInputs.fontSize) {
        this.addEventListener(settingsInputs.fontSize, "input", () => {
          const value = parseInt(settingsInputs.fontSize.value, 10);
          const fontSizeValue = document.getElementById("fontSizeValue");
          if (fontSizeValue) {
            fontSizeValue.textContent = value + "px";
          }
          this.emit("settingChanged", { fontSize: value });
        });
      }
      if (settingsInputs.theme) {
        this.addEventListener(settingsInputs.theme, "change", () => {
          this.emit("settingChanged", { theme: settingsInputs.theme.value });
        });
      }
      if (settingsInputs.tabSize) {
        this.addEventListener(settingsInputs.tabSize, "input", () => {
          this.emit("settingChanged", {
            tabSize: parseInt(settingsInputs.tabSize.value, 10)
          });
        });
      }
      ["lineNumbers", "lineWrapping", "matchBrackets", "minimap"].forEach((setting) => {
        if (settingsInputs[setting]) {
          this.addEventListener(settingsInputs[setting], "change", () => {
            this.emit("settingChanged", {
              [setting]: settingsInputs[setting].checked
            });
          });
        }
      });
      if (settingsInputs.lintingEnabled) {
        this.addEventListener(settingsInputs.lintingEnabled, "change", () => {
          const enabled = settingsInputs.lintingEnabled.checked;
          localStorage.setItem("lintingEnabled", enabled.toString());
          this.emit("lintingToggled", { enabled });
        });
      }
      if (settingsInputs.autosaveEnabled) {
        this.addEventListener(settingsInputs.autosaveEnabled, "change", () => {
          const enabled = settingsInputs.autosaveEnabled.checked;
          localStorage.setItem("autosaveEnabled", enabled.toString());
          this.emit("autosaveToggled", { enabled });
        });
      }
    }
    setupModalListeners() {
      this.on("modalOpened", ({ type }) => {
        if (type === "settings") {
          this.loadSettingsIntoModal();
        }
      });
    }
    setupActionButtons() {
      const saveBtn = document.getElementById("saveSettings");
      const resetBtn = document.getElementById("resetSettings");
      const closeBtn = document.querySelector("#settingsModal .close");
      if (saveBtn) {
        this.addEventListener(saveBtn, "click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.saveAllSettings();
        });
      }
      if (resetBtn) {
        this.addEventListener(resetBtn, "click", (e) => {
          e.preventDefault();
          this.resetToDefaults();
        });
      }
      if (closeBtn) {
        this.addEventListener(closeBtn, "click", (e) => {
          e.preventDefault();
          const modal = document.getElementById("settingsModal");
          if (modal) {
            modal.classList.remove("show");
            modal.style.display = "none";
            document.body.style.overflow = "";
          }
        });
      }
    }
    async loadSettingsIntoModal() {
      try {
        const settings = await this.loadSettings();
        const { settingsInputs } = this;
        if (settingsInputs.theme && settings.theme !== void 0)
          settingsInputs.theme.value = settings.theme;
        if (settingsInputs.fontSize && settings.fontSize !== void 0) {
          settingsInputs.fontSize.value = settings.fontSize;
          const fontSizeValue = document.getElementById("fontSizeValue");
          if (fontSizeValue)
            fontSizeValue.textContent = settings.fontSize + "px";
        }
        if (settingsInputs.tabSize && settings.tabSize !== void 0)
          settingsInputs.tabSize.value = settings.tabSize;
        if (settingsInputs.lineNumbers && settings.lineNumbers !== void 0)
          settingsInputs.lineNumbers.checked = !!settings.lineNumbers;
        if (settingsInputs.lineWrapping && settings.lineWrapping !== void 0)
          settingsInputs.lineWrapping.checked = !!settings.lineWrapping;
        if (settingsInputs.matchBrackets && settings.matchBrackets !== void 0)
          settingsInputs.matchBrackets.checked = !!settings.matchBrackets;
        if (settingsInputs.minimap && settings.minimap !== void 0)
          settingsInputs.minimap.checked = !!settings.minimap;
        if (settingsInputs.lintingEnabled) {
          settingsInputs.lintingEnabled.checked = localStorage.getItem("lintingEnabled") === "true";
        }
        if (settingsInputs.autosaveEnabled) {
          settingsInputs.autosaveEnabled.checked = localStorage.getItem("autosaveEnabled") === "true";
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    }
    async loadSettings() {
      try {
        const result = await chrome.storage.local.get(["editorSettings"]);
        return result.editorSettings || {};
      } catch (error) {
        console.error("Failed to load settings from storage:", error);
        return {};
      }
    }
    async saveAllSettings() {
      try {
        const { settingsInputs } = this;
        const newSettings = {
          theme: settingsInputs.theme?.value || "ayu-dark",
          fontSize: parseInt(settingsInputs.fontSize?.value, 10) || 14,
          tabSize: parseInt(settingsInputs.tabSize?.value, 10) || 2,
          lineNumbers: !!settingsInputs.lineNumbers?.checked,
          lineWrapping: !!settingsInputs.lineWrapping?.checked,
          matchBrackets: !!settingsInputs.matchBrackets?.checked,
          minimap: !!settingsInputs.minimap?.checked
        };
        await chrome.storage.local.set({ editorSettings: newSettings });
        this.emit("settingsSaved", newSettings);
        this.emit("settingChanged", newSettings);
        this.emit("showStatus", { message: "Settings saved successfully", type: "success" });
        const modal = document.getElementById("settingsModal");
        if (modal) {
          modal.classList.remove("show");
          modal.style.display = "none";
          document.body.style.overflow = "";
        }
        return true;
      } catch (error) {
        console.error("Failed to save settings:", error);
        this.emit("showStatus", {
          message: "Failed to save settings: " + (error.message || "Unknown error"),
          type: "error"
        });
        return false;
      }
    }
    resetToDefaults() {
      const { settingsInputs } = this;
      if (settingsInputs.theme)
        settingsInputs.theme.value = "ayu-dark";
      if (settingsInputs.fontSize) {
        settingsInputs.fontSize.value = 14;
        const fontSizeValue = document.getElementById("fontSizeValue");
        if (fontSizeValue)
          fontSizeValue.textContent = "14px";
      }
      if (settingsInputs.tabSize)
        settingsInputs.tabSize.value = 2;
      if (settingsInputs.lineNumbers)
        settingsInputs.lineNumbers.checked = true;
      if (settingsInputs.lineWrapping)
        settingsInputs.lineWrapping.checked = false;
      if (settingsInputs.matchBrackets)
        settingsInputs.matchBrackets.checked = true;
      if (settingsInputs.minimap)
        settingsInputs.minimap.checked = true;
      if (settingsInputs.lintingEnabled)
        settingsInputs.lintingEnabled.checked = true;
      if (settingsInputs.autosaveEnabled)
        settingsInputs.autosaveEnabled.checked = true;
      localStorage.setItem("lintingEnabled", "true");
      localStorage.setItem("autosaveEnabled", "true");
      this.emit("settingsReset", {
        theme: "ayu-dark",
        fontSize: 14,
        tabSize: 2,
        lineNumbers: true,
        lineWrapping: false,
        matchBrackets: true,
        minimap: true
      });
    }
  };
  var URLManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.statusManager = elements.statusManager || elements.status;
      this.setupEventListeners();
    }
    setupEventListeners() {
      if (this.elements.addUrlBtn) {
        this.addEventListener(this.elements.addUrlBtn, "click", (e) => {
          e.preventDefault();
          this.addCurrentUrl();
        });
      }
      if (this.elements.urlList) {
        this.addEventListener(this.elements.urlList, "click", (e) => {
          if (e.target.closest(".remove-btn")) {
            e.preventDefault();
            this.removeUrl(e.target.closest(".url-item"));
          }
        });
      }
      if (this.elements.targetUrl) {
        this.addEventListener(this.elements.targetUrl, "keypress", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.addCurrentUrl();
          }
        });
      }
      if (this.elements.generatePatternBtn) {
        this.elements.generatePatternBtn.addEventListener("click", () => {
          const base = this.elements.patternBaseUrl.value.trim();
          const scope = this.elements.patternScope.value;
          const pattern = generateUrlMatchPattern(base, scope);
          if (pattern) {
            this.elements.generatedPattern.value = pattern + (scope === "exact" ? "" : "");
            this.elements.generatedPatternGroup.classList.remove("hidden");
          }
        });
      }
      if (this.elements.insertPatternBtn) {
        this.elements.insertPatternBtn.addEventListener("click", () => {
          const pattern = this.elements.generatedPattern.value.trim();
          if (pattern) {
            this.addUrlToList(pattern);
            this.elements.generatedPatternGroup.classList.add("hidden");
            this.elements.patternBaseUrl.value = "";
          }
        });
      }
    }
    addCurrentUrl() {
      const url = this.elements.targetUrl?.value?.trim();
      if (!url) {
        if (this.statusManager) {
          this.statusManager.showError("URL cannot be empty.");
        }
        return;
      }
      if (this.isValidUrl(url)) {
        this.addUrlToList(url);
        this.elements.targetUrl.value = "";
        this.emit("urlAdded", { url });
      } else {
        if (this.statusManager) {
          this.statusManager.showError("Invalid URL pattern.");
        }
      }
    }
    addUrlToList(url) {
      if (this.elements.urlList) {
        const existing = Array.from(this.elements.urlList.querySelectorAll(".url-item")).some((item) => item.dataset.url === url);
        if (existing) {
          return false;
        }
      }
      try {
        const urlItem = document.createElement("div");
        urlItem.className = "url-item";
        urlItem.dataset.url = url;
        urlItem.innerHTML = `
        <span>${this.escapeHtml(url)}</span>
        <button type="button" class="remove-btn" title="Remove URL">
          <i data-feather="x"></i>
        </button>
      `;
        if (this.elements.urlList) {
          this.elements.urlList.appendChild(urlItem);
          this.emit("sidebarChanged");
          feather.replace();
          return true;
        }
      } catch (e) {
        console.error("Error adding URL to list:", e);
      }
      return false;
    }
    removeUrl(urlItem) {
      if (!urlItem)
        return;
      const url = urlItem.dataset?.url;
      if (urlItem.remove) {
        urlItem.remove();
      } else if (urlItem.parentNode) {
        urlItem.parentNode.removeChild(urlItem);
      }
      if (url) {
        this.emit("urlRemoved", { url });
        this.emit("sidebarChanged");
      }
    }
    getUrls() {
      return Array.from(this.elements.urlList.querySelectorAll(".url-item")).map((item) => item.dataset.url);
    }
    isValidUrl(url) {
      try {
        if (!url.match(/^https?:\/\//i)) {
          if (this.statusManager) {
            this.statusManager.showError(
              "Please enter a valid URL in this format: https://example.com (include http:// or https://)"
            );
          }
          return false;
        }
        new URL(url);
        return true;
      } catch {
        if (this.statusManager) {
          this.statusManager.showError(
            "Please enter a valid URL in this format: https://example.com (include http:// or https://)"
          );
        }
        return false;
      }
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  };
  var RequireManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.setupEventListeners();
    }
    setupEventListeners() {
      if (this.elements.addRequireBtn) {
        this.addEventListener(this.elements.addRequireBtn, "click", () => {
          this.addCurrentRequire();
        });
      }
      if (this.elements.requireList) {
        this.addEventListener(this.elements.requireList, "click", (e) => {
          if (e.target.classList.contains("remove-require-btn")) {
            this.removeRequire(e.target.closest(".require-item"));
          }
        });
      }
    }
    addCurrentRequire() {
      const url = this.elements.requireURL.value.trim();
      if (url) {
        this.addRequireToList(url);
        this.elements.requireURL.value = "";
        this.emit("requireAdded", { url });
      }
    }
    addRequireToList(url) {
      if (!url)
        return;
      const item = document.createElement("li");
      item.className = "require-item";
      item.dataset.url = url;
      item.innerHTML = `
      <span>${this.escapeHtml(url)}</span>
      <button class="remove-require-btn" title="Remove Required Script">\xD7</button>
    `;
      this.elements.requireList.appendChild(item);
      this.emit("requireAdded", { url });
      this.emit("sidebarChanged");
    }
    removeRequire(item) {
      const url = item.dataset.url;
      item.remove();
      this.emit("requireRemoved", { url });
      this.emit("sidebarChanged");
    }
    getRequires() {
      return Array.from(this.elements.requireList.querySelectorAll(".require-item")).map((i) => i.dataset.url);
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  };
  var ResourceManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.setupEventListeners();
    }
    setupEventListeners() {
      this.addEventListener(this.elements.addResourceBtn, "click", () => {
        this.addCurrentResource();
      });
      this.addEventListener(this.elements.resourceList, "click", (e) => {
        const btn = e.target.closest(".remove-resource-btn, .remove-resource");
        if (btn) {
          this.removeResource(btn.closest(".resource-item"));
        }
      });
      this.on("gmApiChanged", ({ api }) => {
        if (api === "GM_getResourceText" || api === "GM_getResourceURL") {
          this.toggleResourceSection();
        }
      });
    }
    addCurrentResource() {
      const name = this.elements.resourceName.value.trim();
      const url = this.elements.resourceURL.value.trim();
      if (name && url) {
        this.addResourceToList(name, url);
        this.elements.resourceName.value = "";
        this.elements.resourceURL.value = "";
        this.emit("resourceAdded", { name, url });
      }
    }
    addResourceToList(name, url) {
      if (!name || !url)
        return;
      const resourceItem = document.createElement("li");
      resourceItem.className = "resource-item";
      resourceItem.dataset.name = name;
      resourceItem.dataset.url = url;
      resourceItem.innerHTML = `
      <span>${this.escapeHtml(name)} (${this.escapeHtml(url)})</span>
      <button class="remove-resource" title="Remove Resource">\xD7</button>
    `;
      this.elements.resourceList.appendChild(resourceItem);
      this.emit("resourceAdded", { name, url });
      this.emit("sidebarChanged");
    }
    removeResource(resourceItem) {
      const name = resourceItem.dataset.name;
      const url = resourceItem.dataset.url;
      resourceItem.remove();
      this.emit("resourceRemoved", { name, url });
      this.emit("sidebarChanged");
    }
    toggleResourceSection() {
      const section = document.getElementById("resourcesSection");
      const shouldShow = this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked;
      if (section) {
        section.classList.toggle("hidden", !shouldShow);
      }
    }
    getResources() {
      return Array.from(this.elements.resourceList.querySelectorAll(".resource-item")).map((item) => ({
        name: item.dataset.name,
        url: item.dataset.url
      }));
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  };
  var FormManager = class extends BaseUIComponent {
    constructor(elements, eventBus) {
      super(elements, eventBus);
      this.setupEventListeners();
    }
    setupEventListeners() {
      const formElements = [
        "scriptName",
        "scriptAuthor",
        "scriptVersion",
        "scriptDescription",
        "runAt",
        "waitForSelector",
        "scriptResources"
      ];
      formElements.forEach((elementKey) => {
        const element = this.elements[elementKey];
        if (element) {
          const eventType = element.type === "checkbox" ? "change" : "input";
          this.addEventListener(element, eventType, () => {
            this.emit("formChanged");
          });
        }
      });
    }
    getFormData() {
      return {
        name: this.elements.scriptName?.value?.trim() || "",
        author: this.elements.scriptAuthor?.value?.trim() || "",
        version: this.elements.scriptVersion?.value?.trim() || "1.0",
        description: this.elements.scriptDescription?.value?.trim() || "",
        runAt: this.elements.runAt?.value || "document-end",
        waitForSelector: this.elements.waitForSelector?.value?.trim() || ""
      };
    }
    setFormData(data) {
      if (this.elements.scriptName)
        this.elements.scriptName.value = data.name || "";
      if (this.elements.scriptAuthor)
        this.elements.scriptAuthor.value = data.author || "";
      if (this.elements.scriptVersion)
        this.elements.scriptVersion.value = data.version || "1.0";
      if (this.elements.scriptDescription)
        this.elements.scriptDescription.value = data.description || "";
      if (this.elements.runAt)
        this.elements.runAt.value = data.runAt || "document-end";
      if (this.elements.waitForSelector)
        this.elements.waitForSelector.value = data.waitForSelector || "";
    }
    validate() {
      const errors = [];
      const data = this.getFormData();
      if (!data.name) {
        errors.push("Script name is required");
      }
      return {
        isValid: errors.length === 0,
        errors
      };
    }
  };
  var UIManager = class {
    constructor(elements, config) {
      this.elements = elements;
      this.config = config;
      this.eventBus = new EventBus();
      this.components = {};
      this.hasUnsavedChanges = false;
      this.initializeComponents();
      this.setupGlobalEventListeners();
      this.setupButtonEventListeners();
    }
    initializeComponents() {
      this.components.modal = new ModalManager({
        settingsBtn: this.elements.settingsBtn,
        closeSettings: this.elements.closeSettings,
        settingsModal: this.elements.settingsModal,
        helpButton: document.getElementById("helpButton")
      }, this.eventBus);
      this.components.sidebar = new SidebarManager(this.elements, this.eventBus, this.config);
      this.components.status = new StatusManager(this.elements, this.eventBus);
      this.components.settings = new SettingsManager(this.elements, this.eventBus);
      this.components.url = new URLManager(this.elements, this.eventBus);
      this.components.resource = new ResourceManager(this.elements, this.eventBus);
      this.components.require = new RequireManager(this.elements, this.eventBus);
      this.components.form = new FormManager(this.elements, this.eventBus);
      if (this.components.url && this.components.status) {
        this.components.url.statusManager = this.components.status;
      }
    }
    setupGlobalEventListeners() {
      let hasUserInteraction = false;
      const trackInteraction = () => {
        hasUserInteraction = true;
      };
      document.addEventListener("mousedown", trackInteraction, { once: true });
      document.addEventListener("keydown", trackInteraction, { once: true });
      window.addEventListener("beforeunload", (e) => {
        if (this.hasUnsavedChanges && hasUserInteraction) {
          e.preventDefault();
          e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
          return e.returnValue;
        }
      });
    }
    setupButtonEventListeners() {
      if (this.components.form && typeof this.components.form.setupEventListeners === "function") {
        this.components.form.setupEventListeners();
      }
    }
    setupFormEventListeners(onChange) {
      if (this.components.form && typeof this.components.form.setupEventListeners === "function") {
        this.components.form.setupEventListeners(onChange);
      }
    }
    setupUrlManagement(callbacks) {
      if (this.components.url && typeof this.components.url.setupUrlManagement === "function") {
        this.components.url.setupUrlManagement(callbacks);
      }
    }
    setupSettingsModal(callbacks) {
      if (this.components.settings && typeof this.components.settings.setupModalListeners === "function") {
        this.components.settings.setupModalListeners(callbacks);
      }
    }
    setupResourceManagement(callbacks) {
      if (this.components.resource && typeof this.components.resource.setupEventListeners === "function") {
        this.components.resource.setupEventListeners(callbacks);
      }
    }
    // Public API methods
    on(eventName, handler) {
      this.eventBus.on(eventName, handler);
    }
    emit(eventName, data) {
      this.eventBus.emit(eventName, data);
    }
    addResourceToList(name, url) {
      if (this.components.resource && typeof this.components.resource.addResourceToList === "function") {
        this.components.resource.addResourceToList(name, url);
      } else {
        console.warn("ResourceManager not properly initialized");
      }
    }
    addRequireToList(url) {
      if (this.components.require && typeof this.components.require.addRequireToList === "function") {
        this.components.require.addRequireToList(url);
      }
    }
    getComponent(name) {
      return this.components[name];
    }
    destroy() {
      Object.values(this.components).forEach((component) => {
        if (component.destroy) {
          component.destroy();
        }
      });
    }
    updateScriptStatus(hasUnsavedChanges) {
      this.hasUnsavedChanges = hasUnsavedChanges;
      if (this.components.status && typeof this.components.status.updateScriptStatus === "function") {
        this.components.status.updateScriptStatus(hasUnsavedChanges);
      }
    }
    showStatusMessage(message, type = "success", duration = 3e3) {
      if (this.components.status && typeof this.components.status.showMessage === "function") {
        this.components.status.showMessage(message, type, duration);
      }
    }
    clearStatusMessage() {
      if (this.components.status && typeof this.components.status.clearMessage === "function") {
        this.components.status.clearMessage();
      }
    }
    // Proxies for backwords compatability
    initializeCollapsibleSections() {
      if (this.components.sidebar && typeof this.components.sidebar.initializeCollapsibleSections === "function") {
        this.components.sidebar.initializeCollapsibleSections();
      }
    }
    addUrlToList(url) {
      if (this.components.url && typeof this.components.url.addUrlToList === "function") {
        this.components.url.addUrlToList(url);
      }
    }
    updateSidebarState() {
      if (this.components.sidebar && typeof this.components.sidebar.updateVisibility === "function") {
        this.components.sidebar.updateVisibility();
      }
    }
  };
  var EventBus = class {
    constructor() {
      this.events = /* @__PURE__ */ new Map();
    }
    on(eventName, handler) {
      if (!this.events.has(eventName)) {
        this.events.set(eventName, []);
      }
      this.events.get(eventName).push(handler);
    }
    off(eventName, handler) {
      if (this.events.has(eventName)) {
        const handlers = this.events.get(eventName);
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
    emit(eventName, data = {}) {
      if (this.events.has(eventName)) {
        this.events.get(eventName).forEach((handler) => {
          try {
            handler(data);
          } catch (error) {
            console.error(`Error in event handler for ${eventName}:`, error);
          }
        });
      }
    }
  };
  var StorageManager = class {
    constructor() {
      this.storageKey = "scripts";
    }
    async getScript(id) {
      try {
        const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
        return scripts.find((script) => script.id === id) || null;
      } catch (error) {
        console.error("Failed to get script:", error);
        return null;
      }
    }
    async saveScript(scriptData, scriptId = null, isEditMode = false) {
      try {
        const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (isEditMode && scriptId) {
          const scriptIndex = scripts.findIndex((script) => script.id === scriptId);
          if (scriptIndex === -1) {
            throw new Error("Script not found for editing");
          }
          const existingScript = scripts[scriptIndex];
          const updatedScript = {
            ...scriptData,
            id: scriptId,
            createdAt: existingScript.createdAt || now,
            updatedAt: now
          };
          scripts[scriptIndex] = updatedScript;
          await chrome.storage.local.set({ [this.storageKey]: scripts });
          return updatedScript;
        } else {
          const newScript = {
            ...scriptData,
            id: this.generateUniqueId(),
            createdAt: now,
            updatedAt: now
          };
          scripts.push(newScript);
          await chrome.storage.local.set({ [this.storageKey]: scripts });
          return newScript;
        }
      } catch (error) {
        console.error("Failed to save script:", error);
        throw error;
      }
    }
    async deleteScript(id) {
      try {
        const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
        const filteredScripts = scripts.filter((script) => script.id !== id);
        await chrome.storage.local.set({ [this.storageKey]: filteredScripts });
        return true;
      } catch (error) {
        console.error("Failed to delete script:", error);
        return false;
      }
    }
    async getAllScripts() {
      try {
        const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
        return scripts;
      } catch (error) {
        console.error("Failed to get all scripts:", error);
        return [];
      }
    }
    generateUniqueId() {
      return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
    }
  };
  var FormValidator = class {
    constructor(elements) {
      this.elements = elements;
    }
    validateForm() {
      const validations = [
        // Name is optional (auto-generated on save if empty)
        this.validateTargetUrls(),
        this.validateVersion(),
        this.validateRunAt(),
        this.validateIconUrl(),
        this.validateRequireUrls(),
        this.validateResources()
      ];
      return validations.every((validation) => validation.isValid);
    }
    validateTargetUrls() {
      const urlList = Array.from(document.querySelectorAll(".url-item")).map(
        (item) => item.dataset.url
      );
      const currentUrl = this.elements.targetUrl.value.trim();
      if (urlList.length === 0 && !currentUrl) {
        this.showValidationError("Please add at least one target URL.");
        return { isValid: false };
      }
      if (currentUrl) {
        try {
          new URL(currentUrl);
        } catch {
          this.showValidationError("The target URL must be a valid http(s) URL.");
          return { isValid: false };
        }
      }
      return { isValid: true };
    }
    validateVersion() {
      const versionEl = this.elements.scriptVersion;
      const version = (versionEl?.value || "").trim();
      if (!version)
        return { isValid: true };
      const semverLike = /^\d+\.\d+\.\d+$/;
      if (!semverLike.test(version)) {
        this.showValidationError("Version must be in the format X.Y.Z (e.g., 1.0.0).");
        return { isValid: false };
      }
      return { isValid: true };
    }
    validateRunAt() {
      const allowed = /* @__PURE__ */ new Set(["document_start", "document_end", "document_idle"]);
      const runAt = this.elements.runAt?.value;
      if (runAt && !allowed.has(runAt)) {
        this.showValidationError("Invalid 'Run at' value selected.");
        return { isValid: false };
      }
      return { isValid: true };
    }
    validateIconUrl() {
      const icon = this.elements.scriptIcon?.value?.trim();
      if (!icon)
        return { isValid: true };
      try {
        const u = new URL(icon);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          this.showValidationError("Icon URL must start with http:// or https://");
          return { isValid: false };
        }
        return { isValid: true };
      } catch {
        this.showValidationError("Icon URL is not a valid URL.");
        return { isValid: false };
      }
    }
    validateRequireUrls() {
      const items = Array.from(document.querySelectorAll(".require-item"));
      for (const item of items) {
        const url = item.dataset.url?.trim();
        if (!url) {
          this.showValidationError("A required script entry is missing its URL.");
          return { isValid: false };
        }
        try {
          new URL(url);
        } catch {
          this.showValidationError("One of the required script URLs is invalid.");
          return { isValid: false };
        }
      }
      return { isValid: true };
    }
    validateResources() {
      const items = Array.from(document.querySelectorAll(".resource-item"));
      for (const item of items) {
        const name = item.dataset.name?.trim();
        const url = item.dataset.url?.trim();
        if (!name) {
          this.showValidationError("A resource is missing its name.");
          return { isValid: false };
        }
        if (!url) {
          this.showValidationError("A resource is missing its URL.");
          return { isValid: false };
        }
        try {
          new URL(url);
        } catch {
          this.showValidationError("One of the resource URLs is invalid.");
          return { isValid: false };
        }
      }
      return { isValid: true };
    }
    showValidationError(message) {
      const statusMessage = this.elements.statusMessage;
      statusMessage.textContent = message;
      statusMessage.className = "status-message error";
      statusMessage.style.display = "block";
    }
  };

  // src/utils/editor_settings.js
  var import_state = __require("@codemirror/state");
  var import_view = __require("@codemirror/view");
  var import_codemirror = __require("codemirror");
  var import_lang_javascript = __require("@codemirror/lang-javascript");
  var import_commands = __require("@codemirror/commands");

  // src/utils/metadataParser.js
  function parseUserScriptMetadata(content) {
    const metadata = {
      gmApis: {}
    };
    const grantToGmApi = {
      // GM_ style (traditional)
      GM_setValue: "gmSetValue",
      GM_getValue: "gmGetValue",
      GM_deleteValue: "gmDeleteValue",
      GM_listValues: "gmListValues",
      GM_openInTab: "gmOpenInTab",
      GM_notification: "gmNotification",
      GM_getResourceText: "gmGetResourceText",
      GM_getResourceURL: "gmGetResourceURL",
      GM_setClipboard: "gmSetClipboard",
      GM_addStyle: "gmAddStyle",
      GM_addElement: "gmAddElement",
      GM_registerMenuCommand: "gmRegisterMenuCommand",
      GM_xmlhttpRequest: "gmXmlhttpRequest",
      unsafeWindow: "unsafeWindow",
      // GM. style (modern)
      "GM.setValue": "gmSetValue",
      "GM.getValue": "gmGetValue",
      "GM.deleteValue": "gmDeleteValue",
      "GM.listValues": "gmListValues",
      "GM.openInTab": "gmOpenInTab",
      "GM.notification": "gmNotification",
      "GM.getResourceText": "gmGetResourceText",
      "GM.getResourceURL": "gmGetResourceURL",
      "GM.setClipboard": "gmSetClipboard",
      "GM.addStyle": "gmAddStyle",
      "GM.addElement": "gmAddElement",
      "GM.registerMenuCommand": "gmRegisterMenuCommand",
      "GM.xmlhttpRequest": "gmXmlhttpRequest"
    };
    const metaMatch = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!metaMatch)
      return metadata;
    const metaBlock = metaMatch[1];
    const lines = metaBlock.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const match = line.match(/@(\w+)\s+(.+)/);
      if (!match)
        continue;
      const [, key, value] = match;
      switch (key.toLowerCase()) {
        case "match":
        case "include":
          if (!metadata.matches)
            metadata.matches = [];
          metadata.matches.push(value);
          break;
        case "require":
          if (!metadata.requires)
            metadata.requires = [];
          metadata.requires.push(value);
          break;
        case "resource": {
          if (!metadata.resources)
            metadata.resources = [];
          const [name, url] = value.split(/\s+/);
          if (name && url) {
            metadata.resources.push({ name, url });
          }
          break;
        }
        case "run-at":
          metadata.runAt = value;
          break;
        case "grant": {
          const grantValue = value.trim();
          if (grantValue === "none") {
            metadata.gmApis = {};
          } else if (grantValue === "unsafeWindow") {
            metadata.gmApis.unsafeWindow = true;
          } else {
            const apiFlag = grantToGmApi[grantValue];
            if (apiFlag) {
              metadata.gmApis[apiFlag] = true;
            }
          }
          break;
        }
        case "license":
          metadata.license = value.trim();
          break;
        case "icon":
          metadata.icon = value.trim();
          break;
        default:
          metadata[key] = value;
      }
    }
    return metadata;
  }
  var gmApiFlagToGrant = {
    gmSetValue: "GM_setValue",
    gmGetValue: "GM_getValue",
    gmDeleteValue: "GM_deleteValue",
    gmListValues: "GM_listValues",
    gmOpenInTab: "GM_openInTab",
    gmNotification: "GM_notification",
    gmGetResourceText: "GM_getResourceText",
    gmGetResourceURL: "GM_getResourceURL",
    gmSetClipboard: "GM_setClipboard",
    gmAddStyle: "GM_addStyle",
    gmAddElement: "GM_addElement",
    gmRegisterMenuCommand: "GM_registerMenuCommand",
    gmXmlhttpRequest: "GM_xmlhttpRequest",
    unsafeWindow: "unsafeWindow"
  };
  function buildTampermonkeyMetadata(script, useModernStyle = false) {
    const lines = [];
    lines.push("// ==UserScript==");
    const push = (key, value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => lines.push(`// @${key.padEnd(10)} ${v}`));
      } else if (value !== void 0 && value !== null && value !== "") {
        lines.push(`// @${key.padEnd(10)} ${value}`);
      }
    };
    push("name", script.name || "Untitled Script");
    push("namespace", script.namespace || "https://codetweak.local");
    push("version", script.version || "1.0.0");
    push("description", script.description || "");
    push("author", script.author || "Anonymous");
    push("icon", script.icon);
    if (script.targetUrls && script.targetUrls.length) {
      script.targetUrls.forEach((pattern) => push("match", pattern));
    }
    if (script.runAt) {
      let runAt = script.runAt;
      runAt = runAt.replace(/_/g, "-");
      push("run-at", runAt);
    }
    if (script.requires && script.requires.length) {
      script.requires.forEach((url) => push("require", url));
    }
    if (script.resources && script.resources.length) {
      script.resources.forEach((r) => push("resource", `${r.name} ${r.url}`));
    }
    const grants = [];
    let anyApiSelected = false;
    Object.keys(gmApiFlagToGrant).forEach((flag) => {
      if (script[flag]) {
        let grantName = gmApiFlagToGrant[flag];
        if (useModernStyle && grantName !== "unsafeWindow") {
          grantName = grantName.replace("GM_", "GM.");
        }
        grants.push(grantName);
        anyApiSelected = true;
      }
    });
    if (!anyApiSelected) {
      push("grant", "none");
    } else {
      grants.forEach((g) => push("grant", g));
    }
    if (script.license) {
      push("license", script.license);
    }
    lines.push("// ==/UserScript==");
    return lines.join("\n");
  }

  // src/utils/editor_settings.js
  var import_theme_one_dark = __require("@codemirror/theme-one-dark");
  var import_codemirror_theme_solarized_dark = __require("@fsegurai/codemirror-theme-solarized-dark");
  var import_codemirror_theme_solarized_light = __require("@fsegurai/codemirror-theme-solarized-light");
  var import_codemirror_theme_dracula = __require("@fsegurai/codemirror-theme-dracula");
  var import_codemirror_theme_material_dark = __require("@fsegurai/codemirror-theme-material-dark");
  var import_codemirror_theme_monokai = __require("@fsegurai/codemirror-theme-monokai");
  var import_autocomplete = __require("@codemirror/autocomplete");
  var import_language = __require("@codemirror/language");
  var import_lint = __require("@codemirror/lint");
  var import_matchbrackets = __require("@codemirror/matchbrackets");
  var import_jshint = __require("jshint");
  var import_js_beautify = __require("js-beautify");
  var CodeEditorManager = class {
    constructor(elements, state, config, gmApiDefinitions) {
      this.elements = elements;
      this.state = state;
      this.config = config;
      this.gmApiDefinitions = gmApiDefinitions;
      this.codeEditor = null;
      this.defaultSettings = {
        theme: "oneDark",
        fontSize: 14,
        tabSize: 2,
        lineNumbers: true,
        lineWrapping: false,
        matchBrackets: true,
        minimap: true
      };
      this.currentSettings = { ...this.defaultSettings };
      this.theme = new import_state.Compartment();
      this.lint = new import_state.Compartment();
      this.largeFileOptimized = false;
      this.LARGE_FILE_LINE_COUNT = 3e3;
      this.HUGE_FILE_LINE_COUNT = 1e4;
      this.LARGE_FILE_CHAR_COUNT = 2e5;
      this.HUGE_FILE_CHAR_COUNT = 8e5;
      this.currentPerfTier = "normal";
      this._perfCheckTimer = null;
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "local" && changes.editorSettings) {
          this.currentSettings = { ...this.defaultSettings, ...changes.editorSettings.newValue };
          this.applySettings(this.currentSettings);
        }
      });
    }
    async initializeCodeEditor() {
      if (!this.elements.codeEditor) {
        throw new Error("Code editor element not found");
      }
      await this.loadSettings();
      const startState = import_state.EditorState.create({
        doc: this.elements.codeEditor.value,
        extensions: [
          import_codemirror.basicSetup,
          (0, import_lang_javascript.javascript)(),
          this.getEditorKeybindings(),
          (0, import_view.lineNumbers)(),
          (0, import_view.gutter)({ class: "cm-gutters" }),
          this.theme.of(import_theme_one_dark.oneDark),
          this.lint.of((0, import_lint.linter)(this.getLintOptions(true, this.getEnabledGmApis()))),
          (0, import_autocomplete.autocompletion)(),
          (0, import_language.foldGutter)(),
          (0, import_lint.lintGutter)(),
          (0, import_matchbrackets.matchBrackets)(),
          import_view.EditorView.lineWrapping,
          import_view.EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.onChangeCallback?.();
            }
            if (update.selectionSet) {
              const cursor = update.state.selection.main;
              if (this.elements.cursorInfo) {
                const line = update.state.doc.lineAt(cursor.from);
                this.elements.cursorInfo.textContent = `Line: ${line.number}, Col: ${cursor.from - line.from}`;
              }
            }
          })
        ]
      });
      this.codeEditor = new import_view.EditorView({
        state: startState,
        parent: this.elements.codeEditor.parentElement
      });
      this.elements.codeEditor.style.display = "none";
      this.applyLargeFileOptimizations();
      this.setupEditorEventHandlers();
      this.updateEditorLintAndAutocomplete();
      this.state.codeEditor = this.codeEditor;
      this.applySettings(this.currentSettings);
      return this.codeEditor;
    }
    applyLargeFileOptimizations() {
      if (!this.codeEditor)
        return;
      const lineCount = this.codeEditor.state.doc.lines;
      const charCount = this.codeEditor.state.doc.length;
      let nextTier = "normal";
      if (lineCount >= this.HUGE_FILE_LINE_COUNT || charCount >= this.HUGE_FILE_CHAR_COUNT) {
        nextTier = "huge";
      } else if (lineCount >= this.LARGE_FILE_LINE_COUNT || charCount >= this.LARGE_FILE_CHAR_COUNT) {
        nextTier = "large";
      }
      if (nextTier !== this.currentPerfTier) {
        this.applyPerformanceTier(nextTier);
      }
    }
    applyPerformanceTier(tier) {
      if (!this.codeEditor)
        return;
      this.currentPerfTier = tier;
      this.largeFileOptimized = tier !== "normal";
      this.updatePerfBadge(tier);
    }
    updatePerfBadge(tier) {
      try {
        const el = document.getElementById("perfTierBadge");
        if (!el)
          return;
        el.classList.remove("tier-large", "tier-huge");
        const lineCount = this.codeEditor?.state.doc.lines ?? 0;
        const charCount = this.codeEditor?.state.doc.length ?? 0;
        const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if (tier === "normal") {
          el.classList.add("hidden");
          el.textContent = "";
          el.title = "";
        } else if (tier === "large") {
          el.classList.remove("hidden");
          el.classList.add("tier-large");
          el.textContent = "Optimized: lint/minimap off";
          el.title = `Large file detected (lines: ${fmt(lineCount)}, chars: ${fmt(charCount)}). Disabled: linting, minimap, code folding, match brackets, trailing spaces, auto-close brackets. Polling slowed.`;
        } else if (tier === "huge") {
          el.classList.remove("hidden");
          el.classList.add("tier-huge");
          el.textContent = "Optimized: gutters/line# off";
          el.title = `Huge file detected (lines: ${fmt(lineCount)}, chars: ${fmt(charCount)}). Disabled: linting, minimap, code folding, match brackets, trailing spaces, auto-close brackets, gutters & line numbers. Polling greatly reduced.`;
        }
      } catch {
      }
    }
    getEditorKeybindings() {
      return import_view.keymap.of([
        ...import_commands.defaultKeymap,
        import_commands.indentWithTab,
        { key: "Ctrl-s", run: () => {
          this.onSaveCallback?.();
          return true;
        } },
        { key: "Cmd-s", run: () => {
          this.onSaveCallback?.();
          return true;
        } },
        { key: "Alt-f", run: () => {
          this.formatCode(true);
          return true;
        } },
        { key: "F11", run: (view) => {
          if (view.dom.requestFullscreen) {
            view.dom.requestFullscreen();
          }
          return true;
        } },
        { key: "Escape", run: (view) => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          return true;
        } }
      ]);
    }
    toggleMinimap(cm) {
    }
    loadSettings() {
      return new Promise((resolve) => {
        chrome.storage.local.get(["editorSettings"], (result) => {
          if (result.editorSettings) {
            this.currentSettings = { ...this.defaultSettings, ...result.editorSettings };
          } else {
            this.currentSettings = { ...this.defaultSettings };
          }
          resolve(this.currentSettings);
        });
      });
    }
    saveSettings(settings) {
      this.currentSettings = { ...this.currentSettings, ...settings };
      chrome.storage.local.set({ editorSettings: this.currentSettings });
      this.applySettings(settings);
    }
    applySettings(settings) {
      if (!this.codeEditor)
        return;
      const themeMap = {
        oneDark: import_theme_one_dark.oneDark,
        solarizedDark: import_codemirror_theme_solarized_dark.solarizedDark,
        solarizedLight: import_codemirror_theme_solarized_light.solarizedLight,
        dracula: import_codemirror_theme_dracula.dracula,
        materialDark: import_codemirror_theme_material_dark.materialDark,
        monokai: import_codemirror_theme_monokai.monokai
      };
      if (settings.theme && themeMap[settings.theme]) {
        this.codeEditor.dispatch({
          effects: this.theme.reconfigure(themeMap[settings.theme])
        });
      }
    }
    resetToDefaultSettings() {
      this.saveSettings({ ...this.defaultSettings });
      return { ...this.defaultSettings };
    }
    parseUserScriptHeader(content) {
      return parseUserScriptMetadata(content);
    }
    async handlePaste(event) {
      if (!this.onImportCallback)
        return;
      try {
        const clipboardData = event.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData("text/plain");
        if (pastedText.includes("==UserScript==") && pastedText.includes("==/UserScript==")) {
          const metadata = this.parseUserScriptHeader(pastedText);
          if (metadata) {
            event.preventDefault();
            const shouldImport = confirm("This looks like a UserScript. Would you like to import its metadata?");
            if (shouldImport) {
              this.onImportCallback({
                code: pastedText,
                ...metadata
              });
              return;
            }
          }
        }
      } catch (error) {
        console.error("Error handling paste:", error);
      }
    }
    setupEditorEventHandlers() {
      this.codeEditor.dom.addEventListener("paste", (event) => this.handlePaste(event));
    }
    getEnabledGmApis() {
      return Object.values(this.gmApiDefinitions).filter((api) => this.elements[api.el] && this.elements[api.el].checked).map((api) => api.name);
    }
    updateEditorLintAndAutocomplete() {
      if (!this.codeEditor)
        return;
      const enabledApiNames = this.getEnabledGmApis();
      const lintOptions = this.getLintOptions(
        this.state.lintingEnabled,
        enabledApiNames
      );
      this.codeEditor.dispatch({
        effects: this.lint.reconfigure((0, import_lint.linter)(lintOptions))
      });
    }
    getLintOptions(enable, enabledApiNames = []) {
      if (!enable)
        return () => [];
      const globals = {
        chrome: false,
        CodeMirror: false,
        GM: false
      };
      enabledApiNames.forEach((name) => {
        globals[name] = false;
      });
      return (view) => {
        (0, import_jshint.JSHINT)(view.state.doc.toString(), {
          esversion: 11,
          asi: true,
          browser: true,
          devel: true,
          undef: true,
          unused: true,
          curly: true,
          eqeqeq: true,
          laxbreak: true,
          loopfunc: true,
          sub: true,
          shadow: false,
          strict: true,
          globals
        });
        return import_jshint.JSHINT.errors.map((err) => ({
          from: view.state.doc.line(err.line).from + err.character - 1,
          to: view.state.doc.line(err.line).from + err.character,
          message: err.reason,
          severity: err.code?.startsWith("E") ? "error" : "warning"
        }));
      };
    }
    toggleLinting(enabled) {
      this.state.lintingEnabled = enabled;
      this.updateEditorLintAndAutocomplete();
      localStorage.setItem("lintingEnabled", this.state.lintingEnabled);
      return this.state.lintingEnabled;
    }
    async formatCode(showMessage = true, onFormatComplete) {
      try {
        if (!this.codeEditor) {
          throw new Error("Code editor not initialized");
        }
        const unformattedCode = this.getValue();
        const formattedCode = (0, import_js_beautify.js_beautify)(unformattedCode, {
          indent_size: 2,
          space_in_empty_paren: true
        });
        this.setValue(formattedCode);
        if (showMessage && this.onStatusCallback) {
          this.onStatusCallback("Code formatted", "success");
          setTimeout(
            () => this.onStatusCallback(null),
            this.config.STATUS_TIMEOUT
          );
        }
        if (typeof onFormatComplete === "function") {
          await onFormatComplete();
        }
      } catch (error) {
        console.error("Error formatting code:", error);
        if (showMessage && this.onStatusCallback) {
          this.onStatusCallback("Could not format code", "error");
        }
        return false;
      }
    }
    insertTemplateCode(template) {
      const wrappedCode = `(function() {
    'use strict';
    
  ${template}
  
  })();`;
      this.setValue(wrappedCode);
      this.formatCode(false);
    }
    insertDefaultTemplate() {
      const defaultCode = `(function() {
    'use strict';
    
    // Your code here...
    console.log('CodeTweak: Custom script is running!');
  
  })();`;
      this.setValue(defaultCode);
      this.formatCode(false);
    }
    getValue() {
      return this.codeEditor ? this.codeEditor.state.doc.toString() : "";
    }
    setValue(code) {
      if (this.codeEditor) {
        this.codeEditor.dispatch({
          changes: { from: 0, to: this.codeEditor.state.doc.length, insert: code }
        });
        this.applyLargeFileOptimizations();
      }
    }
    focus() {
      if (this.codeEditor) {
        this.codeEditor.focus();
      }
    }
    setSaveCallback(callback) {
      this.onSaveCallback = callback;
    }
    setChangeCallback(callback) {
      this.onChangeCallback = callback;
    }
    setImportCallback(callback) {
      this.onImportCallback = callback;
    }
    setStatusCallback(callback) {
      this.onStatusCallback = callback;
    }
    getEditor() {
      return this.codeEditor;
    }
  };

  // src/editor/editor.js
  var ScriptEditor = class {
    constructor() {
      this.config = {
        RUN_MODES: {
          DOCUMENT_START: "document_start",
          DOCUMENT_END: "document_end",
          DOCUMENT_IDLE: "document_idle"
        },
        DEFAULT_VERSION: "1.0.0",
        SIDEBAR_BREAKPOINT: 900,
        AUTOSAVE_DELAY: 1220,
        STATUS_TIMEOUT: 2e3
      };
      this.state = {
        isEditMode: false,
        scriptId: null,
        hasUnsavedChanges: false,
        isSidebarVisible: window.innerWidth > this.config.SIDEBAR_BREAKPOINT,
        lintingEnabled: localStorage.getItem("lintingEnabled") === "true",
        isAutosaveEnabled: localStorage.getItem("autosaveEnabled") === "true",
        autosaveTimeout: null,
        headerSyncTimeout: null,
        sidebarSyncTimeout: null,
        isUpdatingFromSidebar: false,
        hasUserInteraction: false,
        codeEditor: null
      };
      this.elements = this.cacheElements();
      this.ui = new UIManager(this.elements, this.state, this.config);
      this.storage = new StorageManager();
      this.validator = new FormValidator(this.elements);
      this.gmApiDefinitions = {
        GM_setValue: {
          signature: "declare function GM_setValue(name: string, value: any): Promise<void>;",
          name: "GM_setValue",
          el: "gmSetValue"
        },
        GM_getValue: {
          signature: "declare function GM_getValue(name: string, defaultValue?: any): Promise<any>;",
          name: "GM_getValue",
          el: "gmGetValue"
        },
        GM_deleteValue: {
          signature: "declare function GM_deleteValue(name: string): Promise<void>;",
          name: "GM_deleteValue",
          el: "gmDeleteValue"
        },
        GM_listValues: {
          signature: "declare function GM_listValues(): Promise<string[]>;",
          name: "GM_listValues",
          el: "gmListValues"
        },
        GM_openInTab: {
          signature: "declare function GM_openInTab(url: string, options?: { active?: boolean, insert?: boolean, setParent?: boolean } | boolean): void;",
          name: "GM_openInTab",
          el: "gmOpenInTab"
        },
        GM_notification: {
          signature: "declare function GM_notification(details: { text?: string, title?: string, image?: string, highlight?: boolean, silent?: boolean, timeout?: number, ondone?: Function, onclick?: Function } | string, ondone?: Function): void;",
          name: "GM_notification",
          el: "gmNotification"
        },
        GM_getResourceText: {
          signature: "declare function GM_getResourceText(name: string): string;",
          name: "GM_getResourceText",
          el: "gmGetResourceText"
        },
        GM_getResourceURL: {
          signature: "declare function GM_getResourceURL(name: string): string;",
          name: "GM_getResourceURL",
          el: "gmGetResourceURL"
        },
        GM_setClipboard: {
          signature: "declare function GM_setClipboard(data: string, type?: string): Promise<void>;",
          name: "GM_setClipboard",
          el: "gmSetClipboard"
        },
        GM_addStyle: {
          signature: "declare function GM_addStyle(css: string): void;",
          name: "GM_addStyle",
          el: "gmAddStyle"
        },
        GM_addElement: {
          signature: "declare function GM_addElement(parent: Node, tag: string, attributes?: { [key: string]: string }): Node;",
          name: "GM_addElement",
          el: "gmAddElement"
        },
        GM_registerMenuCommand: {
          signature: "declare function GM_registerMenuCommand(caption: string, onClick: () => any, accessKey?: string): string;",
          name: "GM_registerMenuCommand",
          el: "gmRegisterMenuCommand"
        },
        GM_xmlhttpRequest: {
          signature: "declare function GM_xmlhttpRequest(details: { method: string, url: string, data?: any, headers?: any, timeout?: number, responseType?: string, onload?: Function, onerror?: Function, onprogress?: Function }): void;",
          name: "GM_xmlhttpRequest",
          el: "gmXmlhttpRequest"
        }
      };
      this.codeEditorManager = new CodeEditorManager(
        this.elements,
        this.state,
        this.config,
        this.gmApiDefinitions
      );
    }
    _debouncedSave() {
      if (this.state.autosaveTimeout) {
        clearTimeout(this.state.autosaveTimeout);
      }
      this.state.autosaveTimeout = setTimeout(async () => {
        if (this.state.hasUnsavedChanges) {
          if (this.state.isEditMode) {
            try {
              await this.saveScript(true);
            } catch (error) {
              console.error("Autosave failed:", error);
              if (this.ui && this.ui.showStatusMessage) {
                this.ui.showStatusMessage("Autosave failed", "error");
              }
            }
          }
        }
      }, this.config.AUTOSAVE_DELAY);
    }
    _debouncedHeaderSync() {
      if (this.state.headerSyncTimeout) {
        clearTimeout(this.state.headerSyncTimeout);
      }
      this.state.headerSyncTimeout = setTimeout(() => {
        if (!this.state.isUpdatingFromSidebar) {
          this.syncHeaderToSidebar();
        }
      }, 500);
    }
    _debouncedSidebarSync() {
      if (this.state.sidebarSyncTimeout) {
        clearTimeout(this.state.sidebarSyncTimeout);
      }
      this.state.sidebarSyncTimeout = setTimeout(() => {
        this.syncSidebarToHeader();
      }, 500);
    }
    syncHeaderToSidebar() {
      try {
        const currentCode = this.codeEditorManager.getValue();
        const headerMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
        if (!headerMatch)
          return;
        const metadata = parseUserScriptMetadata(headerMatch[0]);
        if (metadata.name)
          this.elements.scriptName.value = metadata.name;
        if (metadata.author)
          this.elements.scriptAuthor.value = metadata.author;
        if (metadata.version)
          this.elements.scriptVersion.value = metadata.version;
        if (metadata.description)
          this.elements.scriptDescription.value = metadata.description;
        if (metadata.license)
          this.elements.scriptLicense.value = metadata.license;
        if (metadata.icon)
          this.elements.scriptIcon.value = metadata.icon;
        if (metadata.runAt)
          this.elements.runAt.value = metadata.runAt.replace(/-/g, "_");
        if (this.elements.urlList) {
          this.elements.urlList.innerHTML = "";
        }
        if (Array.isArray(metadata.matches) && metadata.matches.length > 0) {
          metadata.matches.forEach((match) => {
            this.ui.addUrlToList(match);
          });
        }
        if (this.gmApiDefinitions) {
          Object.values(this.gmApiDefinitions).forEach((def) => {
            const el = this.elements[def.el];
            if (el)
              el.checked = false;
          });
        }
        if (metadata.gmApis) {
          Object.keys(metadata.gmApis).forEach((apiFlag) => {
            const element = this.elements[apiFlag];
            if (element) {
              element.checked = !!metadata.gmApis[apiFlag];
            }
          });
        }
        this.updateApiCount();
        this.toggleResourcesSection(
          this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked
        );
        this.toggleRequiredScriptsSection();
        if (this.elements.resourceList) {
          this.elements.resourceList.innerHTML = "";
        }
        if (Array.isArray(metadata.resources) && metadata.resources.length > 0) {
          metadata.resources.forEach((resource) => {
            this.ui.addResourceToList(resource.name, resource.url);
          });
        }
        if (this.elements.requireList) {
          this.elements.requireList.innerHTML = "";
        }
        if (Array.isArray(metadata.requires) && metadata.requires.length > 0) {
          metadata.requires.forEach((url) => this.ui.addRequireToList(url));
        }
      } catch {
      }
    }
    syncSidebarToHeader() {
      try {
        const currentCode = this.codeEditorManager.getValue();
        const headerMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
        const scriptData = this.gatherScriptData();
        const newMetadata = buildTampermonkeyMetadata(scriptData);
        let newCode;
        if (headerMatch) {
          newCode = currentCode.replace(headerMatch[0], newMetadata);
        } else {
          newCode = newMetadata + "\n\n" + currentCode;
        }
        if (newCode !== currentCode) {
          this.state.isUpdatingFromSidebar = true;
          this.codeEditorManager.setValue(newCode);
          setTimeout(() => {
            this.state.isUpdatingFromSidebar = false;
          }, 100);
        }
      } catch {
      }
    }
    markAsDirty() {
      if (this.state.hasUnsavedChanges && !this.state.isEditMode)
        return;
      this.state.hasUnsavedChanges = true;
      this.ui.updateScriptStatus(true);
    }
    cacheElements() {
      const elementIds = [
        "pageTitle",
        "settingsBtn",
        "closeSettings",
        "scriptName",
        "scriptAuthor",
        "scriptLicense",
        "scriptIcon",
        "targetUrl",
        "runAt",
        "scriptVersion",
        "scriptDescription",
        "saveBtn",
        "waitForSelector",
        "statusMessage",
        "formatBtn",
        "lintBtn",
        "lintBtnText",
        "cursorInfo",
        "scriptStatusBadge",
        "autosaveBtn",
        "autosaveBtnText",
        "codeEditor",
        "minimap",
        "gmSetValue",
        "gmGetValue",
        "gmDeleteValue",
        "gmListValues",
        "gmOpenInTab",
        "gmNotification",
        "gmGetResourceText",
        "gmGetResourceURL",
        "gmAddStyle",
        "gmAddElement",
        "gmRegisterMenuCommand",
        "gmSetClipboard",
        "gmXmlhttpRequest",
        "apiSearch",
        "apiCountBadge",
        "addUrlBtn",
        "urlList",
        "targetUrl",
        "patternBaseUrl",
        "patternScope",
        "generatePatternBtn",
        "generatedPattern",
        "generatedPatternGroup",
        "insertPatternBtn",
        "addResourceBtn",
        "resourceName",
        "resourceURL",
        "resourceList",
        "addRequireBtn",
        "requireURL",
        "requireList",
        "helpButton",
        "generateHeaderBtn"
      ];
      const elements = {};
      elementIds.forEach((id) => {
        elements[id] = document.getElementById(id);
      });
      elements.sidebar = document.querySelector(".sidebar");
      elements.sidebarIconBar = document.querySelector(".sidebar-icon-bar");
      elements.sidebarContentArea = document.querySelector(".sidebar-content-area");
      elements.sidebarIconBtns = document.querySelectorAll(".sidebar-icon-btn");
      elements.sidebarPanels = document.querySelectorAll(".sidebar-panel");
      elements.sectionToggles = document.querySelectorAll(".section-toggle");
      elements.mainContent = document.querySelector(".main-content");
      elements.settingsModal = document.getElementById("settingsModal");
      elements.requiresSection = document.getElementById("requiresSection");
      elements.status = null;
      return elements;
    }
    async init() {
      try {
        this.setDefaultValues();
        this.state.isAutosaveEnabled = localStorage.getItem("autosaveEnabled") !== "false";
        this.state.lintingEnabled = localStorage.getItem("lintingEnabled") !== "false";
        await this.codeEditorManager.initializeCodeEditor();
        this.codeEditorManager.toggleLinting(this.state.lintingEnabled);
        this.codeEditorManager.setSaveCallback(() => this.saveScript());
        this.codeEditorManager.setChangeCallback(() => {
          this.markAsDirty();
          if (this.state.isAutosaveEnabled) {
            this._debouncedSave();
          }
          this._debouncedHeaderSync();
        });
        this.codeEditorManager.setImportCallback((importData) => this.handleScriptImport(importData));
        this.codeEditorManager.setStatusCallback((message, type) => {
          if (message) {
            this.ui.showStatusMessage(message, type);
          } else {
            this.ui.clearStatusMessage();
          }
        });
        this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
        await this.parseUrlParams();
        this.setupEditorMode();
        this.ui.initializeCollapsibleSections();
        this.ui.updateSidebarState();
        this.registerEventListeners();
        if (this.ui && typeof this.ui.on === "function") {
          this.ui.on("saveRequested", async () => {
            await this.saveScript();
            this.ui.showStatusMessage("Script saved!", "success", 2e3);
          });
        }
        this.setupBackgroundConnection();
        this.codeEditorManager.updateEditorLintAndAutocomplete();
        setTimeout(() => this.codeEditorManager.focus(), 100);
      } catch (error) {
        console.error("Failed to initialize editor:", error);
        this.ui.showStatusMessage("Failed to initialize editor", "error");
      }
    }
    setDefaultValues() {
      if (!this.elements.scriptVersion.value) {
        this.elements.scriptVersion.value = this.config.DEFAULT_VERSION;
      }
    }
    async parseUrlParams() {
      const urlParams = new URLSearchParams(window.location.search);
      this.state.scriptId = urlParams.get("id");
      const initialTargetUrl = urlParams.get("targetUrl");
      const template = urlParams.get("template");
      const importId = urlParams.get("importId");
      this.state.isEditMode = Boolean(this.state.scriptId);
      if (initialTargetUrl && this.elements.targetUrl) {
        const decodedUrl = decodeURIComponent(initialTargetUrl);
        this.elements.targetUrl.value = decodedUrl;
        this.ui.addUrlToList(decodedUrl);
      }
      if (template) {
        const decodedTemplate = decodeURIComponent(template);
        this.codeEditorManager.insertTemplateCode(decodedTemplate);
      } else if (!this.state.isEditMode && !this.codeEditorManager.getValue()) {
        this.codeEditorManager.insertDefaultTemplate();
      }
      if (importId) {
        await this.loadImportedScript(importId);
      }
    }
    handleScriptImport(importData) {
      try {
        const { code, ...metadata } = importData;
        const scriptData = { code };
        if (metadata.name)
          scriptData.name = metadata.name;
        if (metadata.version)
          scriptData.version = metadata.version;
        if (metadata.description)
          scriptData.description = metadata.description;
        if (metadata.author)
          scriptData.author = metadata.author;
        if (metadata.namespace)
          scriptData.namespace = metadata.namespace;
        if (metadata.runAt)
          scriptData.runAt = metadata.runAt;
        if (metadata.license)
          scriptData.license = metadata.license;
        if (metadata.icon)
          scriptData.icon = metadata.icon;
        if (metadata.matches?.length) {
          scriptData.targetUrls = [...new Set(metadata.matches)];
        }
        if (metadata.requires?.length) {
          scriptData.requires = metadata.requires;
        }
        if (metadata.resources?.length) {
          scriptData.resources = metadata.resources;
        }
        if (metadata.gmApis) {
          Object.entries(metadata.gmApis).forEach(([api, enabled]) => {
            if (enabled && this.elements[api]) {
              scriptData[api] = true;
            }
          });
        }
        this.populateFormWithScript(scriptData);
        this.codeEditorManager.setValue(code);
        this.ui.showStatusMessage("Script metadata imported successfully", "success");
      } catch (error) {
        console.error("Error handling script import:", error);
        this.ui.showStatusMessage("Failed to import script metadata", "error");
      }
    }
    async loadImportedScript(importId) {
      try {
        const key = `tempImport_${importId}`;
        const data = await chrome.storage.local.get(key);
        const importData = data[key];
        if (!importData)
          return;
        const { code } = importData;
        const metadata = parseUserScriptMetadata(code);
        this.handleScriptImport({ code, ...metadata });
        this.state.hasUnsavedChanges = true;
        this.ui.updateScriptStatus(true);
        await chrome.storage.local.remove(key);
      } catch (err) {
        console.error("Error loading imported script:", err);
        this.ui.showStatusMessage("Failed to load imported script", "error");
      }
    }
    // edit vs create
    async setupEditorMode() {
      if (this.state.isEditMode) {
        await this.loadScript(this.state.scriptId);
      } else if (!this.codeEditorManager.getValue()) {
        this.codeEditorManager.insertDefaultTemplate();
      }
      this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
    }
    toggleResourcesSection(show) {
      const resourcesSection = document.getElementById("resourcesSection");
      if (resourcesSection) {
        if (show) {
          resourcesSection.classList.remove("hidden");
        } else {
          const hasResources = this.elements.resourceList?.children.length > 0;
          if (!this.elements.gmGetResourceText.checked && !this.elements.gmGetResourceURL.checked && !hasResources) {
            resourcesSection.classList.add("hidden");
          }
        }
      }
    }
    toggleRequiredScriptsSection() {
      const requiresSection = this.elements.requiresSection;
      if (!requiresSection)
        return;
      const requiredScriptsVisible = this.elements.gmGetResourceURL?.checked || false;
      if (requiredScriptsVisible) {
        requiresSection.classList.remove("hidden");
      } else {
        requiresSection.classList.add("hidden");
      }
    }
    setupResourceApiListeners() {
      const resourceCheckboxes = [this.elements.gmGetResourceText, this.elements.gmGetResourceURL];
      resourceCheckboxes.forEach((checkbox) => {
        if (checkbox) {
          checkbox.addEventListener("change", () => {
            const shouldShow = this.elements.gmGetResourceText.checked || this.elements.gmGetResourceURL.checked;
            this.toggleResourcesSection(shouldShow);
            if (!this.elements.gmGetResourceText.checked && !this.elements.gmGetResourceURL.checked && this.elements.resourceList) {
              this.elements.resourceList.innerHTML = "";
            }
          });
        }
      });
      if (this.elements.gmGetResourceURL) {
        this.elements.gmGetResourceURL.addEventListener("change", () => {
          this.toggleRequiredScriptsSection();
        });
      }
    }
    registerEventListeners() {
      this.ui.on("sidebarChanged", () => {
        this.markAsUnsaved();
      });
      this.setupSidebarIconHandlers();
      this.elements.saveBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.saveScript();
      });
      this.elements.generateHeaderBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.generateTampermonkeyHeader();
      });
      const callbacks = {
        saveScript: () => this.saveScript(),
        formatCode: async () => {
          await this.codeEditorManager.formatCode(true, async () => {
            await this.saveScript(true);
          });
        },
        exportScript: () => this.exportScript(),
        loadSettings: () => this.codeEditorManager.loadSettings(),
        saveSettings: (settings) => {
          this.codeEditorManager.saveSettings(settings);
          this.codeEditorManager.applySettings(settings);
        },
        markAsDirty: () => this.markAsDirty(),
        markAsUnsaved: () => this.markAsUnsaved(),
        debouncedSave: () => this._debouncedSave()
      };
      this.ui.setupSettingsModal(callbacks);
      this.ui.setupUrlManagement({
        markAsUnsaved: () => {
          this.markAsUnsaved();
          this._debouncedSidebarSync();
        }
      });
      this.ui.setupResourceManagement({
        ...callbacks,
        markAsUnsaved: () => {
          this.markAsUnsaved();
          this._debouncedSidebarSync();
        }
      });
      const handleChange = () => {
        this.markAsDirty();
        if (this.state.isAutosaveEnabled) {
          this._debouncedSave();
        }
        this._debouncedSidebarSync();
      };
      const formInputs = [
        this.elements.scriptName,
        this.elements.scriptAuthor,
        this.elements.scriptLicense,
        this.elements.scriptIcon,
        this.elements.scriptVersion,
        this.elements.scriptDescription,
        this.elements.runAt,
        this.elements.targetUrl
      ];
      formInputs.forEach((input) => {
        if (input) {
          input.addEventListener("change", handleChange);
          input.addEventListener("input", handleChange);
        }
      });
      Object.values(this.gmApiDefinitions).forEach((api) => {
        const element = this.elements[api.el];
        if (element) {
          element.addEventListener("change", () => {
            handleChange();
            this.updateApiCount();
          });
        }
      });
      this.setupResourceApiListeners();
      if (this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked) {
        this.toggleResourcesSection(true);
      }
      if (this.elements.apiSearch) {
        this.elements.apiSearch.addEventListener("input", () => {
          const query = this.elements.apiSearch.value.toLowerCase();
          const checkboxes = this.elements.sidebar.querySelectorAll(".api-list .form-group-checkbox");
          checkboxes.forEach((cb) => {
            const label = cb.querySelector("label").textContent.toLowerCase();
            const shouldShow = label.includes(query);
            cb.style.display = shouldShow ? "flex" : "none";
          });
        });
      }
    }
    setupSidebarIconHandlers() {
      const sidebarIconBtns = this.elements.sidebarIconBtns;
      if (!sidebarIconBtns)
        return;
      this.elements.sidebar.classList.remove("expanded", "has-active-panel");
      sidebarIconBtns.forEach((btn) => btn.classList.remove("active"));
      this.elements.sidebarPanels.forEach((panel) => panel.classList.remove("active"));
      this.elements.sidebarContentArea.style.display = "none";
      sidebarIconBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const section = btn.getAttribute("data-section");
          if (!section)
            return;
          const panel = document.getElementById(`${section}-panel`);
          if (!panel)
            return;
          const isCurrentlyActive = btn.classList.contains("active");
          if (isCurrentlyActive) {
            this.elements.sidebar.classList.remove("expanded", "has-active-panel");
            btn.classList.remove("active");
            panel.classList.remove("active");
            this.elements.sidebarContentArea.style.display = "none";
            this.elements.sidebarContentArea.style.width = "0";
          } else {
            this.elements.sidebar.classList.add("has-active-panel", "expanded");
            sidebarIconBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            this.elements.sidebarPanels.forEach((p) => p.classList.remove("active"));
            panel.classList.add("active");
            this.elements.sidebarContentArea.style.display = "flex";
            this.elements.sidebarContentArea.style.width = "280px";
          }
        });
      });
    }
    markAsUnsaved() {
      this.state.hasUnsavedChanges = true;
      this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
    }
    async loadScript(id) {
      try {
        const script = await this.storage.getScript(id);
        if (!script) {
          this.ui.showStatusMessage("Script not found.", "error");
          return;
        }
        this.populateFormWithScript(script);
        this.state.hasUnsavedChanges = false;
        this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
        this.codeEditorManager.updateEditorLintAndAutocomplete();
      } catch (error) {
        console.error("Error loading script:", error);
        this.ui.showStatusMessage(
          `Failed to load script: ${error.message}`,
          "error"
        );
      }
    }
    populateFormWithScript(script) {
      this.elements.scriptName.value = script.name || "";
      this.elements.scriptAuthor.value = script.author || "";
      this.elements.runAt.value = script.runAt || "document_idle";
      this.elements.scriptVersion.value = script.version || this.config.DEFAULT_VERSION;
      this.elements.scriptDescription.value = script.description || "";
      this.elements.scriptLicense.value = script.license || "";
      this.elements.scriptIcon.value = script.icon || "";
      this.codeEditorManager.setValue(script.code || "");
      if (this.elements.urlList) {
        this.elements.urlList.innerHTML = "";
      }
      script.targetUrls?.forEach((url) => this.ui.addUrlToList(url));
      if (this.elements.gmSetValue)
        this.elements.gmSetValue.checked = !!script.gmSetValue;
      if (this.elements.gmGetValue)
        this.elements.gmGetValue.checked = !!script.gmGetValue;
      if (this.elements.gmDeleteValue)
        this.elements.gmDeleteValue.checked = !!script.gmDeleteValue;
      if (this.elements.gmListValues)
        this.elements.gmListValues.checked = !!script.gmListValues;
      if (this.elements.gmOpenInTab)
        this.elements.gmOpenInTab.checked = !!script.gmOpenInTab;
      if (this.elements.gmNotification)
        this.elements.gmNotification.checked = !!script.gmNotification;
      if (this.elements.gmGetResourceText)
        this.elements.gmGetResourceText.checked = !!script.gmGetResourceText;
      if (this.elements.gmGetResourceURL)
        this.elements.gmGetResourceURL.checked = !!script.gmGetResourceURL;
      if (this.elements.gmSetClipboard)
        this.elements.gmSetClipboard.checked = !!script.gmSetClipboard;
      if (this.elements.gmAddStyle)
        this.elements.gmAddStyle.checked = !!script.gmAddStyle;
      if (this.elements.gmAddElement)
        this.elements.gmAddElement.checked = !!script.gmAddElement;
      if (this.elements.gmRegisterMenuCommand)
        this.elements.gmRegisterMenuCommand.checked = !!script.gmRegisterMenuCommand;
      if (this.elements.gmXmlhttpRequest)
        this.elements.gmXmlhttpRequest.checked = !!script.gmXmlhttpRequest;
      if (script.gmGetResourceText || script.gmGetResourceURL) {
        this.toggleResourcesSection(true);
      }
      if (this.elements.resourceList && script.resources && Array.isArray(script.resources)) {
        this.elements.resourceList.innerHTML = "";
        script.resources.forEach(
          (res) => this.ui.addResourceToList(res.name, res.url)
        );
      } else if (this.elements.resourceList) {
        this.elements.resourceList.innerHTML = "";
      }
      if (this.elements.requireList && Array.isArray(script.requires)) {
        this.elements.requireList.innerHTML = "";
        script.requires.forEach((url) => this.ui.addRequireToList(url));
      } else if (this.elements.requireList) {
        this.elements.requireList.innerHTML = "";
      }
    }
    // get script data from our sidebar form
    gatherScriptData() {
      const urlList = Array.from(document.querySelectorAll(".url-item")).map(
        (item) => item.dataset.url
      );
      const currentUrl = this.elements.targetUrl.value.trim();
      if (currentUrl && !urlList.includes(currentUrl)) {
        urlList.push(currentUrl);
      }
      const scriptData = {
        name: this.elements.scriptName.value.trim(),
        author: this.elements.scriptAuthor.value.trim() || "Anonymous",
        targetUrls: urlList,
        runAt: this.elements.runAt.value,
        version: this.elements.scriptVersion.value.trim() || this.config.DEFAULT_VERSION,
        description: this.elements.scriptDescription.value.trim(),
        license: this.elements.scriptLicense?.value.trim() || "",
        icon: this.elements.scriptIcon?.value.trim() || "",
        code: this.codeEditorManager.getValue(),
        enabled: true,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      scriptData.gmSetValue = this.elements.gmSetValue?.checked || false;
      scriptData.gmGetValue = this.elements.gmGetValue?.checked || false;
      scriptData.gmDeleteValue = this.elements.gmDeleteValue?.checked || false;
      scriptData.gmListValues = this.elements.gmListValues?.checked || false;
      scriptData.gmOpenInTab = this.elements.gmOpenInTab?.checked || false;
      scriptData.gmNotification = this.elements.gmNotification?.checked || false;
      scriptData.gmGetResourceText = this.elements.gmGetResourceText?.checked || false;
      scriptData.gmGetResourceURL = this.elements.gmGetResourceURL?.checked || false;
      scriptData.gmSetClipboard = this.elements.gmSetClipboard?.checked || false;
      scriptData.gmAddStyle = this.elements.gmAddStyle?.checked || false;
      scriptData.gmAddElement = this.elements.gmAddElement?.checked || false;
      scriptData.gmRegisterMenuCommand = this.elements.gmRegisterMenuCommand?.checked || false;
      scriptData.gmXmlhttpRequest = this.elements.gmXmlhttpRequest?.checked || false;
      scriptData.resources = [];
      if (this.elements.resourceList) {
        const items = Array.from(
          this.elements.resourceList.querySelectorAll(".resource-item")
        );
        items.forEach((item) => {
          scriptData.resources.push({
            name: item.dataset.name,
            url: item.dataset.url
          });
        });
      }
      scriptData.requires = [];
      if (this.elements.requireList) {
        const reqItems = Array.from(
          this.elements.requireList.querySelectorAll(".require-item")
        );
        reqItems.forEach((item) => {
          scriptData.requires.push(item.dataset.url);
        });
      }
      return scriptData;
    }
    // Save script to storage
    async saveScript(quiet = false) {
      try {
        if (!this.validator.validateForm())
          return null;
        const scriptData = this.gatherScriptData();
        if (!scriptData.name || scriptData.name.trim() === "") {
          scriptData.name = `Untitled Script ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
        }
        const isNewScript = !this.state.scriptId;
        if (!this.state.hasUnsavedChanges && !isNewScript) {
          return null;
        }
        if (scriptData.resources && scriptData.resources.length > 0) {
          scriptData.resourceContents = {};
          await Promise.all(
            scriptData.resources.map(async (resource) => {
              try {
                const response = await fetch(resource.url);
                if (response.ok) {
                  scriptData.resourceContents[resource.name] = await response.text();
                } else {
                  console.error(
                    `Failed to fetch resource '${resource.name}' from ${resource.url}: ${response.status} ${response.statusText}`
                  );
                  scriptData.resourceContents[resource.name] = null;
                }
              } catch (error) {
                console.error(
                  `Error fetching resource '${resource.name}':`,
                  error
                );
                scriptData.resourceContents[resource.name] = null;
              }
            })
          );
        }
        const savedScript = await this.storage.saveScript(
          scriptData,
          this.state.scriptId,
          this.state.isEditMode
        );
        this.state.scriptId = savedScript.id;
        this.state.hasUnsavedChanges = false;
        this.ui.updateScriptStatus(false);
        if (isNewScript) {
          const newUrl = new URL(window.location);
          newUrl.searchParams.set("id", savedScript.id);
          window.history.pushState({}, "", newUrl);
          this.state.isEditMode = true;
        }
        this.notifyBackgroundScript();
        if (!quiet) {
          this.ui.showStatusMessage(
            `Script ${isNewScript ? "created" : "saved"} successfully`,
            "success"
          );
          setTimeout(() => {
            if (!this.state.hasUnsavedChanges) {
              this.ui.clearStatusMessage();
            }
          }, 3e3);
        }
        return savedScript;
      } catch (error) {
        console.error("Error saving script:", error);
        const errorMessage = error.message || "Unknown error occurred";
        this.ui.showStatusMessage(
          `Failed to save script: ${errorMessage}`,
          "error"
        );
        setTimeout(() => {
          if (this.state.hasUnsavedChanges) {
            this.ui.showStatusMessage("Unsaved changes", "warning");
          } else {
            this.ui.clearStatusMessage();
          }
        }, 5e3);
        throw error;
      }
    }
    updateEditorStateAfterSave(savedScript) {
      if (!this.state.isEditMode) {
        this.state.isEditMode = true;
        this.state.scriptId = savedScript.id;
        window.history.replaceState({}, "", `editor.html?id=${savedScript.id}`);
      }
    }
    // Notif background for script update changes
    async notifyBackgroundScript() {
      try {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "scriptsUpdated" }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Background sync warning:", chrome.runtime.lastError);
            }
            resolve();
          });
        });
      } catch (error) {
        console.warn("Background sync warning:", error);
      }
    }
    // Connect to backround.js
    setupBackgroundConnection() {
      try {
        const port = chrome.runtime.connect({ name: "CodeTweak" });
        port.onDisconnect.addListener(() => {
          console.log("Background connection closed, will reconnect when needed");
        });
      } catch (error) {
        console.warn("Initial background connection failed:", error);
      }
    }
    updateApiCount() {
      const apiCheckboxes = Object.values(this.gmApiDefinitions).map((api) => this.elements[api.el]);
      const checkedCount = apiCheckboxes.filter((checkbox) => checkbox && checkbox.checked).length;
      if (this.elements.apiCountBadge) {
        this.elements.apiCountBadge.textContent = checkedCount;
        this.elements.apiCountBadge.style.display = checkedCount > 0 ? "inline" : "none";
      }
    }
    /**
     * Export current script in classic Tampermonkey format (.user.js)
     */
    exportScript() {
      try {
        const scriptData = this.gatherScriptData();
        const metadata = buildTampermonkeyMetadata(scriptData);
        const content = `${metadata}

${scriptData.code}`;
        const fileNameSafe = (scriptData.name || "script").replace(/[^a-z0-9_-]+/gi, "_").replace(/_{2,}/g, "_").replace(/^_|_$/g, "") || "script";
        const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileNameSafe}.user.js`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.ui.showStatusMessage("Script exported", "success");
      } catch (err) {
        console.error("Export failed:", err);
        this.ui.showStatusMessage("Export failed", "error");
      }
    }
    /**
     * Generate Tampermonkey-style header and insert at top of code editor
     */
    generateTampermonkeyHeader() {
      try {
        const scriptData = this.gatherScriptData();
        const metadata = buildTampermonkeyMetadata(scriptData);
        const currentCode = this.codeEditorManager.getValue();
        const existingHeaderMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
        let newCode;
        if (existingHeaderMatch) {
          newCode = currentCode.replace(existingHeaderMatch[0], metadata);
          this.ui.showStatusMessage("Metadata updated", "success");
        } else {
          newCode = metadata + "\n\n" + currentCode;
          this.ui.showStatusMessage("Metadata generated", "success");
        }
        this.codeEditorManager.setValue(newCode);
        this.markAsDirty();
      } catch (err) {
        console.error("Generate header failed:", err);
        this.ui.showStatusMessage("Failed to generate header", "error");
      }
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    applyThemeFromSettings().then(() => {
      const editor = new ScriptEditor();
      editor.init().catch((error) => {
        console.error("Failed to initialize script editor:", error);
      });
    });
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "settingsUpdated") {
        applyThemeFromSettings();
      }
    });
  });
  async function applyThemeFromSettings() {
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const isDark = settings.darkMode !== false;
      document.body.classList.toggle("light-theme", !isDark);
    } catch (err) {
      console.error("Error applying theme:", err);
    }
  }
  function setupHelpModalTabs() {
    const tabButtons = document.querySelectorAll(".help-tab");
    const tabContents = document.querySelectorAll(".help-tab-content");
    if (!tabButtons.length || !tabContents.length)
      return;
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", function() {
        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.getAttribute("data-tab");
        const content = document.getElementById("help-tab-" + tab);
        if (content)
          content.classList.add("active");
      });
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    setupHelpModalTabs();
  });
})();
