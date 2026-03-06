import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AICodeManager } from '../../src/editor/ai_code_manager.js';

describe('AICodeManager', () => {
  let aiCodeManager;
  let mockElements;
  let mockState;
  let mockCodeEditorManager;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockElements = {
      aiChatHistory: document.createElement('div'),
      aiChatInput: document.createElement('textarea'),
      aiSendBtn: document.createElement('button'),
      aiClearBtn: document.createElement('button'),
      aiModelSelector: document.createElement('select'),
      aiConfigWarning: document.createElement('div'),
      aiChatContainer: document.createElement('div'),
    };

    mockState = {
      hasUnsavedChanges: false,
    };

    mockCodeEditorManager = {
      getValue: vi.fn().mockReturnValue('// current code'),
      setValue: vi.fn(),
    };

    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys) => {
            const data = {
              aiDomEditorConfigs: [],
              availableModels: [],
              lastAiModel: null,
            };
            if (Array.isArray(keys)) {
              const res = {};
              keys.forEach((k) => (res[k] = data[k]));
              return res;
            }
            if (typeof keys === 'string') {
              return { [keys]: data[keys] };
            }
            return data;
          }),
          set: vi.fn().mockResolvedValue(undefined),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    };

    global.fetch = vi.fn();

    aiCodeManager = new AICodeManager(mockElements, mockState, mockCodeEditorManager);
  });

  describe('clearHistory', () => {
    it('should clear chat history array and UI', () => {
      aiCodeManager.chatHistory = [{ role: 'user', text: 'hi' }];
      aiCodeManager.clearHistory();
      expect(aiCodeManager.chatHistory).toHaveLength(0);
      expect(mockElements.aiChatHistory.innerHTML).toContain('ai-message');
    });
  });

  describe('parseAIContent', () => {
    it('should parse search-replace patches', () => {
      const content = '<<<<<< SEARCH\nold\n======\nnew\n>>>>>> REPLACE';
      const result = aiCodeManager.parseAIContent(content);
      expect(result.type).toBe('patch');
      expect(result.patches).toHaveLength(1);
    });

    it('should diff full code blocks against current code', () => {
      const content = '\`\`\`javascript\nconst x = 2;\n\`\`\`';
      mockCodeEditorManager.getValue.mockReturnValue('const x = 1;');

      const result = aiCodeManager.parseAIContent(content);
      expect(result.type).toBe('patch');
      expect(result.patches[0].type).toBe('unified');
    });

    it('should return plain code if current code is empty', () => {
      const content = '\`\`\`javascript\nconst x = 2;\n\`\`\`';
      mockCodeEditorManager.getValue.mockReturnValue('');

      const result = aiCodeManager.parseAIContent(content);
      expect(result.type).toBe('code');
      expect(result.code).toBe('const x = 2;');
    });
  });

  describe('loadAIConfig', () => {
    it('should update UI when valid config found', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [{ apiKey: 'key', endpoint: 'end', model: 'gpt-4' }],
      });
      await aiCodeManager.loadAIConfig();
      expect(mockElements.aiConfigWarning.classList.contains('hidden')).toBe(true);
      expect(mockElements.aiChatContainer.classList.contains('hidden')).toBe(false);
    });

    it('should show warning when no config found', async () => {
      chrome.storage.local.get.mockResolvedValue({ aiDomEditorConfigs: [] });
      await aiCodeManager.loadAIConfig();
      expect(mockElements.aiConfigWarning.classList.contains('hidden')).toBe(false);
      expect(mockElements.aiChatContainer.classList.contains('hidden')).toBe(true);
    });
  });

  describe('handleSendMessage', () => {
    it('should add user message and call AI', async () => {
      mockElements.aiChatInput.value = 'hello ai';
      vi.spyOn(aiCodeManager, 'callAI').mockImplementation(async () => {});

      await aiCodeManager.handleSendMessage();

      expect(aiCodeManager.chatHistory[0].text).toBe('hello ai');
      expect(aiCodeManager.callAI).toHaveBeenCalledWith('hello ai');
      expect(mockElements.aiChatInput.value).toBe('');
    });
  });

  describe('callAI', () => {
    it('should handle successful AI response with code', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [
          { apiKey: 'key', endpoint: 'http://ai.test', model: 'test', provider: 'openai' },
        ],
      });
      await aiCodeManager.loadAIConfig();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: 'Explanation\n\`\`\`javascript\nconsole.log(1);\n\`\`\`' } },
          ],
        }),
      });

      await aiCodeManager.callAI('hello');

      expect(aiCodeManager.chatHistory).toHaveLength(1);
      expect(aiCodeManager.chatHistory[0].data.type).toBe('patch');
    });

    it('should handle AI error response', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [
          { apiKey: 'key', endpoint: 'http://ai.test', model: 'test', provider: 'openai' },
        ],
      });
      await aiCodeManager.loadAIConfig();

      global.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'Failed' } }),
      });

      await aiCodeManager.callAI('hello');

      expect(aiCodeManager.chatHistory).toHaveLength(1);
      expect(aiCodeManager.chatHistory[0].text).toContain('Error');
    });
  });

  describe('handleModelChange', () => {
    it('should update selectedModel and save to storage', async () => {
      const model = { id: 'new-model', provider: 'openai' };
      const event = { target: { value: JSON.stringify(model) } };

      await aiCodeManager.handleModelChange(event);

      expect(aiCodeManager.selectedModel).toEqual(model);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ lastAiModel: model });
    });
  });

  describe('getActiveConfig', () => {
    it('should prioritize selectedModel over apiConfig', () => {
      aiCodeManager.apiConfig = {
        apiKey: 'api-key',
        endpoint: 'api-end',
        model: 'api-model',
        provider: 'openai',
      };
      aiCodeManager.selectedModel = {
        apiKey: 'sel-key',
        endpoint: 'sel-end',
        id: 'sel-id',
        provider: 'anthropic',
      };

      const active = aiCodeManager.getActiveConfig();

      expect(active.apiKey).toBe('sel-key');
      expect(active.provider).toBe('anthropic');
      expect(active.model).toBe('sel-id');
    });

    it('should fallback to apiConfig if selectedModel is missing properties', () => {
      aiCodeManager.apiConfig = {
        apiKey: 'api-key',
        endpoint: 'api-end',
        model: 'api-model',
        provider: 'openai',
      };
      aiCodeManager.selectedModel = { id: 'sel-id' };

      const active = aiCodeManager.getActiveConfig();

      expect(active.apiKey).toBe('api-key');
      expect(active.model).toBe('sel-id');
    });
  });

  describe('renderModelSelector', () => {
    it('should show "No models available" if list is empty', () => {
      aiCodeManager.availableModels = [];
      aiCodeManager.renderModelSelector(null);
      expect(mockElements.aiModelSelector.textContent).toContain('No models available');
    });

    it('should select the last used model if found', () => {
      const model1 = { id: 'm1', provider: 'p1' };
      const model2 = { id: 'm2', provider: 'p2' };
      aiCodeManager.availableModels = [model1, model2];
      aiCodeManager.renderModelSelector(model2);
      expect(aiCodeManager.selectedModel).toEqual(model2);
      expect(mockElements.aiModelSelector.value).toBe(JSON.stringify(model2));
    });

    it('should default to first model if last used not found', () => {
      const model1 = { id: 'm1', provider: 'p1' };
      aiCodeManager.availableModels = [model1];
      aiCodeManager.renderModelSelector({ id: 'missing' });
      expect(aiCodeManager.selectedModel).toEqual(model1);
    });
  });

  describe('setThinking', () => {
    it('should update isThinking state and button disabled property', () => {
      aiCodeManager.setThinking(true);
      expect(aiCodeManager.isThinking).toBe(true);
      expect(mockElements.aiSendBtn.disabled).toBe(true);

      aiCodeManager.setThinking(false);
      expect(aiCodeManager.isThinking).toBe(false);
      expect(mockElements.aiSendBtn.disabled).toBe(false);
    });
  });
});
