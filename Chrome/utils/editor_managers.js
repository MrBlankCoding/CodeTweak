/* global chrome */
import { generateUrlMatchPattern } from "./urlMatchPattern.js";

// Base for editor UI
class BaseUIComponent {
  constructor(elements, eventBus) {
    this.elements = elements;
    this.eventBus = eventBus;
    this.eventListeners = [];
  }

  // Keep track of our event listeners for cleanup
  addEventListener(element, event, handler, options = {}) {
    if (element) {
      element.addEventListener(event, handler, options);
      this.eventListeners.push({ element, event, handler });
    }
  }

  // Remove all event listners
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
}

// For the settings modal
export class ModalManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Settings modal
    if (this.elements.settingsBtn) {
      this.addEventListener(this.elements.settingsBtn, 'click', () => {
        this.showModal('settings');
      });

      this.addEventListener(this.elements.closeSettings, 'click', () => {
        this.hideModal('settings');
      });
    }

    // Help modal
    if (this.elements.helpButton) {
      this.addEventListener(this.elements.helpButton, 'click', (e) => {
        e.stopPropagation();
        this.showModal('help');
      });

      // Close button inside help modal
      const closeHelpButton = document.querySelector('.close-help-modal');
      if (closeHelpButton) {
        this.addEventListener(closeHelpButton, 'click', (e) => {
          e.stopPropagation();
          this.hideModal('help');
        });
      }
    }

    // Close modal on outside click or Escape key
    this.addEventListener(document, 'click', (e) => {
      if (e.target.classList.contains('modal') && e.target.classList.contains('show')) {
        const modalType = e.target.id.replace('Modal', '');
        this.hideModal(modalType);
      }
    });

    this.addEventListener(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
          const modalType = openModal.id.replace('Modal', '');
          this.hideModal(modalType);
        }
      }
    });
  }

  showModal(modalType) {
    const modal = document.getElementById(`${modalType}Modal`);
    if (modal) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      modal.classList.add('show');
      modal.style.display = 'flex';
      
      // Add a class to the body when any modal is open
      document.body.classList.add('modal-open');
      
      // Focus the first focusable element
      const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus();
      
      this.emit('modalOpened', { type: modalType });
    }
  }

  hideModal(modalType) {
    const modal = document.getElementById(`${modalType}Modal`);
    if (modal && modal.classList.contains('show')) {
      // Restore body scroll if no other modals are open
      const openModals = document.querySelectorAll('.modal.show');
      if (openModals.length <= 1) {
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
      }
      
      modal.classList.remove('show');
      
      // Wait for the transition to complete before hiding
      setTimeout(() => {
        modal.style.display = 'none';
      }, 200);
      
      this.emit('modalClosed', { type: modalType });
    }
  }
}

export class SidebarManager extends BaseUIComponent {
  constructor(elements, eventBus, config) {
    super(elements, eventBus);
    this.config = config;
    this.isVisible = true;
    this.collapsedSections = {};
    this.setupEventListeners();
    this.loadState();
  }

  setupEventListeners() {
    this.addEventListener(this.elements.sidebarToggle, 'click', (e) => {
      this.toggle(e);
    });

    this.addEventListener(document, 'click', (e) => {
      this.handleDocumentClick(e);
    });

    // Listen for keyboard shortcut events
    this.on('sidebarToggleRequested', () => {
      this.toggle();
    });

    this.initializeCollapsibleSections();
  }

  async loadState() {
    try {
      const result = await chrome.storage.local.get(['isSidebarCollapsed', 'collapsedSections']);
      this.isVisible = !result.isSidebarCollapsed;
      this.collapsedSections = result.collapsedSections || {};
      this.updateVisibility();
    } catch (error) {
      console.warn('Failed to load sidebar state:', error);
    }
  }

  async saveState() {
    try {
      await chrome.storage.local.set({
        isSidebarCollapsed: !this.isVisible,
        collapsedSections: this.collapsedSections
      });
    } catch (error) {
      console.warn('Failed to save sidebar state:', error);
    }
  }

  toggle(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    this.isVisible = !this.isVisible;
    this.updateVisibility();
    this.saveState();
    this.emit('sidebarToggled', { isVisible: this.isVisible });
  }

