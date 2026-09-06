import { BaseUIComponent } from '../base/BaseUIComponent.js';

export class ModalManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.elements.settingsBtn) {
      this.addEventListener(this.elements.settingsBtn, 'click', () => {
        this.showModal('settings');
      });

      this.addEventListener(this.elements.closeSettings, 'click', () => {
        this.hideModal('settings');
      });
    }

    if (this.elements.helpButton) {
      this.addEventListener(this.elements.helpButton, 'click', (e) => {
        e.stopPropagation();
        this.hideModal('settings');
        setTimeout(() => this.showModal('help'), 200);
      });

      const closeHelpButton = document.querySelector('.close-help-modal');
      if (closeHelpButton) {
        this.addEventListener(closeHelpButton, 'click', (e) => {
          e.stopPropagation();
          this.hideModal('help');
        });
      }
    }

    this.addEventListener(document, 'click', (e) => {
      if (e.target.classList.contains('modal') && e.target.classList.contains('show')) {
        const modalType = e.target.id.replace('Modal', '');
        this.hideModal(modalType);
      }
    });

    this.addEventListener(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
          const modalType = openModal.id.replace('Modal', '');
          this.hideModal(modalType);
        }
      }
    });
  }

  showModal(modalType) {
    const modal = document.getElementById(`${modalType}Modal`);
    if (modal) {
      document.body.style.overflow = 'hidden';
      modal.classList.add('show');
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
      const focusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus();

      this.emit('modalOpened', { type: modalType });
    }
  }

  hideModal(modalType) {
    const modal = document.getElementById(`${modalType}Modal`);
    if (modal && modal.classList.contains('show')) {
      const openModals = document.querySelectorAll('.modal.show');
      if (openModals.length <= 1) {
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
      }

      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 200);

      this.emit('modalClosed', { type: modalType });
    }
  }
}
