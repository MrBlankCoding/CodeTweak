import { beforeEach, describe, expect, it, vi } from 'vitest';

function createChromeMock(seed = {}) {
  const listeners = {
    runtime: { onMessage: [], onConnect: [], onInstalled: [], onStartup: [] },
    contextMenus: { onClicked: [] },
    webNavigation: { onCommitted: [], onDOMContentLoaded: [], onCompleted: [] },
    tabs: { onRemoved: [], onUpdated: [], onActivated: [] },
  };

  const storageData = {
    scripts: seed.scripts || [],
    settings: {
      enhancedDebugging: true,
      allowExternalResources: true,
      ...seed.settings,
    },
  };

  const addListener = (bucket) => ({
    addListener: (fn) => bucket.push(fn),
  });

  const chrome = {
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    contextMenus: {
      removeAll: vi.fn((cb) => cb && cb()),
      create: vi.fn(() => {}),
      onClicked: addListener(listeners.contextMenus.onClicked),
    },
    runtime: {
      id: 'ext-id',
      lastError: null,
      getManifest: vi.fn(() => ({ version: '1.0.0' })),
      getURL: vi.fn((p) => `chrome-extension://ext-id/${p}`),
      sendMessage: vi.fn((msg, cb) => {
        if (typeof cb === 'function') cb({ result: null });
        return Promise.resolve({ result: null });
      }),
      onMessage: addListener(listeners.runtime.onMessage),
      onConnect: addListener(listeners.runtime.onConnect),
      onInstalled: addListener(listeners.runtime.onInstalled),
      onStartup: addListener(listeners.runtime.onStartup),
    },
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (typeof key === 'string') {
            return { [key]: storageData[key] };
          }
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((k) => [k, storageData[k]]));
          }
          return { ...storageData };
        }),
        set: vi.fn(async (obj) => {
          Object.assign(storageData, obj);
        }),
        remove: vi.fn(async (key) => {
          delete storageData[key];
        }),
      },
    },
    notifications: {
      create: vi.fn((_opts, cb) => cb && cb('notif-id')),
    },
    downloads: {
      download: vi.fn((_opts, cb) => cb && cb(123)),
    },
    offscreen: {
      hasDocument: vi.fn(async () => false),
      createDocument: vi.fn(async () => {}),
    },
    userScripts: {
      register: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      unregister: vi.fn(async () => {}),
    },
    webNavigation: {
      onCommitted: addListener(listeners.webNavigation.onCommitted),
      onDOMContentLoaded: addListener(listeners.webNavigation.onDOMContentLoaded),
      onCompleted: addListener(listeners.webNavigation.onCompleted),
    },
    tabs: {
      query: vi.fn(async (queryInfo) => {
        if (queryInfo?.active) {
          return [{ id: 1, url: 'https://example.com/' }];
        }
        if (queryInfo?.url) {
          return [{ id: 3, url: 'https://example.com/match' }];
        }
        return [
          { id: 1, url: 'https://example.com/a' },
          { id: 2, url: 'chrome://newtab/' },
        ];
      }),
      get: vi.fn(async (id) => ({ id, url: 'https://example.com/x' })),
      create: vi.fn(async () => {}),
      reload: vi.fn(() => {}),
      sendMessage: vi.fn(() => Promise.resolve({})),
      onRemoved: addListener(listeners.tabs.onRemoved),
      onUpdated: addListener(listeners.tabs.onUpdated),
      onActivated: addListener(listeners.tabs.onActivated),
    },
  };

  return { chrome, listeners, storageData };
}

async function setupBackground(seed = {}) {
  vi.resetModules();

  const { chrome, listeners, storageData } = createChromeMock(seed);
  global.chrome = chrome;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    url: 'https://example.com/final',
    headers: { forEach: (cb) => cb('application/json', 'content-type') },
    clone: () => ({ text: async () => '{"ok":true}' }),
    text: async () => '{"ok":true}',
    arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    blob: async () => new Blob(['abc'], { type: 'text/plain' }),
  }));

  await import('../../src/background/background.js');
  return { chrome, listeners, storageData };
}

async function sendRuntimeMessage(listeners, message, sender = { tab: { id: 1 } }) {
  return await new Promise((resolve) => {
    const handler = listeners.runtime.onMessage[0];
    const ret = handler(message, sender, (response) => resolve(response));
    if (ret === false) {
      setTimeout(() => resolve(undefined), 0);
    }
  });
}

