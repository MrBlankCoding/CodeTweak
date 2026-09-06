import logger from '../shared/utils/logger.js';
import { EventBus } from './base/EventBus.js';
import { ModalManager } from './managers/ModalManager.js';
import { SidebarManager } from './managers/SidebarManager.js';
import { StatusManager } from './managers/StatusManager.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { URLManager } from './managers/URLManager.js';
import { RequireManager } from './managers/RequireManager.js';
import { ResourceManager } from './managers/ResourceManager.js';
import { FormManager } from './managers/FormManager.js';
import { storageService } from '../services/storage/StorageService.js';
import { FormValidator } from './validation/FormValidator.js';

export {
  ModalManager,
  SidebarManager,
  StatusManager,
  SettingsManager,
  URLManager,
  RequireManager,
  ResourceManager,
  FormManager,
  storageService,
  FormValidator,
};

export class UIManager {
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
    this.components.modal = new ModalManager(
      {
        settingsBtn: this.elements.settingsBtn,
        closeSettings: this.elements.closeSettings,
        settingsModal: this.elements.settingsModal,
        helpButton: document.getElementById('helpButton'),
      },
      this.eventBus
    );
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

    document.addEventListener('mousedown', trackInteraction, { once: true });
    document.addEventListener('keydown', trackInteraction, { once: true });

    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges && hasUserInteraction) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    });
  }

  setupButtonEventListeners() {
    if (this.components.form && typeof this.components.form.setupEventListeners === 'function') {
      this.components.form.setupEventListeners();
    }
  }

  setupFormEventListeners(onChange) {
    if (this.components.form && typeof this.components.form.setupEventListeners === 'function') {
      this.components.form.setupEventListeners(onChange);
    }
  }

  setupUrlManagement(callbacks) {
    if (this.components.url && typeof this.components.url.setupUrlManagement === 'function') {
      this.components.url.setupUrlManagement(callbacks);
    }
  }

  setupSettingsModal(callbacks) {
    if (
      this.components.settings &&
      typeof this.components.settings.setupModalListeners === 'function'
    ) {
      this.components.settings.setupModalListeners(callbacks);
    }
  }

  setupResourceManagement(callbacks) {
    if (
      this.components.resource &&
      typeof this.components.resource.setupEventListeners === 'function'
    ) {
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
    if (
      this.components.resource &&
      typeof this.components.resource.addResourceToList === 'function'
    ) {
      this.components.resource.addResourceToList(name, url);
    } else {
      logger.warn('ResourceManager not properly initialized');
    }
  }

  addRequireToList(url) {
    if (this.components.require && typeof this.components.require.addRequireToList === 'function') {
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
    if (this.components.status && typeof this.components.status.updateScriptStatus === 'function') {
      this.components.status.updateScriptStatus(hasUnsavedChanges);
    }
  }

  showStatusMessage(message, type = 'success', duration = 3000) {
    if (this.components.status && typeof this.components.status.showMessage === 'function') {
      this.components.status.showMessage(message, type, duration);
    }
  }

  clearStatusMessage() {
    if (this.components.status && typeof this.components.status.clearMessage === 'function') {
      this.components.status.clearMessage();
    }
  }

  // Proxies for backwords compatability
  initializeCollapsibleSections() {
    if (
      this.components.sidebar &&
      typeof this.components.sidebar.initializeCollapsibleSections === 'function'
    ) {
      this.components.sidebar.initializeCollapsibleSections();
    }
  }

  addUrlToList(url) {
    if (this.components.url && typeof this.components.url.addUrlToList === 'function') {
      this.components.url.addUrlToList(url);
    }
  }

  updateSidebarState() {
    if (this.components.sidebar && typeof this.components.sidebar.updateVisibility === 'function') {
      this.components.sidebar.updateVisibility();
    }
  }
}
