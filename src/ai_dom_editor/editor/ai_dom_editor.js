// AI DOM Editor - Main JavaScript

class AIDOMEditor {
  constructor() {
    this.messages = [];
    this.selectedElement = null;
    this.appliedChanges = [];
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
    this.currentSiteUrl = '';
    this.lastUserPrompt = '';
    
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
    await this.loadAPIConfig();
    await this.loadAvailableModels();
    await this.loadChatHistory();
    this.setupEventListeners();
    this.setupMessageListener();
  }

  async loadAPIConfig() {
    try {
      const { aiDomEditorConfig } = await chrome.storage.local.get('aiDomEditorConfig');
      this.apiConfig = aiDomEditorConfig || null;
      
      if (!this.apiConfig || !this.apiConfig.apiKey || !this.apiConfig.endpoint) {
        this.showConfigBanner();
      } else {
        this.hideConfigBanner();
      }
    } catch (error) {
      console.error('Error loading API config:', error);
      this.showConfigBanner();
    }
  }
  
  async loadAvailableModels() {
    try {
      const { availableModels, selectedModel } = await chrome.storage.local.get(['availableModels', 'selectedModel']);
      this.availableModels = availableModels || [];
      
      // Populate model selector
      if (this.elements.modelSelector) {
        this.elements.modelSelector.innerHTML = '';
        
        if (this.availableModels.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No models available - Configure API keys';
          this.elements.modelSelector.appendChild(option);
          this.elements.modelSelector.disabled = true;
        } else {
          this.elements.modelSelector.disabled = false;
          
          // Group models by provider
          const modelsByProvider = {};
          this.availableModels.forEach(model => {
            if (!modelsByProvider[model.provider]) {
              modelsByProvider[model.provider] = [];
            }
            modelsByProvider[model.provider].push(model);
          });
          
          // Add options grouped by provider
          Object.keys(modelsByProvider).sort().forEach(provider => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = provider.toUpperCase();
            
            modelsByProvider[provider].forEach(model => {
              const option = document.createElement('option');
              option.value = JSON.stringify(model);
              option.textContent = model.id;
              if (selectedModel && selectedModel.id === model.id && selectedModel.provider === model.provider) {
                option.selected = true;
              }
              optgroup.appendChild(option);
            });
            
            this.elements.modelSelector.appendChild(optgroup);
          });
          
          // Set selected model or default to first
          if (selectedModel) {
            this.selectedModel = selectedModel;
          } else if (this.availableModels.length > 0) {
            this.selectedModel = this.availableModels[0];
            await chrome.storage.local.set({ selectedModel: this.selectedModel });
          }
        }
      }
    } catch (error) {
      console.error('Error loading available models:', error);
    }
  }

  showConfigBanner() {
    this.elements.configBanner.style.display = 'flex';
  }

  hideConfigBanner() {
    this.elements.configBanner.style.display = 'none';
  }

  async loadChatHistory() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;
      
      const url = new URL(tab.url);
      this.currentSiteUrl = `${url.protocol}//${url.hostname}`;
      
      const storageKey = `aiChatHistory_${this.currentSiteUrl}`;
      const { [storageKey]: history } = await chrome.storage.local.get(storageKey);
      
      if (history && history.messages && history.messages.length > 0) {
        this.messages = history.messages;
        this.elements.welcomeMessage.style.display = 'none';
        
        history.messages.forEach(msg => {
          const messageEl = this.createMessageElement(msg.role, msg.text, msg.data || {});
          this.elements.messages.appendChild(messageEl);
        });
        
        this.scrollToBottom();
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }

  async saveChatHistory() {
    try {
      if (!this.currentSiteUrl) return;
      
      const storageKey = `aiChatHistory_${this.currentSiteUrl}`;
      await chrome.storage.local.set({
        [storageKey]: {
          url: this.currentSiteUrl,
          messages: this.messages,
          lastUpdated: Date.now()
        }
      });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  }

  setupEventListeners() {
    this.elements.userInput.addEventListener('input', () => {
      this.autoResize(this.elements.userInput);
      this.elements.sendBtn.disabled = !this.elements.userInput.value.trim();
    });

    this.elements.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.elements.sendBtn.disabled) {
          this.handleSendMessage();
        }
      }
    });

    this.elements.sendBtn.addEventListener('click', () => {
      this.handleSendMessage();
    });

    this.elements.closeBtn.addEventListener('click', () => {
      this.closeEditor();
    });

    this.elements.openSettingsBtn.addEventListener('click', () => {
      this.openSettings();
    });

    this.elements.headerSettingsBtn.addEventListener('click', () => {
      this.openSettings();
    });

    this.elements.elementSelectorBtn.addEventListener('click', () => {
      this.activateElementSelector();
    });

    this.elements.clearChatBtn.addEventListener('click', () => {
      this.clearChat();
    });

    this.elements.cancelSelector.addEventListener('click', () => {
      this.deactivateElementSelector();
    });
    
    this.elements.modelSelector.addEventListener('change', (e) => {
      this.handleModelChange(e);
    });

    document.querySelectorAll('.example-prompt').forEach(prompt => {
      prompt.addEventListener('click', () => {
        this.elements.userInput.value = prompt.textContent.replace(/^[^a-zA-Z]+/, '').trim();
        this.autoResize(this.elements.userInput);
        this.elements.sendBtn.disabled = false;
        this.elements.userInput.focus();
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
        this.loadAPIConfig();
        this.loadAvailableModels();
      }
    });
  }
  
  async handleModelChange(e) {
    try {
      const modelData = JSON.parse(e.target.value);
      this.selectedModel = modelData;
      await chrome.storage.local.set({ selectedModel: modelData });
    } catch (error) {
      console.error('Error handling model change:', error);
    }
  }

  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  async handleSendMessage() {
    const message = this.elements.userInput.value.trim();
    if (!message) return;

    // Check if we have a selected model or fall back to apiConfig
    const hasModel = this.selectedModel && this.selectedModel.apiKey && this.selectedModel.endpoint;
    const hasConfig = this.apiConfig && this.apiConfig.apiKey && this.apiConfig.endpoint;
    
    if (!hasModel && !hasConfig) {
      this.addMessage('assistant', 'Please configure your AI API settings first.');
      return;
    }

    if (this.elements.welcomeMessage) {
      this.elements.welcomeMessage.style.display = 'none';
    }

    this.addMessage('user', message);
    this.lastUserPrompt = message;
    this.elements.userInput.value = '';
    this.autoResize(this.elements.userInput);
    this.elements.sendBtn.disabled = true;

    const loadingId = this.addLoadingMessage();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      chrome.tabs.sendMessage(tab.id, { action: 'collectDOMSummary' }, async (response) => {
        if (chrome.runtime.lastError) {
          this.removeMessage(loadingId);
          this.addMessage('assistant', 'Error: Could not access page content. Please refresh the page and try again.');
          return;
        }

        const domSummary = response?.summary || '';
        
        try {
          const aiResponse = await this.callAIAPI(message, domSummary);
          this.removeMessage(loadingId);
          this.handleAIResponse(aiResponse);
        } catch (error) {
          this.removeMessage(loadingId);
          this.addMessage('assistant', `Error: ${error.message}`, { error: true });
        }
      });
    } catch (error) {
      this.removeMessage(loadingId);
      this.addMessage('assistant', `Error: ${error.message}`, { error: true });
    }
  }

  async callAIAPI(userMessage, domSummary) {
    const systemPrompt = `You are a JavaScript code generator for Tampermonkey userscripts.

The user will describe changes to a webpage. Generate ACTUAL EXECUTABLE JAVASCRIPT CODE, not JSON.

Your response should be PURE JAVASCRIPT CODE that will run in a userscript.

IMPORTANT RULES:
1. Write actual JavaScript code, NOT JSON arrays
2. Use document.querySelectorAll() and DOM manipulation
3. DO NOT include // ==UserScript== metadata headers
4. DO NOT make external network calls
5. You can use GM_addStyle for CSS changes
6. Make code robust with null checks

EXAMPLES:

To change text:
document.querySelectorAll('h1.title').forEach(el => {
    el.textContent = 'New Title';
});

To change styles:
document.querySelectorAll('.button').forEach(el => {
    el.style.background = 'red';
    el.style.color = 'white';
});

To remove elements:
document.querySelectorAll('.ads').forEach(el => el.remove());

To add CSS:
GM_addStyle(\`
    .my-class {
        color: blue;
        background: pink;
    }
\`);

To insert HTML:
document.querySelectorAll('.container').forEach(el => {
    el.insertAdjacentHTML('beforeend', '<div>New content</div>');
});

For complex changes, write complete logic with loops, conditionals, etc.

DOM Summary:
${domSummary}

Generate ONLY the JavaScript code, no explanations or JSON.`;

    // Use selected model or fall back to apiConfig
    const modelConfig = this.selectedModel || this.apiConfig;
    const modelId = this.selectedModel?.id || this.apiConfig?.model || 'gpt-4';
    const endpoint = modelConfig.endpoint;
    const apiKey = modelConfig.apiKey;
    
    // Google models (Gemini/Gemma) don't support system messages
    const isGoogleModel = modelId.includes('gemini') || modelId.includes('gemma');
    
    const requestBody = {
      model: modelId,
      messages: isGoogleModel ? [
        { role: 'user', content: `${systemPrompt}\n\nUser Request: ${userMessage}` }
      ] : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: this.apiConfig?.temperature || 0.7,
      max_tokens: this.apiConfig?.maxTokens || 2000
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || errorData.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    // Extract JavaScript code from markdown code blocks
    const codeMatch = content.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      return {
        type: 'script',
        code: codeMatch[1].trim()
      };
    }
    
    // If no code block found, treat entire response as code
    // (in case AI returns code without markdown formatting)
    return {
      type: 'script',
      code: content.trim()
    };
  }

  handleAIResponse(response) {
    if (Array.isArray(response)) {
      this.addMessage('assistant', 'I\'ll apply these changes to the page:', {
        code: JSON.stringify(response, null, 2),
        actions: response
      });
    } else if (response.type === 'script' && response.code) {
      this.addMessage('assistant', 'I\'ve generated this code for you:', {
        code: response.code,
        isScript: true
      });
    } else {
      this.addMessage('assistant', 'Unexpected response format from AI', { error: true });
    }
  }

  addMessage(role, text, data = {}) {
    this.messages.push({ role, text, timestamp: new Date(), data });
    
    const messageEl = this.createMessageElement(role, text, data);
    this.elements.messages.appendChild(messageEl);
    this.scrollToBottom();
    
    this.saveChatHistory();
  }

  createMessageElement(role, text, data) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    messageEl.dataset.id = `msg-${Date.now()}-${Math.random()}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    messageEl.appendChild(avatar);

    const content = document.createElement('div');
    content.className = 'message-content';

    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    textEl.textContent = text;
    content.appendChild(textEl);

    if (data.error) {
      const errorEl = document.createElement('div');
      errorEl.className = 'error-message';
      errorEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>An error occurred</span>
      `;
      content.appendChild(errorEl);
    }

    if (data.code) {
      const codePreview = this.createCodePreview(data.code, data.actions, data.isScript);
      content.appendChild(codePreview);
    }

    messageEl.appendChild(content);
    return messageEl;
  }

  createCodePreview(code, actions, isScript) {
    const preview = document.createElement('div');
    preview.className = 'code-preview';

    const header = document.createElement('div');
    header.className = 'code-preview-header';
    
    const title = document.createElement('div');
    title.className = 'code-preview-title';
    title.textContent = isScript ? 'Generated JavaScript' : 'Generated Actions';
    header.appendChild(title);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'code-preview-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-text';
    copyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      Copy
    `;
    copyBtn.addEventListener('click', () => {
      this.copyToClipboard(code);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        `;
      }, 2000);
    });
    actionsDiv.appendChild(copyBtn);
    header.appendChild(actionsDiv);

    preview.appendChild(header);

    const body = document.createElement('div');
    body.className = 'code-preview-body';
    const pre = document.createElement('pre');
    pre.textContent = code;
    body.appendChild(pre);
    preview.appendChild(body);

    if (actions || isScript) {
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'action-buttons';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn-success';
      applyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Create Script
      `;
      applyBtn.addEventListener('click', () => {
        this.createUserscript(code);
      });
      buttonContainer.appendChild(applyBtn);

      preview.appendChild(buttonContainer);
    }

    return preview;
  }

  addLoadingMessage() {
    const messageId = `msg-${Date.now()}-loading`;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    messageEl.dataset.id = messageId;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    messageEl.appendChild(avatar);

    const content = document.createElement('div');
    content.className = 'message-content';
    
    const loading = document.createElement('div');
    loading.className = 'loading-indicator';
    loading.innerHTML = `
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
    `;
    content.appendChild(loading);
    
    messageEl.appendChild(content);
    this.elements.messages.appendChild(messageEl);
    this.scrollToBottom();

    return messageId;
  }

  removeMessage(messageId) {
    const messageEl = document.querySelector(`[data-id="${messageId}"]`);
    if (messageEl) {
      messageEl.remove();
    }
  }

  async createUserscript(code) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      
      const scriptCode = typeof code === 'string' ? code : code;
      
      // Generate script name based on site
      const siteName = url.hostname.replace('www.', '').split('.')[0];
      const capitalizedSite = siteName.charAt(0).toUpperCase() + siteName.slice(1);
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      
      // Use user's prompt as description
      const description = this.lastUserPrompt || `Modifications for ${url.hostname}`;
      
      const userscript = `// ==UserScript==
// @name         ${capitalizedSite} - ${date}
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  ${description}
// @author       AI Assistant
// @match        ${url.origin}/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    
${scriptCode.split('\n').map(line => '    ' + line).join('\n')}
})();`;

      chrome.runtime.sendMessage({
        action: 'createScriptFromAI',
        script: userscript,
        url: tab.url
      });

      this.addMessage('assistant', '✓ Script created and opened in editor!');
    } catch (error) {
      this.addMessage('assistant', `Error creating script: ${error.message}`, { error: true });
    }
  }

  convertActionsToScript(actions) {
    const lines = [];
    
    for (const action of actions) {
      switch (action.type) {
        case 'style':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => {`);
          lines.push(`        el.style.cssText += '${action.value}';`);
          lines.push(`    });`);
          break;
        case 'text':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => {`);
          lines.push(`        el.textContent = ${JSON.stringify(action.value)};`);
          lines.push(`    });`);
          break;
        case 'remove':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => el.remove());`);
          break;
        case 'insert':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => {`);
          lines.push(`        el.insertAdjacentHTML('beforeend', ${JSON.stringify(action.value)});`);
          lines.push(`    });`);
          break;
      }
    }
    
    return lines.join('\n');
  }

  activateElementSelector() {
    this.elements.selectorActive.style.display = 'flex';
    this.elements.elementSelectorBtn.classList.add('active');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' });
    });
  }

  deactivateElementSelector() {
    this.elements.selectorActive.style.display = 'none';
    this.elements.elementSelectorBtn.classList.remove('active');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSelection' });
    });
  }

  handleElementSelected(selector) {
    this.deactivateElementSelector();
    this.selectedElement = selector;
    
    const currentValue = this.elements.userInput.value.trim();
    const newValue = currentValue 
      ? `${currentValue} (element: ${selector})`
      : `Modify the element: ${selector}`;
    
    this.elements.userInput.value = newValue;
    this.autoResize(this.elements.userInput);
    this.elements.sendBtn.disabled = false;
    this.elements.userInput.focus();
  }

  async clearChat() {
    if (confirm('Clear conversation history for this site?')) {
      this.messages = [];
      this.elements.messages.innerHTML = '';
      this.elements.welcomeMessage.style.display = 'flex';
      
      // Clear from storage
      if (this.currentSiteUrl) {
        const storageKey = `aiChatHistory_${this.currentSiteUrl}`;
        await chrome.storage.local.remove(storageKey);
      }
    }
  }

  closeEditor() {
    window.parent.postMessage({ action: 'closeAIEditor' }, '*');
  }

  openSettings() {
    chrome.runtime.sendMessage({ action: 'openAISettings' });
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  scrollToBottom() {
    setTimeout(() => {
      this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
    }, 100);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AIDOMEditor();
});