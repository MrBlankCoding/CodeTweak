import { BaseUIComponent } from '../base/BaseUIComponent.js';

export class SidebarManager extends BaseUIComponent {
  constructor(elements, eventBus, config) {
    super(elements, eventBus);
    this.config = config;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.addEventListener(window, 'resize', () => {
      this.handleResize();
    });
  }

  handleResize() {
    setTimeout(() => {
      this.emit('layoutChanged');
    }, 100);
  }
}
