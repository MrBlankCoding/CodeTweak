import logger from '../shared/utils/logger.js';
import { buildMetadata, parseUserScriptMetadata } from '../services/scripts/MetadataParser.js';
import { normalizeRunAt } from '../shared/utils/urls.js';

export class MetadataSync {
  constructor(elements, state, codeEditorManager, ui, gmApiDefinitions, config) {
    this.elements = elements;
    this.state = state;
    this.codeEditorManager = codeEditorManager;
    this.ui = ui;
    this.gmApiDefinitions = gmApiDefinitions;
    this.config = config;
  }

  syncHeaderToSidebar() {
    try {
      const currentCode = this.codeEditorManager.getValue();
      const headerMatch = currentCode.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);

      if (!headerMatch) return;

      const metadata = parseUserScriptMetadata(headerMatch[0]);
      if (metadata.name) this.elements.scriptName.value = metadata.name;
      if (metadata.author) this.elements.scriptAuthor.value = metadata.author;
      if (metadata.version) this.elements.scriptVersion.value = metadata.version;
      if (metadata.description) this.elements.scriptDescription.value = metadata.description;
      if (metadata.license) this.elements.scriptLicense.value = metadata.license;
      if (metadata.icon) this.elements.scriptIcon.value = metadata.icon;
      if (metadata.runAt) this.elements.runAt.value = normalizeRunAt(metadata.runAt, '');

      if (this.elements.urlList) this.elements.urlList.innerHTML = '';
      if (Array.isArray(metadata.matches)) {
        metadata.matches.forEach((match) => this.ui.addUrlToList(match));
      }

      if (this.gmApiDefinitions) {
        Object.values(this.gmApiDefinitions).forEach((def) => {
          const el = this.elements[def.el];
          if (el) el.checked = false;
        });
      }
      if (metadata.gmApis) {
        Object.keys(metadata.gmApis).forEach((apiFlag) => {
          const element = this.elements[apiFlag];
          if (element) element.checked = !!metadata.gmApis[apiFlag];
        });
      }

      if (this.elements.resourceList) this.elements.resourceList.innerHTML = '';
      if (Array.isArray(metadata.resources)) {
        metadata.resources.forEach((res) => this.ui.addResourceToList(res.name, res.url));
      }

      if (this.elements.requireList) {
        this.elements.requireList.innerHTML = '';
        if (Array.isArray(metadata.requires)) {
          metadata.requires.forEach((url) => this.ui.addRequireToList(url));
        }
      }
    } catch (error) {
      logger.error('Sync to sidebar failed:', error);
    }
  }

  syncSidebarToHeader() {
    this.state.isUpdatingFromSidebar = true;
    try {
      const scriptData = this.gatherScriptData();
      const metadata = buildMetadata(scriptData);
      const currentCode = this.codeEditorManager.getValue();
      const existingHeaderMatch = currentCode.match(
        /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/
      );

      let newCode;
      if (existingHeaderMatch) {
        newCode = currentCode.replace(existingHeaderMatch[0], metadata);
      } else {
        newCode = metadata + '\n\n' + currentCode;
      }

      this.codeEditorManager.setValue(newCode);
    } finally {
      this.state.isUpdatingFromSidebar = false;
    }
  }

  gatherScriptData() {
    const urlList = Array.from(document.querySelectorAll('.url-item')).map(
      (item) => item.dataset.url
    );

    const currentUrl = this.elements.targetUrl.value.trim();
    if (currentUrl && !urlList.includes(currentUrl)) {
      urlList.push(currentUrl);
    }

    const scriptData = {
      name: this.elements.scriptName.value.trim(),
      author: this.elements.scriptAuthor.value.trim() || 'Anonymous',
      targetUrls: urlList,
      runAt: this.elements.runAt.value,
      injectInto: this.elements.injectInto.value,
      version: this.elements.scriptVersion.value.trim() || this.config.DEFAULT_VERSION,
      description: this.elements.scriptDescription.value.trim(),
      license: this.elements.scriptLicense?.value.trim() || '',
      icon: this.elements.scriptIcon?.value.trim() || '',
      code: this.codeEditorManager.getValue(),
      enabled: true,
      updatedAt: new Date().toISOString(),
    };

    // GM APIs
    if (this.gmApiDefinitions) {
      Object.values(this.gmApiDefinitions).forEach((api) => {
        scriptData[api.el] = this.elements[api.el]?.checked || false;
      });
    }

    scriptData.resources = [];
    if (this.elements.resourceList) {
      const items = Array.from(this.elements.resourceList.querySelectorAll('.resource-item'));
      items.forEach((item) => {
        scriptData.resources.push({
          name: item.dataset.name,
          url: item.dataset.url,
        });
      });
    }

    scriptData.requires = [];
    if (this.elements.requireList) {
      const reqItems = Array.from(this.elements.requireList.querySelectorAll('.require-item'));
      reqItems.forEach((item) => {
        scriptData.requires.push(item.dataset.url);
      });
    }

    return scriptData;
  }
}
