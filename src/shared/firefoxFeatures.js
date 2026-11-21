// Firefox has no userScripts.execute, so the background cannot inject code into
// a document to deliver events. Instead, documents that need background events
// (value listeners, notification callbacks, menu commands) open a port from the
// USER_SCRIPT world, and the background pushes over it.

export const FIREFOX_PORT_NAME = 'codetweak-firefox-bridge';
const PENDING_TTL_MS = 10_000;
const MAX_PENDING = 100;
const MENU_LIST_TIMEOUT_MS = 500;

// Page side. Serialized into each userscript bootstrap via toString(), so it
// must not reference anything outside its own body.
export function installFirefoxBridge(registry, runtime) {
  if (registry.bridge) return registry.bridge;
  if (typeof runtime?.connect !== 'function') return null;

  const subscribed = new Set();
  let port = null;
  let retryTimer = null;
  let failures = 0;
  let connectedAt = 0;

  const post = (message) => {
    try {
      port?.postMessage(message);
    } catch {
      // The disconnect handler reconnects.
    }
  };

  const listMenu = () =>
    Array.from(registry.menu.entries(), ([commandId, command]) => ({
      commandId,
      caption: command.caption,
      scriptName: command.scriptName,
    }));

  const onMessage = (message) => {
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'dispatch') {
      registry.dispatch(message.scriptId, message.type, message.data);
    } else if (message.kind === 'menu:list') {
      post({ kind: 'menu:list', requestId: message.requestId, commands: listMenu() });
    } else if (message.kind === 'menu:run') {
      const command = registry.menu.get(message.commandId);
      try {
        command?.onClick?.();
      } catch (error) {
        console.error(`[CodeTweak] ${command.scriptName} menu command failed`, error);
      }
    }
  };

  const connect = () => {
    retryTimer = null;
    try {
      port = runtime.connect({ name: 'codetweak-firefox-bridge' });
    } catch {
      port = null;
      return;
    }
    connectedAt = Date.now();
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      // The event page was suspended or reloaded. Reconnect right away, but
      // back off and eventually stop if the connection keeps dropping.
      failures = Date.now() - connectedAt < 1000 ? failures + 1 : 0;
      if (failures > 5) return;
      retryTimer = setTimeout(connect, failures <= 1 ? 0 : 250 * 2 ** failures);
    });
    post({ kind: 'hello', scriptIds: [...subscribed] });
  };

  registry.bridge = {
    subscribe(scriptId) {
      if (subscribed.has(scriptId)) return;
      subscribed.add(scriptId);
      if (port) post({ kind: 'subscribe', scriptId });
      else if (!retryTimer) connect();
    },
  };
  return registry.bridge;
}

// Background side.
export class FirefoxPortHub {
  constructor(api) {
    this.api = api;
    this.entries = new Set();
    this.pending = [];
    this.requests = new Map();
    this.counter = 0;
    this.listening = false;
  }

  // onUserScriptConnect only exists once the userScripts permission is granted,
  // so this is safe to call again after a grant.
  listen() {
    const event = this.api.runtime?.onUserScriptConnect;
    if (this.listening || typeof event?.addListener !== 'function') return this.listening;
    event.addListener((port) => this.accept(port));
    this.listening = true;
    return true;
  }

  static targetFromSender(sender) {
    const tabId = sender?.tab?.id;
    if (typeof tabId !== 'number') return null;
    return { tabId, frameId: typeof sender.frameId === 'number' ? sender.frameId : 0 };
  }

  accept(port) {
    if (port?.name !== FIREFOX_PORT_NAME) return;
    const target = FirefoxPortHub.targetFromSender(port.sender);
    if (!target) {
      port.disconnect();
      return;
    }
    const entry = { port, ...target, scriptIds: new Set() };
    this.entries.add(entry);
    port.onMessage.addListener((message) => this.onPortMessage(entry, message));
    port.onDisconnect.addListener(() => this.drop(entry));
  }

  drop(entry) {
    this.entries.delete(entry);
    for (const request of [...this.requests.values()]) {
      if (request.entry === entry) request.resolve([]);
    }
  }

