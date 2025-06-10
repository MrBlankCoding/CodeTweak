class ScriptEditor {
  constructor() {
    this.config = {
      RUN_MODES: {
        DOCUMENT_START: "document_start",
        DOCUMENT_END: "document_end",
        DOCUMENT_IDLE: "document_idle",
      },
      DEFAULT_VERSION: "1.0.0",
      SIDEBAR_BREAKPOINT: 900,
      AUTOSAVE_DELAY: 1220,
      STATUS_TIMEOUT: 2000,
    };

    this.state = {
      isEditMode: false,
      scriptId: null,
      hasUnsavedChanges: false,
      isSidebarVisible: window.innerWidth > this.config.SIDEBAR_BREAKPOINT,
      lintingEnabled: localStorage.getItem("lintingEnabled") === "true",
      isAutosaveEnabled: localStorage.getItem("autosaveEnabled") === "true",
      autosaveTimeout: null,
      hasUserInteraction: false,
      codeEditor: null,
    };

    this.elements = this.cacheElements();
    this.ui = new UIManager(this.elements, this.state, this.config);
    this.storage = new StorageManager();
    this.validator = new FormValidator(this.elements);
    this.gmApiDefinitions = {
      GM_setValue: {
        signature:
          "declare function GM_setValue(name: string, value: any): Promise<void>;",
        name: "GM_setValue",
        el: "gmSetValue",
      },
      GM_getValue: {
        signature:
          "declare function GM_getValue(name: string, defaultValue?: any): Promise<any>;",
        name: "GM_getValue",
        el: "gmGetValue",
      },
      GM_deleteValue: {
        signature:
          "declare function GM_deleteValue(name: string): Promise<void>;",
        name: "GM_deleteValue",
        el: "gmDeleteValue",
      },
      GM_listValues: {
        signature: "declare function GM_listValues(): Promise<string[]>;",
        name: "GM_listValues",
        el: "gmListValues",
      },
      GM_openInTab: {
        signature:
          "declare function GM_openInTab(url: string, options?: { active?: boolean, insert?: boolean, setParent?: boolean } | boolean): void;",
        name: "GM_openInTab",
        el: "gmOpenInTab",
      },
      GM_notification: {
        signature:
          "declare function GM_notification(details: { text?: string, title?: string, image?: string, highlight?: boolean, silent?: boolean, timeout?: number, ondone?: Function, onclick?: Function } | string, ondone?: Function): void;",
        name: "GM_notification",
        el: "gmNotification",
      },
      GM_getResourceText: {
        signature: "declare function GM_getResourceText(name: string): string;",
        name: "GM_getResourceText",
        el: "gmGetResourceText",
      },
      GM_getResourceURL: {
        signature: "declare function GM_getResourceURL(name: string): string;",
        name: "GM_getResourceURL",
        el: "gmGetResourceURL",
      },
      GM_setClipboard: {
        signature:
          "declare function GM_setClipboard(data: string, type?: string): Promise<void>;",
        name: "GM_setClipboard",
        el: "gmSetClipboard",
      },
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
      if (
        this.state.hasUnsavedChanges &&
        this.state.isAutosaveEnabled &&
        this.state.codeEditor
      ) {
        console.log("Autosaving due to debounced request...");
        await this.saveScript();
      }
    }, this.config.AUTOSAVE_DELAY);
  }

  markAsDirty() {
    if (this.state.hasUnsavedChanges && !this.state.isEditMode) return; // Allow re-dirtying in edit mode for autosave trigger
    this.state.hasUnsavedChanges = true;
    this.ui.updateScriptStatus(true);
  }

  cacheElements() {
    const elementIds = [
      "pageTitle",
      "scriptName",
      "scriptAuthor",
      "targetUrl",
      "runAt",
      "scriptVersion",
      "scriptDescription",
      "saveBtn",
      "sidebarToggle",
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
      "gmSetValue",
      "gmGetValue",
      "gmDeleteValue",
      "gmListValues",
      "gmOpenInTab",
      "gmNotification",
      "gmGetResourceText",
      "gmGetResourceURL",
      "gmSetClipboard",
      "scriptResources",
    ];

    const elements = {};
    elementIds.forEach((id) => {
      elements[id] = document.getElementById(id);
    });

    // Additional elements
    elements.sidebar = document.querySelector(".sidebar");
    elements.sectionToggles = document.querySelectorAll(".section-toggle");
    elements.mainContent = document.querySelector(".main-content");
    elements.urlList = document.getElementById("urlList");
    elements.addUrlBtn = document.getElementById("addUrlBtn");

    return elements;
  }

  /**
   * Initialize the entire application
   */
  async init() {
    try {
      this.setDefaultValues();
      this.codeEditorManager.initializeCodeEditor();
      this.codeEditorManager.setSaveCallback(() => this.saveScript());
      this.codeEditorManager.setChangeCallback(() => {
        this.markAsDirty();
        if (this.state.isAutosaveEnabled) {
          this._debouncedSave();
        }
      });
      this.codeEditorManager.setStatusCallback((message, type) => {
        if (message) {
          this.ui.showStatusMessage(message, type);
        } else {
          this.ui.clearStatusMessage();
        }
      });
      await this.parseUrlParams();
      this.setupEditorMode();
      this.ui.initializeCollapsibleSections();
      this.ui.updateSidebarState();
      this.registerEventListeners();
      this.setupBackgroundConnection();
      this.codeEditorManager.updateEditorLintAndAutocomplete(); // Ensure it's updated after potential script load

      // Focus editor after initialization
      setTimeout(() => this.codeEditorManager.focus(), 100);
    } catch (error) {
      console.error("Failed to initialize editor:", error);
      this.ui.showStatusMessage("Failed to initialize editor", "error");
    }
  }

  /**
   * Set default form values
   */
  setDefaultValues() {
    if (!this.elements.scriptVersion.value) {
      this.elements.scriptVersion.value = this.config.DEFAULT_VERSION;
    }

    this.elements.autosaveBtnText.textContent = `Autosave: ${
      this.state.isAutosaveEnabled ? "On" : "Off"
    }`;
    this.elements.lintBtnText.textContent = `Lint: ${
      this.state.lintingEnabled ? "On" : "Off"
    }`;
  }

  /**
   * Parse URL parameters and setup editor state
   */
  async parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    this.state.scriptId = urlParams.get("id");
    const initialTargetUrl = urlParams.get("targetUrl");
    const template = urlParams.get("template");
    this.state.isEditMode = Boolean(this.state.scriptId);

    if (initialTargetUrl && this.elements.targetUrl) {
      const decodedUrl = decodeURIComponent(initialTargetUrl);
      this.elements.targetUrl.value = decodedUrl;
      this.addUrlToList(decodedUrl);
    }

    if (template) {
      const decodedTemplate = decodeURIComponent(template);
      this.codeEditorManager.insertTemplateCode(decodedTemplate);
    } else if (!this.state.isEditMode && !this.codeEditorManager.getValue()) {
      this.codeEditorManager.insertDefaultTemplate();
    }
  }

  /**
   * Setup editor mode (edit vs create)
   */
  async setupEditorMode() {
    if (this.state.isEditMode) {
      await this.loadScript(this.state.scriptId);
    } else if (!this.codeEditorManager.getValue()) {
      this.codeEditorManager.insertDefaultTemplate();
    }
    this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
  }

  /**
   * Register all event listeners
   */
  registerEventListeners() {
    Object.values(this.gmApiDefinitions).forEach((apiDef) => {
      const checkbox = this.elements[apiDef.el];
      if (checkbox) {
        checkbox.addEventListener("change", () => {
          this.markAsDirty();
          if (this.state.isAutosaveEnabled) {
            this._debouncedSave();
          }
          this.codeEditorManager.updateEditorLintAndAutocomplete();
        });
      }
    });

    this.setupUserInteractionTracking();
    this.setupGlobalEventListeners();
    this.setupButtonEventListeners();
    this.setupFormEventListeners();
    this.setupUrlManagement();
  }

  /**
   * Setup user interaction tracking
   */
  setupUserInteractionTracking() {
    const trackUserInteraction = () => {
      this.state.hasUserInteraction = true;
    };

    document.addEventListener("mousedown", trackUserInteraction, {
      once: true,
    });
    document.addEventListener("keydown", trackUserInteraction, { once: true });

    window.addEventListener("beforeunload", (e) => {
      if (this.state.hasUnsavedChanges && this.state.hasUserInteraction) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    });
  }

  /**
   * Setup global event listeners
   */
  setupGlobalEventListeners() {
    document.addEventListener("click", (e) => this.handleDocumentClick(e));
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  /**
   * Setup button event listeners
   */
  setupButtonEventListeners() {
    const buttonHandlers = {
      sidebarToggle: () => this.ui.toggleSidebar(),
      lintBtn: () => this.codeEditorManager.toggleLinting(),
      saveBtn: () => this.saveScript(),
      formatBtn: () => this.codeEditorManager.formatCode(true),
      autosaveBtn: () => this.toggleAutosave(),
    };

    Object.entries(buttonHandlers).forEach(([elementKey, handler]) => {
      if (this.elements[elementKey]) {
        this.elements[elementKey].addEventListener("click", handler);
      }
    });
  }

  /**
   * Setup form event listeners
   */
  setupFormEventListeners() {
    this.elements.runAt.addEventListener("change", () => {
      this.markAsUnsaved();
    });

    const formElements = [
      "scriptName",
      "scriptAuthor",
      "scriptVersion",
      "scriptDescription",
      "targetUrl",
      "waitForSelector",
    ];

    formElements.forEach((elementKey) => {
      if (this.elements[elementKey]) {
        this.elements[elementKey].addEventListener("change", () =>
          this.markAsUnsaved()
        );
      }
    });
  }

  /**
   * Setup URL management event listeners
   */
  setupUrlManagement() {
    this.elements.addUrlBtn?.addEventListener("click", () => {
      const url = this.elements.targetUrl.value.trim();
      if (url) {
        this.addUrlToList(url);
      }
    });

    this.elements.urlList?.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-url-btn")) {
        e.target.closest(".url-item").remove();
        this.markAsUnsaved();
      }
    });

    this.elements.targetUrl?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = this.elements.targetUrl.value.trim();
        if (url) {
          this.addUrlToList(url);
        }
      }
    });
  }

  /**
   * Handle document click events
   */
  handleDocumentClick(event) {
    if (
      window.innerWidth <= this.config.SIDEBAR_BREAKPOINT &&
      this.elements.sidebar.classList.contains("active") &&
      !this.elements.sidebar.contains(event.target) &&
      event.target !== this.elements.sidebarToggle
    ) {
      this.state.isSidebarVisible = false;
      this.ui.updateSidebarState();
    }
  }

  /**
   * Handle global keyboard shortcuts
   */
  handleKeyDown(e) {
    const shortcuts = {
      s: () => this.saveScript(),
      b: () => this.ui.toggleSidebar(),
    };

    if ((e.ctrlKey || e.metaKey) && shortcuts[e.key]) {
      e.preventDefault();
      shortcuts[e.key]();
    }
  }

  /**
   * Toggle autosave functionality
   */
  toggleAutosave() {
    this.state.isAutosaveEnabled = !this.state.isAutosaveEnabled;
    this.elements.autosaveBtnText.textContent = `Autosave: ${
      this.state.isAutosaveEnabled ? "On" : "Off"
    }`;
    localStorage.setItem("autosaveEnabled", this.state.isAutosaveEnabled);
  }

  /**
   * Trigger autosave with debouncing
   */
  triggerAutosave() {
    if (this.state.autosaveTimeout) {
      clearTimeout(this.state.autosaveTimeout);
    }

    this.state.autosaveTimeout = setTimeout(() => {
      this.saveScript(true);
      this.state.autosaveTimeout = null;
    }, this.config.AUTOSAVE_DELAY);
  }

  /**
   * Mark script as having unsaved changes
   */
  markAsUnsaved() {
    this.state.hasUnsavedChanges = true;
    this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
  }

  /**
   * Load script data from storage
   */
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

  /**
   * Populate form fields with script data
   */
  populateFormWithScript(script) {
    this.elements.scriptName.value = script.name || "";
    this.elements.scriptAuthor.value = script.author || "";
    this.elements.runAt.value = script.runAt || "document_idle";
    this.elements.scriptVersion.value =
      script.version || this.config.DEFAULT_VERSION;
    this.elements.scriptDescription.value = script.description || "";
    this.codeEditorManager.setValue(script.code || "");

    script.targetUrls?.forEach((url) => this.addUrlToList(url));

    // Set GM API checkboxes
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

    if (
      this.elements.scriptResources &&
      script.resources &&
      Array.isArray(script.resources)
    ) {
      this.elements.scriptResources.value = script.resources
        .map((res) => `@resource ${res.name} ${res.url}`)
        .join("\n");
    } else if (this.elements.scriptResources) {
      this.elements.scriptResources.value = "";
    }
  }

  /**
   * Gather script data from form
   */
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
      version:
        this.elements.scriptVersion.value.trim() || this.config.DEFAULT_VERSION,
      description: this.elements.scriptDescription.value.trim(),
      code: this.codeEditorManager.getValue(),
      enabled: true,
      updatedAt: new Date().toISOString(),
    };

    // GM APIs
    scriptData.gmSetValue = this.elements.gmSetValue?.checked || false;
    scriptData.gmGetValue = this.elements.gmGetValue?.checked || false;
    scriptData.gmDeleteValue = this.elements.gmDeleteValue?.checked || false;
    scriptData.gmListValues = this.elements.gmListValues?.checked || false;
    scriptData.gmOpenInTab = this.elements.gmOpenInTab?.checked || false;
    scriptData.gmNotification = this.elements.gmNotification?.checked || false;
    scriptData.gmGetResourceText =
      this.elements.gmGetResourceText?.checked || false;
    scriptData.gmGetResourceURL =
      this.elements.gmGetResourceURL?.checked || false;
    scriptData.gmSetClipboard = this.elements.gmSetClipboard?.checked || false;

    // Parse resource declarations
    scriptData.resources = [];
    if (this.elements.scriptResources && this.elements.scriptResources.value) {
      const lines = this.elements.scriptResources.value.split("\n");
      const resourceRegex = /^@resource\s+(\S+)\s+(\S+)/;
      for (const line of lines) {
        const match = line.trim().match(resourceRegex);
        if (match) {
          scriptData.resources.push({ name: match[1], url: match[2] });
        }
      }
    }

    return scriptData;
  }

  /**
   * Save script to storage
   */
  async saveScript(quiet = false) {
    try {
      if (!this.validator.validateForm()) return;

      const scriptData = this.gatherScriptData();
      // Fetch and store resource contents
      if (scriptData.resources && scriptData.resources.length > 0) {
        scriptData.resourceContents = {};
        const fetchPromises = scriptData.resources.map(async (resource) => {
          try {
            const response = await fetch(resource.url);
            if (response.ok) {
              scriptData.resourceContents[resource.name] =
                await response.text();
            } else {
              console.error(
                `Failed to fetch resource '${resource.name}' from ${resource.url}: ${response.status} ${response.statusText}`
              );
              scriptData.resourceContents[resource.name] = null;
            }
          } catch (error) {
            console.error(
              `Error fetching resource '${resource.name}' from ${resource.url}:`,
              error
            );
            scriptData.resourceContents[resource.name] = null;
          }
        });
        await Promise.all(fetchPromises);
      }

      const savedScript = await this.storage.saveScript(
        scriptData,
        this.state.scriptId,
        this.state.isEditMode
      );

      this.updateEditorStateAfterSave(savedScript);
      this.state.hasUnsavedChanges = false;
      this.ui.updateScriptStatus(this.state.hasUnsavedChanges);

      if (!quiet) {
        this.ui.showStatusMessage("Script saved successfully!", "success");
        setTimeout(
          () => this.ui.clearStatusMessage(),
          this.config.STATUS_TIMEOUT
        );
      }

      this.notifyBackgroundScript();
    } catch (error) {
      console.error("Error saving script:", error);
      if (!quiet) {
        this.ui.showStatusMessage(
          `Failed to save script: ${error.message}`,
          "error"
        );
      }
    }
  }

  /**
   * Update editor state after successful save
   */
  updateEditorStateAfterSave(savedScript) {
    if (!this.state.isEditMode) {
      this.state.isEditMode = true;
      this.state.scriptId = savedScript.id;
      window.history.replaceState({}, "", `editor.html?id=${savedScript.id}`);
    }
  }

  /**
   * Notify background script of changes
   */
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

  /**
   * Add URL to the target URL list
   */
  addUrlToList(url) {
    const urlItem = document.createElement("div");
    urlItem.className = "url-item";
    urlItem.dataset.url = url;
    urlItem.innerHTML = `
      <span>${url}</span>
      <button type="button" class="remove-url-btn">×</button>
    `;

    this.elements.urlList.appendChild(urlItem);
    this.elements.targetUrl.value = "";
    this.markAsUnsaved();
  }

  /**
   * Setup background connection
   */
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
}

// Initialize the application when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const editor = new ScriptEditor();
  editor.init().catch((error) => {
    console.error("Failed to initialize script editor:", error);
  });
});
