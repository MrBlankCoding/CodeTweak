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
      this.initializeCodeEditor();
      await this.parseUrlParams();
      this.setupEditorMode();
      this.ui.initializeCollapsibleSections();
      this.ui.updateSidebarState();
      this.registerEventListeners();
      this.setupBackgroundConnection();

      // Focus editor after initialization
      setTimeout(() => this.state.codeEditor?.focus(), 100);
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
   * Initialize CodeMirror editor with all configurations
   */
  initializeCodeEditor() {
    if (!this.elements.codeEditor) {
      throw new Error("Code editor element not found");
    }

    const editorConfig = {
      mode: "javascript",
      theme: "ayu-dark",
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      smartIndent: true,
      electricChars: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      showTrailingSpace: true,
      continueComments: true,
      foldGutter: true,
      lint: this.getLintOptions(this.state.lintingEnabled),
      gutters: [
        "CodeMirror-linenumbers",
        "CodeMirror-foldgutter",
        "CodeMirror-lint-markers",
      ],
      scrollbarStyle: "simple",
      extraKeys: this.getEditorKeybindings(),
    };

    this.state.codeEditor = CodeMirror.fromTextArea(
      this.elements.codeEditor,
      editorConfig
    );
    
    this.state.codeEditor.on("inputRead", (cm, change) => {
      if (
        change.text[0] &&
        /[\w.]/.test(change.text[0]) &&
        !cm.state.completionActive
      ) {
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
      }
    });

    this.setupEditorEventHandlers();
  }

  /**
   * Get editor keybindings configuration
   */
  getEditorKeybindings() {
    return {
      "Ctrl-Space": "autocomplete",
      "Ctrl-S": (cm) => {
        event.preventDefault();
        this.saveScript();
      },
      "Cmd-S": (cm) => {
        event.preventDefault();
        this.saveScript();
      },
      "Alt-F": (cm) => this.formatCode(true),
      F11: (cm) => cm.setOption("fullScreen", !cm.getOption("fullScreen")),
      Esc: (cm) => {
        if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
      },
      Tab: (cm) => this.handleTabKey(cm),
      "Ctrl-/": (cm) => cm.toggleComment({ indent: true }),
      "Cmd-/": (cm) => cm.toggleComment({ indent: true }),
    };
  }

  /**
   * Handle tab key behavior in editor
   */
  handleTabKey(cm) {
    if (cm.somethingSelected()) {
      cm.indentSelection("add");
    } else {
      const spaces = " ".repeat(cm.getOption("indentUnit"));
      cm.replaceSelection(spaces, "end", "+input");
    }
  }

  /**
   * Setup editor event handlers
   */
  setupEditorEventHandlers() {
    this.state.codeEditor.on("cursorActivity", (cm) => {
      const cursor = cm.getCursor();
      if (this.elements.cursorInfo) {
        this.elements.cursorInfo.textContent = `Line: ${
          cursor.line + 1
        }, Col: ${cursor.ch + 1}`;
      }
    });

    this.state.codeEditor.on("change", () => {
      if (!this.state.hasUnsavedChanges) {
        this.markAsUnsaved();
      }

      if (this.state.isAutosaveEnabled && this.state.hasUserInteraction) {
        this.triggerAutosave();
      }
    });
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
      this.insertTemplateCode(decodedTemplate);
    } else if (!this.state.isEditMode && !this.state.codeEditor.getValue()) {
      this.insertDefaultTemplate();
    }
  }

  /**
   * Insert template code with proper formatting
   */
  insertTemplateCode(template) {
    const wrappedCode = `(function() {
  'use strict';
  
${template}

})();`;
    this.state.codeEditor.setValue(wrappedCode);
    this.formatCode(false);
  }

  /**
   * Setup editor mode (edit vs create)
   */
  async setupEditorMode() {
    if (this.state.isEditMode) {
      await this.loadScript(this.state.scriptId);
    } else if (!this.state.codeEditor.getValue()) {
      this.insertDefaultTemplate();
    }
    this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
  }

  /**
   * Register all event listeners
   */
  registerEventListeners() {
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
      lintBtn: () => this.toggleLinting(),
      saveBtn: () => this.saveScript(),
      formatBtn: () => this.formatCode(true),
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
   * Toggle code linting
   */
  toggleLinting() {
    this.state.lintingEnabled = !this.state.lintingEnabled;
    this.state.codeEditor.setOption(
      "lint",
      this.getLintOptions(this.state.lintingEnabled)
    );
    this.elements.lintBtnText.textContent = `Lint: ${
      this.state.lintingEnabled ? "On" : "Off"
    }`;
    localStorage.setItem("lintingEnabled", this.state.lintingEnabled);
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
   * Get linting configuration
   */
  getLintOptions(enable) {
    if (!enable || typeof window.JSHINT === "undefined") return false;

    return {
      getAnnotations: (text) => {
        const errors = [];

        if (
          !window.JSHINT(text, {
            esversion: 9,
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
            globals: {
              chrome: false,
              CodeMirror: false,
            },
          })
        ) {
          const jshintErrors = window.JSHINT.errors;

          for (const err of jshintErrors) {
            if (!err) continue;

            errors.push({
              message: err.reason,
              severity: err.code?.startsWith("E") ? "error" : "warning",
              from: CodeMirror.Pos(err.line - 1, err.character - 1),
              to: CodeMirror.Pos(err.line - 1, err.character),
            });
          }
        }

        return errors;
      },
      hasGutters: true,
    };
  }

  /**
   * Mark script as having unsaved changes
   */
  markAsUnsaved() {
    this.state.hasUnsavedChanges = true;
    this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
  }

  /**
   * Insert default template code
   */
  insertDefaultTemplate() {
    const defaultCode = `(function() {
  'use strict';
  
  // Your code here...
  console.log('CodeTweak: Custom script is running!');

})();`;

    this.state.codeEditor.setValue(defaultCode);
    this.formatCode(false);
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
    this.state.codeEditor.setValue(script.code || "");

    script.targetUrls?.forEach((url) => this.addUrlToList(url));
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
      code: this.state.codeEditor.getValue(),
      enabled: true,
      updatedAt: new Date().toISOString(),
    };

    return scriptData;
  }

  /**
   * Save script to storage
   */
  async saveScript(quiet = false) {
    try {
      if (!this.validator.validateForm()) return;

      const scriptData = this.gatherScriptData();
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
        chrome.runtime.sendMessage({ action: "scriptsUpdated" }, (response) => {
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
   * Format code using js-beautify
   */
  formatCode(showMessage = true) {
    try {
      if (!this.state.codeEditor) {
        throw new Error("Code editor not initialized");
      }

      const unformattedCode = this.state.codeEditor.getValue();
      const formattedCode = js_beautify(unformattedCode, {
        indent_size: 2,
        space_in_empty_paren: true,
      });

      this.state.codeEditor.setValue(formattedCode);

      if (showMessage) {
        this.ui.showStatusMessage("Code formatted", "success");
        setTimeout(
          () => this.ui.clearStatusMessage(),
          this.config.STATUS_TIMEOUT
        );
      }
    } catch (error) {
      console.error("Error formatting code:", error);
      if (showMessage) {
        this.ui.showStatusMessage("Could not format code", "error");
      }
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
