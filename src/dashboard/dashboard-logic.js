import logger from '../shared/utils/logger.js';
import { buildMetadata, extractMetadataBlock } from '../services/scripts/MetadataParser.js';
import { updateWebsiteFilterOptions, updateScriptsList, showNotification } from './dashboard-ui.js';
import { applyTranslations, getMessageSync } from '../shared/utils/i18n.js';
import { storageService as ScriptManager } from '../services/storage/StorageService.js';

async function loadScripts(elements, state) {
  try {
    const scripts = await ScriptManager.getAllScripts();
    state.allScripts = scripts;

    updateWebsiteFilterOptions(state.allScripts, elements.filters.websiteFilter);
    filterScripts(elements, state);
  } catch (error) {
    logger.error('Error loading scripts:', error);
    showNotification('Error loading scripts', 'error');
  }
}

function filterScripts(elements, state) {
  if (!elements.scriptsList) return;

  const searchTerm = (elements.filters.scriptSearch?.value || '').toLowerCase();
  const websiteValue = elements.filters.websiteFilter?.value || '';
  const statusValue = elements.filters.statusFilter?.value || '';
  const runAtFilterValue = elements.filters.runAtFilter?.value || '';

  const filteredScripts = (Array.isArray(state.allScripts) ? state.allScripts : [])
    .filter((script) => {
      if (!script || typeof script !== 'object') return false;
      if (
        searchTerm &&
        !String(script.name ?? '')
          .toLowerCase()
          .includes(searchTerm)
      ) {
        return false;
      }
      if (websiteValue) {
        const matchesWebsite = (script.targetUrls || []).some((url) => {
          try {
            return new URL(url).hostname === websiteValue;
          } catch {
            return url === websiteValue;
          }
        });
        if (!matchesWebsite) return false;
      }
      if (statusValue) {
        const isEnabled = statusValue === 'enabled';
        if (script.enabled !== isEnabled) return false;
      }
      if (runAtFilterValue && script.runAt !== runAtFilterValue) return false;

      return true;
    })
    .sort((a, b) => Number(Boolean(b.enabled)) - Number(Boolean(a.enabled)));

  updateScriptsList(filteredScripts, elements);
}

async function toggleScript(scriptId, enabled) {
  try {
    const result = await ScriptManager.toggleScript(scriptId, enabled);
    if (result.success) {
      showNotification(`Script ${enabled ? 'enabled' : 'disabled'}`, 'success');
      await refreshDashboard();
    }
  } catch (error) {
    logger.error('Error toggling script:', error);
    showNotification('Error toggling script', 'error');
  }
}

function editScript(scriptId) {
  window.location.href = ScriptManager.getEditorUrl(scriptId);
}

async function deleteScript(scriptId) {
  if (!confirm('Are you sure you want to delete this script?')) {
    return;
  }

  try {
    await ScriptManager.deleteScript(scriptId);
    showNotification('Script deleted', 'success');
    await refreshDashboard();
  } catch (error) {
    logger.error('Error deleting script:', error);
    showNotification('Error deleting script', 'error');
  }
}

async function loadSettings(settingsElements) {
  try {
    applyTheme();
    const { settings = {} } = await chrome.storage.local.get('settings');

    // default values
    const defaultSettings = {
      enableAllScripts: true,
      showNotifications: true,
      enhancedDebugging: false,
      allowExternalResources: true,
      confirmFirstRun: false,
      accentColor: '#61afef',
      language: 'auto',
    };

    let shouldSaveDefaults = false;
    Object.entries(defaultSettings).forEach(([key, defaultValue]) => {
      const elementKey = key === 'language' ? 'languageSelector' : key;
      const element = settingsElements[elementKey];
      if (element) {
        if (settings[key] === undefined) {
          settings[key] = defaultValue;
          shouldSaveDefaults = true;
        }
        if (element.type === 'color') {
          element.value = settings[key];
        } else if (element.tagName === 'SELECT') {
          element.value = settings[key] || defaultValue;
        } else {
          element.checked = settings[key];
        }
      }
    });

    if (shouldSaveDefaults) {
      await chrome.storage.local.set({ settings });
    }
  } catch (error) {
    logger.error('Error loading settings:', error);
    showNotification('Error loading settings', 'error');
  }
}

async function saveSettings(settingsElements) {
  try {
    const settings = {};

    // get values from elements
    Object.keys(settingsElements).forEach((key) => {
      const element = settingsElements[key];
      if (element) {
        if (element.type === 'color') {
          settings[key] = element.value;
        } else if (element.tagName === 'SELECT') {
          settings[key === 'languageSelector' ? 'language' : key] = element.value;
        } else {
          settings[key] = element.checked;
        }
      }
    });

    await chrome.storage.local.set({ settings });
    chrome.runtime.sendMessage({ action: 'settingsUpdated' });

    applyTheme();

    await applyTranslations();
    showNotification(getMessageSync('settingsSaved'), 'success');
  } catch (error) {
    logger.error('Error saving settings:', error);
    showNotification('Failed to save settings: ' + error.message, 'error');
  }
}

// refresh dash
async function refreshDashboard() {
  const elements = {
    scriptsList: document.getElementById('scriptsList'),
    emptyState: document.getElementById('emptyState'),
    filters: {
      websiteFilter: document.getElementById('websiteFilter'),
      scriptSearch: document.getElementById('scriptSearch'),
      statusFilter: document.getElementById('statusFilter'),
      runAtFilter: document.getElementById('runAtFilter'),
    },
  };

  const { scripts = [] } = await chrome.storage.local.get('scripts');
  const state = { allScripts: scripts };

  updateWebsiteFilterOptions(scripts, elements.filters.websiteFilter);
  filterScripts(elements, state);
}

function exportScript(script) {
  try {
    const code = script.code || '';
    const hasMetadata = !!extractMetadataBlock(code);
    const metadata = hasMetadata ? '' : buildMetadata(script);
    const content = hasMetadata ? code : `${metadata}\n\n${code}`;

    const fileNameSafe =
      (script.name || 'script')
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '') || 'script';

    const blob = new Blob([content], {
      type: 'text/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileNameSafe}.user.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Script exported', 'success');
  } catch (error) {
    logger.error('Export failed:', error);
    showNotification('Export failed', 'error');
  }
}

window.editScript = editScript;
window.exportScript = exportScript;
window.toggleScript = toggleScript;
window.deleteScript = deleteScript;
window.refreshDashboard = refreshDashboard;

export {
  loadScripts,
  filterScripts,
  toggleScript,
  editScript,
  deleteScript,
  loadSettings,
  saveSettings,
  refreshDashboard,
  exportScript,
};
