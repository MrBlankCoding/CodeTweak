// AI Settings JavaScript

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
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toastMessage')
    };

    this.providerEndpoints = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google: 'https://generativelanguage.googleapis.com/v1beta/models',
      aimlapi: 'https://api.aimlapi.com/v1/chat/completions',
      custom: ''
    };

    this.providerModels = {
      openai: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'],
      anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      google: [
        'gemini-pro',
        'gemini-pro-vision',
        'google/gemma-3-12b-it',
        'google/gemma-3n-e4b-it',
        'google/gemma-3-4b-it'
      ],
      aimlapi: ['gemini-pro', 'gemini-pro-vision', 'google/gemma-3-12b-it', 'google/gemma-3n-e4b-it', 'google/gemma-3-4b-it'],
      custom: []
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
  }

  async loadSettings() {
    try {
      const { aiDomEditorConfig } = await chrome.storage.local.get('aiDomEditorConfig');
      
      if (aiDomEditorConfig) {
        this.elements.provider.value = aiDomEditorConfig.provider || '';
        this.elements.apiKey.value = aiDomEditorConfig.apiKey || '';
        this.elements.endpoint.value = aiDomEditorConfig.endpoint || '';
        this.updateModelOptions();
        this.elements.model.value = aiDomEditorConfig.model || '';
        this.elements.temperature.value = aiDomEditorConfig.temperature || 0.7;
        this.elements.maxTokens.value = aiDomEditorConfig.maxTokens || 2000;
        
        this.updateTemperatureValue();
        this.toggleEndpointField();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
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
      const requestBody = {
        model,
        messages: [
          { role: 'user', content: testMessage }
        ],
        max_tokens: 50
      };

      // Allow custom header for API key if needed
      const headers = {
        'Content-Type': 'application/json'
      };
      // Default: use Authorization header
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        Test Connection
      `;
    }
  }

  gatherSettings() {
    const provider = this.elements.provider.value;
    let endpoint = this.elements.endpoint.value;
    
    // Use default endpoint if not custom
    if (provider !== 'custom' && this.providerEndpoints[provider]) {
      endpoint = this.providerEndpoints[provider];
    }

    return {
      provider,
      apiKey: this.elements.apiKey.value.trim(),
      endpoint,
      model: this.elements.model.value,
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
      await chrome.storage.local.set({ aiDomEditorConfig: config });
      this.showToast('Settings saved successfully! ✓', 'success');
      
      // Notify any open AI editor windows
      chrome.runtime.sendMessage({ action: 'aiSettingsUpdated' });
    } catch (error) {
      this.showToast(`Error saving settings: ${error.message}`, 'error');
    }
  }

  resetSettings() {
    if (confirm('Are you sure you want to reset all settings?')) {
      this.elements.form.reset();
      this.elements.provider.value = '';
      this.updateModelOptions();
      this.toggleEndpointField();
      this.updateTemperatureValue();
      
      chrome.storage.local.remove('aiDomEditorConfig');
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AISettings();
});
