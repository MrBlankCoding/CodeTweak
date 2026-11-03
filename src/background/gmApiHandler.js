import { handleCrossOriginXmlhttpRequest, abortCrossOriginRequest } from './networkService.js';
import { urlMatchesPattern } from '../shared/utils/urls.js';
import { ClipboardService } from '../services/ClipboardService.js';
import { NotificationService } from '../services/NotificationService.js';
import { DownloadService } from '../services/DownloadService.js';
import { storeScriptError } from './errorLogger.js';
import { gateFor } from '../services/scripts/adapter/scriptNormalizer.js';

function testRegexSource(source, url) {
  try {
    return new RegExp(source, 'i').test(url);
  } catch {
    return false;
  }
}

// Check a scripts URL and if it works with REGREX
export function scriptMatchesUrl(script, url) {
  const targets = Array.isArray(script.targetUrls) ? script.targetUrls : [];
  const gate = gateFor(script);
  const admitted =
    targets.some((pattern) => typeof pattern === 'string' && urlMatchesPattern(url, pattern)) ||
    gate.includeRegexes.some((source) => testRegexSource(source, url));
  return admitted && !gate.excludeRegexes.some((source) => testRegexSource(source, url));
}

// @connect: no list (or "*") allows any host; "self" is the page's host; a
// plain or "*."-prefixed entry allows that domain and its subdomains.
export function isHostAllowedByConnect(connect, url, senderUrl) {
  if (!Array.isArray(connect) || connect.length === 0 || connect.includes('*')) return true;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return connect.some((entry) => {
    const rule = String(entry).trim().toLowerCase();
    if (rule === 'self') {
      try {
        return new URL(senderUrl).hostname.toLowerCase() === host;
      } catch {
        return false;
      }
    }
    const base = rule.replace(/^\*?\./, '');
    return Boolean(base) && (host === base || host.endsWith(`.${base}`));
  });
}

const STORAGE_FLAGS = [
  'gmSetValue',
  'gmGetValue',
  'gmDeleteValue',
  'gmListValues',
  'gmAddValueChangeListener',
];

// every action needs its grant set to exactly true
const FLAG_FOR_ACTION = {
  setValue: 'gmSetValue',
  deleteValue: 'gmDeleteValue',
  openInTab: 'gmOpenInTab',
  notification: 'gmNotification',
  setClipboard: 'gmSetClipboard',
  download: 'gmDownload',
  xmlhttpRequest: 'gmXmlhttpRequest',
  xhrAbort: 'gmXmlhttpRequest',
};

// perscript write queue
// avoid race conditions
const valueLocks = new Map();

