import { BaseUIComponent } from '../base/BaseUIComponent.js';
import logger from '../../shared/utils/logger.js';

export class SettingsManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.settingsInputs = this.getSettingsInputs();
    this.setupEventListeners();
  }

  getSettingsInputs() {
    return {
      fontSize: document.getElementById('fontSize'),
      tabSize: document.getElementById('tabSize'),
      lineNumbers: document.getElementById('lineNumbers'),
      lineWrapping: document.getElementById('lineWrapping'),
      matchBrackets: document.getElementById('matchBrackets'),
      minimap: document.getElementById('minimap'),
      lintingEnabled: document.getElementById('lintingEnabled'),
      autosaveEnabled: document.getElementById('autosaveEnabled'),
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
      this.addEventListener(settingsInputs.fontSize, 'input', () => {
        const value = parseInt(settingsInputs.fontSize.value, 10);
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeValue) {
          fontSizeValue.textContent = value + 'px';
        }
        this.emit('settingChanged', { fontSize: value });
      });
    }

    if (settingsInputs.tabSize) {
      this.addEventListener(settingsInputs.tabSize, 'input', () => {
        this.emit('settingChanged', {
          tabSize: parseInt(settingsInputs.tabSize.value, 10),
        });
      });
    }

    ['lineNumbers', 'lineWrapping', 'matchBrackets', 'minimap'].forEach((setting) => {
      if (settingsInputs[setting]) {
        this.addEventListener(settingsInputs[setting], 'change', () => {
          this.emit('settingChanged', {
            [setting]: settingsInputs[setting].checked,
          });
        });
      }
    });

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

    if (saveBtn) {
      this.addEventListener(saveBtn, 'click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.saveAllSettings();
      });
    }

    if (resetBtn) {
      this.addEventListener(resetBtn, 'click', async (e) => {
        e.preventDefault();
        await this.resetToDefaults();
      });
    }
  }

  async loadSettingsIntoModal() {
    try {
      const settings = await this.loadSettings();
      const { settingsInputs } = this;

      // Only reflect stored values; leave HTML defaults otherwise
      if (settingsInputs.fontSize && settings.fontSize !== undefined) {
        settingsInputs.fontSize.value = settings.fontSize;
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeValue) fontSizeValue.textContent = settings.fontSize + 'px';
      }
      if (settingsInputs.tabSize && settings.tabSize !== undefined)
        settingsInputs.tabSize.value = settings.tabSize;
      if (settingsInputs.lineNumbers && settings.lineNumbers !== undefined)
        settingsInputs.lineNumbers.checked = !!settings.lineNumbers;
      if (settingsInputs.lineWrapping && settings.lineWrapping !== undefined)
        settingsInputs.lineWrapping.checked = !!settings.lineWrapping;
      if (settingsInputs.matchBrackets && settings.matchBrackets !== undefined)
        settingsInputs.matchBrackets.checked = !!settings.matchBrackets;
      if (settingsInputs.minimap && settings.minimap !== undefined)
        settingsInputs.minimap.checked = !!settings.minimap;
      if (settingsInputs.lintingEnabled) {
        settingsInputs.lintingEnabled.checked = localStorage.getItem('lintingEnabled') !== 'false';
      }
      if (settingsInputs.autosaveEnabled) {
        settingsInputs.autosaveEnabled.checked =
          localStorage.getItem('autosaveEnabled') !== 'false';
      }
    } catch (error) {
      logger.error('Failed to load settings:', error);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['editorSettings']);

      return result.editorSettings || {};
    } catch (error) {
      logger.error('Failed to load settings from storage:', error);
      return {};
    }
  }

  async saveAllSettings() {
    try {
      const { settingsInputs } = this;
      const newSettings = {
        fontSize: parseInt(settingsInputs.fontSize?.value, 10) || 14,
        tabSize: parseInt(settingsInputs.tabSize?.value, 10) || 2,
        lineNumbers: !!settingsInputs.lineNumbers?.checked,
        lineWrapping: !!settingsInputs.lineWrapping?.checked,
        matchBrackets: !!settingsInputs.matchBrackets?.checked,
        minimap: !!settingsInputs.minimap?.checked,
      };
      const lintingEnabled = !!settingsInputs.lintingEnabled?.checked;
      const autosaveEnabled = !!settingsInputs.autosaveEnabled?.checked;

      await chrome.storage.local.set({
        editorSettings: newSettings,
      });
      localStorage.setItem('lintingEnabled', lintingEnabled.toString());
      localStorage.setItem('autosaveEnabled', autosaveEnabled.toString());
      this.emit('settingsSaved', newSettings);
      this.emit('settingChanged', newSettings);
      this.emit('lintingToggled', { enabled: lintingEnabled });
      this.emit('autosaveToggled', { enabled: autosaveEnabled });
      this.emit('showStatus', { message: 'Settings saved successfully', type: 'success' });

      const modal = document.getElementById('settingsModal');
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }

      return true;
    } catch (error) {
      logger.error('Failed to save settings:', error);
      this.emit('showStatus', {
        message: 'Failed to save settings: ' + (error.message || 'Unknown error'),
        type: 'error',
      });
      return false;
    }
  }

  async resetToDefaults() {
    const { settingsInputs } = this;
    const defaults = {
      fontSize: 14,
      tabSize: 2,
      lineNumbers: true,
      lineWrapping: false,
      matchBrackets: true,
      minimap: true,
    };

    try {
      await chrome.storage.local.set({ editorSettings: defaults });
    } catch (error) {
      logger.error('Failed to reset settings:', error);
      this.emit('showStatus', {
        message: 'Failed to reset settings: ' + (error.message || 'Unknown error'),
        type: 'error',
      });
      return false;
    }

    if (settingsInputs.fontSize) settingsInputs.fontSize.value = defaults.fontSize;
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeValue) fontSizeValue.textContent = defaults.fontSize + 'px';
    if (settingsInputs.tabSize) settingsInputs.tabSize.value = defaults.tabSize;
    if (settingsInputs.lineNumbers) settingsInputs.lineNumbers.checked = defaults.lineNumbers;
    if (settingsInputs.lineWrapping) settingsInputs.lineWrapping.checked = defaults.lineWrapping;
    if (settingsInputs.matchBrackets) settingsInputs.matchBrackets.checked = defaults.matchBrackets;
    if (settingsInputs.minimap) settingsInputs.minimap.checked = defaults.minimap;
    if (settingsInputs.lintingEnabled) settingsInputs.lintingEnabled.checked = true;
    if (settingsInputs.autosaveEnabled) settingsInputs.autosaveEnabled.checked = true;

    localStorage.setItem('lintingEnabled', 'true');
    localStorage.setItem('autosaveEnabled', 'true');

    this.emit('settingsReset', {
      ...defaults,
      lintingEnabled: true,
      autosaveEnabled: true,
    });
    return true;
  }
}
