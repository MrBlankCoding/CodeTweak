// src/ai_dom_editor/editor/helpers/chat_manager.js

import feather from 'feather-icons';

export class ChatManager {
  constructor(editor) {
    this.editor = editor;
    this.messages = [];
    this.currentSiteUrl = '';
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
        this.editor.uiManager.hideWelcomeMessage();

        history.messages.forEach(msg => {
          const messageEl = this.editor.uiManager.createMessageElement(msg.role, msg.text, msg.data || {});
          this.editor.elements.messages.appendChild(messageEl);
        });

        feather.replace();
        this.editor.uiManager.scrollToBottom();
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

  addMessage(role, text, data = {}) {
    this.messages.push({ role, text, timestamp: new Date(), data });

    const messageEl = this.editor.uiManager.createMessageElement(role, text, data);
    this.editor.elements.messages.appendChild(messageEl);
    feather.replace();
    this.editor.uiManager.scrollToBottom();

    this.saveChatHistory();
  }

  removeMessage(messageId) {
    const messageEl = document.querySelector(`[data-id="${messageId}"]`);
    if (messageEl) {
      messageEl.remove();
    }
  }

  async clearChat() {
    if (confirm('Clear conversation history for this site?')) {
      this.messages = [];
      this.editor.elements.messages.innerHTML = '';
      this.editor.uiManager.showWelcomeMessage();

      if (this.currentSiteUrl) {
        const storageKey = `aiChatHistory_${this.currentSiteUrl}`;
        await chrome.storage.local.remove(storageKey);
      }
    }
  }
}
