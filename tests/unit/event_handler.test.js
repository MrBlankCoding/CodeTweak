import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventHandler } from '../../src/ai_dom_editor/editor/helpers/event_handler.js';

describe('EventHandler', () => {
  let eventHandler;
  let mockEditor;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockEditor = {
      elements: {
        userInput: document.createElement('textarea'),
        sendBtn: document.createElement('button'),
        clearChatBtn: document.createElement('button'),
        headerSettingsBtn: document.createElement('button'),
        closeBtn: document.createElement('button'),
        elementSelectorBtn: document.createElement('button'),
        cancelSelector: document.createElement('button'),
        openSettingsBtn: document.createElement('button'),
        modelSelector: document.createElement('select'),
      },
      uiManager: {
        autoResize: vi.fn(),
        activateElementSelector: vi.fn(),
        deactivateElementSelector: vi.fn(),
      },
      chatManager: {
        clearChat: vi.fn(),
      },
      apiHandler: {
        handleModelChange: vi.fn(),
      },
      handleSendMessage: vi.fn(),
      closeEditor: vi.fn(),
      openSettings: vi.fn(),
    };

    // Mock handleSendMessage since it's used in setupEventListeners
    // Actually EventHandler has its own handleSendMessage but setupEventListeners
    // calls this.handleSendMessage().
    // We should mock the prototype or the instance method.

    eventHandler = new EventHandler(mockEditor);
    vi.spyOn(eventHandler, 'handleSendMessage').mockImplementation(async () => {});
  });

  describe('setupEventListeners', () => {
    it('should handle send button click', () => {
      eventHandler.setupEventListeners();
      mockEditor.elements.sendBtn.click();
      expect(eventHandler.handleSendMessage).toHaveBeenCalled();
    });

    it('should handle clear chat button click', () => {
      eventHandler.setupEventListeners();
      mockEditor.elements.clearChatBtn.click();
      expect(mockEditor.chatManager.clearChat).toHaveBeenCalled();
    });

    it('should handle Enter key on userInput', () => {
      eventHandler.setupEventListeners();
      // Remove disabled if any
      mockEditor.elements.sendBtn.disabled = false;
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      mockEditor.elements.userInput.dispatchEvent(event);
      expect(eventHandler.handleSendMessage).toHaveBeenCalled();
    });

    it('should handle Shift+Enter without sending', () => {
      eventHandler.setupEventListeners();
      mockEditor.elements.sendBtn.disabled = false;
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
      mockEditor.elements.userInput.dispatchEvent(event);
      expect(eventHandler.handleSendMessage).not.toHaveBeenCalled();
    });

    it('should show script selector on @ input', () => {
      eventHandler.setupEventListeners();
      mockEditor.uiManager.showScriptSelector = vi.fn();
      mockEditor.elements.userInput.value = 'test@';
      mockEditor.elements.userInput.dispatchEvent(new Event('input'));
      expect(mockEditor.uiManager.showScriptSelector).toHaveBeenCalled();
    });

    it('should hide script selector when @ is removed', () => {
      eventHandler.setupEventListeners();
      mockEditor.uiManager.hideScriptSelector = vi.fn();
      mockEditor.elements.userInput.value = 'test';
      mockEditor.elements.userInput.dispatchEvent(new Event('input'));
      expect(mockEditor.uiManager.hideScriptSelector).toHaveBeenCalled();
    });

    it('should handle element selector button click', () => {
      eventHandler.setupEventListeners();
      mockEditor.elements.elementSelectorBtn.click();
      expect(mockEditor.uiManager.activateElementSelector).toHaveBeenCalled();
    });

    it('should handle cancel selector button click', () => {
      eventHandler.setupEventListeners();
      mockEditor.elements.cancelSelector.click();
      expect(mockEditor.uiManager.deactivateElementSelector).toHaveBeenCalled();
    });

    it('should handle model selector change', () => {
      eventHandler.setupEventListeners();
      mockEditor.elements.modelSelector.dispatchEvent(new Event('change'));
      expect(mockEditor.apiHandler.handleModelChange).toHaveBeenCalled();
    });

    it('should handle settings button clicks', () => {
      eventHandler.setupEventListeners();
      eventHandler.openSettings = vi.fn();
      mockEditor.elements.openSettingsBtn.click();
      mockEditor.elements.headerSettingsBtn.click();
      expect(eventHandler.openSettings).toHaveBeenCalledTimes(2);
    });

    it('should handle close button click', () => {
      eventHandler.setupEventListeners();
      eventHandler.closeEditor = vi.fn();
      mockEditor.elements.closeBtn.click();
      expect(eventHandler.closeEditor).toHaveBeenCalled();
    });
  });

  describe('setupMessageListener', () => {
    beforeEach(() => {
      global.chrome = {
        runtime: {
          onMessage: {
            addListener: vi.fn(),
          },
        },
      };
    });

    it('should set up chrome runtime message listener', () => {
      eventHandler.setupMessageListener();
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });

  describe('handleAIResponse', () => {
    it('should handle code response type', () => {
      const response = { type: 'code', explanation: 'Test code' };
      mockEditor.chatManager.addMessage = vi.fn();
      eventHandler.handleAIResponse(response);
      expect(mockEditor.chatManager.addMessage).toHaveBeenCalledWith(
        'assistant',
        'Test code',
        response
      );
    });

    it('should handle text response type', () => {
      const response = { type: 'text', message: 'Test message' };
      mockEditor.chatManager.addMessage = vi.fn();
      eventHandler.handleAIResponse(response);
      expect(mockEditor.chatManager.addMessage).toHaveBeenCalledWith(
        'assistant',
        'Test message',
        response
      );
    });

    it('should handle unexpected response format', () => {
      const response = { type: 'unknown' };
      mockEditor.chatManager.addMessage = vi.fn();
      eventHandler.handleAIResponse(response);
      expect(mockEditor.chatManager.addMessage).toHaveBeenCalledWith(
        'assistant',
        'Unexpected response format from AI.',
        { error: true }
      );
    });
  });

  describe('_hasUsableAIConfig', () => {
    it('should return true when all config values are present', () => {
      mockEditor.apiHandler = {
        selectedModel: {
          endpoint: 'http://test.com',
          apiKey: 'test-key',
          id: 'test-model',
        },
      };
      expect(eventHandler._hasUsableAIConfig()).toBe(true);
    });

    it('should return false when endpoint is missing', () => {
      mockEditor.apiHandler = {
        selectedModel: {
          apiKey: 'test-key',
          id: 'test-model',
        },
      };
      expect(eventHandler._hasUsableAIConfig()).toBe(false);
    });

    it('should use fallback config when selected is missing', () => {
      mockEditor.apiHandler = {
        selectedModel: {},
        apiConfig: {
          endpoint: 'http://test.com',
          apiKey: 'test-key',
          model: 'test-model',
        },
      };
      expect(eventHandler._hasUsableAIConfig()).toBe(true);
    });
  });

  describe('handleElementSelected', () => {
    it('should update input with element selector', () => {
      mockEditor.elements.userInput.value = 'test message';
      eventHandler.handleElementSelected('#test-element');
      expect(mockEditor.elements.userInput.value).toBe('test message (element: #test-element)');
      expect(mockEditor.uiManager.deactivateElementSelector).toHaveBeenCalled();
    });

    it('should set new message when input is empty', () => {
      mockEditor.elements.userInput.value = '';
      eventHandler.handleElementSelected('#test-element');
      expect(mockEditor.elements.userInput.value).toBe('Modify the element: #test-element');
    });
  });

  describe('closeEditor', () => {
    beforeEach(() => {
      global.window = {
        parent: {
          postMessage: vi.fn(),
        },
      };
    });

    it('should post close message to parent', () => {
      eventHandler.closeEditor();
      expect(window.parent.postMessage).toHaveBeenCalledWith({ action: 'closeAIEditor' }, '*');
    });
  });

  describe('openSettings', () => {
    beforeEach(() => {
      global.chrome = {
        runtime: {
          sendMessage: vi.fn(),
        },
      };
    });

    it('should send open settings message', () => {
      eventHandler.openSettings();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'openAISettings' });
    });
  });

  describe('_sendTabMessage', () => {
    beforeEach(() => {
      global.chrome = {
        tabs: {
          sendMessage: vi.fn(),
        },
        runtime: {
          lastError: null,
        },
      };
    });

    it('should send message to tab and resolve response', async () => {
      const mockResponse = { success: true };
      chrome.tabs.sendMessage.mockImplementation((tabId, payload, callback) => {
        callback(mockResponse);
      });

      const result = await eventHandler._sendTabMessage(123, { action: 'test' });
      expect(result).toEqual(mockResponse);
    });

    it('should reject when chrome runtime error occurs', async () => {
      chrome.runtime.lastError = { message: 'Test error' };
      chrome.tabs.sendMessage.mockImplementation((tabId, payload, callback) => {
        callback(null);
      });

      await expect(eventHandler._sendTabMessage(123, { action: 'test' })).rejects.toThrow(
        'Test error'
      );
    });
  });
});
