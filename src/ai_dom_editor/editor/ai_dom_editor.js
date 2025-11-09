// AI DOM Editor - Main JavaScript
import feather from 'feather-icons';
import { ChatManager } from './helpers/chat_manager.js';
import { UIManager } from './helpers/ui_manager.js';
import { ApiHandler } from './helpers/api_handler.js';
import { EventHandler } from './helpers/event_handler.js';
import { UserscriptHandler } from './helpers/userscript_handler.js';

class AIDOMEditor {
  constructor() {
    this.selectedElement = null;
    
    this.elements = {
      chatContainer: document.getElementById('chatContainer'),
      messages: document.getElementById('messages'),
      welcomeMessage: document.getElementById('welcomeMessage'),
      userInput: document.getElementById('userInput'),
      sendBtn: document.getElementById('sendBtn'),
      closeBtn: document.getElementById('closeBtn'),
      configBanner: document.getElementById('configBanner'),
      openSettingsBtn: document.getElementById('openSettingsBtn'),
      headerSettingsBtn: document.getElementById('headerSettingsBtn'),
      elementSelectorBtn: document.getElementById('elementSelectorBtn'),
      clearChatBtn: document.getElementById('clearChatBtn'),
      selectorActive: document.getElementById('selectorActive'),
      cancelSelector: document.getElementById('cancelSelector'),
      modelSelector: document.getElementById('modelSelector')
    };
    
    this.chatManager = new ChatManager(this);
    this.uiManager = new UIManager(this);
    this.apiHandler = new ApiHandler(this);
    this.eventHandler = new EventHandler(this);
    this.userscriptHandler = new UserscriptHandler(this);
    
    this.init();
  }

  async init() {
    await this.initializeAI();
  }

  async getUserLanguage() {
    try {
      const { settings = {} } = await chrome.storage.local.get('settings');
      const userLanguage = settings.language || 'auto';
      
      if (userLanguage === 'auto') {
        return chrome.i18n.getUILanguage().split('-')[0];
      }
      
      return userLanguage;
    } catch (error) {
      console.error('Error getting language:', error);
      return 'en';
    }
  }

  async initializeAI() {
    try {
      const lang = await this.getUserLanguage();
      document.documentElement.setAttribute('lang', lang);
    } catch (error) {
      console.error('Error setting language:', error);
    }
    await this.apiHandler.loadAPIConfig();
    await this.apiHandler.loadAvailableModels();
    await this.chatManager.loadChatHistory();
    this.eventHandler.setupEventListeners();
    this.eventHandler.setupMessageListener();
    feather.replace();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AIDOMEditor();
});
