import logger from '../shared/utils/logger.js';
import feather from 'feather-icons';
import { UIManager, storageService, FormValidator } from './editor_managers.js';
import { CodeEditorManager } from './editor_settings.js';
import { GM_API_DEFINITIONS, getApiElementIds } from '../shared/constants/gmApiDefinitions.js';
import { applyTranslations } from '../shared/utils/i18n.js';

import { Deobfuscator } from './deobfuscator.js';
import { ErrorLogUI } from './errorLog.js';
import { MetadataSync } from './sync.js';
import { registerEditorEventListeners } from './events.js';
import { EditorActions } from './actions/EditorActions.js';
import { EditorUIHelper } from './components/EditorUIHelper.js';

export class ScriptEditor {
  constructor() {
    this.config = {
      RUN_MODES: {
        DOCUMENT_START: 'document_start',
        DOCUMENT_END: 'document_end',
        DOCUMENT_IDLE: 'document_idle',
      },
      DEFAULT_VERSION: '1.0.0',
      SIDEBAR_BREAKPOINT: 900,
      AUTOSAVE_DELAY: 1220,
      STATUS_TIMEOUT: 2000,
    };

    this.state = {
      isEditMode: false,
      scriptId: null,
      hasUnsavedChanges: false,
      isSidebarVisible: window.innerWidth > this.config.SIDEBAR_BREAKPOINT,
      lintingEnabled: localStorage.getItem('lintingEnabled') === 'true',
      isAutosaveEnabled: localStorage.getItem('autosaveEnabled') === 'true',
      autosaveTimeout: null,
      headerSyncTimeout: null,
      sidebarSyncTimeout: null,
      isUpdatingFromSidebar: false,
      hasUserInteraction: false,
      codeEditor: null,
      storageChangeListener: null,
    };

    this.elements = this.cacheElements();
    this.ui = new UIManager(this.elements, this.state, this.config);
    this.storage = storageService;
    this.validator = new FormValidator(this.elements);
    this.gmApiDefinitions = GM_API_DEFINITIONS;

    this.codeEditorManager = new CodeEditorManager(
      this.elements,
      this.state,
      this.config,
      this.gmApiDefinitions
    );

    this.metadataSync = new MetadataSync(
      this.elements,
      this.state,
      this.codeEditorManager,
      this.ui,
      this.gmApiDefinitions,
      this.config
    );

    this.deobfuscator = new Deobfuscator(this.ui, this.codeEditorManager, this.state);
    this.errorLog = new ErrorLogUI(this.elements, this.state, this.ui);

    this.actions = new EditorActions(this);
    this.uiHelper = new EditorUIHelper(this);
  }

