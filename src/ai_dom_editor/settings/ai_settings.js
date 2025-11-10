// AI Settings JavaScript
import feather from 'feather-icons';

class AISettings {
  constructor() {
    this.elements = {
      form: document.getElementById('settingsForm'),
      provider: document.getElementById('provider'),
      apiKey: document.getElementById('apiKey'),
      endpoint: document.getElementById('endpoint'),
      endpointGroup: document.getElementById('endpointGroup'),
      model: document.getElementById('model'),
      modelGroup: document.getElementById('modelGroup'),
      temperature: document.getElementById('temperature'),
      temperatureValue: document.getElementById('temperatureValue'),
      maxTokens: document.getElementById('maxTokens'),
      toggleApiKey: document.getElementById('toggleApiKey'),
      testConnection: document.getElementById('testConnection'),
      resetBtn: document.getElementById('resetBtn'),
      saveBtn: document.getElementById('saveBtn'),
      fetchModelsBtn: document.getElementById('fetchModelsBtn'),
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toastMessage'),
      apiKeysList: document.getElementById('apiKeysList'),
      addKeyBtn: document.getElementById('addKeyBtn')
    };
    
    this.apiConfigs = []; // Array to store multiple API configs
    this.currentConfigIndex = 0; // Currently editing config
    this.availableModels = []; // All available models from all keys

    this.providerEndpoints = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      aimlapi: 'https://api.aimlapi.com/v1/chat/completions',
      custom: ''
    };

    // Fallback model lists if API fetch fails
    this.providerModels = {
      openai: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'],
      anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      google: [
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-pro',
        'gemini-pro-vision'
      ],
      aimlapi: ['gemini-pro', 'gemini-pro-vision', 'google/gemma-3-12b-it', 'google/gemma-3n-e4b-it', 'google/gemma-3-4b-it'],
      custom: []
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    feather.replace();
  }

