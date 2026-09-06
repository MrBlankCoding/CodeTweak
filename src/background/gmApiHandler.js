import { handleCrossOriginXmlhttpRequest } from './networkService.js';
import { browser } from '../shared/browserAdapter.js';
import { urlMatchesPattern } from '../shared/utils/urls.js';
import { ClipboardService } from '../services/ClipboardService.js';
import { NotificationService } from '../services/NotificationService.js';
import { DownloadService } from '../services/DownloadService.js';

export class GMAPIHandler {
  constructor(scriptId, sender, state) {
    this.scriptId = scriptId;
    this.sender = sender;
    this.state = state;
    this.storageKey = `script-values-${scriptId}`;

    this.clipboardService = new ClipboardService();
    this.notificationService = new NotificationService();
    this.downloadService = new DownloadService();
  }

  async authorize(action) {
    if (typeof this.scriptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(this.scriptId)) {
      return 'Unknown or invalid script.';
    }
    const { scripts = [] } = await browser.storage.local.get('scripts');
    const script = (Array.isArray(scripts) ? scripts : []).find((s) => s?.id === this.scriptId);
    if (!script || script.enabled === false) {
      return 'Unknown or disabled script.';
    }
    // Bind caller to registration: sender tab URL must match script targets,
    // otherwise any script can impersonate another by naming its ID.
    const senderUrl = this.sender?.tab?.url;
    if (typeof senderUrl === 'string' && senderUrl) {
      const targets = Array.isArray(script.targetUrls) ? script.targetUrls : [];
      const matches = targets.some(
        (pattern) => typeof pattern === 'string' && urlMatchesPattern(senderUrl, pattern)
      );
      if (!matches) {
        return 'Sender tab does not match script targets.';
      }
    }
    const flagForAction = {
      setValue: 'gmSetValue',
      getValue: 'gmGetValue',
      deleteValue: 'gmDeleteValue',
      listValues: 'gmListValues',
      addValueChangeListener: 'gmAddValueChangeListener',
      removeValueChangeListener: 'gmRemoveValueChangeListener',
      openInTab: 'gmOpenInTab',
      notification: 'gmNotification',
      setClipboard: 'gmSetClipboard',
      download: 'gmDownload',
      xmlhttpRequest: 'gmXmlhttpRequest',
    }[action];

    // Sensitive APIs default-deny unless explicitly granted. Storage value
    // APIs stay legacy-allow (explicit false denies) to avoid breaking scripts
    // created before per-API flags existed.
    const sensitiveFlags = new Set([
      'gmOpenInTab',
      'gmNotification',
      'gmSetClipboard',
      'gmDownload',
      'gmXmlhttpRequest',
    ]);
    if (flagForAction) {
      if (sensitiveFlags.has(flagForAction)) {
        if (script[flagForAction] !== true) {
          return `API not granted for this script: ${action}.`;
        }
      } else if (script[flagForAction] === false) {
        return `API not granted for this script: ${action}.`;
      }
    }
    return null;
  }

  async getStorage() {
    const result = await browser.storage.local.get(this.storageKey);
    const values = result[this.storageKey];
    return values && typeof values === 'object' ? values : {};
  }

  async setStorage(values) {
    await browser.storage.local.set({ [this.storageKey]: values });
  }

  async setValue({ name, value }) {
    if (typeof name !== 'string' || name.length > 256) return { error: 'Invalid value name' };
    let size = 0;
    try {
      size = JSON.stringify(value)?.length ?? 0;
    } catch {
      return { error: 'Value is not serializable' };
    }
    if (size > 100_000) return { error: 'Value exceeds 100KB limit' };
    const values = await this.getStorage();
    if (!(name in values) && Object.keys(values).length >= 1000) {
      return { error: 'Value store is full (1000 keys max)' };
    }
    const oldValue = values[name];
    values[name] = value;
    await this.setStorage(values);

    this.notifyValueChange(name, oldValue, value);
    return { result: null };
  }

  async getValue({ name, defaultValue }) {
    if (typeof name !== 'string') return { result: defaultValue };
    const values = await this.getStorage();
    return { result: values[name] ?? defaultValue };
  }

  async deleteValue({ name }) {
    if (typeof name !== 'string') return { error: 'Name must be a string' };
    const values = await this.getStorage();
    const oldValue = values[name];
    delete values[name];
    await this.setStorage(values);

    this.notifyValueChange(name, oldValue, undefined);
    return { result: null };
  }

  async listValues() {
    const values = await this.getStorage();
    return { result: Object.keys(values) };
  }

  addValueChangeListener({ name }) {
    const tabId = this.sender?.tab?.id;
    if (!tabId || typeof name !== 'string') {
      return { result: null };
    }

    if (!this.state.valueChangeListeners.has(name)) {
      this.state.valueChangeListeners.set(name, new Set());
    }
    this.state.valueChangeListeners.get(name).add(tabId);
    return { result: null };
  }

  removeValueChangeListener({ name }) {
    const tabId = this.sender?.tab?.id;
    if (!tabId || typeof name !== 'string') {
      return { result: null };
    }

    const listeners = this.state.valueChangeListeners.get(name);
    if (listeners) {
      listeners.delete(tabId);
      if (listeners.size === 0) {
        this.state.valueChangeListeners.delete(name);
      }
    }
    return { result: null };
  }

  notifyValueChange(name, oldValue, newValue) {
    const sourceTabId = this.sender?.tab?.id;
    const listeners = this.state.valueChangeListeners.get(name);
    if (!listeners) return;

    for (const tabId of listeners) {
      browser.tabs
        .sendMessage(tabId, {
          type: 'GM_VALUE_CHANGED',
          payload: {
            name,
            oldValue,
            newValue,
            remote: tabId !== sourceTabId,
          },
        })
        .catch(() => {}); // Ignore errors if tab is closed
    }
  }

  async xmlhttpRequest({ details }) {
    if (!details || typeof details.url !== 'string' || !/^https?:\/\//i.test(details.url)) {
      return { error: `Invalid URL: ${details?.url}` };
    }

    return await handleCrossOriginXmlhttpRequest(details);
  }

  async notification(args) {
    return await this.notificationService.showNotification(args.details, args.ondone);
  }

  async openInTab({ url, options = {} }) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { error: 'Only http(s) URLs may be opened.' };
    }

    try {
      const tab = await browser.tabs.create({
        url,
        active: options.active !== false,
      });

      return { result: { tabId: tab?.id ?? null } };
    } catch (error) {
      return { error: error.message };
    }
  }

  async setClipboard({ data, setupOffscreenDocument }) {
    return await this.clipboardService.setClipboard(data, this.sender, setupOffscreenDocument);
  }

  async download(args) {
    return await this.downloadService.download(args);
  }
}
