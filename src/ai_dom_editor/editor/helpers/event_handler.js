// src/ai_dom_editor/editor/helpers/event_handler.js

export class EventHandler {
  constructor(editor) {
    this.editor = editor;
    this.lastUserPrompt = '';
  }

  setupEventListeners() {
    this.editor.elements.userInput.addEventListener('input', () => {
      this.editor.uiManager.autoResize(this.editor.elements.userInput);
      this.editor.elements.sendBtn.disabled = !this.editor.elements.userInput.value.trim();
    });

    this.editor.elements.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.editor.elements.sendBtn.disabled) {
          this.handleSendMessage();
        }
      }
    });

    this.editor.elements.sendBtn.addEventListener('click', () => {
      this.handleSendMessage();
    });

    this.editor.elements.closeBtn.addEventListener('click', () => {
      this.closeEditor();
    });

    this.editor.elements.openSettingsBtn.addEventListener('click', () => {
      this.openSettings();
    });

    this.editor.elements.headerSettingsBtn.addEventListener('click', () => {
      this.openSettings();
    });

    this.editor.elements.elementSelectorBtn.addEventListener('click', () => {
      this.editor.uiManager.activateElementSelector();
    });

    this.editor.elements.clearChatBtn.addEventListener('click', () => {
      this.editor.chatManager.clearChat();
    });

    this.editor.elements.cancelSelector.addEventListener('click', () => {
      this.editor.uiManager.deactivateElementSelector();
    });
    
    this.editor.elements.modelSelector.addEventListener('change', (e) => {
      this.editor.apiHandler.handleModelChange(e);
    });

    document.querySelectorAll('.example-prompt').forEach(prompt => {
      prompt.addEventListener('click', () => {
        this.editor.elements.userInput.value = prompt.textContent.replace(/^[^a-zA-Z]+/, '').trim();
        this.editor.uiManager.autoResize(this.editor.elements.userInput);
        this.editor.elements.sendBtn.disabled = false;
        this.editor.elements.userInput.focus();
      });
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'elementSelected') {
        this.handleElementSelected(message.selector);
      } else if (message.action === 'domSummaryReady') {
        this.handleDOMSummary(message.summary);
      } else if (message.action === 'aiSettingsUpdated') {
        this.editor.apiHandler.loadAPIConfig();
        this.editor.apiHandler.loadAvailableModels();
      }
    });
  }

  async handleSendMessage() {
    const message = this.editor.elements.userInput.value.trim();
    if (!message) return;

    console.log('📨 User Message Sent:', message);

    const hasModel = this.editor.apiHandler.selectedModel && this.editor.apiHandler.selectedModel.apiKey && this.editor.apiHandler.selectedModel.endpoint;
    const hasConfig = this.editor.apiHandler.apiConfig && this.editor.apiHandler.apiConfig.apiKey && this.editor.apiHandler.apiConfig.endpoint;
    
    console.log('🔍 API Configuration Status:', {
      hasModel,
      hasConfig,
      selectedModel: this.editor.apiHandler.selectedModel ? {
        id: this.editor.apiHandler.selectedModel.id,
        provider: this.editor.apiHandler.selectedModel.provider
      } : null
    });
    
    if (!hasModel && !hasConfig) {
      this.editor.chatManager.addMessage('assistant', 'Please configure your AI API settings first.');
      return;
    }

    this.editor.uiManager.hideWelcomeMessage();

    this.editor.chatManager.addMessage('user', message);
    this.lastUserPrompt = message;
    this.editor.elements.userInput.value = '';
    this.editor.uiManager.autoResize(this.editor.elements.userInput);
    this.editor.elements.sendBtn.disabled = true;

    const loadingId = this.editor.uiManager.addLoadingMessage();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      chrome.tabs.sendMessage(tab.id, { action: 'collectDOMSummary' }, async (response) => {
        if (chrome.runtime.lastError) {
          this.editor.chatManager.removeMessage(loadingId);
          this.editor.chatManager.addMessage('assistant', 'Error: Could not access page content. Please refresh the page and try again.');
          return;
        }

        const domSummary = response?.summary || '';
        console.log('📋 DOM Summary Received:', {
          length: domSummary.length,
          preview: domSummary.substring(0, 300) + '...'
        });
        
        try {
          const aiResponse = await this.editor.apiHandler.callAIAPI(message, domSummary);
          console.log('✅ AI Response Received:', {
            type: aiResponse.type,
            codeLength: aiResponse.code?.length || 0
          });
          this.editor.chatManager.removeMessage(loadingId);
          this.handleAIResponse(aiResponse);
        } catch (error) {
          console.error('❌ AI Generation Error:', error);
          this.editor.chatManager.removeMessage(loadingId);
          this.editor.chatManager.addMessage('assistant', `Error: ${error.message}`, { error: true });
        }
      });
    } catch (error) {
      this.editor.chatManager.removeMessage(loadingId);
      this.editor.chatManager.addMessage('assistant', `Error: ${error.message}`, { error: true });
    }
  }

  handleAIResponse(response) {
    console.log('🎯 Handling AI Response:', {
      isArray: Array.isArray(response),
      type: response?.type,
      hasCode: !!response?.code,
      responseKeys: Object.keys(response || {})
    });
    
    if (Array.isArray(response)) {
      console.log('📝 Displaying array response (actions)');
      this.editor.chatManager.addMessage('assistant', 'I\'ll apply these changes to the page:', {
        code: JSON.stringify(response, null, 2),
        actions: response
      });
    } else if (response.type === 'script' && response.code) {
      console.log('💻 Displaying script response, code length:', response.code.length);
      this.editor.chatManager.addMessage('assistant', 'I\'ve generated this code for you:', {
        code: response.code,
        isScript: true
      });
    } else {
      console.error('⚠️ Unexpected response format:', response);
      this.editor.chatManager.addMessage('assistant', 'Unexpected response format from AI', { error: true });
    }
  }

  handleElementSelected(selector) {
    this.editor.uiManager.deactivateElementSelector();
    this.editor.selectedElement = selector;
    
    const currentValue = this.editor.elements.userInput.value.trim();
    const newValue = currentValue 
      ? `${currentValue} (element: ${selector})`
      : `Modify the element: ${selector}`;
    
    this.editor.elements.userInput.value = newValue;
    this.editor.uiManager.autoResize(this.editor.elements.userInput);
    this.editor.elements.sendBtn.disabled = false;
    this.editor.elements.userInput.focus();
  }

  closeEditor() {
    window.parent.postMessage({ action: 'closeAIEditor' }, '*');
  }

  openSettings() {
    chrome.runtime.sendMessage({ action: 'openAISettings' });
  }
}