  updateVisibility() {
    const { sidebar } = this.elements;
    
    if (this.isVisible) {
      sidebar.classList.remove('collapsed');
      sidebar.style.width = '300px';
    } else {
      sidebar.classList.add('collapsed');
      sidebar.style.width = '0';
    }

    setTimeout(() => {
      this.emit('layoutChanged');
    }, 300);
  }

  initializeCollapsibleSections() {
    const sections = this.elements.sidebar.querySelectorAll('.collapsible');
    
    sections.forEach((section) => {
      const sectionId = section.dataset.section;
      
      // Initialize collapsed state from storage or default to false
      if (this.collapsedSections[sectionId] === undefined) {
        this.collapsedSections[sectionId] = false;
      }
      
      // Set initial state
      if (this.collapsedSections[sectionId]) {
        section.classList.add('collapsed');
      } else {
        section.classList.remove('collapsed');
      }

      // Add click handler to section headers
      const header = section.querySelector('.section-header');
      if (header) {
        // Remove any existing click handlers to prevent duplicates
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
        
        this.addEventListener(newHeader, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleSection(section);
        });
      }
    });
  }

  toggleSection(section) {
    const sectionId = section.dataset.section;
    if (!sectionId) return;
    
    // Toggle the collapsed state
    const isCollapsing = !section.classList.contains('collapsed');
    this.collapsedSections[sectionId] = isCollapsing;
    
    // Update the DOM
    if (isCollapsing) {
      section.classList.add('collapsed');
    } else {
      section.classList.remove('collapsed');
    }
    
    // Save the state and notify any listeners
    this.saveState();
    this.emit('sectionToggled', { sectionId, isCollapsed: isCollapsing });
    
    // Trigger layout update after a short delay to allow for CSS transitions
    setTimeout(() => {
      this.emit('layoutChanged');
    }, 100);
  }

  handleDocumentClick(event) {
    if (
      window.innerWidth <= this.config.SIDEBAR_BREAKPOINT &&
      this.elements.sidebar.classList.contains('active') &&
      !this.elements.sidebar.contains(event.target) &&
      event.target !== this.elements.sidebarToggle
    ) {
      this.isVisible = false;
      this.updateVisibility();
    }
  }
}

export class StatusManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.on('scriptStatusChanged', ({ hasUnsavedChanges }) => {
      this.updateScriptStatus(hasUnsavedChanges);
    });
  }

  updateScriptStatus(hasUnsavedChanges) {
    const badge = this.elements.scriptStatusBadge;
    if (!badge) return;

    if (hasUnsavedChanges) {
      badge.textContent = 'Unsaved Changes';
      badge.style.backgroundColor = '#4B5563';
      badge.style.color = '#D1D5DB';
    } else {
      badge.textContent = 'Saved';
      badge.style.backgroundColor = '#065F46';
      badge.style.color = '#A7F3D0';
    }
  }

  showMessage(message, type = 'success', duration = 3000) {
    const { statusMessage } = this.elements;
    if (!statusMessage) return;

    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => this.clearMessage(), duration);
    }
  }

  clearMessage() {
    const { statusMessage } = this.elements;
    if (!statusMessage) return;

    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
    statusMessage.style.display = 'none';
  }

  showError(message) {
    this.showMessage(message, 'error', 5000);
  }

  showSuccess(message) {
    this.showMessage(message, 'success', 3000);
  }
}

