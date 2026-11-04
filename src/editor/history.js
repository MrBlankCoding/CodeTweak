import logger from '../shared/utils/logger.js';
import { clearScriptHistory, listScriptSnapshots } from '../services/scripts/ScriptHistory.js';
import { createIcon } from '../shared/utils/icons.js';

// The per-script history key used by ScriptHistory.js (`script-history-<id>`)
// is not exported there, so it is mirrored here for per-snapshot deletion.
const HISTORY_KEY_PREFIX = 'script-history-';

const REASON_LABELS = {
  save: 'Saved script',
  'auto-update': 'Auto-update',
  'manual-edit': 'Manual edit',
};

export class HistoryUI {
  constructor(elements, state, ui, editor) {
    this.elements = elements;
    this.state = state;
    this.ui = ui;
    this.editor = editor;
  }

  setup() {
    if (this.elements.clearHistoryBtn) {
      this.elements.clearHistoryBtn.addEventListener('click', () => {
        this.clearHistory();
      });
    }

    // Refresh whenever the History panel is opened so the list is current.
    document
      .querySelector('.sidebar-icon-btn[data-section="history"]')
      ?.addEventListener('click', () => {
        if (this.state.scriptId) {
          this.loadHistory();
        }
      });

    if (this.state.scriptId) {
      this.loadHistory();
    }
  }

  async loadHistory() {
    if (!this.state.scriptId) return;

    try {
      const snapshots = await listScriptSnapshots(chrome.storage, this.state.scriptId);
      this.displayHistory(snapshots);
    } catch (error) {
      logger.error('[CodeTweak History] Failed to load script history:', error);
    }
  }

  displayHistory(snapshots) {
    const container = this.elements.historyContainer;

    if (!container) {
      logger.error('[CodeTweak History] History container not found!');
      return;
    }

    container.replaceChildren();

    if (!snapshots || snapshots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'error-log-empty';
      const icon = createIcon('check-circle');
      const title = document.createElement('p');
      title.textContent = 'No snapshots yet';
      const subtitle = document.createElement('small');
      subtitle.textContent = 'Snapshots appear here before each save of an existing script';
      empty.appendChild(icon);
      empty.appendChild(title);
      empty.appendChild(subtitle);
      container.appendChild(empty);
      return;
    }

    snapshots.forEach((snapshot) => {
      const item = document.createElement('div');
      item.className = 'error-log-item info';

      const timestamp = snapshot.savedAt
        ? new Date(snapshot.savedAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      const header = document.createElement('div');
      header.className = 'error-log-header';
      const type = document.createElement('span');
      type.className = 'error-log-type';
      type.textContent = REASON_LABELS[snapshot.reason] || snapshot.reason || 'Snapshot';
      const time = document.createElement('span');
      time.className = 'error-log-timestamp';
      time.textContent = timestamp;
      header.appendChild(type);
      header.appendChild(time);

      const message = document.createElement('div');
      message.className = 'error-log-message';
      const name = snapshot.metadata?.name ? `${snapshot.metadata.name} ` : '';
      message.textContent = `${name}v${snapshot.version || '?'} · ${this.formatSize(
        snapshot.code?.length || 0
      )}`;

      const actions = document.createElement('div');
      actions.className = 'error-log-controls';

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'btn-secondary';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => this.restore(snapshot));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => this.deleteSnapshot(snapshot));

      actions.appendChild(restoreBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(header);
      item.appendChild(message);
      item.appendChild(actions);

      container.appendChild(item);
    });
  }

  formatSize(bytes) {
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  }

  restore(snapshot) {
    const editor = this.editor;
    if (!editor || !snapshot) return;

    // Rebuild a script-shaped record: the metadata subset plus the granular
    // grant flags, which are keyed the same way populateFormWithScript expects
    // (api.el element ids).
    const script = {
      ...(snapshot.metadata || {}),
      ...(snapshot.grants || {}),
      id: this.state.scriptId,
      code: snapshot.code || '',
    };

    editor.populateFormWithScript(script);
    editor.codeEditorManager.updateEditorLintAndAutocomplete();

    // Restoring counts as an unsaved edit: the save flow snapshots again
    // before the next overwrite, but nothing persists until the user saves.
    editor.markAsDirty();
    this.ui.showStatusMessage('Snapshot restored — save to keep it as the new version', 'success');
  }

  async deleteSnapshot(snapshot) {
    if (!this.state.scriptId) return;

    try {
      const key = `${HISTORY_KEY_PREFIX}${this.state.scriptId}`;
      const { [key]: stored = [] } = await chrome.storage.local.get(key);
      const snapshots = Array.isArray(stored)
        ? stored.filter(
            (snap) =>
              snap.savedAt !== snapshot.savedAt ||
              snap.reason !== snapshot.reason ||
              snap.version !== snapshot.version
          )
        : [];
      await chrome.storage.local.set({ [key]: snapshots });

      this.displayHistory(snapshots);
      this.ui.showStatusMessage('Snapshot deleted', 'success');
    } catch (error) {
      logger.error('[CodeTweak History] Failed to delete snapshot:', error);
      this.ui.showStatusMessage('Failed to delete snapshot', 'error');
    }
  }

  async clearHistory() {
    if (!this.state.scriptId) return;

    try {
      await clearScriptHistory(chrome.storage, this.state.scriptId);
      this.displayHistory([]);
      this.ui.showStatusMessage('History cleared', 'success');
    } catch (error) {
      logger.error('[CodeTweak History] Failed to clear script history:', error);
      this.ui.showStatusMessage('Failed to clear history', 'error');
    }
  }
}
