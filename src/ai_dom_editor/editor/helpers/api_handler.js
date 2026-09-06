import logger from '../../../shared/utils/logger.js';
import { AIDiffHelper } from '../../../shared/utils/ai_diff_helper.js';
import { PromptBuilder } from './promptBuilder.js';
import { browser } from '../../../shared/browserAdapter.js';

export class ApiHandler {
  constructor(editor) {
    this.editor = editor;
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
    this.defaultTimeoutMs = 30000;
  }

  async loadAPIConfig() {
    try {
      const { aiDomEditorConfigs = [] } = await browser.storage.local.get('aiDomEditorConfigs');
      this.apiConfig = Array.isArray(aiDomEditorConfigs) ? aiDomEditorConfigs[0] || null : null;
      if (this._hasUsableConfig(this.apiConfig)) this.editor.uiManager.hideConfigBanner();
      else this.editor.uiManager.showConfigBanner();
    } catch (error) {
      logger.error('Error loading AI config:', error);
      this.editor.uiManager.showConfigBanner();
    }
  }

  async loadAvailableModels() {
    try {
      const {
        availableModels = [],
        lastAiModel = null,
        aiDomEditorConfigs = [],
      } = await browser.storage.local.get(['availableModels', 'lastAiModel', 'aiDomEditorConfigs']);

      this.availableModels = this._normalizeModels(availableModels, aiDomEditorConfigs);
      const parsedSelected = this._safeParseJSON(lastAiModel) || lastAiModel;
      this._renderModelSelector(parsedSelected);

      const activeModel = this.selectedModel || this.availableModels[0] || null;
      this.selectedModel = activeModel;
      if (activeModel) await browser.storage.local.set({ lastAiModel: activeModel });
    } catch (error) {
      logger.error('Error loading AI models:', error);
      this.availableModels = [];
      this.selectedModel = null;
      this._renderModelSelector(null);
    }
  }

  async handleModelChange(e) {
    const value = e?.target?.value;
    if (!value) return;
    const parsed = this._safeParseJSON(value);
    if (!parsed) return;
    this.selectedModel = parsed;
    await browser.storage.local.set({ lastAiModel: parsed });
  }

  async callAIAPI(userMessage, domSummary, previousCode = null, history = []) {
    const message = (userMessage || '').trim();
    if (!message) return { type: 'text', message: 'Please enter a request.' };

    const activeConfig = this._getActiveConfig();
    if (!this._hasUsableConfig(activeConfig)) {
      this.editor.uiManager.showConfigBanner();
      throw new Error('Please configure AI settings.');
    }

    const providerType = this._detectProviderType(activeConfig);
    const systemPrompt = PromptBuilder.buildSystemPrompt(domSummary, previousCode);
    const requestBody = PromptBuilder.buildRequestBody({
      providerType,
      activeConfig,
      systemPrompt,
      message,
      history,
    });

    const responseJson = await this._executeRequest({
      endpoint: activeConfig.endpoint,
      headers: this._buildHeaders(activeConfig, providerType),
      body: requestBody,
      timeoutMs: Number(activeConfig.requestTimeoutMs || this.defaultTimeoutMs),
    });

    const rawContent = this._extractContent(responseJson, providerType);
    if (!rawContent) throw new Error('AI returned an empty response.');

    return this._parseAIContent(rawContent);
  }

  _normalizeModels(availableModels, configs) {
    if (Array.isArray(availableModels) && availableModels.length > 0) {
      return availableModels
        .map((m) => this._normalizeModelRecord(m))
        .filter((m) => this._hasUsableConfig(m));
    }
    return (Array.isArray(configs) ? configs : [])
      .map((cfg) => ({
        id: cfg.model || cfg.id || '',
        model: cfg.model || cfg.id || '',
        provider: (cfg.provider || 'custom').toLowerCase(),
        apiKey: cfg.apiKey || cfg.key || '',
        endpoint: cfg.endpoint || '',
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      }))
      .filter((m) => this._hasUsableConfig(m));
  }

