// Base class for UI components with event handling
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
}

// Event bus for component communication
export class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(eventName, handler) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName).push(handler);
  }

  off(eventName, handler) {
    if (this.events.has(eventName)) {
      const handlers = this.events.get(eventName);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(eventName, data = {}) {
    if (this.events.has(eventName)) {
      this.events.get(eventName).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }
}