describe('background', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles core standard actions and unknown action response', async () => {
    const { listeners, chrome } = await setupBackground({
      scripts: [
        {
          id: 's1',
          name: 'Script 1',
          code: 'console.log(1)',
          enabled: true,
          targetUrls: ['https://example.com/*'],
          runAt: 'document_end',
        },
      ],
    });

    await expect(sendRuntimeMessage(listeners, { action: 'scriptsUpdated' })).resolves.toEqual({
      success: true,
    });
    await expect(
      sendRuntimeMessage(listeners, { action: 'getAllScripts' })
    ).resolves.toHaveProperty('scripts');
    await expect(
      sendRuntimeMessage(listeners, { action: 'getScriptContent', scriptName: 'Script 1' })
    ).resolves.toEqual({ code: 'console.log(1)' });
    await expect(
      sendRuntimeMessage(listeners, { action: 'getScriptContent', scriptName: 'Missing' })
    ).resolves.toHaveProperty('error');
    await expect(sendRuntimeMessage(listeners, { action: 'openAISettings' })).resolves.toEqual({
      success: true,
    });
    await expect(sendRuntimeMessage(listeners, { action: 'unknown' })).resolves.toEqual({
      error: 'Unknown action',
    });

    expect(chrome.tabs.create).toHaveBeenCalled();
    expect(chrome.userScripts.register).toHaveBeenCalled();
  });

  it('handles GM API requests for values/listeners/clipboard/download/requests', async () => {
    const { listeners, chrome } = await setupBackground();

    const add = await sendRuntimeMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: { action: 'addValueChangeListener', scriptId: 's1', name: 'k' },
      },
      { tab: { id: 2 } }
    );
    expect(add).toEqual({ result: null });

    const setRes = await sendRuntimeMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: { action: 'setValue', scriptId: 's1', name: 'k', value: 42 },
      },
      { tab: { id: 1 } }
    );
    expect(setRes).toEqual({ result: null });

    const getRes = await sendRuntimeMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: { action: 'getValue', scriptId: 's1', name: 'k', defaultValue: 0 },
      },
      { tab: { id: 1 } }
    );
    expect(getRes).toEqual({ result: 42 });

    const listRes = await sendRuntimeMessage(
      listeners,
      { type: 'GM_API_REQUEST', payload: { action: 'listValues', scriptId: 's1' } },
      { tab: { id: 1 } }
    );
    expect(listRes).toEqual({ result: ['k'] });

    await sendRuntimeMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: { action: 'setClipboard', scriptId: 's1', data: 'copy me' },
      },
      { tab: { id: 1 } }
    );

    const dlRes = await sendRuntimeMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: {
          action: 'download',
          scriptId: 's1',
          url: 'https://example.com/f.js',
          name: 'f.js',
        },
      },
      { tab: { id: 1 } }
    );
    expect(dlRes).toEqual({ result: { downloadId: 123 } });

    const xhrRes = await sendRuntimeMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: {
          action: 'xmlhttpRequest',
          scriptId: 's1',
          details: {
            url: 'https://example.com/a',
            method: 'POST',
            data: 'x',
            responseType: 'json',
          },
        },
      },
      { tab: { id: 1 } }
    );
    expect(xhrRes.result.status).toBe(200);

    expect(chrome.tabs.sendMessage).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'copy-to-clipboard', target: 'offscreen' })
    );
  });

  it('stores, gets, and clears script errors', async () => {
    const { listeners, storageData } = await setupBackground({
      settings: { enhancedDebugging: true },
    });

    await sendRuntimeMessage(listeners, {
      type: 'SCRIPT_ERROR',
      scriptId: 'sErr',
      error: { message: 'boom', stack: 'at blob:https://x/1:10:2' },
    });

    const got = await sendRuntimeMessage(listeners, {
      type: 'GET_SCRIPT_ERRORS',
      scriptId: 'sErr',
    });
    expect(got.errors.length).toBe(1);

    await sendRuntimeMessage(listeners, { type: 'CLEAR_SCRIPT_ERRORS', scriptId: 'sErr' });
    expect(storageData.scriptErrors_sErr).toBeUndefined();
  });

  it('handles tab, context menu, connection listeners, and lifecycle sync', async () => {
    const { listeners, chrome } = await setupBackground({
      scripts: [
        {
          id: 'lifecycle-script',
          name: 'Lifecycle Script',
          code: 'console.log(1)',
          enabled: true,
          targetUrls: ['https://example.com/*'],
          runAt: 'document_end',
        },
      ],
    });

    listeners.contextMenus.onClicked[0]({ menuItemId: 'selectElement' }, { id: 10 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, { action: 'startSelection' });

    const disconnectListeners = [];
    const port = {
      name: 'CodeTweak',
      postMessage: vi.fn(),
      onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
      onMessage: { addListener: vi.fn() },
    };
    listeners.runtime.onConnect[0](port);
    disconnectListeners[0]();

    listeners.tabs.onUpdated[0](1, { status: 'complete' }, { id: 1, url: 'https://example.com' });
    await listeners.tabs.onActivated[0]({ tabId: 1 });
    listeners.tabs.onRemoved[0](1);

    await listeners.runtime.onInstalled[0]();
    await listeners.runtime.onStartup[0]();

    expect(chrome.action.setBadgeText).toHaveBeenCalled();
    expect(chrome.userScripts.register).toHaveBeenCalled();
  });

  it('handles createScriptFromAI and updateScript', async () => {
    const userscript = `// ==UserScript==\n// @name My AI\n// @match https://example.com/*\n// ==/UserScript==\nconsole.log(1)`;
    const { listeners, storageData, chrome } = await setupBackground({
      scripts: [
        {
          id: 's-upd',
          name: 'Updatable',
          code: 'old',
          enabled: true,
          targetUrls: ['https://example.com/*'],
          runAt: 'document_end',
        },
      ],
    });

    const created = await sendRuntimeMessage(listeners, {
      action: 'createScriptFromAI',
      script: userscript,
      url: 'https://example.com/*',
    });
    expect(created.script.name).toBe('My AI');
    expect(storageData.scripts.length).toBe(2);

    const updated = await sendRuntimeMessage(listeners, {
      action: 'updateScript',
      scriptId: 's-upd',
      code: 'new code',
    });
    expect(updated).toEqual({ success: true });
    expect(chrome.tabs.reload).toHaveBeenCalled();
  });

  it('covers GM and handler error branches', async () => {
    const { listeners, chrome } = await setupBackground({
      settings: { allowExternalResources: false, enhancedDebugging: false },
      scripts: [],
    });

    await expect(
      sendRuntimeMessage(listeners, { type: 'GM_API_REQUEST' }, { tab: { id: 1 } })
    ).resolves.toEqual({ error: 'Request payload is missing.' });

    await expect(
      sendRuntimeMessage(
        listeners,
        { type: 'GM_API_REQUEST', payload: { action: 'nope', scriptId: 's1' } },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'Unknown GM API action: nope' });

    chrome.offscreen = undefined;
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(
      sendRuntimeMessage(
        listeners,
        { type: 'GM_API_REQUEST', payload: { action: 'setClipboard', scriptId: 's1', data: 'x' } },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'Clipboard API is unavailable in this browser.' });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });

    chrome.runtime.lastError = { message: 'notif blocked' };
    await expect(
      sendRuntimeMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'notification', scriptId: 's1', details: { text: 'a' } },
        },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ result: null });
    chrome.runtime.lastError = null;

    chrome.downloads.download = vi.fn((_opts, cb) => {
      chrome.runtime.lastError = { message: 'download failed' };
      cb(undefined);
      chrome.runtime.lastError = null;
    });
    await expect(
      sendRuntimeMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'download', scriptId: 's1', url: 'https://x', name: 'x' },
        },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'download failed' });

    await expect(
      sendRuntimeMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'xmlhttpRequest', scriptId: 's1', details: { url: 'https://x' } },
        },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'Cross-origin requests are disabled by a security setting.' });

    chrome.tabs.query = vi.fn(async () => {
      throw new Error('tab failure');
    });
    await expect(sendRuntimeMessage(listeners, { action: 'getCurrentTab' })).resolves.toEqual({
      error: 'tab failure',
    });

    await expect(
      sendRuntimeMessage(listeners, {
        action: 'updateScript',
        scriptId: 'missing',
        code: 'x',
      })
    ).resolves.toEqual({ error: 'Script with id missing not found.' });
  });

  it('covers createScript and greasyFork error path branches', async () => {
    const { listeners, chrome, storageData } = await setupBackground({
      scripts: [
        {
          id: 'existing',
          name: 'Existing',
          code: '(function(){\\n})();',
          targetUrls: ['https://example.com/*'],
          enabled: true,
          runAt: 'document_end',
        },
      ],
    });

    await expect(
      sendRuntimeMessage(listeners, {
        action: 'createScript',
        data: { url: 'https://example.com/page', template: 'console.log(2);' },
      })
    ).resolves.toEqual({ success: true });
    expect(storageData.scripts[0].code).toContain('Added by element selector');

    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(
      sendRuntimeMessage(listeners, {
        action: 'greasyForkInstall',
        url: 'https://greasyfork.org/scripts/1/code.user.js',
      })
    ).resolves.toEqual({ success: true });

    const ignoredPort = {
      name: 'Other',
      onDisconnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
    };
    listeners.runtime.onConnect[0](ignoredPort);

    chrome.tabs.get = vi.fn(async () => {
      throw new Error('No tab with id');
    });
    await listeners.tabs.onActivated[0]({ tabId: 123 });
  });
});
