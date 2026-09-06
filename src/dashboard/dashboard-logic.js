import logger from '../shared/utils/logger.js';
import { buildMetadata, extractMetadataBlock } from '../services/scripts/MetadataParser.js';
import ScriptAnalyzer from '../services/scripts/ScriptAnalyzer.js';
import { updateWebsiteFilterOptions, updateScriptsList, showNotification } from './dashboard-ui.js';
import { applyTranslations } from '../shared/utils/i18n.js';
import { storageService as ScriptManager } from '../services/storage/StorageService.js';
import { browser } from '../shared/browserAdapter.js';

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

  const filteredScripts = (Array.isArray(state.allScripts) ? state.allScripts : []).filter(
    (script) => {
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
    }
  );

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
    const { settings = {} } = await browser.storage.local.get('settings');

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
      await browser.storage.local.set({ settings });
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

    await browser.storage.local.set({ settings });
    showNotification('Settings saved successfully', 'success');
    browser.runtime.sendMessage({ action: 'settingsUpdated' });

    applyTheme();

    await applyTranslations();
  } catch (error) {
    logger.error('Error saving settings:', error);
    showNotification('Failed to save settings: ' + error.message, 'error');
  }
}

async function checkForUpdates(script) {
  if (!script.updateInfo?.updateUrl) {
    showNotification('No update URL available', 'error');
    return;
  }
  if (!/^https:\/\//i.test(script.updateInfo.updateUrl)) {
    showNotification('Update URL must use https.', 'error');
    return;
  }

  try {
    const response = await fetch(script.updateInfo.updateUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const newCode = await response.text();
    const metadataBlock = newCode.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!metadataBlock) {
      throw new Error('Invalid script format');
    }

    const versionMatch = metadataBlock[1].match(/@version\s+(.+)/);
    const newVersion = versionMatch ? versionMatch[1].trim() : null;

    if (!newVersion) {
      throw new Error('Could not determine script version');
    }

    if (newVersion === script.version) {
      showNotification('Script is up to date', 'success');
      return;
    }

    const updateConfirmed = confirm(
      `Update available: ${script.version} → ${newVersion}\nWould you like to update now?`
    );

    if (updateConfirmed) {
      const { scripts = [] } = await browser.storage.local.get('scripts');
      const scriptIndex = scripts.findIndex((s) => s.id === script.id);

      if (scriptIndex !== -1) {
        const newMetadata = parseUserScriptMetadata(newCode);
        const detected = ScriptAnalyzer.detectGMApiUsage(newCode);

        scripts[scriptIndex] = {
          ...scripts[scriptIndex],
          name: newMetadata.name || scripts[scriptIndex].name,
          version: newVersion,
          code: newCode,
          updatedAt: Date.now(),
          targetUrls: newMetadata.matches || scripts[scriptIndex].targetUrls,
          ...(newMetadata.requires && { requires: newMetadata.requires }),
          ...(newMetadata.resources && { resources: newMetadata.resources }),
          ...detected,
          updateInfo: {
            ...scripts[scriptIndex].updateInfo,
            lastChecked: Date.now(),
            version: newVersion,
          },
        };

        await browser.storage.local.set({ scripts });
        browser.runtime.sendMessage({ action: 'scriptsUpdated' });
        showNotification('Script updated successfully', 'success');
        await refreshDashboard();
      }
    }
  } catch (error) {
    logger.error('Error checking for updates:', error);
    showNotification('Error checking for updates: ' + error.message, 'error');
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

  const { scripts = [] } = await browser.storage.local.get('scripts');
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
window.checkForUpdates = checkForUpdates;
window.refreshDashboard = refreshDashboard;

export {
  loadScripts,
  filterScripts,
  toggleScript,
  editScript,
  deleteScript,
  loadSettings,
  saveSettings,
  checkForUpdates,
  refreshDashboard,
  exportScript,
};
