import feather from 'feather-icons';
import {
  UIManager,
  StorageManager,
  FormValidator
} from "./editor_managers.js";
import { CodeEditorManager } from "./editor_settings.js";
import { buildTampermonkeyMetadata, parseUserScriptMetadata } from "../utils/metadataParser.js";
import { GM_API_DEFINITIONS, getApiElementIds } from "../GM/gmApiDefinitions.js";
import { applyTranslations } from "../utils/i18n.js";
import ScriptAnalyzer from "../utils/scriptAnalyzer.js";

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
      headerSyncTimeout: null,
      sidebarSyncTimeout: null,
      isUpdatingFromSidebar: false,
      hasUserInteraction: false,
      codeEditor: null,
    };

    this.elements = this.cacheElements();
    this.ui = new UIManager(this.elements, this.state, this.config);
    this.storage = new StorageManager();
    this.validator = new FormValidator(this.elements);
    // Use centralized API definitions
    this.gmApiDefinitions = GM_API_DEFINITIONS;

    // Init code mirror
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
      // Skip if we're currently updating from sidebar to prevent loops
      if (!this.state.isUpdatingFromSidebar) {
        this.syncHeaderToSidebar();
      }
    }, 500); // 500ms debounce
  }

  _debouncedSidebarSync() {
    if (this.state.sidebarSyncTimeout) {
      clearTimeout(this.state.sidebarSyncTimeout);
    }

    this.state.sidebarSyncTimeout = setTimeout(() => {
      this.syncSidebarToHeader();
    }, 500); // 500ms debounce
  }

  syncHeaderToSidebar() {
    try {
      const currentCode = this.codeEditorManager.getValue();
      const headerMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
      
      if (!headerMatch) return; // No header found
      
      const metadata = parseUserScriptMetadata(headerMatch[0]);
      
      // Overwrite sidebar fields with header metadata
      if (metadata.name) this.elements.scriptName.value = metadata.name;
      if (metadata.author) this.elements.scriptAuthor.value = metadata.author;
      if (metadata.version) this.elements.scriptVersion.value = metadata.version;
      if (metadata.description) this.elements.scriptDescription.value = metadata.description;
      if (metadata.license) this.elements.scriptLicense.value = metadata.license;
      if (metadata.icon) this.elements.scriptIcon.value = metadata.icon;
      if (metadata.runAt) this.elements.runAt.value = metadata.runAt.replace(/-/g, '_');
      
      // Update target URLs (replace list with header values)
      if (this.elements.urlList) {
        this.elements.urlList.innerHTML = '';
      }
      if (Array.isArray(metadata.matches) && metadata.matches.length > 0) {
        metadata.matches.forEach(match => {
          this.ui.addUrlToList(match);
        });
      }
      
      // Reset and update GM API checkboxes to reflect @grant
      if (this.gmApiDefinitions) {
        Object.values(this.gmApiDefinitions).forEach(def => {
          const el = this.elements[def.el];
          if (el) el.checked = false;
        });
      }
      if (metadata.gmApis) {
        Object.keys(metadata.gmApis).forEach(apiFlag => {
          const element = this.elements[apiFlag];
          if (element) {
            element.checked = !!metadata.gmApis[apiFlag];
          }
        });
      }
      this.updateApiCount();
      // Update dependent sections visibility after grants change
      this.updateSectionVisibility();
      
      // Update resources (replace list with header values)
      if (this.elements.resourceList) {
        this.elements.resourceList.innerHTML = '';
      }
      if (Array.isArray(metadata.resources) && metadata.resources.length > 0) {
        metadata.resources.forEach(resource => {
          this.ui.addResourceToList(resource.name, resource.url);
        });
      }

      // Update required scripts from @require (replace list)
      if (this.elements.requireList) {
        this.elements.requireList.innerHTML = '';
      }
      if (Array.isArray(metadata.requires) && metadata.requires.length > 0) {
        metadata.requires.forEach(url => this.ui.addRequireToList(url));
      }

    } catch {
      // Silently fail - don't spam console during normal editing
    }
  }

  syncSidebarToHeader() {
    try {
      const currentCode = this.codeEditorManager.getValue();
      const headerMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
      
      // Generate new header from current sidebar data
      const scriptData = this.gatherScriptData();
      const newMetadata = buildTampermonkeyMetadata(scriptData);
      
      let newCode;
      if (headerMatch) {
        // Replace existing header
        newCode = currentCode.replace(headerMatch[0], newMetadata);
      } else {
        // Insert header at the beginning
        newCode = newMetadata + '\n\n' + currentCode;
      }
      
      // Only update if the code actually changed to avoid infinite loops
      if (newCode !== currentCode) {
        // Set flag to prevent header sync during this update
        this.state.isUpdatingFromSidebar = true;
        
        this.codeEditorManager.setValue(newCode);
        
        // Reset flag after a short delay to allow future header syncing
        setTimeout(() => {
          this.state.isUpdatingFromSidebar = false;
        }, 100);
      }
      
    } catch {
      // Silently fail - don't spam console during normal editing
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
      "iconPreview",
      "targetUrl",
      "runAt",
      "injectInto",
      "scriptVersion",
      "scriptDescription",
      "saveBtn",
      "waitForSelector",
      "statusMessage",
      "lintBtn",
      "lintBtnText",
      "cursorInfo",
      "scriptStatusBadge",
      "autosaveBtn",
      "autosaveBtnText",
      "codeEditor",
      "minimap",
      ...getApiElementIds(), // All GM API checkboxes
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
      "generateHeaderBtn",
      "errorLogContainer",
      "clearErrorsBtn",
      "errorCountBadge"
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
      
      // Setup error logging
      this.setupErrorLog();

      await this.codeEditorManager.initializeCodeEditor();
      this.codeEditorManager.toggleLinting(this.state.lintingEnabled);
      this.codeEditorManager.setSaveCallback(() => this.saveScript());
      this.codeEditorManager.setChangeCallback(() => {
        this.markAsDirty();
        if (this.state.isAutosaveEnabled) {
          this._debouncedSave();
        }
        // Check for header changes and update sidebar
        this._debouncedHeaderSync();
        // Update section visibility based on code content
        this.updateSectionVisibility();
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
      window.applyTheme();

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
    const aiScriptId = urlParams.get("aiScriptId");
    this.state.isEditMode = Boolean(this.state.scriptId);

    if (initialTargetUrl && this.elements.targetUrl) {
      this.elements.targetUrl.value = initialTargetUrl;
    }

    // Load existing script if editing
    if (this.state.isEditMode) {
      await this.loadScript(this.state.scriptId);
    } else if (template) {
      this.codeEditorManager.insertDefaultTemplate();
    }

    if (importId) {
      await this.loadImportedScript(importId);
    }
    
    if (aiScriptId) {
      await this.loadAIScript(aiScriptId);
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

  async loadAIScript(aiScriptId) {
    try {
      const key = `tempAIScript_${aiScriptId}`;
      const data = await chrome.storage.local.get(key);
      const aiData = data[key];
      if (!aiData) return;
      
      const { code, sourceUrl } = aiData;

      // Validate and enhance the AI-generated script
      const enhanced = ScriptAnalyzer.validateAndEnhanceMetadata(code, {
        url: sourceUrl || '',
        hostname: sourceUrl ? new URL(sourceUrl).hostname : '',
        userPrompt: 'AI Generated Script'
      });
      
      if (enhanced.warnings && enhanced.warnings.length > 0) {
        enhanced.warnings.forEach(warning => {
          if (warning.suggestion) {
            console.log(`       ${warning.suggestion}`);
          }
        });
        
        // Show a summary to the user
        const fixedCount = enhanced.warnings.length;
        this.ui.showStatusMessage(
          `AI script loaded: ${fixedCount} metadata issue${fixedCount > 1 ? 's' : ''} auto-fixed`, 
          'info'
        );
      }

      // Rebuild script with enhanced metadata
      const enhancedCode = ScriptAnalyzer.rebuildWithEnhancedMetadata(code, enhanced);

      // Parse the enhanced metadata
      const metadata = parseUserScriptMetadata(enhancedCode);

      // Populate form with enhanced AI script data
      this.handleScriptImport({ code: enhancedCode, ...metadata });

      // Mark as unsaved so user can review and save
      this.state.hasUnsavedChanges = true;
      this.ui.updateScriptStatus(true);

      // Clean up storage
      await chrome.storage.local.remove(key);
      
    } catch (err) {
      console.error('Error loading AI script:', err);
      this.ui.showStatusMessage('Failed to load AI-generated script', 'error');
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

  /**
   * Check if code contains @require directives
   */
  hasRequireInCode() {
    const code = this.codeEditorManager?.getValue() || '';
    return /@require\s+\S+/i.test(code);
  }

  /**
   * Check if code contains @resource directives
   */
  hasResourceInCode() {
    const code = this.codeEditorManager?.getValue() || '';
    return /@resource\s+\S+/i.test(code);
  }

  /**
   * Update visibility of script resources section and sidebar icon
   */
  toggleResourcesSection() {
    const resourcesPanel = document.getElementById('resources-panel');
    const resourcesIconBtn = document.querySelector('[data-section="resources"]');
    
    // Determine if section should be visible
    const hasResourceApis = this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked;
    const hasResourcesInList = this.elements.resourceList?.children.length > 0;
    const hasResourceInCode = this.hasResourceInCode();
    
    const shouldShow = hasResourceApis || hasResourcesInList || hasResourceInCode;
    
    // Update panel visibility
    if (resourcesPanel) {
      if (shouldShow) {
        resourcesPanel.classList.remove('hidden');
      } else {
        resourcesPanel.classList.add('hidden');
      }
    }
    
    // Update sidebar icon button visibility
    if (resourcesIconBtn) {
      if (shouldShow) {
        resourcesIconBtn.style.display = 'flex';
      } else {
        resourcesIconBtn.style.display = 'none';
        // If this section was active, collapse the sidebar
        if (resourcesIconBtn.classList.contains('active')) {
          this.elements.sidebar?.classList.remove('expanded', 'has-active-panel');
          resourcesIconBtn.classList.remove('active');
          if (this.elements.sidebarContentArea) {
            this.elements.sidebarContentArea.style.display = 'none';
          }
        }
      }
    }
  }

  /**
   * Update visibility of required scripts section and sidebar icon
   */
  toggleRequiredScriptsSection() {
    const requiresPanel = document.getElementById('requires-panel');
    const requiresIconBtn = document.querySelector('[data-section="requires"]');
    
    // Determine if section should be visible
    const hasRequiresInList = this.elements.requireList?.children.length > 0;
    const hasRequireInCode = this.hasRequireInCode();
    
    const shouldShow = hasRequiresInList || hasRequireInCode;
    
    // Update panel visibility
    if (requiresPanel) {
      if (shouldShow) {
        requiresPanel.classList.remove('hidden');
      } else {
        requiresPanel.classList.add('hidden');
      }
    }
    
    // Update sidebar icon button visibility
    if (requiresIconBtn) {
      if (shouldShow) {
        requiresIconBtn.style.display = 'flex';
      } else {
        requiresIconBtn.style.display = 'none';
        // If this section was active, collapse the sidebar
        if (requiresIconBtn.classList.contains('active')) {
          this.elements.sidebar?.classList.remove('expanded', 'has-active-panel');
          requiresIconBtn.classList.remove('active');
          if (this.elements.sidebarContentArea) {
            this.elements.sidebarContentArea.style.display = 'none';
          }
        }
      }
    }
  }

  /**
   * Update visibility of requires and resources sections based on all conditions
   */
  updateSectionVisibility() {
    this.toggleResourcesSection();
    this.toggleRequiredScriptsSection();
  }

  setupResourceApiListeners() {
    const resourceCheckboxes = [this.elements.gmGetResourceText, this.elements.gmGetResourceURL];
    
    resourceCheckboxes.forEach(checkbox => {
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.updateSectionVisibility();
        });
      }
    });
  }

  registerEventListeners() {
    // Listen for sidebar changes
    this.ui.on('sidebarChanged', () => {
      this.markAsUnsaved();
    });

    this.ui.on('settingChanged', (settings) => {
      this.codeEditorManager.applySettings(settings);
    });
    
    // Setup VSCode-like sidebar icon functionality
    this.setupSidebarIconHandlers();
    
    // Directly add click listener to save button
    this.elements.saveBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveScript();
    });

    // Add click listener to generate header button
    this.elements.generateHeaderBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.generateTampermonkeyHeader();
    });
    
    // Setup UI callbacks - UIManager initializes everything in constructor, no init() method needed
    const callbacks = {
      saveScript: () => this.saveScript(),
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
    this.ui.setupUrlManagement({ 
      markAsUnsaved: () => {
        this.markAsUnsaved();
        this._debouncedSidebarSync();
      },
      updateSectionVisibility: () => this.updateSectionVisibility()
    });
    this.ui.setupResourceManagement({
      ...callbacks,
      markAsUnsaved: () => {
        this.markAsUnsaved();
        this._debouncedSidebarSync();
      },
      updateSectionVisibility: () => this.updateSectionVisibility()
    });

    // Add both change and input events for better responsiveness
    const handleChange = () => {
      this.markAsDirty();
      if (this.state.isAutosaveEnabled) {
        this._debouncedSave();
      }
      // Sync sidebar changes to header
      this._debouncedSidebarSync();
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
      this.elements.injectInto,
      this.elements.targetUrl
    ];

    formInputs.forEach(input => {
      if (input) {
        input.addEventListener('change', handleChange);
        input.addEventListener('input', handleChange);
      }
    });

    this.elements.scriptIcon?.addEventListener('input', () => this.updateIconPreview());

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
    
    // Initial update of section visibility
    this.updateSectionVisibility();

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

  updateIconPreview() {
    const url = this.elements.scriptIcon.value;
    const preview = this.elements.iconPreview;
    if (url) {
      preview.src = url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
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

    sidebarIconBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-section');
        
        // Skip if this is the generate header button (no data-section)
        if (!section) return;
        
        const panel = document.getElementById(`${section}-panel`);
        if (!panel) return;
        
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
    this.elements.injectInto.value = script.injectInto || "default";
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

    // Set GM API checkboxes using definitions
    Object.values(this.gmApiDefinitions).forEach(api => {
      const element = this.elements[api.el];
      if (element) {
        element.checked = !!script[api.el];
      }
    });
      
    // Update section visibility and API count based on loaded script
    this.updateApiCount();
    this.updateSectionVisibility();
    this.updateIconPreview();

    // Populate resource list
    if (this.elements.resourceList) {
      this.elements.resourceList.innerHTML = "";
      if (script.resources && Array.isArray(script.resources)) {
        script.resources.forEach((res) => this.ui.addResourceToList(res.name, res.url));
      }
    }

    // Populate require list
    if (this.elements.requireList) {
      this.elements.requireList.innerHTML = "";
      if (Array.isArray(script.requires)) {
        script.requires.forEach((url) => this.ui.addRequireToList(url));
      }
    }
    
    // Load errors for this script
    if (script.id) {
      this.loadScriptErrors();
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
      injectInto: this.elements.injectInto.value,
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
    scriptData.gmAddValueChangeListener = this.elements.gmAddValueChangeListener?.checked || false;
    scriptData.gmRemoveValueChangeListener = this.elements.gmRemoveValueChangeListener?.checked || false;
    scriptData.gmOpenInTab = this.elements.gmOpenInTab?.checked || false;
    scriptData.gmNotification = this.elements.gmNotification?.checked || false;
    scriptData.gmGetResourceText =
      this.elements.gmGetResourceText?.checked || false;
    scriptData.gmGetResourceURL =
      this.elements.gmGetResourceURL?.checked || false;
    scriptData.gmSetClipboard = this.elements.gmSetClipboard?.checked || false;
    scriptData.gmDownload = this.elements.gmDownload?.checked || false;
    scriptData.gmAddStyle = this.elements.gmAddStyle?.checked || false;
    scriptData.gmAddElement = this.elements.gmAddElement?.checked || false;
    scriptData.gmRegisterMenuCommand = this.elements.gmRegisterMenuCommand?.checked || false;
    scriptData.gmUnregisterMenuCommand = this.elements.gmUnregisterMenuCommand?.checked || false;
    scriptData.gmXmlhttpRequest = this.elements.gmXmlhttpRequest?.checked || false;
    scriptData.unsafeWindow = this.elements.unsafeWindow?.checked || false;
    scriptData.gmLog = this.elements.gmLog?.checked || false;

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
      window.history.replaceState({}, "", `../editor/editor.html?id=${savedScript.id}`);
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
   * Setup error logging system
   */
  setupErrorLog() {
    // Listen for error updates from background
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SCRIPT_ERROR_UPDATE' && message.scriptId === this.state.scriptId) {
        this.loadScriptErrors();
      }
    });

    // Setup clear errors button
    if (this.elements.clearErrorsBtn) {
      this.elements.clearErrorsBtn.addEventListener('click', () => {
        this.clearScriptErrors();
      });
    }

    // Load errors if in edit mode
    if (this.state.scriptId) {
      this.loadScriptErrors();
    }
  }

  /**
   * Load script errors from storage
   */
  async loadScriptErrors() {
    if (!this.state.scriptId) {
      return;
    }

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_SCRIPT_ERRORS', scriptId: this.state.scriptId },
          resolve
        );
      });

      const errors = response?.errors || [];
      this.displayErrors(errors);
    } catch (error) {
      console.error('[CodeTweak Error Log] Failed to load script errors:', error);
    }
  }

  /**
   * Display errors in the error log panel
   */
  displayErrors(errors) {
    const container = this.elements.errorLogContainer;
    const badge = this.elements.errorCountBadge;

    if (!container) {
      console.error('[CodeTweak Error Log] Error log container not found!');
      return;
    }

    // Update badge
    if (badge) {
      if (errors.length > 0) {
        badge.textContent = errors.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Clear container
    container.innerHTML = '';

    if (errors.length === 0) {
      // Show empty state
      container.innerHTML = `
        <div class="error-log-empty">
          <i data-feather="check-circle"></i>
          <p>No errors detected</p>
          <small>Errors will appear here when your script runs</small>
        </div>
      `;
      feather.replace();
      return;
    }

    // Display errors
    errors.forEach((error, index) => {
      const errorItem = document.createElement('div');
      errorItem.className = `error-log-item ${error.type || 'error'}`;
      if (error.resolved) {
        errorItem.classList.add('resolved');
      }

      const timestamp = new Date(error.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const stack = error.stack ? `<div class="error-log-stack">${this.escapeHtml(error.stack)}</div>` : '';

      errorItem.innerHTML = `
        <input type="checkbox" ${error.resolved ? 'checked' : ''} data-error-index="${index}" title="Mark as resolved">
        <div class="error-log-header">
          <span class="error-log-type">${error.type || 'error'}</span>
          <span class="error-log-timestamp">${timestamp}</span>
        </div>
        <div class="error-log-message">${this.escapeHtml(error.message)}</div>
        ${stack}
      `;

      // Add checkbox event listener
      const checkbox = errorItem.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        // Only allow checking, not unchecking (since we dismiss on check)
        if (e.target.checked) {
          // Disable checkbox to prevent multiple clicks
          e.target.disabled = true;
          this.toggleErrorResolved(index);
        } else {
          // Prevent unchecking
          e.target.checked = true;
        }
      });

      container.appendChild(errorItem);
    });

    feather.replace();
  }

  /**
   * Clear all errors for the current script
   */
  async clearScriptErrors() {
    if (!this.state.scriptId) return;

    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'CLEAR_SCRIPT_ERRORS', scriptId: this.state.scriptId },
          resolve
        );
      });

      this.displayErrors([]);
      this.ui.showStatusMessage('Errors cleared', 'success');
    } catch (error) {
      console.error('[CodeTweak Error Log] Failed to clear script errors:', error);
      this.ui.showStatusMessage('Failed to clear errors', 'error');
    }
  }

  /**
   * Dismiss error with animation
   */
  async toggleErrorResolved(errorIndex) {
    if (!this.state.scriptId) return;

    try {
      // Get current errors
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_SCRIPT_ERRORS', scriptId: this.state.scriptId },
          resolve
        );
      });

      const errors = response?.errors || [];
      if (errors[errorIndex]) {
        // Mark as resolved and trigger animation
        errors[errorIndex].resolved = true;
        
        // Temporarily save to trigger animation
        const storageKey = `scriptErrors_${this.state.scriptId}`;
        await chrome.storage.local.set({ [storageKey]: errors });
        
        // Refresh display to show animation
        this.displayErrors(errors);
        
        // After animation completes, remove the error
        setTimeout(async () => {
          // Remove the error from array
          errors.splice(errorIndex, 1);
          await chrome.storage.local.set({ [storageKey]: errors });
          this.displayErrors(errors);
        }, 300); // Match animation duration
      }
    } catch (error) {
      console.error('[CodeTweak Error Log] Failed to dismiss error:', error);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

  /**
   * Generate Tampermonkey-style header and insert at top of code editor
   */
  generateTampermonkeyHeader() {
    try {
      const scriptData = this.gatherScriptData();
      const metadata = buildTampermonkeyMetadata(scriptData);
      
      // Get current code content
      const currentCode = this.codeEditorManager.getValue();
      
      // Check if there's already a userscript header
      const existingHeaderMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
      
      let newCode;
      if (existingHeaderMatch) {
        // Replace existing header
        newCode = currentCode.replace(existingHeaderMatch[0], metadata);
        this.ui.showStatusMessage('Metadata updated', 'success');
      } else {
        // Insert header at the beginning
        newCode = metadata + '\n\n' + currentCode;
        this.ui.showStatusMessage('Metadata generated', 'success');
      }
      
      // Set the new code content
      this.codeEditorManager.setValue(newCode);
      
      // Mark as dirty to indicate changes
      this.markAsDirty();
      
    } catch (err) {
      console.error('Generate header failed:', err);
      this.ui.showStatusMessage('Failed to generate header', 'error');
    }
  }
}

// Main init for editor
document.addEventListener("DOMContentLoaded", async () => {
  // Setup help modal tabs
  setupHelpModalTabs();
  
  // Apply translations
  await applyTranslations();
  
  // Initialize Feather icons
  feather.replace();
  
  const editor = new ScriptEditor();
  editor.init().catch((error) => {
    console.error("Failed to initialize script editor:", error);
  });
});



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
