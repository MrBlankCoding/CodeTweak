import { BaseUIComponent } from '../base/BaseUIComponent.js';

export class FormManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    const formElements = [
      'scriptName',
      'scriptAuthor',
      'scriptVersion',
      'scriptDescription',
      'runAt',
      'waitForSelector',
      'scriptResources',
    ];

    formElements.forEach((elementKey) => {
      const element = this.elements[elementKey];
      if (element) {
        const eventType = element.type === 'checkbox' ? 'change' : 'input';
        this.addEventListener(element, eventType, () => {
          this.emit('formChanged');
        });
      }
    });
  }

  getFormData() {
    return {
      name: this.elements.scriptName?.value?.trim() || '',
      author: this.elements.scriptAuthor?.value?.trim() || '',
      version: this.elements.scriptVersion?.value?.trim() || '1.0',
      description: this.elements.scriptDescription?.value?.trim() || '',
      runAt: this.elements.runAt?.value || 'document-end',
      waitForSelector: this.elements.waitForSelector?.value?.trim() || '',
    };
  }

  setFormData(data) {
    if (this.elements.scriptName) this.elements.scriptName.value = data.name || '';
    if (this.elements.scriptAuthor) this.elements.scriptAuthor.value = data.author || '';
    if (this.elements.scriptVersion) this.elements.scriptVersion.value = data.version || '1.0';
    if (this.elements.scriptDescription)
      this.elements.scriptDescription.value = data.description || '';
    if (this.elements.runAt) this.elements.runAt.value = data.runAt || 'document-end';
    if (this.elements.waitForSelector)
      this.elements.waitForSelector.value = data.waitForSelector || '';
  }

  validate() {
    const errors = [];
    const data = this.getFormData();

    if (!data.name) {
      errors.push('Script name is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
