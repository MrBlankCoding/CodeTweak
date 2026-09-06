import logger from '../../shared/utils/logger.js';
import { browser } from '../../shared/browserAdapter.js';

class StorageService {
  constructor() {
    this.storageKey = 'scripts';
  }

  async getAllScripts() {
    try {
      const { [this.storageKey]: scripts = [] } = await browser.storage.local.get(this.storageKey);
      return Array.isArray(scripts) ? scripts : [];
    } catch (error) {
      logger.error('Failed to get all scripts:', error);
      return [];
    }
  }

  async getScript(id) {
    try {
      const scripts = await this.getAllScripts();
      return scripts.find((script) => script.id === id) || null;
    } catch (error) {
      logger.error('Failed to get script:', error);
      return null;
    }
  }

  async saveScript(scriptData, scriptId = null, isEditMode = false) {
    try {
      const scripts = await this.getAllScripts();
      const now = new Date().toISOString();

      if (isEditMode && scriptId) {
        const scriptIndex = scripts.findIndex((script) => script.id === scriptId);
        if (scriptIndex === -1) {
          throw new Error('Script not found for editing');
        }

        const existingScript = scripts[scriptIndex];
        const updatedScript = {
          ...scriptData,
          id: scriptId,
          createdAt: existingScript.createdAt || now,
          updatedAt: now,
        };

        scripts[scriptIndex] = updatedScript;
        await this._setScripts(scripts);
        return updatedScript;
      } else {
        const newScript = {
          ...scriptData,
          id: this.generateUniqueId(),
          createdAt: now,
          updatedAt: now,
        };

        scripts.push(newScript);
        await this._setScripts(scripts);
        return newScript;
      }
    } catch (error) {
      logger.error('Failed to save script:', error);
      throw error;
    }
  }

  async saveScripts(scripts) {
    try {
      await this._setScripts(scripts);
      return true;
    } catch (error) {
      logger.error('Failed to save scripts:', error);
      return false;
    }
  }

  async toggleScript(scriptId, enabled) {
    try {
      const scripts = await this.getAllScripts();
      const scriptIndex = scripts.findIndex((s) => s.id === scriptId);

      if (scriptIndex !== -1) {
        scripts[scriptIndex].enabled = enabled;
        await this.saveScripts(scripts);
        return { success: true, enabled };
      }
      return { success: false, error: 'Script not found' };
    } catch (error) {
      logger.error('Error toggling script:', error);
      throw error;
    }
  }

  async deleteScript(id) {
    try {
      const scripts = await this.getAllScripts();
      const filteredScripts = scripts.filter((script) => script.id !== id);
      await this._setScripts(filteredScripts);
      return true;
    } catch (error) {
      logger.error('Failed to delete script:', error);
      return false;
    }
  }

  async _setScripts(scripts) {
    await browser.storage.local.set({ [this.storageKey]: scripts });
    // Notify about changes
    browser.runtime.sendMessage({ action: 'scriptsUpdated' }).catch(() => {});
  }

  generateUniqueId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
  }

  getEditorUrl(scriptId) {
    const params = scriptId ? `?id=${scriptId}` : '';
    return browser.runtime.getURL(`editor/editor.html${params}`);
  }
}

export const storageService = new StorageService();