  _normalizeModelRecord(model) {
    return {
      ...model,
      id: model.id || model.model || '',
      model: model.model || model.id || '',
      provider: (model.provider || 'custom').toLowerCase(),
      apiKey: model.apiKey || model.key || '',
      endpoint: model.endpoint || '',
    };
  }

  _renderModelSelector(selectedModel) {
    const selector = this.editor.elements.modelSelector;
    if (!selector) return;
    selector.innerHTML = '';
    if (!this.availableModels.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No models available';
      selector.appendChild(opt);
      selector.disabled = true;
      this.selectedModel = null;
      return;
    }
    selector.disabled = false;
    const grouped = this.availableModels.reduce((acc, m) => {
      const p = (m.provider || 'custom').toLowerCase();
      if (!acc[p]) acc[p] = [];
      acc[p].push(m);
      return acc;
    }, {});
    const sig = this._modelSignature(selectedModel);
    let matched = null;
    Object.keys(grouped)
      .sort()
      .forEach((p) => {
        const g = document.createElement('optgroup');
        g.label = p.toUpperCase();
        grouped[p].forEach((m, i) => {
          const o = document.createElement('option');
          o.value = JSON.stringify(m);
          o.textContent = m.id || m.model || `${p}-${i + 1}`;
          if (sig && this._modelSignature(m) === sig) {
            o.selected = true;
            matched = m;
          }
          g.appendChild(o);
        });
        selector.appendChild(g);
      });
    this.selectedModel = matched || this.availableModels[0];
  }

  _modelSignature(m) {
    return m ? `${(m.provider || 'custom').toLowerCase()}:${m.id || m.model || ''}` : '';
  }

  _getActiveConfig() {
    const s = this._normalizeModelRecord(this.selectedModel || {});
    const f = this._normalizeModelRecord(this.apiConfig || {});
    return {
      ...f,
      ...s,
      model: s.model || s.id || f.model || f.id || '',
      id: s.id || s.model || f.id || f.model || '',
      endpoint: s.endpoint || f.endpoint || '',
      apiKey: s.apiKey || f.apiKey || f.key || '',
      provider: (s.provider || f.provider || 'custom').toLowerCase(),
      temperature: s.temperature ?? f.temperature ?? 0.4,
      maxTokens: s.maxTokens ?? f.maxTokens ?? 1800,
    };
  }

  _hasUsableConfig(c) {
    return !!(c && c.apiKey && c.endpoint && (c.id || c.model));
  }

  _detectProviderType(c) {
    const p = (c.provider || '').toLowerCase(),
      e = (c.endpoint || '').toLowerCase(),
      m = (c.model || c.id || '').toLowerCase();
    if (
      p.includes('google') ||
      p.includes('gemini') ||
      e.includes('generativelanguage.googleapis.com')
    )
      return 'google';
    if (p.includes('anthropic') || e.includes('api.anthropic.com') || m.includes('claude'))
      return 'anthropic';
    return 'openai';
  }

  _buildHeaders(c, type) {
    const h = { 'Content-Type': 'application/json' };
    if (!c.apiKey) return h;
    if (type === 'google') h['x-goog-api-key'] = c.apiKey;
    else if (type === 'anthropic') {
      h['x-api-key'] = c.apiKey;
      h['anthropic-version'] = '2023-06-01';
    } else h.Authorization = `Bearer ${c.apiKey}`;
    return h;
  }

