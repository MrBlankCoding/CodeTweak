import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiHandler } from '../../src/ai_dom_editor/editor/helpers/api_handler.js';

describe('ApiHandler', () => {
  let apiHandler;
  let mockEditor;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockEditor = {
      elements: {
        modelSelector: document.createElement('select'),
      },
      uiManager: {
        showConfigBanner: vi.fn(),
        hideConfigBanner: vi.fn(),
      },
    };

    global.chrome = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
    };

    global.fetch = vi.fn();

    apiHandler = new ApiHandler(mockEditor);
  });

  describe('loadAPIConfig', () => {
    it('should show banner if no config exists', async () => {
      chrome.storage.local.get.mockResolvedValue({ aiDomEditorConfigs: [] });
      await apiHandler.loadAPIConfig();
      expect(mockEditor.uiManager.showConfigBanner).toHaveBeenCalled();
    });

    it('should hide banner if valid config exists', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [{ apiKey: 'key', endpoint: 'end', model: 'gpt-4' }],
      });
      await apiHandler.loadAPIConfig();
      expect(mockEditor.uiManager.hideConfigBanner).toHaveBeenCalled();
    });
  });

  describe('_detectProviderType', () => {
    it('should detect openai from provider name', () => {
      expect(apiHandler._detectProviderType({ provider: 'openai' })).toBe('openai');
    });

    it('should detect openai from endpoint', () => {
      expect(apiHandler._detectProviderType({ endpoint: 'api.openai.com' })).toBe('openai');
    });

    it('should detect anthropic from provider name', () => {
      expect(apiHandler._detectProviderType({ provider: 'anthropic' })).toBe('anthropic');
    });

    it('should detect anthropic from model name', () => {
      expect(apiHandler._detectProviderType({ model: 'claude-3' })).toBe('anthropic');
    });

    it('should detect google from provider name', () => {
      expect(apiHandler._detectProviderType({ provider: 'google' })).toBe('google');
    });

    it('should detect google from gemini provider name', () => {
      expect(apiHandler._detectProviderType({ provider: 'gemini' })).toBe('google');
    });

    it('should detect google from endpoint', () => {
      expect(
        apiHandler._detectProviderType({ endpoint: 'generativelanguage.googleapis.com' })
      ).toBe('google');
    });

    it('should default to openai for unknown configs', () => {
      expect(apiHandler._detectProviderType({})).toBe('openai');
      expect(apiHandler._detectProviderType({ provider: 'unknown', endpoint: 'unknown' })).toBe(
        'openai'
      );
    });
  });

  describe('_parseAIContent', () => {
    it('should parse code blocks', () => {
      const content = 'Script Name: Test\nDescription\n\`\`\`javascript\nconsole.log(1);\n\`\`\`';
      const result = apiHandler._parseAIContent(content);
      expect(result.type).toBe('code');
      expect(result.code).toBe('console.log(1);');
      expect(result.name).toBe('Test');
    });

    it('should parse patches', () => {
      const content = '<<<<<< SEARCH\nold\n======\nnew\n>>>>>> REPLACE';
      const result = apiHandler._parseAIContent(content);
      expect(result.type).toBe('patch');
      expect(result.patches).toHaveLength(1);
    });

    it('should return text if no code or patches found', () => {
      const content = 'Just some text';
      const result = apiHandler._parseAIContent(content);
      expect(result.type).toBe('text');
      expect(result.message).toBe('Just some text');
    });
  });

  describe('callAIAPI', () => {
    it('should call fetch with correct parameters for openai', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [
          {
            apiKey: 'key',
            endpoint: 'https://api.openai.com/v1',
            model: 'gpt-4',
            provider: 'openai',
          },
        ],
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: { content: 'Script Name: Test\n\`\`\`javascript\nconsole.log(1);\n\`\`\`' },
            },
          ],
        }),
      });

      await apiHandler.loadAPIConfig();
      const result = await apiHandler.callAIAPI('prompt', 'dom', '// prev', []);

      expect(global.fetch).toHaveBeenCalled();
      expect(result.type).toBe('code');
    });

    it('should throw error if fetch fails', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [
          { apiKey: 'key', endpoint: 'http://ai.test', model: 'test', provider: 'openai' },
        ],
      });
      global.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'invalid' } }),
      });

      await apiHandler.loadAPIConfig();
      await expect(apiHandler.callAIAPI('p', 'd', 'c', [])).rejects.toThrow('invalid');
    });

    it('should handle missing rawContent', async () => {
      chrome.storage.local.get.mockResolvedValue({
        aiDomEditorConfigs: [
          { apiKey: 'key', endpoint: 'http://ai.test', model: 'test', provider: 'openai' },
        ],
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }), // Empty choices
      });

      await apiHandler.loadAPIConfig();
      await expect(apiHandler.callAIAPI('p', 'd', 'c', [])).rejects.toThrow();
    });
  });

  describe('_buildRequestBody', () => {
    const config = { model: 'test-model' };
    const systemPrompt = 'sys';
    const message = 'user-msg';
    const history = [];

    it('should build request body for openai', () => {
      const body = apiHandler._buildRequestBody({
        providerType: 'openai',
        activeConfig: config,
        systemPrompt,
        message,
        history,
      });
      expect(body.model).toBe('test-model');
      expect(body.messages[0].role).toBe('system');
    });

    it('should build request body for anthropic', () => {
      const body = apiHandler._buildRequestBody({
        providerType: 'anthropic',
        activeConfig: config,
        systemPrompt,
        message,
        history,
      });
      expect(body.model).toBe('test-model');
      expect(body.system).toBe(systemPrompt);
    });

    it('should build request body for google', () => {
      const body = apiHandler._buildRequestBody({
        providerType: 'google',
        activeConfig: config,
        systemPrompt,
        message,
        history,
      });
      expect(body.contents[0].parts[0].text).toContain(systemPrompt);
    });
  });

  describe('_formatHistory', () => {
    it('should format user and assistant messages', () => {
      const history = [
        { role: 'user', text: 'hi' },
        { role: 'assistant', data: { type: 'code', code: 'c', name: 'n', explanation: 'e' } },
      ];
      const result = apiHandler._formatHistory(history);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[1].content).toContain('Script Name: n');
    });

    it('should handle assistant text messages', () => {
      const history = [{ role: 'assistant', text: 'plain' }];
      const result = apiHandler._formatHistory(history);
      expect(result[0].content).toBe('plain');
    });

    it('should return empty array for invalid input', () => {
      expect(apiHandler._formatHistory(null)).toEqual([]);
      expect(apiHandler._formatHistory([null])).toEqual([]);
    });
  });

  describe('_extractErrorMessage', () => {
    it('should extract message from json error', async () => {
      const res = {
        json: async () => ({ error: { message: 'api error' } }),
        status: 500,
      };
      const msg = await apiHandler._extractErrorMessage(res);
      expect(msg).toBe('api error');
    });

    it('should fallback to status text if json fails', async () => {
      const res = {
        json: async () => {
          throw new Error();
        },
        text: async () => 'raw error',
        status: 500,
      };
      const msg = await apiHandler._extractErrorMessage(res);
      expect(msg).toBe('raw error');
    });
  });

  describe('_looksLikeCode', () => {
    it('should detect userscript patterns', () => {
      expect(apiHandler._looksLikeCode('// ==UserScript==')).toBe(true);
      expect(apiHandler._looksLikeCode('(function(){})()')).toBe(true);
      expect(apiHandler._looksLikeCode('const x = 1; let y = 2;')).toBe(true);
      expect(apiHandler._looksLikeCode('just some random text')).toBe(false);
    });
  });

  describe('loadAvailableModels', () => {
    it('should load and normalize models', async () => {
      chrome.storage.local.get.mockResolvedValue({
        availableModels: [
          { id: 'test-model', provider: 'openai', apiKey: 'key', endpoint: 'http://test' },
        ],
        lastAiModel: null,
        aiDomEditorConfigs: [],
      });

      await apiHandler.loadAvailableModels();
      expect(apiHandler.availableModels).toHaveLength(1);
      expect(apiHandler.availableModels[0].id).toBe('test-model');
    });

    it('should handle empty models gracefully', async () => {
      chrome.storage.local.get.mockResolvedValue({
        availableModels: [],
        lastAiModel: null,
        aiDomEditorConfigs: [],
      });

      await apiHandler.loadAvailableModels();
      expect(apiHandler.availableModels).toHaveLength(0);
      expect(apiHandler.selectedModel).toBeNull();
    });

    it('should use configs when no available models', async () => {
      chrome.storage.local.get.mockResolvedValue({
        availableModels: [],
        lastAiModel: null,
        aiDomEditorConfigs: [
          { model: 'config-model', provider: 'anthropic', apiKey: 'key', endpoint: 'http://test' },
        ],
      });

      await apiHandler.loadAvailableModels();
      expect(apiHandler.availableModels).toHaveLength(1);
      expect(apiHandler.availableModels[0].model).toBe('config-model');
    });
  });

  describe('handleModelChange', () => {
    it('should update selected model', async () => {
      const mockEvent = { target: { value: JSON.stringify({ id: 'new-model' }) } };
      await apiHandler.handleModelChange(mockEvent);
      expect(apiHandler.selectedModel.id).toBe('new-model');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ lastAiModel: { id: 'new-model' } });
    });

    it('should handle invalid JSON gracefully', async () => {
      const mockEvent = { target: { value: 'invalid-json' } };
      await apiHandler.handleModelChange(mockEvent);
      expect(apiHandler.selectedModel).not.toEqual({ id: 'new-model' });
    });

    it('should handle empty value', async () => {
      const mockEvent = { target: { value: '' } };
      await apiHandler.handleModelChange(mockEvent);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('_normalizeModels', () => {
    it('should normalize available models array', () => {
      const models = [{ model: 'test', provider: 'OPENAI', key: 'key', endpoint: 'http://test' }];
      const result = apiHandler._normalizeModels(models, []);
      expect(result[0].provider).toBe('openai');
      expect(result[0].apiKey).toBe('key');
    });

    it('should normalize configs when no available models', () => {
      const configs = [
        { id: 'cfg1', provider: 'ANTHROPIC', apiKey: 'key', endpoint: 'http://test' },
      ];
      const result = apiHandler._normalizeModels([], configs);
      expect(result[0].provider).toBe('anthropic');
      expect(result[0].id).toBe('cfg1');
    });

    it('should filter out invalid configs', () => {
      const configs = [{ provider: 'invalid' }]; // missing required fields
      const result = apiHandler._normalizeModels([], configs);
      expect(result).toHaveLength(0);
    });
  });

  describe('_renderModelSelector', () => {
    beforeEach(() => {
      apiHandler.availableModels = [
        { id: 'model1', provider: 'openai' },
        { id: 'model2', provider: 'anthropic' },
      ];
    });

    it('should render options for available models', () => {
      apiHandler._renderModelSelector(null);
      const selector = mockEditor.elements.modelSelector;
      expect(selector.disabled).toBe(false);
      expect(selector.options.length).toBeGreaterThan(0);
    });

    it('should show no models message when empty', () => {
      apiHandler.availableModels = [];
      apiHandler._renderModelSelector(null);
      const selector = mockEditor.elements.modelSelector;
      expect(selector.disabled).toBe(true);
      expect(selector.options[0].textContent).toContain('No models available');
    });

    it('should select matching model', () => {
      const selectedModel = { id: 'model1', provider: 'openai' };
      apiHandler._renderModelSelector(selectedModel);
      const selector = mockEditor.elements.modelSelector;
      const selectedOption = selector.options[selector.selectedIndex];
      expect(JSON.parse(selectedOption.value).id).toBe('model1');
    });
  });

  describe('_getActiveConfig', () => {
    it('should merge selected model with api config', () => {
      apiHandler.selectedModel = { id: 'selected', endpoint: 'http://selected' };
      apiHandler.apiConfig = { apiKey: 'config-key', model: 'config-model' };

      const config = apiHandler._getActiveConfig();
      expect(config.id).toBe('selected');
      expect(config.endpoint).toBe('http://selected');
      expect(config.apiKey).toBe('config-key');
    });

    it('should use fallback when selected is empty', () => {
      apiHandler.selectedModel = null;
      apiHandler.apiConfig = { apiKey: 'key', endpoint: 'http://test', model: 'test' };

      const config = apiHandler._getActiveConfig();
      expect(config.apiKey).toBe('key');
      expect(config.model).toBe('test');
    });
  });

  describe('_hasUsableConfig', () => {
    it('should return true for valid config', () => {
      const config = { apiKey: 'key', endpoint: 'http://test', model: 'test' };
      expect(apiHandler._hasUsableConfig(config)).toBe(true);
    });

    it('should return false for invalid config', () => {
      expect(apiHandler._hasUsableConfig(null)).toBe(false);
      expect(apiHandler._hasUsableConfig({})).toBe(false);
      expect(apiHandler._hasUsableConfig({ apiKey: 'key' })).toBe(false);
    });
  });

  describe('_modelSignature', () => {
    it('should create signature from model', () => {
      const model = { provider: 'openai', id: 'gpt-4' };
      expect(apiHandler._modelSignature(model)).toBe('openai:gpt-4');
    });

    it('should handle empty model', () => {
      expect(apiHandler._modelSignature(null)).toBe('');
      expect(apiHandler._modelSignature({})).toBe('custom:');
    });
  });

  describe('_safeParseJSON', () => {
    it('should parse valid JSON', () => {
      const result = apiHandler._safeParseJSON('{"test": true}');
      expect(result.test).toBe(true);
    });

    it('should return null for invalid JSON', () => {
      const invalid = '{invalid json}';
      const result = apiHandler._safeParseJSON(invalid);
      expect(result).toBeNull();
    });
  });
});
