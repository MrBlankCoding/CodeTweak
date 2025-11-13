// src/ai_dom_editor/editor/helpers/ui_manager.js

import feather from 'feather-icons';

export class UIManager {
  constructor(editor) {
    this.editor = editor;
  }

  showConfigBanner() {
    this.editor.elements.configBanner.style.display = 'flex';
  }

  hideConfigBanner() {
    this.editor.elements.configBanner.style.display = 'none';
  }

  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
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
        <i data-feather="alert-circle" width="16" height="16"></i>
        <span>An error occurred</span>
      `;
      content.appendChild(errorEl);
      feather.replace();
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
      <i data-feather="copy" width="16" height="16"></i>
      Copy
    `;
    copyBtn.addEventListener('click', () => {
      this.copyToClipboard(code);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => {
        copyBtn.innerHTML = `
          <i data-feather="copy" width="16" height="16"></i>
          Copy
        `;
        feather.replace();
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
        <i data-feather="check" width="16" height="16"></i>
        Create Script
      `;
      applyBtn.addEventListener('click', () => {
        this.editor.userscriptHandler.createUserscript(code);
      });
      buttonContainer.appendChild(applyBtn);

      preview.appendChild(buttonContainer);
    }
    
    feather.replace();
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
    this.editor.elements.messages.appendChild(messageEl);
    this.scrollToBottom();

    return messageId;
  }

  scrollToBottom() {
    setTimeout(() => {
      this.editor.elements.chatContainer.scrollTop = this.editor.elements.chatContainer.scrollHeight;
    }, 100);
  }

  activateElementSelector() {
    this.editor.elements.selectorActive.style.display = 'flex';
    this.editor.elements.elementSelectorBtn.classList.add('active');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'startSelection' });
    });
  }

  deactivateElementSelector() {
    this.editor.elements.selectorActive.style.display = 'none';
    this.editor.elements.elementSelectorBtn.classList.remove('active');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSelection' });
    });
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  showWelcomeMessage() {
    if (this.editor.elements.welcomeMessage) {
      this.editor.elements.welcomeMessage.style.display = 'block';
    }
  }

  hideWelcomeMessage() {
    if (this.editor.elements.welcomeMessage) {
      this.editor.elements.welcomeMessage.style.display = 'none';
    }
  }

  async showScriptSelector(input) {
    this.hideScriptSelector();
    const scripts = await this.editor.userscriptHandler.getAllScripts();
    if (!scripts || scripts.length === 0) return;

    const selector = document.createElement('div');
    selector.className = 'script-selector';
    
    scripts.forEach(scriptName => {
      const item = document.createElement('div');
      item.className = 'script-item';
      item.textContent = scriptName;
      item.addEventListener('click', () => {
        const atIndex = input.value.lastIndexOf('@');
        input.value = input.value.substring(0, atIndex + 1) + scriptName + ' ';
        this.hideScriptSelector();
        input.focus();
      });
      selector.appendChild(item);
    });

    document.body.appendChild(selector);
    const rect = input.getBoundingClientRect();
    selector.style.top = `${rect.top - selector.offsetHeight}px`;
    selector.style.left = `${rect.left}px`;
  }

  hideScriptSelector() {
    const selector = document.querySelector('.script-selector');
    if (selector) {
      selector.remove();
    }
  }
}