  _debouncedSave() {
    if (this.state.autosaveTimeout) {
      clearTimeout(this.state.autosaveTimeout);
    }

    this.state.autosaveTimeout = setTimeout(async () => {
      if (this.state.hasUnsavedChanges && this.state.isEditMode) {
        try {
          await this.saveScript(true);
        } catch (error) {
          logger.error('Autosave failed:', error);
          this.ui.showStatusMessage('Autosave failed', 'error');
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
        this.metadataSync.syncHeaderToSidebar();
      }
    }, 500);
  }

  _debouncedSidebarSync() {
    if (this.state.sidebarSyncTimeout) {
      clearTimeout(this.state.sidebarSyncTimeout);
    }

    this.state.sidebarSyncTimeout = setTimeout(() => {
      this.metadataSync.syncSidebarToHeader();
    }, 500);
  }

  cacheElements() {
    const elementIds = [
      'scriptName',
      'scriptAuthor',
      'scriptLicense',
      'scriptIcon',
      'iconPreview',
      'targetUrl',
      'runAt',
      'injectInto',
      'scriptVersion',
      'scriptDescription',
      'saveBtn',
      'waitForSelector',
      'statusMessage',
      'lintBtn',
      'lintBtnText',
      'cursorInfo',
      'scriptStatusBadge',
      'autosaveBtn',
      'autosaveBtnText',
      'codeEditor',
      'minimap',
      ...getApiElementIds(),
      'apiSearch',
      'apiCountBadge',
      'addUrlBtn',
      'urlList',
      'patternBaseUrl',
      'patternScope',
      'generatePatternBtn',
      'generatedPattern',
      'generatedPatternGroup',
      'insertPatternBtn',
      'addResourceBtn',
      'resourceName',
      'resourceURL',
      'resourceList',
      'addRequireBtn',
      'requireURL',
      'requireList',
      'helpButton',
      'generateHeaderBtn',
      'deobfuscateBtn',
      'errorLogContainer',
      'clearErrorsBtn',
      'errorCountBadge',
    ];

    const elements = {};
    elementIds.forEach((id) => {
      elements[id] = document.getElementById(id);
    });

    elements.sidebar = document.querySelector('.sidebar');
    elements.sidebarIconBar = document.querySelector('.sidebar-icon-bar');
    elements.sidebarContentArea = document.querySelector('.sidebar-content-area');
    elements.sidebarIconBtns = document.querySelectorAll('.sidebar-icon-btn');
    elements.sidebarPanels = document.querySelectorAll('.sidebar-panel');
    elements.sectionToggles = document.querySelectorAll('.section-toggle');
    elements.mainContent = document.querySelector('.main-content');
    elements.settingsModal = document.getElementById('settingsModal');
    elements.requiresSection = document.getElementById('requiresSection');

    return elements;
  }

  async init() {
    try {
      this.setDefaultValues();
      this.state.isAutosaveEnabled = localStorage.getItem('autosaveEnabled') !== 'false';
      this.state.lintingEnabled = localStorage.getItem('lintingEnabled') !== 'false';

      await this.codeEditorManager.initializeCodeEditor();

      this.codeEditorManager.setSaveCallback(() => this.saveScript());
      this.codeEditorManager.setChangeCallback(() => {
        this.markAsDirty();
        this._debouncedHeaderSync();
        this.updateSectionVisibility();
      });
      this.codeEditorManager.setImportCallback((importData) => this.handleScriptImport(importData));

      this.ui.updateScriptStatus(this.state.hasUnsavedChanges);

      await this.parseUrlParams();
      this.setupEditorMode();
      this.ui.initializeCollapsibleSections();

      registerEditorEventListeners(this);
      this.setupBackgroundConnection();
      this.errorLog.setup();

      logger.info('Script editor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize script editor:', error);
      this.ui.showStatusMessage('Editor initialization failed.', 'error');
    }
  }

  setupEditorMode() {
    if (this.state.isEditMode) {
      this.ui.showStatusMessage('Editing existing script', 'success');
    } else {
      this.ui.showStatusMessage('Creating new script', 'success');
      this.codeEditorManager.insertDefaultTemplate();
      this.updateSectionVisibility();
      this.markAsDirty();
    }
  }

  async parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (id) {
      this.state.scriptId = id;
      this.state.isEditMode = true;
      await this.loadScript(id);
      return;
    }

    const importId = params.get('importId');
    if (importId) {
      await this.loadTempImport(importId);
    }
  }

  async loadTempImport(importId) {
    const browser = globalThis.browser ?? globalThis.chrome;
    const key = `tempImport_${importId}`;
    try {
      const { [key]: staged = {} } = await browser.storage.local.get(key);
      if (!staged?.code) {
        this.ui.showStatusMessage('Import data expired or missing.', 'error');
        return;
      }
      this.codeEditorManager.setValue(staged.code);
      this._debouncedHeaderSync();
      this.markAsDirty();
      this.ui.showStatusMessage('Imported script ready.', 'success');
    } catch (error) {
      logger.error('Failed to load import:', error);
      this.ui.showStatusMessage('Failed to load import.', 'error');
    } finally {
      browser.storage.local.remove(key).catch(() => {});
    }
  }

  setDefaultValues() {
    if (this.elements.scriptVersion) {
      this.elements.scriptVersion.value = this.config.DEFAULT_VERSION;
    }
    if (this.elements.runAt) {
      this.elements.runAt.value = this.config.RUN_MODES.DOCUMENT_IDLE;
    }
    this.updateApiCount();
  }

  markAsDirty() {
    this.state.hasUnsavedChanges = true;
    this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
  }

  handleScriptImport(importData) {
    this.populateFormWithScript(importData);
    this.markAsDirty();
    this.ui.showStatusMessage('Script metadata imported successfully', 'success');
  }

  updateSectionVisibility() {
    this.uiHelper.updateSectionVisibility();
  }

