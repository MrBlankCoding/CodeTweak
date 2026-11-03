import { getMessageSync } from '../../shared/utils/i18n.js';

import { BaseUIComponent } from '../base/BaseUIComponent.js';

export class StatusManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.on('scriptStatusChanged', ({ hasUnsavedChanges }) => {
      this.updateScriptStatus(hasUnsavedChanges);
    });
  }

  updateScriptStatus(hasUnsavedChanges) {
    const badge = this.elements.scriptStatusBadge;
    if (!badge) return;

    badge.classList.toggle('is-unsaved', hasUnsavedChanges);
    badge.classList.toggle('is-saved', !hasUnsavedChanges);
    const text = badge.querySelector('.status-text');
    if (text)
      text.textContent = getMessageSync(hasUnsavedChanges ? 'editorUnsaved' : 'editorSaved');
  }

  showMessage(message, type = 'success', duration = 3000) {
    const { statusMessage } = this.elements;
    if (!statusMessage) return;

    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => this.clearMessage(), duration);
    }
  }

  clearMessage() {
    const { statusMessage } = this.elements;
    if (!statusMessage) return;

    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
    statusMessage.style.display = 'none';
  }

  showError(message) {
    this.showMessage(message, 'error', 5000);
  }

  showSuccess(message) {
    this.showMessage(message, 'success', 3000);
  }
}
