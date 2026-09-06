import logger from '../shared/utils/logger.js';
import feather from 'feather-icons';

export class ErrorLogUI {
  constructor(elements, state, ui) {
    this.elements = elements;
    this.state = state;
    this.ui = ui;
  }

  setup() {
    const browser = globalThis.browser ?? globalThis.chrome;
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'SCRIPT_ERROR_UPDATE' && message.scriptId === this.state.scriptId) {
        this.loadErrors();
      }
    });

    if (this.elements.clearErrorsBtn) {
      this.elements.clearErrorsBtn.addEventListener('click', () => {
        this.clearErrors();
      });
    }

    if (this.state.scriptId) {
      this.loadErrors();
    }
  }

  async loadErrors() {
    const browser = globalThis.browser ?? globalThis.chrome;
    if (!this.state.scriptId) return;

    try {
      const response = await new Promise((resolve) => {
        browser.runtime.sendMessage(
          { type: 'GET_SCRIPT_ERRORS', scriptId: this.state.scriptId },
          resolve
        );
      });

      const errors = response?.errors || [];
      this.displayErrors(errors);
    } catch (error) {
      logger.error('[CodeTweak Error Log] Failed to load script errors:', error);
    }
  }

  displayErrors(errors) {
    const container = this.elements.errorLogContainer;
    const badge = this.elements.errorCountBadge;

    if (!container) {
      logger.error('[CodeTweak Error Log] Error log container not found!');
      return;
    }

    if (badge) {
      if (errors.length > 0) {
        badge.textContent = errors.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    container.replaceChildren();

    if (errors.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'error-log-empty';
      const icon = document.createElement('i');
      icon.setAttribute('data-feather', 'check-circle');
      const title = document.createElement('p');
      title.textContent = 'No errors detected';
      const subtitle = document.createElement('small');
      subtitle.textContent = 'Errors will appear here when your script runs';
      empty.appendChild(icon);
      empty.appendChild(title);
      empty.appendChild(subtitle);
      container.appendChild(empty);
      feather.replace();
      return;
    }

    errors.forEach((error, index) => {
      const errorItem = document.createElement('div');
      errorItem.className = `error-log-item ${error.type || 'error'}`;
      if (error.resolved) {
        errorItem.classList.add('resolved');
      }

      const timestamp = new Date(error.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(error.resolved);
      checkbox.dataset.errorIndex = String(index);
      checkbox.title = 'Mark as resolved';

      const header = document.createElement('div');
      header.className = 'error-log-header';
      const type = document.createElement('span');
      type.className = 'error-log-type';
      type.textContent = error.type || 'error';
      const time = document.createElement('span');
      time.className = 'error-log-timestamp';
      time.textContent = timestamp;
      header.appendChild(type);
      header.appendChild(time);

      const message = document.createElement('div');
      message.className = 'error-log-message';
      message.textContent = error.message || '';

      errorItem.appendChild(checkbox);
      errorItem.appendChild(header);
      errorItem.appendChild(message);

      if (error.stack) {
        const stackEl = document.createElement('div');
        stackEl.className = 'error-log-stack';
        stackEl.textContent = error.stack;
        errorItem.appendChild(stackEl);
      }

      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          e.target.disabled = true;
          this.toggleErrorResolved(index);
        } else {
          e.target.checked = true;
        }
      });

      container.appendChild(errorItem);
    });

    feather.replace();
  }

  async clearErrors() {
    const browser = globalThis.browser ?? globalThis.chrome;
    if (!this.state.scriptId) return;

    try {
      await new Promise((resolve) => {
        browser.runtime.sendMessage(
          { type: 'CLEAR_SCRIPT_ERRORS', scriptId: this.state.scriptId },
          resolve
        );
      });

      this.displayErrors([]);
      this.ui.showStatusMessage('Errors cleared', 'success');
    } catch (error) {
      logger.error('[CodeTweak Error Log] Failed to clear script errors:', error);
      this.ui.showStatusMessage('Failed to clear errors', 'error');
    }
  }

  async toggleErrorResolved(errorIndex) {
    const browser = globalThis.browser ?? globalThis.chrome;
    if (!this.state.scriptId) return;

    try {
      const response = await new Promise((resolve) => {
        browser.runtime.sendMessage(
          { type: 'GET_SCRIPT_ERRORS', scriptId: this.state.scriptId },
          resolve
        );
      });

      const errors = response?.errors || [];
      if (errors[errorIndex]) {
        errors[errorIndex].resolved = true;
        const storageKey = `scriptErrors_${this.state.scriptId}`;
        await browser.storage.local.set({ [storageKey]: errors });

        this.displayErrors(errors);
        setTimeout(async () => {
          errors.splice(errorIndex, 1);
          await browser.storage.local.set({ [storageKey]: errors });
          this.displayErrors(errors);
        }, 300);
      }
    } catch (error) {
      logger.error('[CodeTweak Error Log] Failed to dismiss error:', error);
    }
  }
}
