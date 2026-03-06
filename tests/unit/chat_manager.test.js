import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatManager } from '../../src/ai_dom_editor/editor/helpers/chat_manager.js';

describe('ChatManager', () => {
  let chatManager;
  let mockEditor;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockEditor = {
      elements: {
        chatContainer: document.createElement('div'),
        messages: document.createElement('div'),
        userInput: document.createElement('textarea'),
        sendBtn: document.createElement('button'),
        welcomeMessage: document.createElement('div'),
      },
      uiManager: {
        createMessageElement: vi.fn().mockReturnValue(document.createElement('div')),
        hideWelcomeMessage: vi.fn(),
        showWelcomeMessage: vi.fn(),
        scrollToBottom: vi.fn(),
        autoResize: vi.fn(),
      },
      apiHandler: {
        loadAvailableModels: vi.fn(),
      },
      currentScript: null,
      setCurrentScript: vi.fn(),
    };

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue({}),
          remove: vi.fn().mockResolvedValue({}),
        },
      },
    };

    global.confirm = vi.fn().mockReturnValue(true);

    chatManager = new ChatManager(mockEditor);
  });

  describe('addMessage', () => {
    it('should add message to array and UI', () => {
      chatManager.addMessage('user', 'hello');
      expect(chatManager.messages).toHaveLength(1);
      expect(mockEditor.uiManager.createMessageElement).toHaveBeenCalledWith('user', 'hello', {});
      expect(mockEditor.elements.messages.children).toHaveLength(1);
    });
  });

  describe('clearChat', () => {
    it('should clear messages and update UI', async () => {
      chatManager.messages = [{ role: 'user', content: 'hi' }];
      await chatManager.clearChat();
      expect(chatManager.messages).toHaveLength(0);
      expect(mockEditor.elements.messages.innerHTML).toBe('');
      expect(mockEditor.uiManager.showWelcomeMessage).toHaveBeenCalled();
    });
  });

  describe('loadChatHistory', () => {
    it('should load messages from storage and render them', async () => {
      const historyData = {
        messages: [
          { role: 'user', text: 'msg1' },
          { role: 'assistant', text: 'msg2', data: { type: 'text' } },
        ],
      };
      chrome.storage.local.get.mockResolvedValue({ aiChatHistory_s1: historyData });

      chatManager.scriptId = 's1';
      await chatManager.loadChatHistory();

      expect(chatManager.messages).toHaveLength(2);
      expect(mockEditor.uiManager.createMessageElement).toHaveBeenCalledTimes(2);
      expect(mockEditor.uiManager.hideWelcomeMessage).toHaveBeenCalled();
    });

    it('should handle empty history', async () => {
      chrome.storage.local.get.mockResolvedValue({ aiChatHistory_s1: null });

      chatManager.scriptId = 's1';
      await chatManager.loadChatHistory();

      expect(chatManager.messages).toHaveLength(0);
      expect(mockEditor.uiManager.showWelcomeMessage).toHaveBeenCalled();
    });

    it('should get scriptId from current tab when not set', async () => {
      global.chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([{ url: 'https://example.com' }]),
        },
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({}),
          },
        },
      };

      await chatManager.loadChatHistory();
      expect(chatManager.scriptId).toBe('chat_https://example.com');
      expect(chatManager.currentSiteUrl).toBe('https://example.com');
    });

    it('should handle missing tab information', async () => {
      global.chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([]),
        },
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ tab: null }),
        },
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({}),
          },
        },
      };

      await chatManager.loadChatHistory();
      expect(chatManager.scriptId).toBeNull();
    });

    it('should use runtime sendMessage when tabs.query not available', async () => {
      global.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ tab: { url: 'https://test.com' } }),
        },
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({}),
          },
        },
      };

      await chatManager.loadChatHistory();
      expect(chatManager.currentSiteUrl).toBe('https://test.com');
    });
  });

  describe('setScriptId', () => {
    it('should set scriptId and load chat history', () => {
      chatManager.loadChatHistory = vi.fn();
      chatManager.setScriptId('test-script');
      expect(chatManager.scriptId).toBe('test-script');
      expect(chatManager.loadChatHistory).toHaveBeenCalled();
    });
  });

  describe('saveChatHistory', () => {
    it('should save messages to storage', async () => {
      chatManager.scriptId = 'test-script';
      chatManager.messages = [{ role: 'user', text: 'hello' }];
      chatManager.currentSiteUrl = 'https://test.com';

      await chatManager.saveChatHistory();
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'aiChatHistory_test-script': expect.objectContaining({
            id: 'test-script',
            messages: expect.any(Array),
          }),
        })
      );
    });

    it('should not save when scriptId is not set', async () => {
      await chatManager.saveChatHistory();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('getPreviousCode', () => {
    it('should return code from last assistant message', () => {
      chatManager.messages = [
        { role: 'user', text: 'hello' },
        { role: 'assistant', text: 'here is code', data: { code: 'console.log(1);' } },
        { role: 'user', text: 'thanks' },
      ];
      const result = chatManager.getPreviousCode();
      expect(result).toBe('console.log(1);');
    });

    it('should return null when no assistant message with code', () => {
      chatManager.messages = [
        { role: 'user', text: 'hello' },
        { role: 'assistant', text: 'just text' },
      ];
      const result = chatManager.getPreviousCode();
      expect(result).toBeNull();
    });

    it('should return null when messages are empty', () => {
      chatManager.messages = [];
      const result = chatManager.getPreviousCode();
      expect(result).toBeNull();
    });
  });

  describe('removeMessage', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('should remove message element from DOM', () => {
      const messageEl = document.createElement('div');
      messageEl.setAttribute('data-id', 'test-id');
      document.body.appendChild(messageEl);

      chatManager.removeMessage('test-id');
      expect(document.querySelector('[data-id="test-id"]')).toBeNull();
    });

    it('should handle missing message element gracefully', () => {
      expect(() => chatManager.removeMessage('non-existent')).not.toThrow();
    });
  });

  describe('clearChat', () => {
    it('should not clear when user cancels confirmation', async () => {
      global.confirm = vi.fn().mockReturnValue(false);
      chatManager.messages = [{ role: 'user', text: 'test' }];

      await chatManager.clearChat();
      expect(chatManager.messages).toHaveLength(1);
      expect(mockEditor.uiManager.showWelcomeMessage).not.toHaveBeenCalled();
    });

    it('should clear storage when scriptId is set', async () => {
      global.confirm = vi.fn().mockReturnValue(true);
      chatManager.scriptId = 'test-script';

      await chatManager.clearChat();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('aiChatHistory_test-script');
    });

    it('should not clear storage when scriptId is not set', async () => {
      global.confirm = vi.fn().mockReturnValue(true);
      chatManager.scriptId = null;

      await chatManager.clearChat();
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });
});
