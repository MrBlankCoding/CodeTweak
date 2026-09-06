import { BaseUIComponent } from '../base/BaseUIComponent.js';

export class ResourceManager extends BaseUIComponent {
  constructor(elements, eventBus) {
    super(elements, eventBus);
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.addEventListener(this.elements.addResourceBtn, 'click', () => {
      this.addCurrentResource();
    });

    this.addEventListener(this.elements.resourceList, 'click', (e) => {
      const btn = e.target.closest('.remove-resource-btn, .remove-resource');
      if (btn) {
        this.removeResource(btn.closest('.resource-item'));
      }
    });

    this.on('gmApiChanged', ({ api }) => {
      if (api === 'GM_getResourceText' || api === 'GM_getResourceURL') {
        this.toggleResourceSection();
      }
    });
  }

  addCurrentResource() {
    const name = this.elements.resourceName.value.trim();
    const url = this.elements.resourceURL.value.trim();

    if (name && url) {
      this.addResourceToList(name, url);
      this.elements.resourceName.value = '';
      this.elements.resourceURL.value = '';
      this.emit('resourceAdded', { name, url });
    }
  }

  addResourceToList(name, url) {
    if (!name || !url) return;

    const resourceItem = document.createElement('li');
    resourceItem.className = 'resource-item';
    resourceItem.dataset.name = name;
    resourceItem.dataset.url = url;

    const displayUrl =
      url.length > 60 ? `${url.substring(0, 30)}...${url.substring(url.length - 20)}` : url;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'resource-item-content';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'resource-name';
    nameDiv.title = name;
    nameDiv.textContent = name;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'resource-url';
    link.title = url;
    link.textContent = displayUrl;
    contentDiv.appendChild(nameDiv);
    contentDiv.appendChild(link);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-resource';
    removeBtn.title = 'Remove Resource';
    const icon = document.createElement('i');
    icon.setAttribute('data-feather', 'x');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    removeBtn.appendChild(icon);
    resourceItem.appendChild(contentDiv);
    resourceItem.appendChild(removeBtn);

    this.elements.resourceList.appendChild(resourceItem);
    this.emit('resourceAdded', { name, url });
    this.emit('sidebarChanged');
  }

  removeResource(resourceItem) {
    const name = resourceItem.dataset.name;
    const url = resourceItem.dataset.url;
    resourceItem.remove();
    this.emit('resourceRemoved', { name, url });
    this.emit('sidebarChanged');
  }

  toggleResourceSection() {
    const section = document.getElementById('resourcesSection');
    const shouldShow =
      this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked;

    if (section) {
      section.classList.toggle('hidden', !shouldShow);
    }
  }

  getResources() {
    return Array.from(this.elements.resourceList.querySelectorAll('.resource-item')).map(
      (item) => ({
        name: item.dataset.name,
        url: item.dataset.url,
      })
    );
  }
}