function withValueLock(key, fn) {
  const previous = valueLocks.get(key) || Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => {});
  valueLocks.set(key, tail);
  tail.then(() => {
    if (valueLocks.get(key) === tail) valueLocks.delete(key);
  });
  return run;
}

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

  async authorize(action, payload = {}) {
    if (typeof this.scriptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(this.scriptId)) {
      return 'Unknown or invalid script.';
    }
    const { scripts = [] } = await chrome.storage.local.get('scripts');
    const script = (Array.isArray(scripts) ? scripts : []).find((s) => s?.id === this.scriptId);
    if (!script || script.enabled === false) {
      return 'Unknown or disabled script.';
    }

    // bind caller to script's targetUrls and @connect list
    const senderUrl = this.sender?.url || this.sender?.tab?.url;
    if (typeof senderUrl === 'string' && senderUrl && !scriptMatchesUrl(script, senderUrl)) {
      return 'Sender tab does not match script targets.';
    }

    if (action === 'getAllValues') {
      return STORAGE_FLAGS.some((flag) => script[flag] === true) ? null : 'Storage not granted.';
    }

    const flag = FLAG_FOR_ACTION[action];
    if (flag && script[flag] !== true) {
      return `API not granted for this script: ${action}.`;
    }
    if (
      action === 'xmlhttpRequest' &&
      !isHostAllowedByConnect(script.connect, payload?.details?.url, senderUrl)
    ) {
      return 'GM_xmlhttpRequest host is not in @connect list.';
    }
    return null;
  }

  async getStorage() {
    const result = await chrome.storage.local.get(this.storageKey);
    const values = result[this.storageKey];
    return values && typeof values === 'object' ? values : {};
  }

  async setStorage(values) {
    await chrome.storage.local.set({ [this.storageKey]: values });
  }

  // intial snapshot of all values for this script
  // used to populate the GM storage API
  async getAllValues() {
    await this.state.push?.subscribe(this.scriptId, this.sender);
    return { result: await this.getStorage() };
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

    const outcome = await withValueLock(this.storageKey, async () => {
      const values = await this.getStorage();
      if (!(name in values) && Object.keys(values).length >= 1000) {
        return { error: 'Value store is full (1000 keys max)' };
      }
      const oldValue = values[name];
      values[name] = value;
      await this.setStorage(values);
      return { oldValue };
    });
    if (outcome.error) return outcome;

    this.notifyValueChange({ name, oldValue: outcome.oldValue, newValue: value });
    return { result: null };
  }

  async deleteValue({ name }) {
    if (typeof name !== 'string') return { error: 'Name must be a string' };
    const oldValue = await withValueLock(this.storageKey, async () => {
      const values = await this.getStorage();
      const previous = values[name];
      delete values[name];
      await this.setStorage(values);
      return previous;
    });

    this.notifyValueChange({ name, oldValue, newValue: undefined, deleted: true });
    return { result: null };
  }

  notifyValueChange(change) {
    this.state.push?.broadcastValueChange(this.scriptId, change, this.sender).catch(() => {});
  }

  requestKey(requestId) {
    return `${this.sender?.documentId ?? this.sender?.tab?.id ?? 'unknown'}:${requestId}`;
  }

  async xmlhttpRequest({ details, requestId }) {
    if (!details || typeof details.url !== 'string' || !/^https?:\/\//i.test(details.url)) {
      return { error: `Invalid URL: ${details?.url}` };
    }

    return await handleCrossOriginXmlhttpRequest(details, {
      abortKey: typeof requestId === 'string' ? this.requestKey(requestId) : undefined,
    });
  }

  xhrAbort({ requestId }) {
    if (typeof requestId !== 'string') return { result: false };
    return { result: abortCrossOriginRequest(this.requestKey(requestId)) };
  }

  async notification({ details, callbackId }) {
    const response = await this.notificationService.showNotification(details);
    const notificationId = response?.result?.notificationId;
    if (notificationId && typeof callbackId === 'string') {
      await this.state.push?.trackNotification(
        notificationId,
        this.scriptId,
        callbackId,
        this.sender
      );
    }
    return response;
  }

  async openInTab({ url, options = {} }) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { error: 'Only http(s) URLs may be opened.' };
    }

    const senderTab = this.sender?.tab;
    const createOptions = { url, active: options.active !== false };
    if (options.insert && typeof senderTab?.index === 'number') {
      createOptions.index = senderTab.index + 1;
    }
    if (options.setParent && typeof senderTab?.id === 'number') {
      createOptions.openerTabId = senderTab.id;
    }

    try {
      const tab = await chrome.tabs.create(createOptions);
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

  async reportError({ error }) {
    if (!error || typeof error !== 'object') return { error: 'Invalid error payload.' };
    const safe = {
      message: String(error.message ?? 'Unknown error').slice(0, 2000),
      stack: String(error.stack ?? '').slice(0, 10_000),
      timestamp: typeof error.timestamp === 'string' ? error.timestamp : new Date().toISOString(),
      type: typeof error.type === 'string' ? error.type : 'error',
    };
    await storeScriptError(this.scriptId, safe);
    return { result: null };
  }
}
