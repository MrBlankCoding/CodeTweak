import feather from 'feather-icons';
import { browser } from '../../../shared/browserAdapter.js';
import { MessageRenderer } from './MessageRenderer.js';

export class UIManager {
  constructor(editor) {
    this.editor = editor;
    this.messageRenderer = new MessageRenderer(editor);
    this.setupCurrentScriptListener();
  }

  setupCurrentScriptListener() {
    document.addEventListener('currentScriptChanged', () => {
      this.updateAllActionButtons();
    });
  }

  updateAllActionButtons() {
    const allButtons = document.querySelectorAll('.ai-code-actions .action-btn');
    allButtons.forEach((btn) => {
      const isPatch = btn.closest('.ai-patch-response') !== null;
      if (isPatch) return; // Patches use their own logic

      btn.replaceChildren();
      const icon = this._createFeatherIcon('', 14);

      if (this.editor.currentScript) {
        icon.setAttribute('data-feather', 'refresh-cw');
        btn.title = `Update script: ${this.editor.currentScript.name}`;
        const span = document.createElement('span');
        span.textContent = 'Update';
        btn.appendChild(icon);
        btn.appendChild(span);
      } else {
        icon.setAttribute('data-feather', 'plus-circle');
        btn.title = 'Create new script';
        const span = document.createElement('span');
        span.textContent = 'Create';
        btn.appendChild(icon);
        btn.appendChild(span);
      }
      feather.replace();
    });
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

  createMessageElement(role, text, data = {}) {
    return this.messageRenderer.createMessageElement(role, text, data);
  }

  addLoadingMessage() {
    const messageId = `msg-${Date.now()}-loading`;

    const messageEl = document.createElement('div');
    messageEl.className = 'ai-message ai-message-assistant';
    messageEl.dataset.id = messageId;

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = 'AI';
    messageEl.appendChild(avatar);

    const content = document.createElement('div');
    content.className = 'ai-message-content';

    const loading = document.createElement('div');
    loading.className = 'ai-typing-indicator';

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'ai-typing-dot';
      loading.appendChild(dot);
    }

    content.appendChild(loading);

    messageEl.appendChild(content);
    this.editor.elements.messages.appendChild(messageEl);
    this.scrollToBottom();

    return messageId;
  }

  scrollToBottom() {
    setTimeout(() => {
      this.editor.elements.chatContainer.scrollTop =
        this.editor.elements.chatContainer.scrollHeight;
    }, 100);
  }

  activateElementSelector() {
    this.editor.elements.selectorActive.style.display = 'flex';
    this.editor.elements.elementSelectorBtn.classList.add('active');

    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'startAiSelection' }, () => {
          void browser.runtime.lastError;
        });
      }
    });
  }

  deactivateElementSelector() {
    this.editor.elements.selectorActive.style.display = 'none';
    this.editor.elements.elementSelectorBtn.classList.remove('active');

    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'stopSelection' }, () => {
          void browser.runtime.lastError;
        });
      }
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

    scripts.forEach((script) => {
      const item = document.createElement('div');
      item.className = 'script-item';
      item.textContent = script.name;
      item.addEventListener('click', () => {
        const atIndex = input.value.lastIndexOf('@');
        input.value = input.value.substring(0, atIndex + 1) + script.name + ' ';
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

  _createFeatherIcon(name, size = 16) {
    const icon = document.createElement('i');
    if (name) {
      icon.setAttribute('data-feather', name);
    }
    icon.setAttribute('width', String(size));
    icon.setAttribute('height', String(size));
    return icon;
  }
}