  async loadSettings() {
    try {
      const { aiDomEditorConfigs } = await chrome.storage.local.get('aiDomEditorConfigs');
      
      if (aiDomEditorConfigs && Array.isArray(aiDomEditorConfigs)) {
        this.apiConfigs = aiDomEditorConfigs;
      }
      
      // Load all available models from storage
      const { availableModels } = await chrome.storage.local.get('availableModels');
      if (availableModels) {
        this.availableModels = availableModels;
      }
      
      // Load first config if available
      if (this.apiConfigs.length > 0) {
        this.loadConfig(0);
      }
      
      this.renderAPIKeysList();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }
  
  loadConfig(index) {
    const config = this.apiConfigs[index];
    if (!config) return;
    
    this.currentConfigIndex = index;
    this.elements.provider.value = config.provider || '';
    this.elements.apiKey.value = config.apiKey || '';
    this.elements.endpoint.value = config.endpoint || '';
    this.updateModelOptions();
    this.elements.model.value = config.model || '';
    this.elements.temperature.value = config.temperature || 0.7;
    this.elements.maxTokens.value = config.maxTokens || 2000;
    
    this.updateTemperatureValue();
    this.toggleEndpointField();
  }
  
  renderAPIKeysList() {
    if (!this.elements.apiKeysList) return;
    
    this.elements.apiKeysList.innerHTML = '';
    this.apiConfigs.forEach((config, index) => {
      const item = document.createElement('div');
      item.className = 'api-key-item' + (index === this.currentConfigIndex ? ' active' : '');
      item.innerHTML = `
        <div class="api-key-info">
          <strong>${config.provider || 'Unnamed'}</strong>
          <span>${config.model || 'No model'}</span>
        </div>
        <div class="api-key-actions">
          <button type="button" class="btn-icon" onclick="aiSettings.loadConfig(${index})" title="Edit">
            <i data-feather="edit-2" width="14" height="14"></i>
          </button>
          <button type="button" class="btn-icon btn-danger" onclick="aiSettings.deleteConfig(${index})" title="Delete">
            <i data-feather="trash-2" width="14" height="14"></i>
          </button>
        </div>
      `;
      this.elements.apiKeysList.appendChild(item);
    });
    feather.replace();
  }

  setupEventListeners() {
    // Provider change
    this.elements.provider.addEventListener('change', () => {
      this.updateModelOptions();
      this.toggleEndpointField();
      this.updateEndpoint();
      // Hide endpoint field for aimlapi
      if (this.elements.provider.value === 'aimlapi') {
        this.elements.endpointGroup.style.display = 'none';
      }
    });

    // Toggle API key visibility
    this.elements.toggleApiKey.addEventListener('click', () => {
      const type = this.elements.apiKey.type === 'password' ? 'text' : 'password';
      this.elements.apiKey.type = type;
    });

    // Temperature slider
    this.elements.temperature.addEventListener('input', () => {
      this.updateTemperatureValue();
    });

    // Test connection
    this.elements.testConnection.addEventListener('click', () => {
      this.testConnection();
    });

    // Reset
    this.elements.resetBtn.addEventListener('click', () => {
      this.resetSettings();
    });

    // Fetch models button
    if (this.elements.fetchModelsBtn) {
      this.elements.fetchModelsBtn.addEventListener('click', () => {
        this.fetchModelsFromAPI();
      });
    }

    // Add key button
    if (this.elements.addKeyBtn) {
      this.elements.addKeyBtn.addEventListener('click', () => {
        this.addNewConfig();
      });
    }

    // Form submission
    this.elements.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });
  }

  updateModelOptions() {
    const provider = this.elements.provider.value;
    const models = this.providerModels[provider] || [];
    
    this.elements.model.innerHTML = '<option value="">Select a model...</option>';
    
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      this.elements.model.appendChild(option);
    });

    if (provider === 'custom') {
      const option = document.createElement('option');
      option.value = 'custom';
      option.textContent = 'Custom Model';
      this.elements.model.appendChild(option);
    }
  }

  toggleEndpointField() {
    const provider = this.elements.provider.value;
    this.elements.endpointGroup.style.display = provider === 'custom' ? 'block' : 'none';
  }

  updateEndpoint() {
    const provider = this.elements.provider.value;
    if (provider !== 'custom' && this.providerEndpoints[provider]) {
      this.elements.endpoint.value = this.providerEndpoints[provider];
    }
    // Hide endpoint field for aimlapi
    if (provider === 'aimlapi') {
      this.elements.endpointGroup.style.display = 'none';
    }
  }

  updateTemperatureValue() {
    this.elements.temperatureValue.textContent = this.elements.temperature.value;
  }

  async testConnection() {
    const config = this.gatherSettings();
    
    // For aimlapi, endpoint is fixed
    if (config.provider === 'aimlapi') {
      config.endpoint = this.providerEndpoints.aimlapi;
    }
    if (!config.apiKey || !config.endpoint) {
      this.showToast('Please fill in all required fields', 'error');
      return;
    }

    this.elements.testConnection.disabled = true;
    this.elements.testConnection.textContent = 'Testing...';

    try {
      const testMessage = 'Hello, this is a test message. Please respond with "OK".';
      
      // Always use the selected model
      const model = config.model || 'gpt-3.5-turbo';
      // Build request based on provider
      let requestBody;
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (config.provider === 'google' || model.includes('gemini')) {
        // Gemini uses different format
        requestBody = {
          contents: [{
            parts: [{ text: testMessage }]
          }]
        };
        headers['x-goog-api-key'] = config.apiKey;
      } else {
        // OpenAI/standard format
        requestBody = {
          model,
          messages: [
            { role: 'user', content: testMessage }
          ],
          max_tokens: 50
        };
        if (config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
      }
      // Optionally: allow user to specify a custom header in the future
      console.log('[AI Settings] Test Connection URL:', config.endpoint);
      console.log('[AI Settings] Request Headers:', headers);
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        this.showToast('Connection successful! ✓', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        // Prefer full error message if provided
        let errorMsg = errorData.message || errorData.error?.message || response.statusText;
        if (errorData.statusCode) {
          errorMsg = `[${errorData.statusCode}] ${errorMsg}`;
        }
        this.showToast(`Connection failed: ${errorMsg}`, 'error');
      }
    } catch (error) {
      this.showToast(`Connection error: ${error.message}`, 'error');
    } finally {
      this.elements.testConnection.disabled = false;
      this.elements.testConnection.innerHTML = `
        <i data-feather="activity" width="16" height="16"></i>
        Test Connection
      `;
      feather.replace();
    }
  }

  gatherSettings() {
    const provider = this.elements.provider.value;
    const model = this.elements.model.value;
    let endpoint = this.elements.endpoint.value;
    
    // Use default endpoint if not custom
    if (provider !== 'custom' && this.providerEndpoints[provider]) {
      endpoint = this.providerEndpoints[provider];
      
      // For Google/Gemini, update endpoint with specific model
      if (provider === 'google' && model) {
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      }
    }

    return {
      provider,
      apiKey: this.elements.apiKey.value.trim(),
      endpoint,
      model,
      temperature: parseFloat(this.elements.temperature.value),
      maxTokens: parseInt(this.elements.maxTokens.value)
    };
  }

  async saveSettings() {
    const config = this.gatherSettings();
    
    if (!config.apiKey || !config.endpoint || !config.model) {
      this.showToast('Please fill in all required fields', 'error');
      return;
    }

    try {
      // Update or add the config
      if (this.currentConfigIndex < this.apiConfigs.length) {
        this.apiConfigs[this.currentConfigIndex] = config;
      } else {
        this.apiConfigs.push(config);
        this.currentConfigIndex = this.apiConfigs.length - 1;
      }
      
      await chrome.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });
      
      this.renderAPIKeysList();
      this.showToast('Settings saved successfully! ✓', 'success');
      
      // Fetch and save all available models
      const fetchedModels = await this.fetchAllModels();
      
      // If no models were fetched, create entries from provider fallback models
      if (!fetchedModels || fetchedModels.length === 0) {
        const basicModels = [];
        this.apiConfigs.forEach(cfg => {
          const modelsForProvider = this.providerModels[cfg.provider] || [];
          modelsForProvider.forEach(modelId => {
            if (!basicModels.find(m => m.id === modelId && m.provider === cfg.provider)) {
              basicModels.push({
                id: modelId,
                provider: cfg.provider,
                apiKey: cfg.apiKey,
                endpoint: cfg.endpoint
              });
            }
          });
        });
        await chrome.storage.local.set({ availableModels: basicModels });
      }
      
      // Notify any open AI editor windows
      chrome.runtime.sendMessage({ action: 'aiSettingsUpdated' });
    } catch (error) {
      this.showToast(`Error saving settings: ${error.message}`, 'error');
    }
  }
  
  addNewConfig() {
    // Save current config if modified
    const config = this.gatherSettings();
    if (config.apiKey && config.endpoint) {
      this.apiConfigs[this.currentConfigIndex] = config;
    }
    
    // Create new empty config
    this.currentConfigIndex = this.apiConfigs.length;
    this.elements.form.reset();
    this.elements.provider.value = '';
    this.updateModelOptions();
    this.toggleEndpointField();
    this.updateTemperatureValue();
    this.elements.temperature.value = 0.7;
    this.elements.maxTokens.value = 2000;
    this.renderAPIKeysList();
  }
  
  async deleteConfig(index) {
    if (!confirm('Are you sure you want to delete this API key configuration?')) {
      return;
    }
    
    this.apiConfigs.splice(index, 1);
    await chrome.storage.local.set({ aiDomEditorConfigs: this.apiConfigs });
    
    // Load first config or reset form
    if (this.apiConfigs.length > 0) {
      this.loadConfig(0);
    } else {
      this.currentConfigIndex = 0;
      this.elements.form.reset();
      this.updateModelOptions();
    }
    
    this.renderAPIKeysList();
    
    // Fetch all models or create entries from provider fallback models
    const fetchedModels = await this.fetchAllModels();
    if ((!fetchedModels || fetchedModels.length === 0) && this.apiConfigs.length > 0) {
      const basicModels = [];
      this.apiConfigs.forEach(cfg => {
        const modelsForProvider = this.providerModels[cfg.provider] || [];
        modelsForProvider.forEach(modelId => {
          if (!basicModels.find(m => m.id === modelId && m.provider === cfg.provider)) {
            basicModels.push({
              id: modelId,
              provider: cfg.provider,
              apiKey: cfg.apiKey,
              endpoint: cfg.endpoint
            });
          }
        });
      });
      await chrome.storage.local.set({ availableModels: basicModels });
    } else if (this.apiConfigs.length === 0) {
      // Clear models if no configs left
      await chrome.storage.local.set({ availableModels: [] });
    }
    
    this.showToast('API key configuration deleted', 'success');
    
    // Notify any open AI editor windows
    chrome.runtime.sendMessage({ action: 'aiSettingsUpdated' });
  }

  resetSettings() {
    if (confirm('Are you sure you want to reset all settings?')) {
      this.elements.form.reset();
      this.elements.provider.value = '';
      this.updateModelOptions();
      this.toggleEndpointField();
      this.updateTemperatureValue();
      
      chrome.storage.local.remove('aiDomEditorConfigs');
      chrome.storage.local.remove('availableModels');
      this.showToast('Settings reset', 'success');
    }
  }

  showToast(message, type = 'success') {
    this.elements.toastMessage.textContent = message;
    this.elements.toast.className = `toast ${type}`;
    this.elements.toast.style.display = 'flex';

    setTimeout(() => {
      this.elements.toast.style.display = 'none';
    }, 3000);
  }
  
  async fetchModelsFromAPI() {
    const config = this.gatherSettings();
    
    if (!config.apiKey || !config.provider) {
      this.showToast('Please enter API key and select provider first', 'error');
      return;
    }
    
    this.elements.fetchModelsBtn.disabled = true;
    this.elements.fetchModelsBtn.textContent = 'Fetching...';
    
    try {
      let models = [];
      
      switch (config.provider) {
        case 'openai':
          models = await this.fetchOpenAIModels(config.apiKey);
          break;
        case 'anthropic':
          models = await this.fetchAnthropicModels();
          break;
        case 'google':
          models = await this.fetchGoogleModels(config.apiKey);
          break;
        case 'aimlapi':
          models = await this.fetchAIMLAPIModels(config.apiKey);
          break;
        case 'custom':
          this.showToast('Custom endpoints do not support model fetching', 'error');
          return;
      }
      
      if (models.length > 0) {
        this.providerModels[config.provider] = models;
        this.updateModelOptions();
        this.showToast(`Found ${models.length} models!`, 'success');
      } else {
        this.showToast('No models found', 'error');
      }
    } catch (error) {
      this.showToast(`Error fetching models: ${error.message}`, 'error');
    } finally {
      this.elements.fetchModelsBtn.disabled = false;
      this.elements.fetchModelsBtn.textContent = 'Fetch Available Models';
    }
  }
  
  async fetchOpenAIModels(apiKey) {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    
    const data = await response.json();
    // Filter for chat models only
    return data.data
      .filter(model => model.id.includes('gpt'))
      .map(model => model.id)
      .sort();
  }
  
  async fetchAnthropicModels() {
    // Anthropic doesn't have a models endpoint, return known models
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
  
  async fetchGoogleModels(apiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.models
      .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
      .map(model => model.name.replace('models/', ''))
      .sort();
  }
  
  async fetchAIMLAPIModels(apiKey) {
    try {
      const response = await fetch('https://api.aimlapi.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data.map(model => model.id).sort();
    } catch {
      // Fallback to known AIML API models if fetch fails
      return this.providerModels.aimlapi;
    }
  }
  
  async fetchAllModels() {
    const allModels = [];
    
    for (const config of this.apiConfigs) {
      try {
        let models = [];
        
        switch (config.provider) {
          case 'openai':
            models = await this.fetchOpenAIModels(config.apiKey);
            break;
          case 'anthropic':
            models = await this.fetchAnthropicModels();
            break;
          case 'google':
            models = await this.fetchGoogleModels(config.apiKey);
            break;
          case 'aimlapi':
            models = await this.fetchAIMLAPIModels(config.apiKey);
            break;
        }
        
        models.forEach(model => {
          if (!allModels.find(m => m.id === model)) {
            allModels.push({
              id: model,
              provider: config.provider,
              apiKey: config.apiKey,
              endpoint: config.endpoint
            });
          }
        });
      } catch (error) {
        console.error(`Error fetching models for ${config.provider}:`, error);
      }
    }
    
    this.availableModels = allModels;
    await chrome.storage.local.set({ availableModels: allModels });
    
    return allModels;
  }
}

// Global instance for inline event handlers (used in HTML onclick attributes)
// eslint-disable-next-line no-unused-vars
let aiSettings;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  aiSettings = new AISettings();
});
