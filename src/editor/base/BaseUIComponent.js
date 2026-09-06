import { escapeHtml } from '../../shared/utils/dom.js';

export class BaseUIComponent {
  constructor(elements, eventBus) {
    this.elements = elements;
    this.eventBus = eventBus;
    this.eventListeners = [];
  }

  addEventListener(element, event, handler, options = {}) {
    if (element) {
      element.addEventListener(event, handler, options);
      this.eventListeners.push({ element, event, handler });
    }
  }

  destroy() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }

  emit(eventName, data = {}) {
    this.eventBus.emit(eventName, data);
  }

  on(eventName, handler) {
    this.eventBus.on(eventName, handler);
  }

  escapeHtml(text) {
    return escapeHtml(text);
  }
}
