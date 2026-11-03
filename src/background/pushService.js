import logger from '../shared/utils/logger.js';

const SUBSCRIBERS_KEY = 'gmValueSubscribers';
const MAX_DOCUMENTS_PER_SCRIPT = 200;
const NOTIFICATION_PREFIX = 'gmNotification:';

// deliver background events
// this way we send correct events to script and document
export class PushService {
  constructor(api) {
    this.api = api;
    this.subscribers = null;
    this.chain = Promise.resolve();
  }

  get canExecute() {
    try {
      return typeof this.api.userScripts?.execute === 'function';
    } catch {
      return false;
    }
  }

  withLock(fn) {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  async load() {
    if (this.subscribers) return this.subscribers;
    let stored = {};
    try {
      stored = (await this.api.storage.session?.get(SUBSCRIBERS_KEY))?.[SUBSCRIBERS_KEY] || {};
    } catch (error) {
      logger.debug('storage.session unavailable:', error);
    }
    this.subscribers = stored && typeof stored === 'object' ? stored : {};
    return this.subscribers;
  }

  async persist() {
    try {
      await this.api.storage.session?.set({ [SUBSCRIBERS_KEY]: this.subscribers });
    } catch (error) {
      logger.debug('Failed to persist subscribers:', error);
    }
  }

  static targetFromSender(sender) {
    const tabId = sender?.tab?.id;
    if (typeof tabId !== 'number' || typeof sender?.documentId !== 'string') return null;
    return { tabId, documentId: sender.documentId };
  }

  subscribe(scriptId, sender) {
    const target = PushService.targetFromSender(sender);
    if (!target) return Promise.resolve();
    return this.withLock(async () => {
      const subscribers = await this.load();
      const list = (subscribers[scriptId] || []).filter((t) => t.documentId !== target.documentId);
      list.push(target);
      subscribers[scriptId] = list.slice(-MAX_DOCUMENTS_PER_SCRIPT);
      await this.persist();
    });
  }

  removeTab(tabId) {
    return this.withLock(async () => {
      const subscribers = await this.load();
      let changed = false;
      for (const [scriptId, list] of Object.entries(subscribers)) {
        const next = list.filter((target) => target.tabId !== tabId);
        if (next.length !== list.length) {
          changed = true;
          if (next.length) subscribers[scriptId] = next;
          else delete subscribers[scriptId];
        }
      }
      if (changed) await this.persist();
    });
  }

  removeDocument(scriptId, documentId) {
    return this.withLock(async () => {
      const subscribers = await this.load();
      const list = subscribers[scriptId];
      if (!list) return;
      subscribers[scriptId] = list.filter((target) => target.documentId !== documentId);
      if (subscribers[scriptId].length === 0) delete subscribers[scriptId];
      await this.persist();
    });
  }

  async sendToDocument(target, scriptId, type, data) {
    if (!this.canExecute) return false;
    const code =
      `globalThis.__codetweak?.dispatch(${JSON.stringify(scriptId)}, ` +
      `${JSON.stringify(type)}, ${JSON.stringify(data ?? {})});`;
    try {
      await this.api.userScripts.execute({
        target: { tabId: target.tabId, documentIds: [target.documentId] },
        world: 'USER_SCRIPT',
        js: [{ code }],
        injectImmediately: true,
      });
      return true;
    } catch (error) {
      logger.debug('Push to document failed:', error?.message);
      return false;
    }
  }

  async trackNotification(notificationId, scriptId, callbackId, sender) {
    const target = PushService.targetFromSender(sender);
    if (!target || !callbackId) return;
    const key = `${NOTIFICATION_PREFIX}${notificationId}`;
    try {
      await this.api.storage.session?.set({ [key]: { ...target, scriptId, callbackId } });
    } catch (error) {
      logger.debug('Failed to track notification:', error);
    }
  }

  // Forwards a notification click/close to the script that created it.
  async notificationEvent(notificationId, event) {
    const key = `${NOTIFICATION_PREFIX}${notificationId}`;
    let entry;
    try {
      entry = (await this.api.storage.session?.get(key))?.[key];
    } catch {
      return;
    }
    if (!entry) return;
    if (event === 'done') await this.api.storage.session.remove(key).catch?.(() => {});
    await this.sendToDocument(entry, entry.scriptId, 'notification', {
      callbackId: entry.callbackId,
      event,
    });
  }

  // Sends a value change to every other document running the script.
  async broadcastValueChange(scriptId, change, sender) {
    if (!this.canExecute) return;
    const subscribers = await this.load();
    const targets = (subscribers[scriptId] || []).filter(
      (target) => target.documentId !== sender?.documentId
    );
    const sourceTabId = sender?.tab?.id;
    await Promise.all(
      targets.map(async (target) => {
        const delivered = await this.sendToDocument(target, scriptId, 'valueChanged', {
          ...change,
          remote: target.tabId !== sourceTabId,
        });
        if (!delivered) await this.removeDocument(scriptId, target.documentId);
      })
    );
  }
}