export class SettingsManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.settingsInputs = this.getSettingsInputs();
    this.setupEventListeners();
  }

  getSettingsInputs() {
    return {
      theme: document.getElementById('editorTheme'),
      fontSize: document.getElementById('fontSize'),
      tabSize: document.getElementById('tabSize'),
      lineNumbers: document.getElementById('lineNumbers'),
      lineWrapping: document.getElementById('lineWrapping'),
      matchBrackets: document.getElementById('matchBrackets'),
      lintingEnabled: document.getElementById('lintingEnabled'),
      autosaveEnabled: document.getElementById('autosaveEnabled')
    };
  }

  setupEventListeners() {
    this.setupInstantApplyListeners();
    this.setupModalListeners();
    this.setupActionButtons();
  }

  setupInstantApplyListeners() {
    const { settingsInputs } = this;

    // Font size 
    if (settingsInputs.fontSize) {
      this.addEventListener(settingsInputs.fontSize, 'input', () => {
        const value = parseInt(settingsInputs.fontSize.value, 10);
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeValue) {
          fontSizeValue.textContent = value + 'px';
        }
        this.emit('settingChanged', { fontSize: value });
      });
    }

    // Theme
    if (settingsInputs.theme) {
      this.addEventListener(settingsInputs.theme, 'change', () => {
        this.emit('settingChanged', { theme: settingsInputs.theme.value });
      });
    }

    // Tab size
    if (settingsInputs.tabSize) {
      this.addEventListener(settingsInputs.tabSize, 'input', () => {
        this.emit('settingChanged', { 
          tabSize: parseInt(settingsInputs.tabSize.value, 10) 
        });
      });
    }

    // Boolean settings
    ['lineNumbers', 'lineWrapping', 'matchBrackets'].forEach(setting => {
      if (settingsInputs[setting]) {
        this.addEventListener(settingsInputs[setting], 'change', () => {
          this.emit('settingChanged', { 
            [setting]: settingsInputs[setting].checked 
          });
        });
      }
    });

    // Local storage settings
    if (settingsInputs.lintingEnabled) {
      this.addEventListener(settingsInputs.lintingEnabled, 'change', () => {
        const enabled = settingsInputs.lintingEnabled.checked;
        localStorage.setItem('lintingEnabled', enabled.toString());
        this.emit('lintingToggled', { enabled });
      });
    }

    if (settingsInputs.autosaveEnabled) {
      this.addEventListener(settingsInputs.autosaveEnabled, 'change', () => {
        const enabled = settingsInputs.autosaveEnabled.checked;
        localStorage.setItem('autosaveEnabled', enabled.toString());
        this.emit('autosaveToggled', { enabled });
      });
    }
  }

  setupModalListeners() {
    this.on('modalOpened', ({ type }) => {
      if (type === 'settings') {
        this.loadSettingsIntoModal();
      }
    });
  }

  setupActionButtons() {
    const saveBtn = document.getElementById('saveSettings');
    const resetBtn = document.getElementById('resetSettings');
    const closeBtn = document.querySelector('#settingsModal .close');

    if (saveBtn) {
      this.addEventListener(saveBtn, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Main save action
        await this.saveAllSettings();
      });
    }

    if (resetBtn) {
      this.addEventListener(resetBtn, 'click', (e) => {
        e.preventDefault();
        this.resetToDefaults();
      });
    }

    if (closeBtn) {
      this.addEventListener(closeBtn, 'click', (e) => {
        e.preventDefault();
        const modal = document.getElementById('settingsModal');
        if (modal) {
          modal.classList.remove('show');
          modal.style.display = 'none';
          document.body.style.overflow = '';
        }
      });
    }
  }

  async loadSettingsIntoModal() {
    try {
      const settings = await this.loadSettings();
      const { settingsInputs } = this;

      if (settingsInputs.theme) settingsInputs.theme.value = settings.theme || 'ayu-dark';
      if (settingsInputs.fontSize) {
        settingsInputs.fontSize.value = settings.fontSize || 14;
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeValue) fontSizeValue.textContent = (settings.fontSize || 14) + 'px';
      }
      if (settingsInputs.tabSize) settingsInputs.tabSize.value = settings.tabSize || 2;
      if (settingsInputs.lineNumbers) settingsInputs.lineNumbers.checked = !!settings.lineNumbers;
      if (settingsInputs.lineWrapping) settingsInputs.lineWrapping.checked = !!settings.lineWrapping;
      if (settingsInputs.matchBrackets) settingsInputs.matchBrackets.checked = !!settings.matchBrackets;
      if (settingsInputs.lintingEnabled) {
        settingsInputs.lintingEnabled.checked = localStorage.getItem('lintingEnabled') === 'true';
      }
      if (settingsInputs.autosaveEnabled) {
        settingsInputs.autosaveEnabled.checked = localStorage.getItem('autosaveEnabled') === 'true';
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['editorSettings']);
      return result.editorSettings || this.getDefaultSettings();
    } catch (error) {
      console.error('Failed to load settings from storage:', error);
      return this.getDefaultSettings();
    }
  }

  async saveAllSettings() {
    try {
      const { settingsInputs } = this;
      const newSettings = {
        theme: settingsInputs.theme?.value || 'ayu-dark',
        fontSize: parseInt(settingsInputs.fontSize?.value, 10) || 14,
        tabSize: parseInt(settingsInputs.tabSize?.value, 10) || 2,
        lineNumbers: !!settingsInputs.lineNumbers?.checked,
        lineWrapping: !!settingsInputs.lineWrapping?.checked,
        matchBrackets: !!settingsInputs.matchBrackets?.checked
      };

      // Save to chrome.storage.local
      await chrome.storage.local.set({ editorSettings: newSettings });
      
      // Emit the event with the new settings
      this.emit('settingsSaved', newSettings);
      
      // Apply the settings to the editor
      this.emit('settingChanged', newSettings);
      
      // Show success message
      this.emit('showStatus', { message: 'Settings saved successfully', type: 'success' });
      
      // Close the modal immediately
      const modal = document.getElementById('settingsModal');
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
      
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.emit('showStatus', { 
        message: 'Failed to save settings: ' + (error.message || 'Unknown error'),
        type: 'error' 
      });
      return false;
    }
  }

  resetToDefaults() {
    const defaults = this.getDefaultSettings();
    const { settingsInputs } = this;

    if (settingsInputs.theme) settingsInputs.theme.value = defaults.theme;
    if (settingsInputs.fontSize) {
      settingsInputs.fontSize.value = defaults.fontSize;
      const fontSizeValue = document.getElementById('fontSizeValue');
      if (fontSizeValue) fontSizeValue.textContent = defaults.fontSize + 'px';
    }
    if (settingsInputs.tabSize) settingsInputs.tabSize.value = defaults.tabSize;
    if (settingsInputs.lineNumbers) settingsInputs.lineNumbers.checked = defaults.lineNumbers;
    if (settingsInputs.lineWrapping) settingsInputs.lineWrapping.checked = defaults.lineWrapping;
    if (settingsInputs.matchBrackets) settingsInputs.matchBrackets.checked = defaults.matchBrackets;
    if (settingsInputs.lintingEnabled) settingsInputs.lintingEnabled.checked = true;
    if (settingsInputs.autosaveEnabled) settingsInputs.autosaveEnabled.checked = true;

    // Reset local storage
    localStorage.setItem('lintingEnabled', 'true');
    localStorage.setItem('autosaveEnabled', 'true');

    this.emit('settingsReset', defaults);
  }

  getDefaultSettings() {
    return {
      theme: 'ayu-dark',
      fontSize: 14,
      tabSize: 2,
      lineNumbers: true,
      lineWrapping: true,
      matchBrackets: true
    };
  }
}

