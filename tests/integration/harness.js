import { vi } from 'vitest';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

import { urlMatchesPattern } from '../../src/shared/utils/urls.js';
import { globToRegexSource } from '../../src/services/scripts/adapter/scriptNormalizer.js';
import {
  parseUserScriptMetadata,
  scriptFieldsFromMetadata,
} from '../../src/services/scripts/MetadataParser.js';

// loads against fake chrome
// for testing
const RUN_AT_ORDER = { document_start: 0, document_end: 1, document_idle: 2 };
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const flush = () => new Promise((resolve) => setTimeout(resolve, 15));

function makeResponse(url, entry) {
  if (!entry) return makeResponse(url, { status: 404, body: 'not found' });
  const {
    status = 200,
    body = '',
    headers = {},
  } = typeof entry === 'string' ? { body: entry } : entry;
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    url,
    headers: new Headers(headers),
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function eventBucket() {
  const fns = [];
  return { fns, api: { addListener: (fn) => fns.push(fn) } };
}

export async function createExtension({ settings = {}, server = {} } = {}) {
  vi.resetModules();

  const events = {
    onMessage: eventBucket(),
    onUserScriptMessage: eventBucket(),
    onInstalled: eventBucket(),
    onStartup: eventBucket(),
    onClicked: eventBucket(),
    onClosed: eventBucket(),
    menuClicked: eventBucket(),
    alarm: eventBucket(),
    tabRemoved: eventBucket(),
    tabUpdated: eventBucket(),
    tabActivated: eventBucket(),
  };

  const storageData = {
    scripts: [],
    settings: { allowExternalResources: true, enhancedDebugging: true, ...settings },
    // Keeps the updater's start-up check from firing mid-test.
    lastUpdateCheck: Date.now(),
  };
  const sessionData = {};
  const registered = new Map();
  const documents = new Map();
  const notifications = [];
  const requests = [];
  let documentCounter = 0;

  const area = (data) => ({
    get: vi.fn(async (key) => {
      if (key == null) return clone(data);
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((k) => [k, clone(data[k])]));
    }),
    set: vi.fn(async (obj) => Object.assign(data, clone(obj))),
    remove: vi.fn(async (keys) => [].concat(keys).forEach((k) => delete data[k])),
    getKeys: vi.fn(async () => Object.keys(data)),
  });

  const chrome = {
    runtime: {
      id: 'codetweak-test',
      lastError: null,
      getManifest: () => ({ version: '9.9.9' }),
      getURL: (path) => `chrome-extension://codetweak-test/${path}`,
      sendMessage: vi.fn(async () => undefined),
      onMessage: events.onMessage.api,
      onUserScriptMessage: events.onUserScriptMessage.api,
      onInstalled: events.onInstalled.api,
      onStartup: events.onStartup.api,
    },
    storage: { local: area(storageData), session: area(sessionData) },
    userScripts: {
      getScripts: vi.fn(async () => clone([...registered.values()])),
      configureWorld: vi.fn(async () => {}),
      register: vi.fn(async (regs) => {
        for (const reg of regs) {
          if (registered.has(reg.id)) throw new Error(`Duplicate script ID '${reg.id}'`);
        }
        regs.forEach((reg) => registered.set(reg.id, clone(reg)));
      }),
      update: vi.fn(async (regs) => {
        regs.forEach((reg) => registered.set(reg.id, { ...registered.get(reg.id), ...clone(reg) }));
      }),
      unregister: vi.fn(async ({ ids }) => ids.forEach((id) => registered.delete(id))),
      execute: vi.fn(async ({ target, js }) => {
        const ids = target.documentIds || [];
        const targets = ids.length
          ? ids.map((id) => documents.get(id))
          : [...documents.values()].filter((doc) => doc.tabId === target.tabId && doc.alive);
        if (targets.length === 0 || targets.some((doc) => !doc?.alive)) {
          throw new Error('No document with the given ID');
        }
        return targets.map((doc) => ({ result: clone(doc.runInUserWorld(js[0].code)) }));
      }),
    },
    notifications: {
      create: vi.fn((id, options, cb) => {
        notifications.push({ id, options });
        cb?.(id);
      }),
      clear: vi.fn((id, cb) => {
        events.onClosed.fns.forEach((fn) => fn(id));
        cb?.(true);
      }),
      onClicked: events.onClicked.api,
      onClosed: events.onClosed.api,
    },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(async (id) => ({ id, url: 'https://example.com/' })),
      create: vi.fn(async (options) => ({ id: 900, ...options })),
      sendMessage: vi.fn(),
      reload: vi.fn(),
      onRemoved: events.tabRemoved.api,
      onUpdated: events.tabUpdated.api,
      onActivated: events.tabActivated.api,
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    contextMenus: {
      removeAll: (cb) => cb?.(),
      create: vi.fn(),
      onClicked: events.menuClicked.api,
    },
    alarms: { create: vi.fn(), get: (_name, cb) => cb?.(null), onAlarm: events.alarm.api },
    downloads: { download: vi.fn((_options, cb) => cb?.(1)) },
    scripting: { executeScript: vi.fn(async () => [{ result: true }]), insertCSS: vi.fn() },
  };

  global.chrome = chrome;
  global.fetch = vi.fn(async (url, options = {}) => {
    requests.push({ url, options });
    const entry = server[url];
    return makeResponse(url, typeof entry === 'function' ? entry(options) : entry);
  });

  await import('../../src/background/background.js');

  const sendRuntime = (message) =>
    new Promise((resolve) => {
      const keepOpen = events.onMessage.fns[0](clone(message), {}, (r) => resolve(clone(r)));
      if (keepOpen === false) resolve(undefined);
    });

  const sendFromUserScript = (message, sender) =>
    new Promise((resolve) => {
      const keepOpen = events.onUserScriptMessage.fns[0](clone(message), sender, (r) =>
        resolve(clone(r))
      );
      if (keepOpen === false) resolve(undefined);
    });

  function registrationsFor(url) {
    return [...registered.values()]
      .filter((reg) => reg.matches.some((pattern) => urlMatchesPattern(url, pattern)))
      .filter(
        (reg) =>
          !(reg.excludeGlobs || []).some((glob) => new RegExp(globToRegexSource(glob)).test(url))
      )
      .sort(
        (a, b) =>
          (RUN_AT_ORDER[a.runAt || 'document_idle'] ?? 2) -
          (RUN_AT_ORDER[b.runAt || 'document_idle'] ?? 2)
      );
  }

  const ext = {
    chrome,
    storage: storageData,
    registered,
    notifications,
    requests,
    events,
    server,
    flush,
    sendRuntime,

    async sync() {
      await sendRuntime({ action: 'scriptsUpdated' });
    },

    // Installs a userscript from source the way an import does: header fields
    // become the stored script, then registrations are synced.
    async install(source, overrides = {}) {
      const metadata = parseUserScriptMetadata(source);
      const script = {
        runAt: 'document_idle',
        ...scriptFieldsFromMetadata(metadata),
        id: overrides.id || `script-${storageData.scripts.length + 1}`,
        code: source,
        enabled: true,
        ...overrides,
      };
      storageData.scripts = [...storageData.scripts, script];
      await ext.sync();
      return script;
    },

    async openPage(
      url,
      {
        tabId = 1,
        html = '<!doctype html><html><head></head><body></body></html>',
        pageGlobals = {},
      } = {}
    ) {
      const documentId = `doc-${++documentCounter}`;
      const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
      Object.assign(dom.window, pageGlobals);
      const mainContext = dom.getInternalVMContext();

      const sender = {
        tab: { id: tabId, url, index: 0 },
        url,
        frameId: 0,
        documentId,
        origin: new URL(url).origin,
      };

      // The USER_SCRIPT world: same document, its own globals.
      const userGlobals = {
        console,
        setTimeout,
        clearTimeout,
        atob,
        btoa,
        TextEncoder,
        TextDecoder,
        Blob: dom.window.Blob,
        DOMParser: dom.window.DOMParser,
        document: dom.window.document,
        location: dom.window.location,
        postMessage: (data, origin) => dom.window.postMessage(data, origin),
        chrome: {
          runtime: {
            sendMessage: (message) => sendFromUserScript(message, sender),
          },
        },
      };
      const userContext = vm.createContext(userGlobals);
      // Inside the VM, `window` must be the context's own global object.
      const userGlobal = vm.runInContext('globalThis', userContext);
      userGlobals.window = userGlobal;
      // window.postMessage events are seen by every world; source is "this window".
      userGlobals.addEventListener = (type, fn) =>
        dom.window.addEventListener(type, (event) =>
          fn({ type: event.type, data: event.data, source: userGlobal })
        );

      const doc = {
        documentId,
        tabId,
        url,
        dom,
        window: dom.window,
        document: dom.window.document,
        userWorld: userContext,
        alive: true,
        runInUserWorld: (code) => vm.runInContext(code, userContext),
        async close() {
          doc.alive = false;
          documents.delete(documentId);
        },
      };
      documents.set(documentId, doc);

      for (const reg of registrationsFor(url)) {
        const code = reg.js.map((source) => source.code).join('\n');
        vm.runInContext(code, reg.world === 'MAIN' ? mainContext : userContext);
      }
      await flush();
      return doc;
    },

    async reload(doc) {
      await doc.close();
      return ext.openPage(doc.url, { tabId: doc.tabId });
    },

    async scriptErrors(scriptId) {
      return (await sendRuntime({ type: 'GET_SCRIPT_ERRORS', scriptId })).errors;
    },
  };

  await ext.sync();
  return ext;
}