  onPortMessage(entry, message) {
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'hello' && Array.isArray(message.scriptIds)) {
      message.scriptIds.forEach((id) => typeof id === 'string' && entry.scriptIds.add(id));
      this.flushPending(entry);
    } else if (message.kind === 'subscribe' && typeof message.scriptId === 'string') {
      entry.scriptIds.add(message.scriptId);
      this.flushPending(entry);
    } else if (message.kind === 'menu:list') {
      const request = this.requests.get(message.requestId);
      if (request?.entry === entry) request.resolve(message.commands);
    }
  }

  post(entry, message) {
    try {
      entry.port.postMessage(message);
      return true;
    } catch {
      this.drop(entry);
      return false;
    }
  }

  matching(target, scriptId) {
    return [...this.entries].filter(
      (entry) =>
        entry.tabId === target.tabId &&
        entry.frameId === target.frameId &&
        (scriptId === undefined || entry.scriptIds.has(scriptId))
    );
  }

  // Delivers to one document. If its port is down (e.g. the event page just
  // woke up), the message waits briefly for the document to reconnect.
  dispatch(target, scriptId, type, data) {
    const message = { kind: 'dispatch', scriptId, type, data: data ?? {} };
    const delivered = this.matching(target, scriptId).filter((entry) => this.post(entry, message));
    if (delivered.length > 0) return true;
    this.prunePending();
    this.pending.push({ target, scriptId, message, expires: Date.now() + PENDING_TTL_MS });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    return false;
  }

  prunePending() {
    const now = Date.now();
    this.pending = this.pending.filter((item) => item.expires > now);
  }

  flushPending(entry) {
    this.prunePending();
    this.pending = this.pending.filter((item) => {
      const matches =
        item.target.tabId === entry.tabId &&
        item.target.frameId === entry.frameId &&
        entry.scriptIds.has(item.scriptId);
      if (matches) this.post(entry, item.message);
      return !matches;
    });
  }

  // Sends a value change to every other document running the script.
  broadcastValueChange(scriptId, change, sender) {
    const source = FirefoxPortHub.targetFromSender(sender);
    for (const entry of [...this.entries]) {
      if (!entry.scriptIds.has(scriptId)) continue;
      if (source && entry.tabId === source.tabId && entry.frameId === source.frameId) continue;
      this.post(entry, {
        kind: 'dispatch',
        scriptId,
        type: 'valueChanged',
        data: { ...change, remote: entry.tabId !== source?.tabId },
      });
    }
  }

  requestMenu(entry, timeoutMs) {
    return new Promise((resolve) => {
      const requestId = `m${++this.counter}`;
      const timer = setTimeout(() => finish([]), timeoutMs);
      const finish = (commands) => {
        clearTimeout(timer);
        this.requests.delete(requestId);
        resolve(Array.isArray(commands) ? commands : []);
      };
      this.requests.set(requestId, { entry, resolve: finish });
      if (!this.post(entry, { kind: 'menu:list', requestId })) finish([]);
    });
  }

  async listMenuCommands(tabId, timeoutMs = MENU_LIST_TIMEOUT_MS) {
    const entries = [...this.entries].filter((entry) => entry.tabId === tabId);
    const results = await Promise.all(entries.map((entry) => this.requestMenu(entry, timeoutMs)));
    return results.flatMap((commands, index) =>
      commands
        .filter((cmd) => typeof cmd?.commandId === 'string' && typeof cmd.caption === 'string')
        .map((cmd) => ({
          commandId: cmd.commandId,
          caption: cmd.caption,
          scriptName: typeof cmd.scriptName === 'string' ? cmd.scriptName : '',
          frameId: entries[index].frameId,
        }))
    );
  }

  runMenuCommand(tabId, frameId, commandId) {
    const entries = this.matching({ tabId, frameId: frameId ?? 0 });
    return entries.filter((entry) => this.post(entry, { kind: 'menu:run', commandId })).length > 0;
  }

  removeTab(tabId) {
    this.pending = this.pending.filter((item) => item.target.tabId !== tabId);
  }
}
