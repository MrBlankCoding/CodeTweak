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

    if (hasUnsavedChanges) {
      badge.textContent = 'Unsaved Changes';
      badge.style.backgroundColor = '#4B5563';
      badge.style.color = '#D1D5DB';
    } else {
      badge.textContent = 'Saved';
      badge.style.backgroundColor = '#065F46';
      badge.style.color = '#A7F3D0';
    }
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
