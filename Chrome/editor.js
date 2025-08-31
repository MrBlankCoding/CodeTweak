/* global chrome */

import {
  UIManager,
  StorageManager,
  FormValidator
} from "./utils/editor_managers.js";
import { CodeEditorManager } from "./utils/editor_settings.js";
import { buildTampermonkeyMetadata, parseUserScriptMetadata } from "./utils/metadataParser.js";

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
      GM_addStyle: {
        signature:
          "declare function GM_addStyle(css: string): void;",
        name: "GM_addStyle",
        el: "gmAddStyle",
      },
      GM_addElement: {
        signature:
          "declare function GM_addElement(parent: Node, tag: string, attributes?: { [key: string]: string }): Node;",
        name: "GM_addElement",
        el: "gmAddElement",
      },
      GM_registerMenuCommand: {
        signature:
          "declare function GM_registerMenuCommand(caption: string, onClick: () => any, accessKey?: string): string;",
        name: "GM_registerMenuCommand",
        el: "gmRegisterMenuCommand",
      },
      GM_xmlhttpRequest: {
        signature:
          "declare function GM_xmlhttpRequest(details: { method: string, url: string, data?: any, headers?: any, timeout?: number, responseType?: string, onload?: Function, onerror?: Function, onprogress?: Function }): void;",
        name: "GM_xmlhttpRequest",
        el: "gmXmlhttpRequest",
      },
    };

    // Init code mirror
    this.codeEditorManager = new CodeEditorManager(
      this.elements,
      this.state,
      this.config,
      this.gmApiDefinitions
    );
  }

  _debouncedSave(force = false) {
    // Clear existing timeout
    if (this.state.autosaveTimeout) {
      clearTimeout(this.state.autosaveTimeout);
      this.state.autosaveTimeout = null;
    }

    if (this.state.isAutosaveEnabled || force) {
      this.state.autosaveTimeout = setTimeout(async () => {
        if (this.state.hasUnsavedChanges && this.state.codeEditor) {
          try {
            await this.saveScript(true);

            if (!force) {
              setTimeout(() => {
                if (!this.state.hasUnsavedChanges) {
                  this.ui.clearStatusMessage();
                }
              }, 2000);
            }
          } catch (error) {
            console.error("Error during autosave:", error);
            if (!force) {
              this.ui.showStatusMessage("Autosave failed", "error");
            }
          }
        }
      }, this.config.AUTOSAVE_DELAY);
    }
  }

  markAsDirty() {
    if (this.state.hasUnsavedChanges && !this.state.isEditMode) return; // Allow dirting in edit mode for autosave
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
      "helpButton"
    ];

    const elements = {};
    elementIds.forEach((id) => {
      elements[id] = document.getElementById(id);
    });

    // Add any additional elements
    elements.sidebar = document.querySelector(".sidebar");
    elements.sidebarIconBar = document.querySelector(".sidebar-icon-bar");
    elements.sidebarContentArea = document.querySelector(".sidebar-content-area");
    elements.sidebarIconBtns = document.querySelectorAll(".sidebar-icon-btn");
    elements.sidebarPanels = document.querySelectorAll(".sidebar-panel");
    elements.sectionToggles = document.querySelectorAll(".section-toggle");
    elements.mainContent = document.querySelector(".main-content");
    elements.settingsModal = document.getElementById("settingsModal");
    elements.requiresSection = document.getElementById("requiresSection");
    
    // StatusManager will be initialized after UIManager is created
    elements.status = null;

    return elements;
  }

  async init() {
    try {
      this.setDefaultValues();
      this.state.isAutosaveEnabled =
        localStorage.getItem("autosaveEnabled") !== "false";
      this.state.lintingEnabled =
        localStorage.getItem("lintingEnabled") !== "false";
      

      await this.codeEditorManager.initializeCodeEditor();
      this.codeEditorManager.toggleLinting(this.state.lintingEnabled);
      this.codeEditorManager.setSaveCallback(() => this.saveScript());
      this.codeEditorManager.setChangeCallback(() => {
        this.markAsDirty();
        if (this.state.isAutosaveEnabled) {
          this._debouncedSave();
        }
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

    // Listen for Ctrl+S / Cmd+S via KeyboardManager
    if (this.ui && typeof this.ui.on === 'function') {
      this.ui.on('saveRequested', async () => {
        await this.saveScript();
        this.ui.showStatusMessage('Script saved!', 'success', 2000);
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
      
      // Map metadata to script data
      if (metadata.name) scriptData.name = metadata.name;
      if (metadata.version) scriptData.version = metadata.version;
      if (metadata.description) scriptData.description = metadata.description;
      if (metadata.author) scriptData.author = metadata.author;
      if (metadata.namespace) scriptData.namespace = metadata.namespace;
      if (metadata.runAt) scriptData.runAt = metadata.runAt;
      if (metadata.license) scriptData.license = metadata.license;
      if (metadata.icon) scriptData.icon = metadata.icon;
      
      // Handle matches and includes
      if (metadata.matches?.length) {
        scriptData.targetUrls = [...new Set(metadata.matches)];
      }
      
      // Handle requires
      if (metadata.requires?.length) {
        scriptData.requires = metadata.requires;
      }
      
      // Handle resources
      if (metadata.resources?.length) {
        scriptData.resources = metadata.resources;
      }
      
      // Handle GM APIs from @grant directives
      if (metadata.gmApis) {
        // Map the GM API flags to the script data
        Object.entries(metadata.gmApis).forEach(([api, enabled]) => {
          if (enabled && this.elements[api]) {
            scriptData[api] = true;
          }
        });
      }
      
      // Update the form with the imported data
      this.populateFormWithScript(scriptData);
      
      // Set the code in the editor
      this.codeEditorManager.setValue(code);
      
      // Show success message
      this.ui.showStatusMessage('Script metadata imported successfully', 'success');
      
    } catch (error) {
      console.error('Error handling script import:', error);
      this.ui.showStatusMessage('Failed to import script metadata', 'error');
    }
  }

  async loadImportedScript(importId) {
    try {
      const key = `tempImport_${importId}`;
      const data = await chrome.storage.local.get(key);
      const importData = data[key];
      if (!importData) return;
      
      const { code } = importData;

      // Parse metadata using shared utility for full support
      const metadata = parseUserScriptMetadata(code);

      // Delegate to existing import handler for form population
      this.handleScriptImport({ code, ...metadata });

      // Mark as unsaved draft for user review (but DO NOT autosave)
      this.state.hasUnsavedChanges = true;
      this.ui.updateScriptStatus(true);

      // Clean up storage
      await chrome.storage.local.remove(key);
    } catch (err) {
      console.error('Error loading imported script:', err);
      this.ui.showStatusMessage('Failed to load imported script', 'error');
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
    const resourcesSection = document.getElementById('resourcesSection');
    if (resourcesSection) {
      if (show) {
        resourcesSection.classList.remove('hidden');
      } else {
        // Only hide if both APIs are disabled AND no resources exist
        const hasResources = this.elements.resourceList?.children.length > 0;
        if (!this.elements.gmGetResourceText.checked && 
            !this.elements.gmGetResourceURL.checked &&
            !hasResources) {
          resourcesSection.classList.add('hidden');
        }
      }
    }
  }

  toggleRequiredScriptsSection() {
    const requiresSection = this.elements.requiresSection;
    if (!requiresSection) return;
    
    // Only show required scripts section if GM_getResourceURL is checked
    const requiredScriptsVisible = this.elements.gmGetResourceURL?.checked || false;
    
    if (requiredScriptsVisible) {
      requiresSection.classList.remove('hidden');
    } else {
      requiresSection.classList.add('hidden');
    }
  }

  setupResourceApiListeners() {
    const resourceCheckboxes = [this.elements.gmGetResourceText, this.elements.gmGetResourceURL];
    
    resourceCheckboxes.forEach(checkbox => {
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          const shouldShow = this.elements.gmGetResourceText.checked || this.elements.gmGetResourceURL.checked;
          this.toggleResourcesSection(shouldShow);
          
          // Clear resources if both APIs are disabled
          if (!this.elements.gmGetResourceText.checked && 
              !this.elements.gmGetResourceURL.checked &&
              this.elements.resourceList) {
            this.elements.resourceList.innerHTML = '';
          }
        });
      }
    });
    
    // Add specific listener for GM_getResourceURL to toggle required scripts section
    if (this.elements.gmGetResourceURL) {
      this.elements.gmGetResourceURL.addEventListener('change', () => {
        this.toggleRequiredScriptsSection();
      });
    }
  }

  registerEventListeners() {
    // Listen for sidebar changes
    this.ui.on('sidebarChanged', () => {
      this.markAsUnsaved();
    });
    
    // Setup VSCode-like sidebar icon functionality
    this.setupSidebarIconHandlers();
    
    // Directly add click listener to save button
    this.elements.saveBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveScript();
    });
    
    // Setup UI callbacks - UIManager initializes everything in constructor, no init() method needed
    const callbacks = {
      saveScript: () => this.saveScript(),
      formatCode: async () => {
        await this.codeEditorManager.formatCode(true, async () => {
          // Always save after formatting, regardless of autosave setting
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
      debouncedSave: () => this._debouncedSave(),
    };

    // Setup additional UI components that need callbacks
    this.ui.setupSettingsModal(callbacks);
    this.ui.setupUrlManagement({ markAsUnsaved: () => this.markAsUnsaved() });
    this.ui.setupResourceManagement(callbacks);

    // Add both change and input events for better responsiveness
    const handleChange = () => {
      this.markAsDirty();
      if (this.state.isAutosaveEnabled) {
        this._debouncedSave();
      }
    };

    // Form inputs that should trigger change detection
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

    formInputs.forEach(input => {
      if (input) {
        input.addEventListener('change', handleChange);
        input.addEventListener('input', handleChange);
      }
    });

    // GM API checkboxes
    Object.values(this.gmApiDefinitions).forEach(api => {
      const element = this.elements[api.el];
      if (element) {
        element.addEventListener('change', () => {
          handleChange();
          this.updateApiCount();
        });
      }
    });
    
    // Setup resource API listeners
    this.setupResourceApiListeners();
    
    // Show resources section if either resource API is checked
    if (this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked) {
      this.toggleResourcesSection(true);
    }

    // Setup API search filter
    if (this.elements.apiSearch) {
      this.elements.apiSearch.addEventListener("input", () => {
        const query = this.elements.apiSearch.value.toLowerCase();
        const checkboxes = this.elements.sidebar.querySelectorAll(".api-list .form-group-checkbox");
        checkboxes.forEach(cb => {
          const label = cb.querySelector("label").textContent.toLowerCase();
          const shouldShow = label.includes(query);
          cb.style.display = shouldShow ? "flex" : "none";
        });
      });
    }
  }

  setupSidebarIconHandlers() {
    const sidebarIconBtns = this.elements.sidebarIconBtns;
    if (!sidebarIconBtns) return;

    // Initialize with sidebar completely collapsed
    this.elements.sidebar.classList.remove('expanded', 'has-active-panel');
    sidebarIconBtns.forEach(btn => btn.classList.remove('active'));
    this.elements.sidebarPanels.forEach(panel => panel.classList.remove('active'));
    this.elements.sidebarContentArea.style.display = 'none';
    this.elements.sidebarContentArea.style.width = '0';

    sidebarIconBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        const panel = document.getElementById(`${section}-panel`);
        const isCurrentlyActive = btn.classList.contains('active');
        
        if (isCurrentlyActive) {
          // Collapse sidebar completely
          this.elements.sidebar.classList.remove('expanded', 'has-active-panel');
          btn.classList.remove('active');
          panel.classList.remove('active');
          this.elements.sidebarContentArea.style.display = 'none';
          this.elements.sidebarContentArea.style.width = '0';
        } else {
          // Show icon bar and expand sidebar
          this.elements.sidebar.classList.add('has-active-panel', 'expanded');
          
          // Update active states
          sidebarIconBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          // Show correct panel
          this.elements.sidebarPanels.forEach(p => p.classList.remove('active'));
          panel.classList.add('active');
          
          // Show content area with smooth transition
          this.elements.sidebarContentArea.style.display = 'flex';
          this.elements.sidebarContentArea.style.width = '280px';
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
    this.elements.scriptVersion.value =
      script.version || this.config.DEFAULT_VERSION;
    this.elements.scriptDescription.value = script.description || "";
    this.elements.scriptLicense.value = script.license || "";
    this.elements.scriptIcon.value = script.icon || "";
    this.codeEditorManager.setValue(script.code || "");

    // Reset the URL list before adding to avoid duplicates when reloading/editing
    if (this.elements.urlList) {
      this.elements.urlList.innerHTML = "";
    }
    
    script.targetUrls?.forEach((url) => this.ui.addUrlToList(url));

    // Set the sidebar checkboxes -> Not clean but its okay
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
      
    // Show resources section if either resource API is checked
    if (script.gmGetResourceText || script.gmGetResourceURL) {
      this.toggleResourcesSection(true);
    }

    if (
      this.elements.resourceList &&
      script.resources &&
      Array.isArray(script.resources)
    ) {
      // Clear list
      this.elements.resourceList.innerHTML = "";
      script.resources.forEach((res) =>
        this.ui.addResourceToList(res.name, res.url)
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
      version:
        this.elements.scriptVersion.value.trim() || this.config.DEFAULT_VERSION,
      description: this.elements.scriptDescription.value.trim(),
      license: this.elements.scriptLicense?.value.trim() || "",
      icon: this.elements.scriptIcon?.value.trim() || "",
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
    scriptData.gmAddStyle = this.elements.gmAddStyle?.checked || false;
    scriptData.gmAddElement = this.elements.gmAddElement?.checked || false;
    scriptData.gmRegisterMenuCommand = this.elements.gmRegisterMenuCommand?.checked || false;
    scriptData.gmXmlhttpRequest = this.elements.gmXmlhttpRequest?.checked || false;

    // Parse resource items
    scriptData.resources = [];
    if (this.elements.resourceList) {
      const items = Array.from(
        this.elements.resourceList.querySelectorAll(".resource-item")
      );
      items.forEach((item) => {
        scriptData.resources.push({
          name: item.dataset.name,
          url: item.dataset.url,
        });
      });
    }

    // Required scripts
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
      if (!this.validator.validateForm()) return null;

      const scriptData = this.gatherScriptData();
      
      // Auto-generate name if empty
      if (!scriptData.name || scriptData.name.trim() === '') {
        scriptData.name = `Untitled Script ${new Date().toISOString().slice(0, 10)}`;
      }
      
      const isNewScript = !this.state.scriptId;

      // Only if new changes or is a new script
      if (!this.state.hasUnsavedChanges && !isNewScript) {
        return null;
      }

      // Only fetch and store if needed
      if (scriptData.resources && scriptData.resources.length > 0) {
        scriptData.resourceContents = {};
        await Promise.all(
          scriptData.resources.map(async (resource) => {
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
                `Error fetching resource '${resource.name}':`,
                error
              );
              scriptData.resourceContents[resource.name] = null;
            }
          })
        );
      }

      // Saved
      const savedScript = await this.storage.saveScript(
        scriptData,
        this.state.scriptId,
        this.state.isEditMode
      );

      // Update UI
      this.state.scriptId = savedScript.id;
      this.state.hasUnsavedChanges = false;
      this.ui.updateScriptStatus(false);

      // Update URL if its a new script
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
        }, 3000);
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
      }, 5000);

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
    const apiCheckboxes = Object.values(this.gmApiDefinitions).map(api => this.elements[api.el]);
    const checkedCount = apiCheckboxes.filter(checkbox => checkbox && checkbox.checked).length;
    
    if (this.elements.apiCountBadge) {
      this.elements.apiCountBadge.textContent = checkedCount;
      this.elements.apiCountBadge.style.display = checkedCount > 0 ? 'inline' : 'none';
    }
  }

  /**
   * Export current script in classic Tampermonkey format (.user.js)
   */
  exportScript() {
    try {
      const scriptData = this.gatherScriptData();
      const metadata = buildTampermonkeyMetadata(scriptData);
      const content = `${metadata}\n\n${scriptData.code}`;

      const fileNameSafe = (scriptData.name || 'script')
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '') || 'script';

      const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileNameSafe}.user.js`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.ui.showStatusMessage('Script exported', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      this.ui.showStatusMessage('Export failed', 'error');
    }
  }
}

// Main init for editor
document.addEventListener("DOMContentLoaded", () => {
  applyThemeFromSettings().then(() => {
    const editor = new ScriptEditor();
    editor.init().catch((error) => {
      console.error("Failed to initialize script editor:", error);
    });
  });

  // Listen for runtime theme changes
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "settingsUpdated") {
      applyThemeFromSettings();
    }
  });
});


async function applyThemeFromSettings() {
  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const isDark = settings.darkMode !== false; // default dark mode true
    document.body.classList.toggle("light-theme", !isDark);
  } catch (err) {
    console.error("Error applying theme:", err);
  }
}

function setupHelpModalTabs() {
  const tabButtons = document.querySelectorAll('.help-tab');
  const tabContents = document.querySelectorAll('.help-tab-content');
  if (!tabButtons.length || !tabContents.length) return;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', function () {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      const content = document.getElementById('help-tab-' + tab);
      if (content) content.classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupHelpModalTabs();
});
