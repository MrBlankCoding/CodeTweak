import { beforeEach, describe, expect, it, vi } from 'vitest';

function createChromeMock(seed = {}) {
  const listeners = {
    runtime: {
      onMessage: [],
      onUserScriptMessage: [],
      onConnect: [],
      onInstalled: [],
      onStartup: [],
    },
    notifications: { onClicked: [], onClosed: [] },
    contextMenus: { onClicked: [] },
    webNavigation: { onCommitted: [], onDOMContentLoaded: [], onCompleted: [] },
    tabs: { onRemoved: [], onUpdated: [], onActivated: [] },
  };

  const sessionData = {};
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
      onUserScriptMessage: addListener(listeners.runtime.onUserScriptMessage),
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
      session: {
        get: vi.fn(async (key) => ({ [key]: sessionData[key] })),
        set: vi.fn(async (obj) => Object.assign(sessionData, obj)),
        remove: vi.fn(async (key) => {
          delete sessionData[key];
        }),
      },
    },
    notifications: {
      create: vi.fn((id, _opts, cb) => cb && cb(id)),
      clear: vi.fn((_id, cb) => cb && cb(true)),
      onClicked: addListener(listeners.notifications.onClicked),
      onClosed: addListener(listeners.notifications.onClosed),
    },
    scripting: {
      executeScript: vi.fn(async () => [{ result: false }]),
      insertCSS: vi.fn(async () => {}),
    },
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: vi.fn() },
      get: vi.fn((_name, cb) => cb && cb(null)),
    },
    downloads: {
      download: vi.fn((_opts, cb) => cb && cb(123)),
    },
    offscreen: {
      hasDocument: vi.fn(async () => false),
      createDocument: vi.fn(async () => {}),
    },
    userScripts: {
      getScripts: vi.fn(async () => []),
      configureWorld: vi.fn(async () => {}),
      execute: vi.fn(async () => [{ result: undefined }]),
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

// GM API calls come from the USER_SCRIPT world via runtime.onUserScriptMessage.
async function sendUserScriptMessage(listeners, message, sender = { tab: { id: 1 } }) {
  return await new Promise((resolve) => {
    const handler = listeners.runtime.onUserScriptMessage[0];
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
    await expect(sendRuntimeMessage(listeners, { action: 'unknown' })).resolves.toEqual({
      error: 'Unknown action',
    });
    // Removed AI editor actions are no longer handled.
    for (const action of [
      'openAISettings',
      'createScriptFromAI',
      'updateScript',
      'getAllScripts',
    ]) {
      await expect(sendRuntimeMessage(listeners, { action })).resolves.toEqual({
        error: 'Unknown action',
      });
    }

    expect(chrome.userScripts.register).toHaveBeenCalled();
  });

  it('handles GM API requests for values/listeners/clipboard/download/requests', async () => {
    const gmScript = (overrides = {}) => ({
      id: 's1',
      name: 'S1',
      enabled: true,
      gmSetValue: true,
      gmGetValue: true,
      gmDeleteValue: true,
      gmListValues: true,
      gmAddValueChangeListener: true,
      gmRemoveValueChangeListener: true,
      gmOpenInTab: true,
      gmNotification: true,
      gmSetClipboard: true,
      gmDownload: true,
      gmXmlhttpRequest: true,
      ...overrides,
    });
    const { listeners, chrome } = await setupBackground({ scripts: [gmScript()] });

    // A second document subscribes by loading its value snapshot.
    const snapshot = await sendUserScriptMessage(
      listeners,
      { type: 'GM_API_REQUEST', payload: { action: 'getAllValues', scriptId: 's1' } },
      { tab: { id: 2 }, documentId: 'doc-2' }
    );
    expect(snapshot).toEqual({ result: {} });

    const setRes = await sendUserScriptMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: { action: 'setValue', scriptId: 's1', name: 'k', value: 42 },
      },
      { tab: { id: 1 }, documentId: 'doc-1' }
    );
    expect(setRes).toEqual({ result: null });
    await vi.waitFor(() =>
      expect(chrome.userScripts.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 2, documentIds: ['doc-2'] },
          world: 'USER_SCRIPT',
        })
      )
    );
    const pushed = chrome.userScripts.execute.mock.calls[0][0].js[0].code;
    expect(pushed).toContain('"valueChanged"');
    expect(pushed).toContain('"remote":true');

    const getRes = await sendUserScriptMessage(
      listeners,
      { type: 'GM_API_REQUEST', payload: { action: 'getAllValues', scriptId: 's1' } },
      { tab: { id: 1 } }
    );
    expect(getRes).toEqual({ result: { k: 42 } });

    await sendUserScriptMessage(
      listeners,
      {
        type: 'GM_API_REQUEST',
        payload: { action: 'setClipboard', scriptId: 's1', data: 'copy me' },
      },
      { tab: { id: 1 } }
    );

    const dlRes = await sendUserScriptMessage(
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

    const xhrRes = await sendUserScriptMessage(
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

    await sendUserScriptMessage(listeners, {
      type: 'GM_API_REQUEST',
      payload: { action: 'deleteValue', scriptId: 's1', name: 'k' },
    });
    const afterDelete = await sendUserScriptMessage(listeners, {
      type: 'GM_API_REQUEST',
      payload: { action: 'getAllValues', scriptId: 's1' },
    });
    expect(afterDelete.result).toEqual({});

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'copy-to-clipboard', target: 'offscreen' })
    );
  });

  it('stores, gets, and clears script errors', async () => {
    const { listeners, storageData } = await setupBackground({
      settings: { enhancedDebugging: true },
      scripts: [{ id: 'sErr', enabled: true, targetUrls: ['https://example.com/*'] }],
    });

    await sendUserScriptMessage(listeners, {
      type: 'GM_API_REQUEST',
      payload: {
        action: 'reportError',
        scriptId: 'sErr',
        error: { message: 'boom', stack: 'at blob:https://x/1:10:2' },
      },
    });

    const got = await sendRuntimeMessage(listeners, {
      type: 'GET_SCRIPT_ERRORS',
      scriptId: 'sErr',
    });
    expect(got.errors.length).toBe(1);

    await sendRuntimeMessage(listeners, { type: 'CLEAR_SCRIPT_ERRORS', scriptId: 'sErr' });
    expect(storageData.scriptErrors_sErr).toBeUndefined();
  });

  it('handles tab, context menu, and lifecycle sync', async () => {
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

    await listeners.contextMenus.onClicked[0]({ menuItemId: 'selectElement' }, { id: 10 });
    // Page tools are injected on demand before the selector starts.
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.arrayContaining(['elementSelector/main.js']) })
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      10,
      { action: 'startSelection' },
      expect.any(Function)
    );

    listeners.tabs.onUpdated[0](1, { status: 'complete' }, { id: 1, url: 'https://example.com' });
    await listeners.tabs.onActivated[0]({ tabId: 1 });
    listeners.tabs.onRemoved[0](1);

    await listeners.runtime.onInstalled[0]();
    await listeners.runtime.onStartup[0]();

    expect(chrome.action.setBadgeText).toHaveBeenCalled();
    expect(chrome.userScripts.register).toHaveBeenCalled();
  });

  it('covers GM and handler error branches', async () => {
    const { listeners, chrome } = await setupBackground({
      settings: { allowExternalResources: false, enhancedDebugging: false },
      scripts: [
        {
          id: 's1',
          enabled: true,
          gmSetClipboard: true,
          gmNotification: true,
          gmDownload: true,
          gmXmlhttpRequest: true,
        },
      ],
    });

    await expect(
      sendUserScriptMessage(listeners, { type: 'GM_API_REQUEST' }, { tab: { id: 1 } })
    ).resolves.toEqual({ error: 'Request payload is missing.' });

    await expect(
      sendUserScriptMessage(
        listeners,
        { type: 'GM_API_REQUEST', payload: { action: 'nope', scriptId: 's1' } },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'Unknown GM API action: nope' });

    chrome.offscreen = undefined;
    const originalScripting = chrome.scripting;
    chrome.scripting = undefined;
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(
      sendUserScriptMessage(
        listeners,
        { type: 'GM_API_REQUEST', payload: { action: 'setClipboard', scriptId: 's1', data: 'x' } },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'Clipboard API is unavailable in this browser context.' });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    chrome.scripting = originalScripting;

    chrome.runtime.lastError = { message: 'notif blocked' };
    await expect(
      sendUserScriptMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'notification', scriptId: 's1', details: { text: 'a' } },
        },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'notif blocked' });
    chrome.runtime.lastError = null;

    chrome.downloads.download = vi.fn((_opts, cb) => {
      chrome.runtime.lastError = { message: 'download failed' };
      cb(undefined);
      chrome.runtime.lastError = null;
    });
    await expect(
      sendUserScriptMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'download', scriptId: 's1', url: 'https://x', name: 'x' },
        },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'download failed' });

    await expect(
      sendUserScriptMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'xmlhttpRequest', scriptId: 's1', details: { url: 'https://x' } },
        },
        { tab: { id: 1 } }
      )
    ).resolves.toEqual({ error: 'Cross-origin requests are disabled by a security setting.' });
  });

  it('covers CLEAR_SCRIPT_ERRORS and extra message branches', async () => {
    const { listeners } = await setupBackground({
      scripts: [{ id: 's1', name: 'S1', enabled: true, gmAddValueChangeListener: true }],
    });

    await expect(
      sendRuntimeMessage(listeners, { type: 'CLEAR_SCRIPT_ERRORS', scriptId: 's1' })
    ).resolves.toEqual({ success: true });

    // GM requests are not accepted from extension/content-script messaging.
    await expect(
      sendRuntimeMessage(listeners, {
        type: 'GM_API_REQUEST',
        payload: { action: 'getValue', scriptId: 's1', name: 'k' },
      })
    ).resolves.toEqual({ error: 'Unknown action' });
    // And the user script channel accepts nothing but GM requests.
    await expect(sendUserScriptMessage(listeners, { action: 'getAllScripts' })).resolves.toEqual({
      error: 'Unsupported message.',
    });
  });

  it('rejects GM API calls from unknown, disabled, or ungranted scripts', async () => {
    const { listeners } = await setupBackground({
      scripts: [
        {
          id: 'ok',
          enabled: true,
          gmSetValue: true,
          targetUrls: ['https://example.com/*'],
        },
        { id: 'disabled', enabled: false, gmSetValue: true },
        { id: 'ungranted', enabled: true, gmSetValue: false },
        { id: 'legacy-sensitive', enabled: true, gmDownload: true },
      ],
    });

    await expect(
      sendUserScriptMessage(listeners, {
        type: 'GM_API_REQUEST',
        payload: { action: 'setValue', scriptId: 'ghost', name: 'k', value: 1 },
      })
    ).resolves.toEqual({ error: 'Unknown or disabled script.' });

    await expect(
      sendUserScriptMessage(listeners, {
        type: 'GM_API_REQUEST',
        payload: { action: 'setValue', scriptId: 'disabled', name: 'k', value: 1 },
      })
    ).resolves.toEqual({ error: 'Unknown or disabled script.' });

    await expect(
      sendUserScriptMessage(listeners, {
        type: 'GM_API_REQUEST',
        payload: { action: 'setValue', scriptId: 'ungranted', name: 'k', value: 1 },
      })
    ).resolves.toEqual({ error: 'API not granted for this script: setValue.' });

    await expect(
      sendUserScriptMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'setValue', scriptId: 'ok', name: 'k', value: 1 },
        },
        { tab: { id: 1, url: 'https://evil.com/' } }
      )
    ).resolves.toEqual({ error: 'Sender tab does not match script targets.' });

    await expect(
      sendUserScriptMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: { action: 'setValue', scriptId: 'ok', name: 'k', value: 1 },
        },
        { tab: { id: 1, url: 'https://example.com/page' } }
      )
    ).resolves.toEqual({ result: null });

    // Sensitive APIs default-deny for scripts without explicit flags.
    await expect(
      sendUserScriptMessage(listeners, {
        type: 'GM_API_REQUEST',
        payload: { action: 'download', scriptId: 'ok', url: 'https://x', name: 'x' },
      })
    ).resolves.toEqual({ error: 'API not granted for this script: download.' });

    // Explicit true still grants.
    await expect(
      sendUserScriptMessage(
        listeners,
        {
          type: 'GM_API_REQUEST',
          payload: {
            action: 'download',
            scriptId: 'legacy-sensitive',
            url: 'https://x',
            name: 'x',
          },
        },
        { tab: { id: 1 } }
      )
    ).not.resolves.toEqual({ error: 'API not granted for this script: download.' });

    await expect(
      sendUserScriptMessage(listeners, {
        type: 'GM_API_REQUEST',
        payload: { action: 'setValue', scriptId: '../../evil', name: 'k', value: 1 },
      })
    ).resolves.toEqual({ error: 'Unknown or invalid script.' });
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

    chrome.tabs.get = vi.fn(async () => {
      throw new Error('No tab with id');
    });
    await listeners.tabs.onActivated[0]({ tabId: 123 });
  });
});
