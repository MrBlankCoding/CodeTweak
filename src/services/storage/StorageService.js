import logger from '../../shared/utils/logger.js';
import { saveScriptSnapshot, clearScriptHistory } from '../scripts/ScriptHistory.js';

const SCRIPTS_KEY = 'scripts';
const SCRIPTS_LOCK = 'codetweak-scripts';
let localLockChain = Promise.resolve();

// serialize acess to scripts storage
export function withScriptsLock(fn) {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request === 'function') {
    return locks.request(SCRIPTS_LOCK, () => fn());
  }
  const run = localLockChain.then(
    () => fn(),
    () => fn()
  );
  localLockChain = run.catch(() => {});
  return run;
}

export async function mutateScripts(storageApi, mutator) {
  return withScriptsLock(async () => {
    const { [SCRIPTS_KEY]: stored } = await storageApi.local.get(SCRIPTS_KEY);
    const scripts = Array.isArray(stored) ? stored : [];
    const result = await mutator(scripts);
    if (result !== false) {
      await writeScripts(storageApi, scripts);
    }
    return result;
  });
}

// A failed write leaves the previous array intact; on quota errors a warning
// is stored for the dashboard and the failure is surfaced to the caller.
async function writeScripts(storageApi, scripts) {
  try {
    await storageApi.local.set({ [SCRIPTS_KEY]: scripts });
  } catch (error) {
    if (isQuotaError(error)) {
      await storageApi.local
        .set({
          storageWarning: {
            message:
              'Extension storage is full. Recent changes were NOT saved. Delete or export some scripts to free space.',
            at: Date.now(),
          },
        })
        .catch(() => {});
      throw new Error('Extension storage is full; changes were not saved.');
    }
    throw error;
  }
}

class StorageService {
  constructor() {
    this.storageKey = SCRIPTS_KEY;
  }

  async getAllScripts() {
    try {
      const { [this.storageKey]: scripts = [] } = await chrome.storage.local.get(this.storageKey);
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

  async mutateScripts(mutator, { notify = true } = {}) {
    const result = await mutateScripts(chrome.storage, mutator);
    if (notify && result !== false) this._notify();
    return result;
  }

  async saveScript(scriptData, scriptId = null, isEditMode = false) {
    let previous = null;
    try {
      const saved = await this.mutateScripts((scripts) => {
        const now = new Date().toISOString();

        if (isEditMode && scriptId) {
          const scriptIndex = scripts.findIndex((script) => script.id === scriptId);
          if (scriptIndex === -1) {
            throw new Error('Script not found for editing');
          }

          const existingScript = scripts[scriptIndex];
          previous = existingScript;
          // Merge so fields the editor doesn't manage (update URLs, upstream
          // hash, update info) survive a save.
          const updatedScript = {
            ...existingScript,
            ...scriptData,
            id: scriptId,
            createdAt: existingScript.createdAt || now,
            updatedAt: now,
          };

          scripts[scriptIndex] = updatedScript;
          return updatedScript;
        }

        const newScript = {
          ...scriptData,
          id: this.generateUniqueId(),
          createdAt: now,
          updatedAt: now,
        };

        scripts.push(newScript);
        return newScript;
      });
      if (previous && previous.code !== saved.code) {
        await saveScriptSnapshot(chrome.storage, previous, 'save');
      }
      return saved;
    } catch (error) {
      logger.error('Failed to save script:', error);
      throw error;
    }
  }

  async saveScripts(scripts) {
    try {
      await withScriptsLock(() => writeScripts(chrome.storage, scripts));
      this._notify();
      return true;
    } catch (error) {
      logger.error('Failed to save scripts:', error);
      return false;
    }
  }

  async toggleScript(scriptId, enabled) {
    try {
      const found = await this.mutateScripts(
        (scripts) => {
          const script = scripts.find((s) => s.id === scriptId);
          if (!script) return false;
          script.enabled = enabled;
          return true;
        },
        { notify: false }
      );
      if (found) await this._notifyAndWait();
      return found ? { success: true, enabled } : { success: false, error: 'Script not found' };
    } catch (error) {
      logger.error('Error toggling script:', error);
      throw error;
    }
  }

  async deleteScript(id) {
    try {
      await this.mutateScripts((scripts) => {
        const index = scripts.findIndex((script) => script.id === id);
        if (index === -1) return false;
        scripts.splice(index, 1);
        return true;
      });
      await clearScriptHistory(chrome.storage, id);
      return true;
    } catch (error) {
      logger.error('Failed to delete script:', error);
      return false;
    }
  }

  _notify() {
    this._notifyAndWait().catch((error) => {
      logger.warn('Failed to notify background about script changes:', error);
    });
  }

  async _notifyAndWait() {
    const response = await chrome.runtime.sendMessage({ action: 'scriptsUpdated' });
    if (response?.error) throw new Error(response.error);
    if (response?.success !== true) {
      throw new Error('Background did not confirm the script registration update.');
    }
    return response;
  }

  generateUniqueId() {
    // Match the UUID format used by the installer/importer so IDs stay
    // consistent for authorization and dedupe.
    return crypto.randomUUID();
  }

  getEditorUrl(scriptId) {
    const params = scriptId ? `?id=${scriptId}` : '';
    return chrome.runtime.getURL(`editor/editor.html${params}`);
  }
}

export const storageService = new StorageService();

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || /quota|exceeded/i.test(error?.message || '');
}
