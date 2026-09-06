import { BaseUIComponent } from '../base/BaseUIComponent.js';

export class RequireManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.elements.addRequireBtn) {
      this.addEventListener(this.elements.addRequireBtn, 'click', () => {
        this.addCurrentRequire();
      });
    }

    if (this.elements.requireList) {
      this.addEventListener(this.elements.requireList, 'click', (e) => {
        if (e.target.classList.contains('remove-require-btn')) {
          this.removeRequire(e.target.closest('.require-item'));
        }
      });
    }
  }

  addCurrentRequire() {
    const url = this.elements.requireURL.value.trim();
    if (url) {
      this.addRequireToList(url);
      this.elements.requireURL.value = '';
      this.emit('requireAdded', { url });
    }
  }

  addRequireToList(url) {
    if (!url) return;
    const item = document.createElement('li');
    item.className = 'require-item';
    item.dataset.url = url;
    const span = document.createElement('span');
    span.textContent = url;
    const button = document.createElement('button');
    button.className = 'remove-require-btn';
    button.title = 'Remove Required Script';
    button.textContent = '×';
    item.appendChild(span);
    item.appendChild(button);
    this.elements.requireList.appendChild(item);
    this.emit('requireAdded', { url });
    this.emit('sidebarChanged');
  }

  removeRequire(item) {
    const url = item.dataset.url;
    item.remove();
    this.emit('requireRemoved', { url });
    this.emit('sidebarChanged');
  }

  getRequires() {
    return Array.from(this.elements.requireList.querySelectorAll('.require-item')).map(
      (i) => i.dataset.url
    );
  }
}
