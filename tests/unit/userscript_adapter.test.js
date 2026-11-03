import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

import { UserScriptsAdapter } from '../../src/services/scripts/UserScriptsAdapter.js';
import { DependencyCache, parseIntegrity } from '../../src/services/scripts/DependencyCache.js';
import { resolveWorld, gateFor } from '../../src/services/scripts/adapter/scriptNormalizer.js';
import { bytesToHex } from '../../src/shared/utils/hash.js';

describe('UserScriptsAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete global.chrome;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  function createChromeMock({ registered = [] } = {}) {
    const storageData = {};
    const chrome = {
      runtime: {
        id: 'ext-id',
        getManifest: () => ({ version: '9.9.9' }),
      },
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: storageData[key] })),
          set: vi.fn(async (obj) => Object.assign(storageData, obj)),
          remove: vi.fn(async (keys) => [].concat(keys).forEach((k) => delete storageData[k])),
          getKeys: vi.fn(async () => Object.keys(storageData)),
        },
      },
      userScripts: {
        getScripts: vi.fn(async () => registered),
        configureWorld: vi.fn(async () => {}),
        register: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        unregister: vi.fn(async () => {}),
      },
    };

    global.chrome = chrome;
    return { chrome, storageData };
  }

  const script = (overrides = {}) => ({
    id: 's1',
    name: 'One',
    code: 'console.log("one")',
    enabled: true,
    runAt: 'document-end',
    targetUrls: ['https://example.com/*'],
    ...overrides,
  });

  it('picks the USER_SCRIPT world for privileged grants and MAIN for grant none', () => {
    expect(resolveWorld(script({ gmXmlhttpRequest: true }))).toBe('USER_SCRIPT');
    expect(resolveWorld(script({ gmSetValue: true }))).toBe('USER_SCRIPT');
    expect(resolveWorld(script({ gmAddStyle: true, unsafeWindow: true }))).toBe('MAIN');
    expect(resolveWorld(script({ injectInto: 'isolated' }))).toBe('USER_SCRIPT');
    expect(resolveWorld(script({ injectInto: 'main', gmSetValue: true }))).toBe('MAIN');
    // 'ISOLATED' is not a valid userScripts world and must never be produced.
    expect(resolveWorld(script({ injectInto: 'isolated' }))).not.toBe('ISOLATED');
  });

  it('configures messaging and registers new scripts', async () => {
    const { chrome } = createChromeMock();
    const adapter = new UserScriptsAdapter();

    const result = await adapter.syncEnabledScripts([
      script({ gmSetValue: true }),
      script({ id: 's2', targetUrls: ['https://example.org/*'], injectInto: 'isolated' }),
      script({ id: 's3', enabled: false }),
    ]);

    expect(result).toEqual(
      expect.objectContaining({ usingUserScripts: true, added: 2, updated: 0, removed: 0 })
    );
    expect(chrome.userScripts.configureWorld).toHaveBeenCalledWith(
      expect.objectContaining({ messaging: true })
    );
    const regs = chrome.userScripts.register.mock.calls[0][0];
    expect(regs.map((r) => r.id)).toEqual(['ct-us-s1', 'ct-us-s2']);
    expect(regs[0]).toEqual(
      expect.objectContaining({ runAt: 'document_end', world: 'USER_SCRIPT', allFrames: true })
    );
    // GM APIs are scoped parameters, never window globals.
    expect(regs[0].js[0].code).not.toContain('window.GM_setValue');
    expect(regs[0].js[0].code).toContain('GM_setValue');
  });

  it('only touches registrations that changed', async () => {
    createChromeMock();
    const first = new UserScriptsAdapter();
    const scripts = [script({ gmSetValue: true }), script({ id: 's2', gmSetValue: true })];
    await first.syncEnabledScripts(scripts);
    const registered = global.chrome.userScripts.register.mock.calls[0][0];

    const { chrome } = createChromeMock({ registered: [...registered, { id: 'ct-us-gone' }] });
    const adapter = new UserScriptsAdapter();
    const result = await adapter.syncEnabledScripts([
      scripts[0],
      { ...scripts[1], code: 'changed()' },
    ]);

    expect(result).toEqual(expect.objectContaining({ added: 0, updated: 1, removed: 1 }));
    expect(chrome.userScripts.unregister).toHaveBeenCalledWith({ ids: ['ct-us-gone'] });
    expect(chrome.userScripts.update.mock.calls[0][0].map((r) => r.id)).toEqual(['ct-us-s2']);
    expect(chrome.userScripts.register).not.toHaveBeenCalled();
  });

  it('adds an error bridge only when Main World scripts exist', async () => {
    const { chrome } = createChromeMock();
    await new UserScriptsAdapter().syncEnabledScripts([script()]);
    const ids = chrome.userScripts.register.mock.calls[0][0].map((r) => r.id);
    expect(ids).toContain('ct-sys-error-bridge');

    const isolated = createChromeMock();
    await new UserScriptsAdapter().syncEnabledScripts([script({ gmSetValue: true })]);
    const isolatedIds = isolated.chrome.userScripts.register.mock.calls[0][0].map((r) => r.id);
    expect(isolatedIds).not.toContain('ct-sys-error-bridge');
  });

  it('inlines cached @require code and reports missing dependencies', async () => {
    createChromeMock();
    const fetchImpl = vi.fn(async (url) =>
      url.includes('ok.js')
        ? { ok: true, arrayBuffer: async () => new TextEncoder().encode('var LIB = 1;').buffer }
        : { ok: false, status: 404 }
    );
    const adapter = new UserScriptsAdapter({
      dependencyCache: new DependencyCache(global.chrome.storage, fetchImpl),
    });

    const reg = await adapter.toRegistration(
      script({ requires: ['https://cdn.test/ok.js', 'https://cdn.test/missing.js'] })
    );
    expect(reg.js[0].code).toContain('var LIB = 1;');
    expect(reg.js[0].code).not.toContain("createElement('script')");
    expect(reg.js[0].code).toContain('"missingDependencies":["https://cdn.test/missing.js"]');

    // Second build is served from the cache.
    await adapter.toRegistration(script({ requires: ['https://cdn.test/ok.js'] }));
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('ok.js'))).toHaveLength(1);
  });

  it('verifies @require integrity hashes', async () => {
    createChromeMock();
    const body = new TextEncoder().encode('var SAFE = 1;');
    const hex = bytesToHex(await webcrypto.subtle.digest('SHA-256', body));
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => body.buffer }));
    const cache = new DependencyCache(global.chrome.storage, fetchImpl);

    expect(parseIntegrity(`https://x/a.js#sha256=${hex}`)).toEqual([
      { algorithm: 'sha256', value: hex },
    ]);
    const good = await cache.resolve({ requires: [`https://x/a.js#sha256=${hex}`] });
    expect(good.requires).toEqual(['var SAFE = 1;']);
    const bad = await cache.resolve({ requires: ['https://x/b.js#sha256=deadbeef'] });
    expect(bad.missing).toEqual(['https://x/b.js#sha256=deadbeef']);
    // Fragments are not sent to the server.
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x/a.js');
  });

  it('blocks non-HTTPS @require URLs', async () => {
    createChromeMock();
    const fetchImpl = vi.fn();
    const cache = new DependencyCache(global.chrome.storage, fetchImpl);
    const result = await cache.resolve({ requires: ['http://insecure.test/lib.js'] });
    expect(result.missing).toEqual(['http://insecure.test/lib.js']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('applies @exclude globs and regex @include gates', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const reg = await adapter.toRegistration(
      script({
        excludes: ['*://example.com/private/*', '/logout/'],
        includeRegexes: ['^https://news\\.test/'],
        noframes: true,
      })
    );
    expect(reg.matches).toEqual(['*://*/*']);
    expect(reg.excludeGlobs).toEqual(['*://example.com/private/*']);
    expect(reg.allFrames).toBe(false);
    expect(reg.js[0].code).toContain('"gate":{"include":[');

    const gate = gateFor(script({ excludes: ['/logout/', 'https://a.test/*'] }));
    expect(gate.excludeRegexes).toEqual(['logout', '^https://a\\.test/.*$']);
  });

  it('returns unsupported when the userScripts API is disabled', async () => {
    global.chrome = {
      runtime: { id: 'ext-id', getManifest: () => ({ version: '1.0.0' }) },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      get userScripts() {
        throw new Error('The userScripts API is not available');
      },
    };

    const adapter = new UserScriptsAdapter();
    await expect(adapter.syncEnabledScripts([script()])).resolves.toEqual({
      usingUserScripts: false,
    });
  });

  it('serializes concurrent sync calls', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    let active = 0;
    let maxActive = 0;
    vi.spyOn(adapter, '_doSyncEnabledScripts').mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return { usingUserScripts: true };
    });

    await Promise.all([
      adapter.syncEnabledScripts([]),
      adapter.syncEnabledScripts([]),
      adapter.syncEnabledScripts([]),
    ]);
    expect(maxActive).toBe(1);
  });

  it('reports failure when registration throws outright', async () => {
    const { chrome } = createChromeMock();
    chrome.userScripts.unregister.mockRejectedValue(new Error('boom'));
    chrome.userScripts.getScripts.mockResolvedValue([{ id: 'ct-us-old' }]);
    const result = await new UserScriptsAdapter().syncEnabledScripts([]);
    expect(result.usingUserScripts).toBe(false);
  });
});
