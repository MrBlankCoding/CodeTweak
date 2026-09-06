export class FormValidator {
  constructor(elements) {
    this.elements = elements;
  }

  validateForm() {
    const validations = [
      this.validateTargetUrls(),
      this.validateRunAt(),
      this.validateIconUrl(),
      this.validateRequireUrls(),
      this.validateResources(),
    ];

    return validations.every((validation) => validation.isValid);
  }

  validateTargetUrls() {
    const urlList = Array.from(document.querySelectorAll('.url-item')).map(
      (item) => item.dataset.url
    );
    const currentUrl = this.elements.targetUrl.value.trim();

    if (urlList.length === 0 && !currentUrl) {
      this.showValidationError('Please add at least one target URL.');
      return { isValid: false };
    }

    if (currentUrl) {
      try {
        new URL(currentUrl);
      } catch {
        this.showValidationError('The target URL must be a valid http(s) URL.');
        return { isValid: false };
      }
    }
    return { isValid: true };
  }

  validateRunAt() {
    const allowed = new Set(['document_start', 'document_end', 'document_idle']);
    const runAt = this.elements.runAt?.value;
    if (runAt && !allowed.has(runAt)) {
      this.showValidationError("Invalid 'Run at' value selected.");
      return { isValid: false };
    }
    return { isValid: true };
  }

  validateIconUrl() {
    const icon = this.elements.scriptIcon?.value?.trim();
    if (!icon) return { isValid: true };

    if (icon.startsWith('data:image/')) {
      if (!/^data:image\/[a-z+]+;base64,/.test(icon)) {
        this.showValidationError(
          'Invalid data URL format for icon. Must be a valid base64-encoded image.'
        );
        return { isValid: false };
      }
      return { isValid: true };
    }

    try {
      const u = new URL(icon);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        this.showValidationError(
          'Icon URL must be a valid http:// or https:// URL, or a data:image/ URL'
        );
        return { isValid: false };
      }
      return { isValid: true };
    } catch {
      this.showValidationError(
        'Invalid icon URL. Must be a valid http://, https://, or data:image/ URL'
      );
      return { isValid: false };
    }
  }

  validateRequireUrls() {
    const items = Array.from(document.querySelectorAll('.require-item'));
    for (const item of items) {
      const url = item.dataset.url?.trim();
      if (!url) {
        this.showValidationError('A required script entry is missing its URL.');
        return { isValid: false };
      }

      if (!/^https:\/\//i.test(url)) {
        this.showValidationError(
          'Required script URLs must use https:// (runtime blocks the rest).'
        );
        return { isValid: false };
      }
    }
    return { isValid: true };
  }

  validateResources() {
    const items = Array.from(document.querySelectorAll('.resource-item'));
    for (const item of items) {
      const name = item.dataset.name?.trim();
      const url = item.dataset.url?.trim();
      if (!name) {
        this.showValidationError('A resource is missing its name.');
        return { isValid: false };
      }
      if (!url) {
        this.showValidationError('A resource is missing its URL.');
        return { isValid: false };
      }

      if (!/^https?:\/\//i.test(url)) {
        this.showValidationError('Resource URLs must use http(s)://.');
        return { isValid: false };
      }
    }
    return { isValid: true };
  }

  showValidationError(message) {
    const statusMessage = this.elements.statusMessage;
    statusMessage.textContent = message;
    statusMessage.className = 'status-message error';
    statusMessage.style.display = 'block';
  }
}
