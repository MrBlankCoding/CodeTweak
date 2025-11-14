import feather from 'feather-icons';

export class ChatManager {
  constructor(editor) {
    this.editor = editor;
    this.messages = [];
    this.currentSiteUrl = '';
    this.scriptId = null;
  }

  setScriptId(scriptId) {
    this.scriptId = scriptId;
    this.loadChatHistory();
  }

  async loadChatHistory() {
    try {
      if (!this.scriptId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;

        const url = new URL(tab.url);
        this.currentSiteUrl = `${url.protocol}//${url.hostname}`;
        this.scriptId = `chat_${this.currentSiteUrl}`;
      }

      const storageKey = `aiChatHistory_${this.scriptId}`;
      const { [storageKey]: history } = await chrome.storage.local.get(storageKey);

      this.editor.elements.messages.innerHTML = '';

      if (history && history.messages && history.messages.length > 0) {
        this.messages = history.messages;
        this.editor.uiManager.hideWelcomeMessage();

        history.messages.forEach(msg => {
          const messageEl = this.editor.uiManager.createMessageElement(msg.role, msg.text, msg.data || {});
          this.editor.elements.messages.appendChild(messageEl);
        });

        feather.replace();
        this.editor.uiManager.scrollToBottom();
      } else {
        this.messages = [];
        this.editor.uiManager.showWelcomeMessage();
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }

  async saveChatHistory() {
    try {
      if (!this.scriptId) return;

      const storageKey = `aiChatHistory_${this.scriptId}`;
      await chrome.storage.local.set({
        [storageKey]: {
          id: this.scriptId,
          url: this.currentSiteUrl,
          messages: this.messages,
          lastUpdated: Date.now()
        }
      });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  }

  getPreviousCode() {
    const lastAssistantMessage = this.messages.slice().reverse().find(msg => msg.role === 'assistant' && msg.data && msg.data.code);
    return lastAssistantMessage ? lastAssistantMessage.data.code : null;
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
    if (confirm('Clear conversation history for this script?')) {
      this.messages = [];
      this.editor.elements.messages.innerHTML = '';
      this.editor.uiManager.showWelcomeMessage();

      if (this.scriptId) {
        const storageKey = `aiChatHistory_${this.scriptId}`;
        await chrome.storage.local.remove(storageKey);
      }
    }
  }
}
