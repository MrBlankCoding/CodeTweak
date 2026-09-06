import { AISettingsLogic } from './AISettingsLogic.js';
import { AISettingsUI } from './AISettingsUI.js';
import { applyTranslations } from '../../shared/utils/i18n.js';
import feather from 'feather-icons';

class AISettings {
  constructor() {
    this.logic = new AISettingsLogic();
    this.ui = new AISettingsUI(this.logic);
    this.init();
  }

  async init() {
    if (typeof window.applyTheme === 'function') {
      window.applyTheme();
    }
    await applyTranslations();
    await this.logic.load();
    this.ui.setupEventListeners();
    this.ui.renderProfilesList();

    if (this.logic.apiConfigs.length > 0) {
      this.ui.loadConfig(0);
    } else {
      this.ui.startNewProfile();
    }

    feather.replace();
  }
}

let aiSettings; // eslint-disable-line no-unused-vars

document.addEventListener('DOMContentLoaded', () => {
  aiSettings = new AISettings();
});
