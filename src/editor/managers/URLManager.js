import { BaseUIComponent } from '../base/BaseUIComponent.js';
import feather from 'feather-icons';
import { generateUrlMatchPattern } from '../../shared/utils/urls.js';

export class URLManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.statusManager = elements.statusManager || elements.status;
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.elements.addUrlBtn) {
      this.addEventListener(this.elements.addUrlBtn, 'click', (e) => {
        e.preventDefault();
        this.addCurrentUrl();
      });
    }

    if (this.elements.urlList) {
      this.addEventListener(this.elements.urlList, 'click', (e) => {
        if (e.target.closest('.remove-btn')) {
          e.preventDefault();
          this.removeUrl(e.target.closest('.url-item'));
        }
      });
    }

    if (this.elements.targetUrl) {
      this.addEventListener(this.elements.targetUrl, 'keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addCurrentUrl();
        }
      });
    }

    if (this.elements.generatePatternBtn) {
      this.elements.generatePatternBtn.addEventListener('click', () => {
        const base = this.elements.patternBaseUrl.value.trim();
        const scope = this.elements.patternScope.value;
        const pattern = generateUrlMatchPattern(base, scope);
        if (pattern) {
          this.elements.generatedPattern.value = pattern + (scope === 'exact' ? '' : '');
          this.elements.generatedPatternGroup.classList.remove('hidden');
        }
      });
    }

    if (this.elements.insertPatternBtn) {
      this.elements.insertPatternBtn.addEventListener('click', () => {
        const pattern = this.elements.generatedPattern.value.trim();
        if (pattern) {
          this.addUrlToList(pattern);
          this.elements.generatedPatternGroup.classList.add('hidden');
          this.elements.patternBaseUrl.value = '';
        }
      });
    }
  }

  addCurrentUrl() {
    const url = this.elements.targetUrl?.value?.trim();

    if (!url) {
      if (this.statusManager) {
        this.statusManager.showError('URL cannot be empty.');
      }
      return;
    }

    if (this.isValidUrl(url)) {
      this.addUrlToList(url);
      this.elements.targetUrl.value = '';
      this.emit('urlAdded', { url });
    } else {
      if (this.statusManager) {
        this.statusManager.showError('Invalid URL pattern.');
      }
    }
  }

  addUrlToList(url) {
    if (this.elements.urlList) {
      const existing = Array.from(this.elements.urlList.querySelectorAll('.url-item')).some(
        (item) => item.dataset.url === url
      );
      if (existing) {
        return false;
      }
    }

    try {
      const urlItem = document.createElement('div');
      urlItem.className = 'url-item';
      urlItem.dataset.url = url;
      const span = document.createElement('span');
      span.textContent = url;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'remove-btn';
      button.title = 'Remove URL';
      const icon = document.createElement('i');
      icon.setAttribute('data-feather', 'x');
      button.appendChild(icon);
      urlItem.appendChild(span);
      urlItem.appendChild(button);

      if (this.elements.urlList) {
        this.elements.urlList.appendChild(urlItem);
        this.emit('sidebarChanged');
        feather.replace();
        return true;
      }
    } catch {
      // Silently fail - feather icons might not be ready yet
    }
    return false;
  }

  removeUrl(urlItem) {
    if (!urlItem) return;

    const url = urlItem.dataset?.url;
    if (urlItem.remove) {
      urlItem.remove();
    } else if (urlItem.parentNode) {
      urlItem.parentNode.removeChild(urlItem);
    }

    if (url) {
      this.emit('urlRemoved', { url });
      this.emit('sidebarChanged');
    }
  }

  getUrls() {
    return Array.from(this.elements.urlList.querySelectorAll('.url-item')).map(
      (item) => item.dataset.url
    );
  }

  isValidUrl(url) {
    const errorMessage =
      'Please enter a valid URL in this format: https://example.com (include http:// or https://';
    try {
      if (!url.match(/^https?:\/\//i)) {
        if (this.statusManager) {
          this.statusManager.showError(errorMessage);
        }
        return false;
      }

      new URL(url);
      return true;
    } catch {
      if (this.statusManager) {
        this.statusManager.showError(errorMessage);
      }
      return false;
    }
  }
}
