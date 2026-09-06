import logger from '../../shared/utils/logger.js';
import { getMessageSync } from '../../shared/utils/i18n.js';
import { browser } from '../../shared/browserAdapter.js';

export class AISettingsLogic {
  constructor() {
    this.apiConfigs = [];
    this.availableModels = [];

    this.providerEndpoints = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google:
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
      aimlapi: 'https://api.aimlapi.com/v1/chat/completions',
      custom: '',
    };

    this.providerModels = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
      anthropic: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
      google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
      mistral: ['mistral-large-latest', 'mistral-small-latest'],
      aimlapi: ['google/gemma-3-12b-it', 'gemini-pro'],
      custom: [],
    };
  }

  async load() {
    try {
      const { aiDomEditorConfigs = [], availableModels = [] } = await browser.storage.local.get([
        'aiDomEditorConfigs',
        'availableModels',
      ]);

      this.apiConfigs = Array.isArray(aiDomEditorConfigs) ? aiDomEditorConfigs : [];
      this.availableModels = Array.isArray(availableModels) ? availableModels : [];
      this.mergeFetchedModels();
      return { apiConfigs: this.apiConfigs, availableModels: this.availableModels };
    } catch (error) {
      logger.error('Error loading AI settings logic:', error);
      throw error;
    }
  }

  mergeFetchedModels() {
    this.availableModels.forEach((entry) => {
      if (!entry?.provider || !entry?.id) return;
      if (!this.providerModels[entry.provider]) {
        this.providerModels[entry.provider] = [];
      }
      if (!this.providerModels[entry.provider].includes(entry.id)) {
        this.providerModels[entry.provider].push(entry.id);
      }
    });
  }

  async save(apiConfigs) {
    this.apiConfigs = apiConfigs;
    await browser.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });
    await this.rebuildAvailableModels();
    await browser.runtime.sendMessage({ action: 'aiSettingsUpdated' });
  }

  async delete(index) {
    this.apiConfigs.splice(index, 1);
    await browser.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });
    await this.rebuildAvailableModels();
    await browser.runtime.sendMessage({ action: 'aiSettingsUpdated' });
  }

  async reset() {
    await browser.storage.local.remove(['aiDomEditorConfigs', 'availableModels']);
    this.apiConfigs = [];
    this.availableModels = [];
    await browser.runtime.sendMessage({ action: 'aiSettingsUpdated' });
  }

  async rebuildAvailableModels() {
    const merged = [];
    for (const cfg of this.apiConfigs) {
      const models = this.providerModels[cfg.provider] || [cfg.model];
      models.forEach((id) => {
        if (!id) return;
        if (merged.some((m) => m.id === id && m.provider === cfg.provider)) return;
        merged.push({
          id,
          provider: cfg.provider,
          apiKey: cfg.apiKey,
          endpoint: cfg.endpoint,
        });
      });
    }
    this.availableModels = merged;
    await browser.storage.local.set({ availableModels: merged });
  }

  async testConnection(config) {
    const testMessage = 'Reply with exactly: OK';
    const headers = { 'Content-Type': 'application/json' };

    if (config.provider === 'google' || config.model.includes('gemini')) {
      headers['x-goog-api-key'] = config.apiKey;
      return fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: testMessage }] }],
          generationConfig: { maxOutputTokens: 8, temperature: 0 },
        }),
      });
    }

    if (config.provider === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      return fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8,
          temperature: 0,
          messages: [{ role: 'user', content: testMessage }],
        }),
      });
    }

    headers.Authorization = `Bearer ${config.apiKey}`;
    return fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: testMessage }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
  }

  async fetchModelsForProvider(provider, apiKey) {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return data.data
        .map((m) => m.id)
        .filter((id) => /^gpt|^o\d|^text-embedding/i.test(id))
        .sort();
    }

    if (provider === 'google') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .sort();
    }

    if (provider === 'mistral') {
      const response = await fetch('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return (data.data || []).map((m) => m.id).sort();
    }

    if (provider === 'aimlapi') {
      const response = await fetch('https://api.aimlapi.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      return (data.data || []).map((m) => m.id).sort();
    }

    if (provider === 'anthropic') {
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
    }

    return [];
  }

  t(key, fallback) {
    const value = getMessageSync(key);
    return value && value !== key ? value : fallback;
  }
}