export class URLManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.statusManager = elements.statusManager || elements.status; // Try both possible locations
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.elements.addUrlBtn) {
      this.addEventListener(this.elements.addUrlBtn, 'click', (e) => {
        e.preventDefault();
        this.addCurrentUrl();
      });
    }

    if (this.elements.urlList) {
      this.addEventListener(this.elements.urlList, 'click', (e) => {
        if (e.target.closest('.remove-btn')) {
          e.preventDefault();
          this.removeUrl(e.target.closest('.url-item'));
        }
      });
    }

    if (this.elements.targetUrl) {
      this.addEventListener(this.elements.targetUrl, 'keypress', (e) => {
        if (e.key === 'Enter') {
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
        this.statusManager.showError('URL cannot be empty.');
      }
      return;
    }

    if (this.isValidUrl(url)) {
      this.addUrlToList(url);
      this.elements.targetUrl.value = '';
      this.emit('urlAdded', { url });
    } else {
      if (this.statusManager) {
        this.statusManager.showError('Invalid URL pattern.');
      }
    }
  }

  addUrlToList(url) {
    // Note: We don't need to validate URL here since it's already validated in addCurrentUrl
    // This prevents duplicate error messages
    try {
      const urlItem = document.createElement('div');
      urlItem.className = 'url-item';
      urlItem.dataset.url = url;
      urlItem.innerHTML = `
        <span>${this.escapeHtml(url)}</span>
        <button type="button" class="remove-btn" title="Remove URL">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      if (this.elements.urlList) {
        this.elements.urlList.appendChild(urlItem);
        this.emit('sidebarChanged');
        return true;
      }
    } catch (e) {
      console.error('Error adding URL to list:', e);
    }
    return false;
  }

  removeUrl(urlItem) {
    if (!urlItem) return;
    
    const url = urlItem.dataset?.url;
    if (urlItem.remove) {
      urlItem.remove();
    } else if (urlItem.parentNode) {
      urlItem.parentNode.removeChild(urlItem);
    }
    
    if (url) {
      this.emit('urlRemoved', { url });
      this.emit('sidebarChanged');
    }
  }

  getUrls() {
    return Array.from(this.elements.urlList.querySelectorAll('.url-item'))
      .map(item => item.dataset.url);
  }

  isValidUrl(url) {
    try {
      // First check if URL has protocol
      if (!url.match(/^https?:\/\//i)) {
        if (this.statusManager) {
          this.statusManager.showError(
            'Please enter a valid URL in this format: https://example.com (include http:// or https://)'
          );
        }
        return false;
      }
      
      // Then validate the full URL
      new URL(url);
      return true;
    } catch {
      if (this.statusManager) {
        this.statusManager.showError(
          'Please enter a valid URL in this format: https://example.com (include http:// or https://)'
        );
      }
      return false;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export class RequireManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.elements.addRequireBtn) {
      this.addEventListener(this.elements.addRequireBtn, 'click', () => {
        this.addCurrentRequire();
      });
    }

    if (this.elements.requireList) {
      this.addEventListener(this.elements.requireList, 'click', (e) => {
        if (e.target.classList.contains('remove-require-btn')) {
          this.removeRequire(e.target.closest('.require-item'));
        }
      });
    }
  }

  addCurrentRequire() {
    const url = this.elements.requireURL.value.trim();
    if (url) {
      this.addRequireToList(url);
      this.elements.requireURL.value = '';
      this.emit('requireAdded', { url });
    }
  }

  addRequireToList(url) {
    if (!url) return;
    const item = document.createElement('li');
    item.className = 'require-item';
    item.dataset.url = url;
    item.innerHTML = `
      <span>${this.escapeHtml(url)}</span>
      <button class="remove-require-btn" title="Remove Required Script">×</button>
    `;
    this.elements.requireList.appendChild(item);
    this.emit('requireAdded', { url });
    this.emit('sidebarChanged');
  }

  removeRequire(item) {
    const url = item.dataset.url;
    item.remove();
    this.emit('requireRemoved', { url });
    this.emit('sidebarChanged');
  }

  getRequires() {
    return Array.from(this.elements.requireList.querySelectorAll('.require-item')).map(i => i.dataset.url);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export class ResourceManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.addEventListener(this.elements.addResourceBtn, 'click', () => {
      this.addCurrentResource();
    });

    this.addEventListener(this.elements.resourceList, 'click', (e) => {
      if (e.target.classList.contains('remove-resource-btn')) {
        this.removeResource(e.target.closest('.resource-item'));
      }
    });

    this.on('gmApiChanged', ({ api }) => {
      if (api === 'GM_getResourceText' || api === 'GM_getResourceURL') {
        this.toggleResourceSection();
      }
    });
  }

  addCurrentResource() {
    const name = this.elements.resourceName.value.trim();
    const url = this.elements.resourceURL.value.trim();
    
    if (name && url) {
      this.addResourceToList(name, url);
      this.elements.resourceName.value = '';
      this.elements.resourceURL.value = '';
      this.emit('resourceAdded', { name, url });
    }
  }

  addResourceToList(name, url) {
    if (!name || !url) return;
    
    const resourceItem = document.createElement('li');
    resourceItem.className = 'resource-item';
    resourceItem.dataset.name = name;
    resourceItem.dataset.url = url;
    resourceItem.innerHTML = `
      <span>${this.escapeHtml(name)} (${this.escapeHtml(url)})</span>
      <button class="remove-resource" title="Remove Resource">×</button>
    `;

    this.elements.resourceList.appendChild(resourceItem);
    this.emit('resourceAdded', { name, url });
    this.emit('sidebarChanged');
  }

  removeResource(resourceItem) {
    const name = resourceItem.dataset.name;
    const url = resourceItem.dataset.url;
    resourceItem.remove();
    this.emit('resourceRemoved', { name, url });
    this.emit('sidebarChanged');
  }

  toggleResourceSection() {
    const section = document.getElementById('resourcesSection');
    const shouldShow = 
      this.elements.gmGetResourceText?.checked ||
      this.elements.gmGetResourceURL?.checked;
    
    if (section) {
      section.classList.toggle('hidden', !shouldShow);
    }
  }

  getResources() {
    return Array.from(this.elements.resourceList.querySelectorAll('.resource-item'))
      .map(item => ({
        name: item.dataset.name,
        url: item.dataset.url
      }));
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export class FormManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    const formElements = [
      'scriptName', 'scriptAuthor', 'scriptVersion', 'scriptDescription', 
      'runAt', 'waitForSelector', 'scriptResources'
    ];

    formElements.forEach(elementKey => {
      const element = this.elements[elementKey];
      if (element) {
        const eventType = element.type === 'checkbox' ? 'change' : 'input';
        this.addEventListener(element, eventType, () => {
          this.emit('formChanged');
        });
      }
    });
  }

  getFormData() {
    return {
      name: this.elements.scriptName?.value?.trim() || '',
      author: this.elements.scriptAuthor?.value?.trim() || '',
      version: this.elements.scriptVersion?.value?.trim() || '1.0',
      description: this.elements.scriptDescription?.value?.trim() || '',
      runAt: this.elements.runAt?.value || 'document-end',
      waitForSelector: this.elements.waitForSelector?.value?.trim() || ''
    };
  }

  setFormData(data) {
    if (this.elements.scriptName) this.elements.scriptName.value = data.name || '';
    if (this.elements.scriptAuthor) this.elements.scriptAuthor.value = data.author || '';
    if (this.elements.scriptVersion) this.elements.scriptVersion.value = data.version || '1.0';
    if (this.elements.scriptDescription) this.elements.scriptDescription.value = data.description || '';
    if (this.elements.runAt) this.elements.runAt.value = data.runAt || 'document-end';
    if (this.elements.waitForSelector) this.elements.waitForSelector.value = data.waitForSelector || '';
  }

  validate() {
    const errors = [];
    const data = this.getFormData();

    if (!data.name) {
      errors.push('Script name is required');
    }

    // Could add more valadation
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Shortcuts -> Need to make a menu to display
export class KeyboardManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.shortcuts = new Map();
    this.setupEventListeners();
    this.registerDefaultShortcuts();
  }

  setupEventListeners() {
    this.addEventListener(document, 'keydown', (e) => {
      this.handleKeyDown(e);
    });
  }

  registerDefaultShortcuts() {
    this.register('ctrl+s', () => this.emit('saveRequested'));
    this.register('cmd+s', () => this.emit('saveRequested'));
    this.register('ctrl+b', () => this.emit('sidebarToggleRequested'));
    this.register('cmd+b', () => this.emit('sidebarToggleRequested'));
    this.register('ctrl+\\', () => this.emit('sidebarToggleRequested'));
    this.register('cmd+\\', () => this.emit('sidebarToggleRequested'));
  }

  register(combination, handler) {
    this.shortcuts.set(combination.toLowerCase(), handler);
  }

  handleKeyDown(e) {
    const combination = this.getCombination(e);
    const handler = this.shortcuts.get(combination);
    
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  }

  getCombination(e) {
    const parts = [];
    
    if (e.ctrlKey) parts.push('ctrl');
    if (e.metaKey) parts.push('cmd');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    
    // Safely handle the key property
    if (e.key) {
      // Skip if it's a modifier key that we've already handled
      const key = e.key.toLowerCase();
      if (!['control', 'shift', 'alt', 'meta', 'command', 'cmd', 'ctrl'].includes(key)) {
        parts.push(key);
      } else if (parts.length === 0) {
        // If only a modifier key is pressed, include it
        parts.push(key);
      }
    } else if (e.keyCode) {
      // Fallback for older browsers
      const key = String.fromCharCode(e.keyCode).toLowerCase();
      if (key && key.length === 1) {
        parts.push(key);
      }
    }
    
    // If no valid key was found, return an empty string
    if (parts.length === 0) return '';
    
    return parts.join('+');
  }
}

//In charge of everything
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
    // Initialize all UI components
    this.components.modal = new ModalManager({
      settingsBtn: this.elements.settingsBtn,
      closeSettings: this.elements.closeSettings,
      settingsModal: this.elements.settingsModal,
      helpButton: document.getElementById('helpButton')
    }, this.eventBus);
    this.components.sidebar = new SidebarManager(this.elements, this.eventBus, this.config);
    this.components.status = new StatusManager(this.elements, this.eventBus);
    this.components.settings = new SettingsManager(this.elements, this.eventBus);
    this.components.url = new URLManager(this.elements, this.eventBus);
    this.components.resource = new ResourceManager(this.elements, this.eventBus);
    this.components.require = new RequireManager(this.elements, this.eventBus);
    this.components.form = new FormManager(this.elements, this.eventBus);
    this.components.keyboard = new KeyboardManager(this.elements, this.eventBus);

    // Manually inject the status manager into the URL manager
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
    if (this.components.settings && typeof this.components.settings.setupModalListeners === 'function') {
      this.components.settings.setupModalListeners(callbacks);
    }
  }

  setupResourceManagement(callbacks) {
    if (this.components.resource && typeof this.components.resource.setupEventListeners === 'function') {
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
  
  /**
   * Add a resource to the resource list
   * @param {string} name - The name of the resource
   * @param {string} url - The URL of the resource
   */
  addResourceToList(name, url) {
    if (this.components.resource && typeof this.components.resource.addResourceToList === 'function') {
      this.components.resource.addResourceToList(name, url);
    } else {
      console.warn('ResourceManager not properly initialized');
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
    Object.values(this.components).forEach(component => {
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
    if (this.components.sidebar && typeof this.components.sidebar.initializeCollapsibleSections === 'function') {
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

// Event bus
class EventBus {
  constructor() {
    this.events = new Map();
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
      this.events.get(eventName).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }
}

export class StorageManager {
  constructor() {
    this.storageKey = 'scripts';
  }

  async getScript(id) {
    try {
      const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
      return scripts.find(script => script.id === id) || null;
    } catch (error) {
      console.error('Failed to get script:', error);
      return null;
    }
  }

  async saveScript(scriptData, scriptId = null, isEditMode = false) {
    try {
      const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
      const now = new Date().toISOString();

      if (isEditMode && scriptId) {
        const scriptIndex = scripts.findIndex(script => script.id === scriptId);
        if (scriptIndex === -1) {
          throw new Error('Script not found for editing');
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
      console.error('Failed to save script:', error);
      throw error;
    }
  }

  async deleteScript(id) {
    try {
      const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
      const filteredScripts = scripts.filter(script => script.id !== id);
      await chrome.storage.local.set({ [this.storageKey]: filteredScripts });
      return true;
    } catch (error) {
      console.error('Failed to delete script:', error);
      return false;
    }
  }

  async getAllScripts() {
    try {
      const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
      return scripts;
    } catch (error) {
      console.error('Failed to get all scripts:', error);
      return [];
    }
  }

  generateUniqueId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
  }
}

export class FormValidator {
  constructor(elements) {
    this.elements = elements;
  }

  validateForm() {
    const validations = [this.validateScriptName(), this.validateTargetUrls()];

    return validations.every((validation) => validation.isValid);
  }

  validateScriptName() {
    if (!this.elements.scriptName.value.trim()) {
      this.showValidationError("Please enter a script name.");
      return { isValid: false };
    }
    return { isValid: true };
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
    return { isValid: true };
  }

  showValidationError(message) {
    const statusMessage = this.elements.statusMessage;
    statusMessage.textContent = message;
    statusMessage.className = "status-message error";
    statusMessage.style.display = "block";
  }
}