  async _executeRequest({ endpoint, headers, body, timeoutMs }) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(await this._extractErrorMessage(res));
      return await res.json();
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error(`AI request timed out after ${timeoutMs}ms`);
      throw e;
    } finally {
      clearTimeout(tid);
    }
  }

  async _extractErrorMessage(res) {
    try {
      const data = await res.json();
      return data?.error?.message || data?.message || JSON.stringify(data);
    } catch {
      try {
        return (await res.text()) || `AI request failed with status ${res.status}`;
      } catch {
        return `AI request failed with status ${res.status}`;
      }
    }
  }

  _extractContent(data, type) {
    if (type === 'google')
      return data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text || '')
        .join('\n')
        .trim();
    if (type === 'anthropic')
      return data?.content
        ?.map((i) => i?.text || '')
        .join('\n')
        .trim();
    const c = data?.choices?.[0]?.message?.content;
    if (Array.isArray(c))
      return c
        .map((p) =>
          typeof p === 'string' ? p : p?.type === 'text' ? p.text : p?.text?.value || ''
        )
        .join('\n')
        .trim();
    return (c || data?.choices?.[0]?.text || data?.output_text || data?.text || '').trim();
  }

  _parseAIContent(content) {
    const text = (content || '').trim();
    if (!text) return { type: 'text', message: '' };
    const nameMatch = text.match(/^\s*Script Name:\s*(.+)$/im);
    const patches = AIDiffHelper.parsePatches(text);
    if (patches.length > 0) {
      const explanation = text
        .replace(/<<<<<< SEARCH[\s\S]*?>>>>>> REPLACE/gi, '')
        .replace(/```diff[\s\S]*?```/gi, '')
        .replace(/^\s*Script Name:\s*.+$/gim, '')
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        type: 'patch',
        patches,
        name: this._cleanScriptName(nameMatch?.[1]) || 'Script Update',
        explanation: explanation || 'I have prepared some surgical edits:',
      };
    }
    const codeMatch = text.match(/```(?:javascript|js|ts)?\s*([\s\S]*?)```/i);
    if (codeMatch?.[1]) {
      const code = codeMatch[1].trim(),
        explanation = this._extractExplanation(text).trim(),
        name = this._cleanScriptName(nameMatch?.[1]) || 'Generated Script';
      if (this.editor.currentScript && code !== this.editor.currentScript.code.trim()) {
        return {
          type: 'patch',
          patches: [
            {
              type: 'unified',
              diff: AIDiffHelper.createUnifiedDiff(this.editor.currentScript.code.trim(), code),
            },
          ],
          name,
          explanation: explanation || 'I have refactored the script:',
        };
      }
      return {
        type: 'code',
        name,
        explanation: explanation || 'Generated script based on your request.',
        code,
      };
    }
    if (this._looksLikeCode(text))
      return {
        type: 'code',
        name: this._cleanScriptName(nameMatch?.[1]) || 'Generated Script',
        explanation: 'Generated script based on your request.',
        code: text,
      };
    return { type: 'text', message: text };
  }

  _extractExplanation(text) {
    return text
      .replace(/```(?:javascript|js)?[\s\S]*?```/gi, '')
      .replace(/^\s*Script Name:\s*.+$/gim, '')
      .replace(/\r?\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  _cleanScriptName(raw) {
    return raw
      ? raw
          .replace(/<[^>]*>/g, '')
          .replace(/^['"]|['"]$/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80)
      : '';
  }
  _looksLikeCode(t) {
    if (
      /==UserScript==|==\/UserScript==/.test(t) ||
      /\(\s*function\s*\(\)\s*\{[\s\S]*?\}\)\(\);?/.test(t)
    )
      return true;
    const s = [
      /\bfunction\b/,
      /\bconst\s+\w+\s*=/,
      /\blet\s+\w+\s*=/,
      /\bvar\s+\w+\s*=/,
      /document\./,
      /window\./,
      /GM_\w+\s*\(/,
      /addEventListener\s*\(/,
      /querySelector\s*\(/,
      /getElementById\s*\(/,
      /=>\s*\{/,
      /;\s*$/m,
    ];
    const m = s.filter((p) => p.test(t)).length;
    return m >= 2 || (m >= 1 && t.split('\n').length > 8);
  }
  _safeParseJSON(v) {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
}