  setupResourceApiListeners() {
    this.uiHelper.setupResourceApiListeners();
  }

  updateIconPreview() {
    this.uiHelper.updateIconPreview();
  }

  setupSidebarIconHandlers() {
    this.uiHelper.setupSidebarIconHandlers();
  }

  markAsUnsaved() {
    this.state.hasUnsavedChanges = true;
    this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
  }

  async loadScript(id) {
    try {
      const script = await this.storage.getScript(id);
      if (!script) {
        this.ui.showStatusMessage('Script not found.', 'error');
        return;
      }
      this.populateFormWithScript(script);
      this.state.hasUnsavedChanges = false;
      this.ui.updateScriptStatus(false);
      this.codeEditorManager.updateEditorLintAndAutocomplete();
    } catch (error) {
      logger.error('Error loading script:', error);
      this.ui.showStatusMessage(`Failed to load script: ${error.message}`, 'error');
    }
  }

  populateFormWithScript(script) {
    const { elements, gmApiDefinitions, ui, codeEditorManager } = this;
    elements.scriptName.value = script.name || '';
    elements.scriptAuthor.value = script.author || '';
    elements.runAt.value = script.runAt || 'document_idle';
    elements.injectInto.value = script.injectInto || 'default';
    elements.scriptVersion.value = script.version || this.config.DEFAULT_VERSION;
    elements.scriptDescription.value = script.description || '';
    elements.scriptLicense.value = script.license || '';
    elements.scriptIcon.value = script.icon || '';
    codeEditorManager.setValue(script.code || '');

    if (elements.urlList) elements.urlList.innerHTML = '';
    script.targetUrls?.forEach((url) => ui.addUrlToList(url));

    Object.values(gmApiDefinitions).forEach((api) => {
      const element = elements[api.el];
      if (element) element.checked = !!script[api.el];
    });

    this.updateApiCount();
    this.updateSectionVisibility();
    this.updateIconPreview();

    if (elements.resourceList) {
      elements.resourceList.innerHTML = '';
      script.resources?.forEach((res) => ui.addResourceToList(res.name, res.url));
    }

    if (elements.requireList) {
      elements.requireList.innerHTML = '';
      script.requires?.forEach((url) => ui.addRequireToList(url));
    }

    if (script.id) this.errorLog.loadErrors();
  }

  async saveScript(quiet = false) {
    return this.actions.saveScript(quiet);
  }

  async notifyBackgroundScript() {
    const browser = globalThis.browser ?? globalThis.chrome;
    try {
      await new Promise((resolve) => {
        browser.runtime.sendMessage({ action: 'scriptsUpdated' }, () => {
          if (browser.runtime.lastError)
            logger.warn('Background sync warning:', browser.runtime.lastError);
          resolve();
        });
      });
    } catch (error) {
      logger.warn('Background sync warning:', error);
    }
  }

  setupBackgroundConnection() {
    const browser = globalThis.browser ?? globalThis.chrome;
    try {
      const port = browser.runtime.connect({ name: 'CodeTweak' });
      port.onDisconnect.addListener(() => logger.info('Background connection closed'));
    } catch (error) {
      logger.warn('Initial background connection failed:', error);
    }
  }

  updateApiCount() {
    const checkedCount = Object.values(this.gmApiDefinitions).filter(
      (api) => this.elements[api.el]?.checked
    ).length;

    if (this.elements.apiCountBadge) {
      this.elements.apiCountBadge.textContent = checkedCount;
      this.elements.apiCountBadge.style.display = checkedCount > 0 ? 'inline' : 'none';
    }
  }

  exportScript() {
    this.actions.exportScript();
  }

  generateHeader() {
    this.actions.generateHeader();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupHelpModalTabs();
  await applyTranslations();
  feather.replace();

  const editor = new ScriptEditor();
  editor.init().catch((error) => logger.error('Failed to initialize script editor:', error));
});

function setupHelpModalTabs() {
  const tabButtons = document.querySelectorAll('.help-tab');
  const tabContents = document.querySelectorAll('.help-tab-content');
  if (!tabButtons.length || !tabContents.length) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', function () {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      const content = document.getElementById('help-tab-' + tab);
      if (content) content.classList.add('active');
    });
  });
}
