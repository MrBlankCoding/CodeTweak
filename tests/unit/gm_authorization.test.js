import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageRouter, GM_API_ACTIONS } from '../../src/background/handlers/MessageRouter.js';

const MATCHING_TAB = { id: 1, url: 'https://example.com/page' };

function grantedScript(overrides = {}) {
  return {
    id: 's1',
    name: 'S1',
    enabled: true,
    targetUrls: ['https://example.com/*'],
    connect: ['api.example.com'],
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
  };
}

function createChromeMock(seed = {}) {
  const storageData = {
    scripts: seed.scripts || [],
    settings: { allowExternalResources: true, ...seed.settings },
  };
  return {
    chrome: {
      runtime: { id: 'ext-id', lastError: null, sendMessage: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async (key) => {
            if (typeof key === 'string') return { [key]: storageData[key] };
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
      tabs: {
        sendMessage: vi.fn(),
        create: vi.fn(async () => ({ id: 7 })),
      },
    },
    storageData,
  };
}

async function setupRouter(seed = {}) {
  vi.resetModules();
  const { chrome, storageData } = createChromeMock(seed);
  global.chrome = chrome;
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    url: 'https://api.example.com/final',
    headers: { forEach: (cb) => cb('application/json', 'content-type') },
    clone: () => ({ text: async () => '{"ok":true}' }),
    text: async () => '{"ok":true}',
    arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    blob: async () => new Blob(['abc'], { type: 'text/plain' }),
  }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const router = new MessageRouter({
    state: { valueChangeListeners: new Map() },
    scriptRegistry: {},
    messageHandlers: {},
    displayService: {},
  });
  return { router, chrome, storageData };
}

function gmRequest(payload) {
  return { type: 'GM_API_REQUEST', payload };
}

async function dispatch(router, message, sender = { tab: MATCHING_TAB }) {
  return await new Promise((resolve) => {
    router.handleUserScriptMessage(message, sender, (response) => resolve(response));
  });
}

describe('GM API router whitelist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports the exact public bridge action whitelist', async () => {
    await setupRouter();
    expect([...GM_API_ACTIONS].sort()).toEqual(
      [
        'getAllValues',
        'setValue',
        'deleteValue',
        'xhrAbort',
        'reportError',
        'openInTab',
        'notification',
        'setClipboard',
        'download',
        'xmlhttpRequest',
      ].sort()
    );
  });

  describe('internal utility actions are unreachable', () => {
    const forbidden = [
      'getStorage',
      'setStorage',
      'notifyValueChange',
      'authorize',
      'constructor',
      'addValueChangeListener',
      'getValue',
      'listValues',
    ];

    for (const action of forbidden) {
      it(`refuses "${action}" even when scripts match and grants exist`, async () => {
        const { router } = await setupRouter({ scripts: [grantedScript()] });
        const payload =
          action === 'setStorage'
            ? { action, scriptId: 's1', values: { hacked: true } }
            : { action, scriptId: 's1' };
        await expect(dispatch(router, gmRequest(payload))).resolves.toEqual({
          error: `Unknown GM API action: ${action}`,
        });
      });
    }

    it('refuses unknown actions with the same error copy', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, gmRequest({ action: 'nope', scriptId: 's1' }))
      ).resolves.toEqual({ error: 'Unknown GM API action: nope' });
    });

    it('refuses actions that are merely close to public names', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, gmRequest({ action: 'streamFile', scriptId: 's1' }))
      ).resolves.toEqual({ error: 'Unknown GM API action: streamFile' });
    });

    it('refuses forbidden actions regardless of sender tab URL match', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, gmRequest({ action: 'getStorage', scriptId: 's1' }), {
          tab: { id: 2, url: 'https://example.com/' },
        })
      ).resolves.toEqual({ error: 'Unknown GM API action: getStorage' });
    });
  });

  describe('setValue keeps working through the whitelist', () => {
    it('stores a value on the authorized grant path and reads it back', async () => {
      const { router, storageData } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, gmRequest({ action: 'setValue', scriptId: 's1', name: 'k', value: 42 }))
      ).resolves.toEqual({ result: null });
      expect(storageData['script-values-s1']).toEqual({ k: 42 });

      await expect(
        dispatch(router, gmRequest({ action: 'getAllValues', scriptId: 's1' }))
      ).resolves.toEqual({ result: { k: 42 } });
    });

    it('keeps the 100KB-per-value limit', async () => {
      const { router, storageData } = await setupRouter({ scripts: [grantedScript()] });
      const big = 'a'.repeat(100_001);
      await expect(
        dispatch(router, gmRequest({ action: 'setValue', scriptId: 's1', name: 'big', value: big }))
      ).resolves.toEqual({ error: 'Value exceeds 100KB limit' });
      // rejected before any storage write
      expect(storageData['script-values-s1']).toBeUndefined();
    });

    it('keeps the 1000-key store limit', async () => {
      const { router } = await setupRouter({
        scripts: [grantedScript()],
      });
      const base = { ...Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`k${i}`, i])) };
      global.chrome.storage.local.set({ 'script-values-s1': base });
      await expect(
        dispatch(
          router,
          gmRequest({ action: 'setValue', scriptId: 's1', name: 'overflow', value: 1 })
        )
      ).resolves.toEqual({ error: 'Value store is full (1000 keys max)' });
    });
  });

  describe('per-API grant flags', () => {
    it('denies sensitive APIs without an explicit truthy flag', async () => {
      const { router } = await setupRouter({
        scripts: [grantedScript({ gmNotification: false, gmSetClipboard: undefined })],
      });
      await expect(
        dispatch(router, gmRequest({ action: 'notification', scriptId: 's1', details: {} }))
      ).resolves.toEqual({ error: 'API not granted for this script: notification.' });
      await expect(
        dispatch(router, gmRequest({ action: 'setClipboard', scriptId: 's1', data: 'x' }))
      ).resolves.toEqual({ error: 'API not granted for this script: setClipboard.' });
    });

    it('allows sensitive APIs when the flag is exactly true', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(
          router,
          gmRequest({ action: 'openInTab', scriptId: 's1', url: 'https://example.com/x' })
        )
      ).resolves.toEqual({ result: { tabId: 7 } });
    });
  });

  describe('sender tab binding', () => {
    it('denies when the sender tab URL does not match script targets', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, gmRequest({ action: 'setValue', scriptId: 's1', name: 'k', value: 1 }), {
          tab: { id: 1, url: 'https://evil.com/' },
        })
      ).resolves.toEqual({ error: 'Sender tab does not match script targets.' });
    });

    it('enforces scriptId format validation', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(
          router,
          gmRequest({ action: 'setValue', scriptId: '../../evil', name: 'k', value: 1 })
        )
      ).resolves.toEqual({ error: 'Unknown or invalid script.' });
    });

    it('denies disabled scripts', async () => {
      const { router } = await setupRouter({
        scripts: [grantedScript({ enabled: false })],
      });
      await expect(
        dispatch(router, gmRequest({ action: 'setValue', scriptId: 's1', name: 'k', value: 1 }))
      ).resolves.toEqual({ error: 'Unknown or disabled script.' });
    });
  });

  describe('GM_xmlhttpRequest @connect enforcement', () => {
    const xhr = (url, extraPayload = {}) =>
      gmRequest({
        action: 'xmlhttpRequest',
        scriptId: 's1',
        details: { url, method: 'GET' },
        ...extraPayload,
      });

    it('allows an exact host listed in @connect', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      const res = await dispatch(router, xhr('https://api.example.com/v1'), { tab: MATCHING_TAB });
      expect(res).toEqual(expect.objectContaining({ result: expect.anything() }));
    });

    it('denies a host not listed in @connect (exact mismatch, no subdomain games)', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, xhr('https://notevil.com/'), { tab: MATCHING_TAB })
      ).resolves.toEqual({ error: 'GM_xmlhttpRequest host is not in @connect list.' });
    });

    it.each([
      // wildcard entry matching subdomains and the bare base domain
      [grantedScript({ connect: ['*.example.com'] }), 'https://foo.example.com/a'],
      [grantedScript({ connect: ['*.example.com'] }), 'https://a.b.example.com/a'],
      [grantedScript({ connect: ['*.example.com'] }), 'https://example.com/a'],
      [grantedScript({ connect: ['.example.com'] }), 'https://foo.example.com/a'],
      // plain entry matches the domain exactly and any of its subdomains
      [grantedScript({ connect: ['api.example.com'] }), 'https://api.example.com/v1'],
      [grantedScript({ connect: ['example.com'] }), 'https://example.com/a'],
      [grantedScript({ connect: ['example.com'] }), 'https://sub.example.com/a'],
      // plain entries also subsume deeper subdomains (a plain entry is
      // equivalent to the bare domain plus any of its subdomains)
      [grantedScript({ connect: ['API.example.com'] }), 'https://sub.api.example.com/'],
    ])('connect %# allows a request to %s', async (script, url) => {
      const { router } = await setupRouter({ scripts: [script] });
      const res = await dispatch(router, xhr(url), { tab: MATCHING_TAB });
      expect(res).not.toHaveProperty('error', 'GM_xmlhttpRequest host is not in @connect list.');
    });

    it.each([
      [grantedScript({ connect: ['api.example.com'] }), 'https://evil.com/'],
      [grantedScript({ connect: ['evil.com'] }), 'https://notevil.com/'],
      [grantedScript({ connect: ['*.example.com'] }), 'https://notexample.com/a'],
    ])('deny case %# denies %s', async (script, url) => {
      const { router } = await setupRouter({ scripts: [script] });
      await expect(dispatch(router, xhr(url), { tab: MATCHING_TAB })).resolves.toEqual({
        error: 'GM_xmlhttpRequest host is not in @connect list.',
      });
    });

    it('allows every host when the connect list contains "*" (legacy allow-all)', async () => {
      const { router } = await setupRouter({
        scripts: [grantedScript({ connect: ['*'] })],
      });
      const res = await dispatch(router, xhr('https://anything.tld/x'), { tab: MATCHING_TAB });
      expect(res).not.toHaveProperty('error', 'GM_xmlhttpRequest host is not in @connect list.');
    });

    it('allows every host when connect is absent (legacy script)', async () => {
      const { router } = await setupRouter({
        scripts: [grantedScript({ connect: undefined })],
      });
      const res = await dispatch(router, xhr('https://legacy-host.example/x'), {
        tab: MATCHING_TAB,
      });
      expect(res).not.toHaveProperty('error', 'GM_xmlhttpRequest host is not in @connect list.');
    });

    it('allows every host when connect is an empty array (legacy allow-all)', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript({ connect: [] })] });
      const res = await dispatch(router, xhr('https://empty-connect.example/x'), {
        tab: MATCHING_TAB,
      });
      expect(res).not.toHaveProperty('error', 'GM_xmlhttpRequest host is not in @connect list.');
    });

    it('denies invalid URLs when a concrete connect list exists', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(dispatch(router, xhr('not a url'), { tab: MATCHING_TAB })).resolves.toEqual({
        error: 'GM_xmlhttpRequest host is not in @connect list.',
      });
      await expect(dispatch(router, xhr(undefined), { tab: MATCHING_TAB })).resolves.toEqual({
        error: 'GM_xmlhttpRequest host is not in @connect list.',
      });
      await expect(
        dispatch(
          router,
          gmRequest({ action: 'xmlhttpRequest', scriptId: 's1', details: { url: {} } }),
          { tab: MATCHING_TAB }
        )
      ).resolves.toEqual({ error: 'GM_xmlhttpRequest host is not in @connect list.' });
    });

    it('matches hostnames case-insensitively against lowercase entries', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      const res = await dispatch(router, xhr('https://API.Example.COM/v1'), { tab: MATCHING_TAB });
      expect(res).not.toHaveProperty('error', 'GM_xmlhttpRequest host is not in @connect list.');
    });

    it('denies requests without details object', async () => {
      const { router } = await setupRouter({ scripts: [grantedScript()] });
      await expect(
        dispatch(router, gmRequest({ action: 'xmlhttpRequest', scriptId: 's1' }), {
          tab: MATCHING_TAB,
        })
      ).resolves.toEqual({ error: 'GM_xmlhttpRequest host is not in @connect list.' });
    });
  });
});
