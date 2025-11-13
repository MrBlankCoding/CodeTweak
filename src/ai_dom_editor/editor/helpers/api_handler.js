export class ApiHandler {
  constructor(editor) {
    this.editor = editor;
    this.apiConfig = null; // global config (array first element in storage)
    this.availableModels = [];
    this.selectedModel = null;
    this.defaultTimeoutMs = 30_000; // 30s default timeout for network requests
  }

  // Load global API configuration (aiDomEditorConfigs)
  async loadAPIConfig() {
    try {
      // chrome.storage.local.get accepts either string or array; returns an object mapping keys to values
      const res = await chrome.storage.local.get('aiDomEditorConfigs');
      const aiDomEditorConfigs = res?.aiDomEditorConfigs;

      if (Array.isArray(aiDomEditorConfigs) && aiDomEditorConfigs.length > 0) {
        this.apiConfig = aiDomEditorConfigs[0];
      } else {
        this.apiConfig = null;
      }

      // If we don't have a usable config, show banner
      const hasKeyAndEndpoint = !!(this.apiConfig && (this.apiConfig.apiKey || this.apiConfig.key) && this.apiConfig.endpoint);
      if (!hasKeyAndEndpoint) {
        this.editor?.uiManager?.showConfigBanner();
      } else {
        this.editor?.uiManager?.hideConfigBanner();
      }
    } catch (error) {
      console.error('Error loading API config:', error);
      this.editor?.uiManager?.showConfigBanner();
    }
  }

  // Load available models and populate a <select> (modelSelector) if present
  async loadAvailableModels() {
    try {
      const storage = await chrome.storage.local.get(['availableModels', 'selectedModel', 'aiDomEditorConfigs']);
      let { availableModels, selectedModel, aiDomEditorConfigs } = storage;

      // normalize availableModels
      if (!Array.isArray(availableModels) || availableModels.length === 0) {
        // fallback: derive from aiDomEditorConfigs if present
        if (Array.isArray(aiDomEditorConfigs) && aiDomEditorConfigs.length > 0) {
          availableModels = aiDomEditorConfigs.map(cfg => ({
            id: cfg.model || cfg.modelId || 'default',
            provider: (cfg.provider || cfg.vendor || 'custom').toLowerCase(),
            apiKey: cfg.apiKey || cfg.key,
            endpoint: cfg.endpoint,
            // optional per-model overrides
            temperature: cfg.temperature,
            maxTokens: cfg.maxTokens
          }));
        } else {
          availableModels = [];
        }
      }

      this.availableModels = availableModels;

      // If selectedModel was stored as JSON string, parse it
      if (typeof selectedModel === 'string') {
        try {
          selectedModel = JSON.parse(selectedModel);
        } catch {
          // ignore; selectedModel left as string (invalid) and we'll reset it later
          selectedModel = null;
        }
      }

      // Populate UI selector if it exists
      const selector = this.editor?.elements?.modelSelector;
      if (selector) {
        // clear previous options
        selector.innerHTML = '';

        if (!this.availableModels || this.availableModels.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No models available - Configure API keys';
          selector.appendChild(option);
          selector.disabled = true;
          this.selectedModel = null;
        } else {
          selector.disabled = false;

          // group models by provider for visual clarity
          const modelsByProvider = {};
          this.availableModels.forEach(m => {
            const provider = (m.provider || 'custom').toLowerCase();
            modelsByProvider[provider] = modelsByProvider[provider] || [];
            modelsByProvider[provider].push(m);
          });

          Object.keys(modelsByProvider).sort().forEach(provider => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = provider.toUpperCase();

            modelsByProvider[provider].forEach(model => {
              const option = document.createElement('option');
              option.value = JSON.stringify(model);
              option.textContent = model.id || `${provider}-model`;
              // mark selected if storage's selectedModel matches
              if (selectedModel && selectedModel.id === model.id && (selectedModel.provider || '').toLowerCase() === provider) {
                option.selected = true;
              }
              optgroup.appendChild(option);
            });

            selector.appendChild(optgroup);
          });

          // If there's a selectedModel in storage, use that; otherwise default to first available
          if (selectedModel && typeof selectedModel === 'object') {
            this.selectedModel = selectedModel;
          } else {
            // default to first availableModel
            this.selectedModel = this.availableModels[0];
            // persist default
            await chrome.storage.local.set({ selectedModel: this.selectedModel });
          }
        }
      } else {
        // If there's no selector in DOM, still set selectedModel from storage or default
        if (selectedModel && typeof selectedModel === 'object') {
          this.selectedModel = selectedModel;
        } else if (this.availableModels && this.availableModels.length > 0) {
          this.selectedModel = this.availableModels[0];
          await chrome.storage.local.set({ selectedModel: this.selectedModel });
        } else {
          this.selectedModel = null;
        }
      }
    } catch (error) {
      console.error('Error loading available models:', error);
    }
  }

  // Handle UI change for model select
  async handleModelChange(e) {
    try {
      const raw = e?.target?.value;
      if (!raw) return;
      const modelData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      this.selectedModel = modelData;
      await chrome.storage.local.set({ selectedModel: modelData });
    } catch (error) {
      console.error('Error handling model change:', error);
    }
  }

  // Helper to build headers depending on provider heuristics or explicit headerFormat on model config
  _buildAuthHeaders(modelConfig) {
    const apiKey = modelConfig?.apiKey || modelConfig?.key;
    const provider = (modelConfig?.provider || '').toLowerCase();
    const modelId = (modelConfig?.id || modelConfig?.model || '').toLowerCase();

    if (!apiKey) return {};

    // Allow explicit override
    if (modelConfig?.headerFormat === 'x-api-key') {
      return { 'X-API-Key': apiKey };
    }

    if (provider.includes('aimlapi')) {
      return { 'Authorization': `Bearer ${apiKey}` };
    }

    // Handle Gemma models specifically
    const isGemma = modelId.includes('gemma') || 
                   (provider.includes('google') && modelId.includes('gemma'));

    if (isGemma) {
      return { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
    }

    // Gemini API uses x-goog-api-key header
    if (modelId.includes('gemini') || provider.includes('gemini')) {
      return { 'x-goog-api-key': apiKey };
    }

    // common heuristics
    if (provider.includes('openai') || provider.includes('gpt') || provider.includes('anthropic')) {
      return { 'Authorization': `Bearer ${apiKey}` };
    }
    if (provider.includes('azure')) {
      return { 'api-key': apiKey }; // Azure OpenAI uses an 'api-key' header sometimes
    }
    if (provider.includes('google') || provider.includes('vertex')) {
      return { 'Authorization': `Bearer ${apiKey}` };
    }

    // fallback
    return { 'Authorization': `Bearer ${apiKey}` };
  }

  // Robust response content extractor for various provider shapes
  _extractContentFromResponse(data) {
    // Gemini API format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    if (data?.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
        const textParts = candidate.content.parts
          .filter(part => part.text)
          .map(part => part.text)
          .join('');
        if (textParts) return textParts;
      }
    }

    // OpenAI Chat Completions
    if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
      const first = data.choices[0];
      if (first.message?.content) return first.message.content;
      if (typeof first.text === 'string') return first.text;
    }

    // OpenAI / other: top-level 'output_text' or 'text'
    if (typeof data.output_text === 'string') return data.output_text;
    if (typeof data.text === 'string') return data.text;

    // Some vendor may return data[0].content or similar
    if (Array.isArray(data) && data.length > 0 && typeof data[0].content === 'string') return data[0].content;

    // Otherwise fallback to JSON string
    return JSON.stringify(data);
  }

  // Extract first fenced-code-block, or return entire content if none
  _extractCode(content) {
    if (!content || typeof content !== 'string') return '';
    // Try to get triple-backtick fenced JS block first
    const codeFenceRegex = /```(?:javascript|js)?\s*([\s\S]*?)```/i;
    const match = content.match(codeFenceRegex);
    if (match && match[1]) return match[1].trim();
    // If no fences, return content as-is (caller will decide)
    return content.trim();
  }

  // Primary method to call AI APIs. Returns { type: 'script', code: '...' }
  async callAIAPI(userMessage, domSummary, previousCode = null) {

    let systemPrompt = `You are a JavaScript developer who writes userscripts.
This is the current page structure (DOM summary):
${domSummary}`;

    if (previousCode) {
      systemPrompt += `
This is the previously generated code:
\`\`\`javascript
${previousCode}
\`\`\`
The user wants to modify the above script.
`;
    }

    systemPrompt += `
Your task is to generate JavaScript code to modify the page based on the user's request.
- Use specific selectors. Prefer IDs, then classes, then tags.
- You can use Greasemonkey APIs: GM_addStyle, GM_setValue, GM_getValue, GM_deleteValue, GM_listValues, GM_xmlhttpRequest, GM_notification, GM_addElement, GM_registerMenuCommand, GM_openInTab, GM_setClipboard, GM_download, GM_getResourceText, unsafeWindow.
- Write immediately executable code.
- Check if elements exist before using them.
- Use modern JavaScript.
- Do not include userscript metadata headers (like // ==UserScript==), markdown fences, or IIFE wrappers. Only provide pure JavaScript code.

User's request: ${userMessage}

Your response is only the JavaScript code.`;

    // Decide model config (selectedModel preferred, else global apiConfig)
    const modelConfig = this.selectedModel || this.apiConfig || {};
    const modelId = modelConfig.id || modelConfig.model || this.apiConfig?.model || 'gpt-4';
    const endpoint = modelConfig.endpoint || this.apiConfig?.endpoint;
    const apiKey = modelConfig.apiKey || modelConfig.key || this.apiConfig?.apiKey || this.apiConfig?.key;

    if (!endpoint) {
      this.editor?.uiManager?.showConfigBanner?.();
      throw new Error('No endpoint configured for AI provider. Please configure an API endpoint in settings.');
    }
    if (!apiKey) {
      this.editor?.uiManager?.showConfigBanner?.();
      throw new Error('No API key configured for the selected model/provider.');
    }

    // choose header format intelligently
    const authHeaders = this._buildAuthHeaders(modelConfig);

    // build messages depending on heuristics (some providers expect system+user, others expect just user)
    const provider = (modelConfig.provider || '').toLowerCase();
    const isGemma = modelId.toLowerCase().includes('gemma');
    const isGoogleish = !provider.includes('aimlapi') && 
                       !isGemma && 
                       (modelId.toLowerCase().includes('gemini') || 
                        provider.includes('google') || 
                        provider.includes('vertex'));
    const isAnthropic = provider.includes('anthropic') || modelId.toLowerCase().includes('claude');

    // prefer settings on per-model config, fallback to global
    const temperature = (typeof modelConfig.temperature === 'number') ? modelConfig.temperature : (typeof this.apiConfig?.temperature === 'number' ? this.apiConfig.temperature : 0.7);
    const max_tokens = (typeof modelConfig.maxTokens === 'number') ? modelConfig.maxTokens : (typeof this.apiConfig?.maxTokens === 'number' ? this.apiConfig.maxTokens : 2000);
    
    // Construct request body for common Chat completions patterns (best-effort)
    let requestBody;
    if (isGemma) {
      // Format for Gemma models
      requestBody = {
        model: modelId,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userMessage}` }
        ],
        temperature: temperature,
        max_tokens: max_tokens
      };
    } else if (isGoogleish) {
      // Gemini uses a different API format than OpenAI
      // Format: { contents: [{ parts: [{ text: "..." }] }] }
      const combinedPrompt = `${systemPrompt}\n\n${userMessage}`;
      requestBody = {
        contents: [
          {
            parts: [
              { text: combinedPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens
        }
      };
    } else if (isAnthropic) {
      // Claude-like: use a single input field (this is heuristic)
      requestBody = {
        model: modelId,
        prompt: `${systemPrompt}\n\nUser Request: ${userMessage}`,
        temperature,
        max_tokens
      };
    } else {
      // Default: OpenAI/Chat-completions style
      requestBody = {
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
        max_tokens
      };
    }

    // Add any user-supplied additional fields from modelConfig (non-destructive)
    if (modelConfig?.extraRequestFields && typeof modelConfig.extraRequestFields === 'object') {
      Object.assign(requestBody, modelConfig.extraRequestFields);
    }

    // Timeout handling
    const controller = new AbortController();
    const timeout = modelConfig.requestTimeoutMs || this.defaultTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        // try to extract json error payload for better message
        let errText = `API request failed with status ${res.status}`;
        try {
          const errJson = await res.json();
          // different providers put error messages in different places
          errText = errJson?.error?.message || errJson?.message || JSON.stringify(errJson);
        } catch {
          // fallback to text
          try {
            const txt = await res.text();
            if (txt) errText = txt;
          } catch { /* ignore */ }
        }
        throw new Error(errText);
      }

      const data = await res.json();

      // extract content robustly
      const content = this._extractContentFromResponse(data);
      if (!content || content.length === 0) {
        throw new Error('No usable content returned from AI provider.');
      }

      const code = this._extractCode(content);

      return {
        type: 'script',
        code: code
      };
    } catch (err) {
      console.error('❌ AI API Error:', err);
      console.groupEnd();
      if (err.name === 'AbortError') {
        throw new Error(`AI request timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}