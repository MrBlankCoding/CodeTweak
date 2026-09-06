import feather from 'feather-icons';

export class AISettingsUI {
  constructor(logic) {
    this.logic = logic;
    this.elements = this.initializeElements();
    this.currentConfigIndex = -1;
    this.isDraftProfile = false;
    this.isDirty = false;
  }

  initializeElements() {
    return {
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
      addKeyBtn: document.getElementById('addKeyBtn'),
      activeProfileText: document.getElementById('activeProfileText'),
      profileCount: document.getElementById('profileCount'),
    };
  }

  setupEventListeners() {
    this.elements.form.addEventListener('input', () => {
      this.isDirty = true;
    });

    window.addEventListener('beforeunload', (e) => {
      if (!this.isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    });

    this.elements.provider.addEventListener('change', () => {
      this.updateModelOptions();
      this.toggleEndpointField();
      this.autoFillEndpoint();
    });

    this.elements.toggleApiKey.addEventListener('click', () => {
      const nextType = this.elements.apiKey.type === 'password' ? 'text' : 'password';
      this.elements.apiKey.type = nextType;
    });

    this.elements.temperature.addEventListener('input', () => {
      this.elements.temperatureValue.textContent = this.elements.temperature.value;
    });

    this.elements.fetchModelsBtn.addEventListener('click', () => {
      this.fetchModelsFromAPI();
    });

    this.elements.testConnection.addEventListener('click', () => {
      this.testConnection();
    });

    this.elements.addKeyBtn.addEventListener('click', () => {
      this.startNewProfile();
    });

    this.elements.resetBtn.addEventListener('click', () => {
      this.resetSettings();
    });

    this.elements.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });
  }

  renderProfilesList() {
    const list = this.elements.apiKeysList;
    list.replaceChildren();

    if (this.isDraftProfile) {
      list.appendChild(this.createDraftProfileItem());
    }

    this.logic.apiConfigs.forEach((config, index) => {
      list.appendChild(this.createProfileItem(config, index));
    });

    if (list.children.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'profiles-empty';
      empty.textContent = this.logic.t(
        'aiSettingsNoProfiles',
        'No profiles yet. Click New Profile.'
      );
      list.appendChild(empty);
    }

    this.elements.profileCount.textContent = String(this.logic.apiConfigs.length);
    feather.replace();
  }

  createDraftProfileItem() {
    const item = document.createElement('div');
    item.className = 'api-key-item active';

    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = this.logic.t('aiSettingsNewProfile', 'New Profile');
    const subtitle = document.createElement('span');
    subtitle.textContent = this.logic.t('aiSettingsProfileHintNew', 'New unsaved profile');
    info.appendChild(title);
    info.appendChild(subtitle);

    item.appendChild(info);
    return item;
  }

  createProfileItem(config, index) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `api-key-item${index === this.currentConfigIndex ? ' active' : ''}`;

    const info = document.createElement('div');
    const providerLabel = config.provider || 'custom';
    const providerStrong = document.createElement('strong');
    providerStrong.textContent = providerLabel;

    const modelSpan = document.createElement('span');
    const modelLabel = config.model || this.logic.t('aiSettingsNoModel', 'no model');
    const keySuffix = this.maskApiKey(config.apiKey || '');
    modelSpan.textContent = `${modelLabel} ${keySuffix}`.trim();

    info.appendChild(providerStrong);
    info.appendChild(modelSpan);

    const actions = document.createElement('div');
    actions.className = 'api-key-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-icon btn-danger';
    deleteBtn.title = this.logic.t('aiSettingsDeleteProfile', 'Delete profile');
    deleteBtn.appendChild(this.createFeatherIcon('trash-2', 14));

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteConfig(index);
    });

    actions.appendChild(deleteBtn);
    item.appendChild(info);
    item.appendChild(actions);

    item.addEventListener('click', () => {
      this.loadConfig(index);
    });

    return item;
  }

  loadConfig(index) {
    const config = this.logic.apiConfigs[index];
    if (!config) return;

    this.currentConfigIndex = index;
    this.isDraftProfile = false;
    this.elements.provider.value = config.provider || '';
    this.elements.apiKey.value = config.apiKey || '';
    this.elements.endpoint.value = config.endpoint || '';
    this.elements.temperature.value = String(config.temperature ?? 0.4);
    this.elements.maxTokens.value = String(config.maxTokens ?? 1800);

    this.updateModelOptions(config.model || '');
    this.toggleEndpointField();
    this.elements.temperatureValue.textContent = this.elements.temperature.value;

    this.elements.activeProfileText.textContent = `${this.logic.t('aiSettingsEditingProfile', 'Editing profile')} #${index + 1}`;
    this.isDirty = false;
    this.renderProfilesList();
  }

  startNewProfile() {
    this.currentConfigIndex = -1;
    this.isDraftProfile = true;
    this.elements.form.reset();
    this.elements.provider.value = '';
    this.elements.endpoint.value = '';
    this.elements.temperature.value = '0.4';
    this.elements.maxTokens.value = '1800';
    this.elements.temperatureValue.textContent = '0.4';
    this.elements.activeProfileText.textContent = this.logic.t(
      'aiSettingsProfileHintNew',
      'New unsaved profile'
    );

    this.updateModelOptions();
    this.toggleEndpointField();
    this.isDirty = false;
    this.renderProfilesList();
    this.elements.provider.focus();
  }

  updateModelOptions(selectedModel = '') {
    const provider = this.elements.provider.value;
    const modelSelect = this.elements.model;
    modelSelect.replaceChildren();
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.logic.t('aiSettingsSelectModel', 'Select model...');
    modelSelect.appendChild(defaultOption);

    const staticModels = this.logic.providerModels[provider] || [];
    const fetchedModels = this.logic.availableModels
      .filter((m) => m.provider === provider)
      .map((m) => m.id);

    const merged = [...new Set([...staticModels, ...fetchedModels])];

    merged.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });

    if (provider === 'custom') {
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'custom';
      modelSelect.appendChild(customOption);
    }

    if (selectedModel) {
      modelSelect.value = selectedModel;
    }
  }

  toggleEndpointField() {
    this.elements.endpointGroup.style.display =
      this.elements.provider.value === 'custom' ? 'block' : 'none';
  }

  autoFillEndpoint() {
    const provider = this.elements.provider.value;
    if (provider && provider !== 'custom') {
      this.elements.endpoint.value = this.logic.providerEndpoints[provider] || '';
    }
  }

  gatherSettings() {
    const provider = this.elements.provider.value;
    const model = this.elements.model.value;
    let endpoint = this.elements.endpoint.value.trim();

    if (provider !== 'custom') {
      endpoint = this.logic.providerEndpoints[provider] || endpoint;
      if (provider === 'google' && model) {
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      }
    }

    return {
      provider,
      apiKey: this.elements.apiKey.value.trim(),
      endpoint,
      model,
      temperature: Number(this.elements.temperature.value || 0.4),
      maxTokens: Number(this.elements.maxTokens.value || 1800),
    };
  }

  validateConfig(config) {
    return !!(config.provider && config.apiKey && config.endpoint && config.model);
  }

  async saveSettings() {
    const config = this.gatherSettings();

    if (!this.validateConfig(config)) {
      this.showToast(
        this.logic.t(
          'aiSettingsToastRequiredFields',
          'Provider, key, endpoint, and model are required'
        ),
        'error'
      );
      return;
    }

    try {
      const apiConfigs = [...this.logic.apiConfigs];
      if (this.currentConfigIndex >= 0 && this.currentConfigIndex < apiConfigs.length) {
        apiConfigs[this.currentConfigIndex] = config;
      } else {
        apiConfigs.push(config);
        this.currentConfigIndex = apiConfigs.length - 1;
      }
      this.isDraftProfile = false;

      await this.logic.save(apiConfigs);

      this.isDirty = false;
      this.renderProfilesList();
      this.loadConfig(this.currentConfigIndex);
      this.showToast(this.logic.t('aiSettingsToastSaved', 'Profile saved'), 'success');
    } catch {
      this.showToast(this.logic.t('aiSettingsToastSaveFailed', 'Failed to save profile'), 'error');
    }
  }

  async deleteConfig(index) {
    if (!confirm(this.logic.t('aiSettingsConfirmDelete', 'Delete this profile?'))) return;

    await this.logic.delete(index);

    if (this.logic.apiConfigs.length === 0) {
      this.startNewProfile();
    } else {
      const nextIndex = Math.max(0, index - 1);
      this.loadConfig(nextIndex);
    }

    this.showToast(this.logic.t('aiSettingsToastDeleted', 'Profile deleted'), 'success');
  }

  async resetSettings() {
    if (!confirm(this.logic.t('aiSettingsConfirmReset', 'Reset all AI profiles and model cache?')))
      return;

    await this.logic.reset();
    this.startNewProfile();
    this.showToast(this.logic.t('aiSettingsToastReset', 'All settings reset'), 'success');
  }

  async testConnection() {
    const config = this.gatherSettings();

    if (!config.apiKey || !config.endpoint || !config.model) {
      this.showToast(
        this.logic.t('aiSettingsToastNeedConnectionFields', 'Add key, endpoint, and model first'),
        'error'
      );
      return;
    }

    this.setButtonState(
      this.elements.testConnection,
      true,
      this.logic.t('aiSettingsTesting', 'Testing...')
    );

    try {
      const response = await this.logic.testConnection(config);
      if (response.ok) {
        this.showToast(
          this.logic.t('aiSettingsToastConnectionSuccess', 'Connection successful'),
          'success'
        );
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData?.error?.message || errorData?.message || response.statusText;
        this.showToast(
          `${this.logic.t('aiSettingsToastConnectionFailed', 'Connection failed')}: ${errorMsg}`,
          'error'
        );
      }
    } catch (error) {
      this.showToast(
        `${this.logic.t('aiSettingsToastConnectionError', 'Connection error')}: ${error.message}`,
        'error'
      );
    } finally {
      this.setButtonState(
        this.elements.testConnection,
        false,
        this.logic.t('aiSettingsTest', 'Test')
      );
    }
  }

  async fetchModelsFromAPI() {
    const provider = this.elements.provider.value;
    const apiKey = this.elements.apiKey.value.trim();

    if (!provider || !apiKey) {
      this.showToast(
        this.logic.t('aiSettingsToastNeedProviderKey', 'Select provider and enter key first'),
        'error'
      );
      return;
    }

    if (provider === 'custom') {
      this.showToast(
        this.logic.t(
          'aiSettingsToastCustomSyncUnsupported',
          'Custom endpoint model sync is not supported'
        ),
        'error'
      );
      return;
    }

    this.setButtonState(
      this.elements.fetchModelsBtn,
      true,
      this.logic.t('aiSettingsSyncing', 'Syncing...')
    );

    try {
      const models = await this.logic.fetchModelsForProvider(provider, apiKey);
      if (!models.length) {
        this.showToast(this.logic.t('aiSettingsToastNoModels', 'No models found'), 'error');
        return;
      }

      this.logic.providerModels[provider] = models;
      this.updateModelOptions();
      this.showToast(
        `${this.logic.t('aiSettingsToastSyncedPrefix', 'Synced')} ${models.length} ${this.logic.t('aiSettingsToastSyncedSuffix', 'models')}`,
        'success'
      );
    } catch (error) {
      this.showToast(
        `${this.logic.t('aiSettingsToastSyncFailed', 'Model sync failed')}: ${error.message}`,
        'error'
      );
    } finally {
      this.setButtonState(
        this.elements.fetchModelsBtn,
        false,
        this.logic.t('aiSettingsSyncModels', 'Sync Models')
      );
    }
  }

  setButtonState(button, disabled, loadingText) {
    button.disabled = disabled;

    if (disabled) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      return;
    }

    if (button.id === 'testConnection') {
      button.replaceChildren(
        this.createFeatherIcon('activity', 16),
        document.createTextNode(this.logic.t('aiSettingsTest', 'Test'))
      );
    } else if (button.id === 'fetchModelsBtn') {
      button.replaceChildren(
        this.createFeatherIcon('refresh-cw', 14),
        document.createTextNode(this.logic.t('aiSettingsSyncModels', 'Sync Models'))
      );
    }

    feather.replace();
  }

  maskApiKey(key) {
    if (!key || key.length < 8) return '';
    return `••••${key.slice(-4)}`;
  }

  showToast(message, type = 'success') {
    this.elements.toastMessage.textContent = message;
    this.elements.toast.className = `toast ${type}`;
    this.elements.toast.classList.add('show');

    setTimeout(() => {
      this.elements.toast.classList.remove('show');
    }, 2400);
  }

  createFeatherIcon(name, size = 16) {
    const icon = document.createElement('i');
    icon.setAttribute('data-feather', name);
    icon.setAttribute('width', String(size));
    icon.setAttribute('height', String(size));
    return icon;
  }
}
