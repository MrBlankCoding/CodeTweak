import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserScriptsAdapter } from '../../src/services/scripts/UserScriptsAdapter.js';

describe('UserScriptsAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete global.browser;
    delete global.chrome;
  });

  function createChromeMock() {
    const storageData = {
      userScriptRegistrationIds: ['ct-us-old-script'],
      'script-values-s1': { alpha: 1 },
      'script-values-s2': { beta: 2 },
    };

    const chrome = {
      runtime: {
        id: 'ext-id',
        getManifest: () => ({ version: '9.9.9' }),
      },
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: storageData[key] })),
          set: vi.fn(async (obj) => Object.assign(storageData, obj)),
        },
      },
      userScripts: {
        register: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        unregister: vi.fn(async () => {}),
      },
    };

    global.chrome = chrome;
    return { chrome, storageData };
  }

  it('syncs enabled scripts and persists registration ids', async () => {
    const { chrome, storageData } = createChromeMock();
    const adapter = new UserScriptsAdapter();

    const scripts = [
      {
        id: 's1',
        name: 'One',
        code: 'console.log("one")',
        enabled: true,
        runAt: 'document-end',
        injectInto: 'main',
        targetUrls: ['https://example.com/*'],
        gmSetValue: true,
      },
      {
        id: 's2',
        name: 'Two',
        code: 'console.log("two")',
        enabled: true,
        runAt: 'document_start',
        injectInto: 'isolated',
        targetUrls: ['https://example.org/*'],
      },
      {
        id: 's3',
        name: 'Disabled',
        code: 'console.log("off")',
        enabled: false,
        targetUrls: ['https://example.net/*'],
      },
    ];

    const result = await adapter.syncEnabledScripts(scripts);

    expect(result).toEqual({ usingUserScripts: true });
    expect(chrome.userScripts.unregister).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['ct-us-old-script'] }),
      expect.any(Function)
    );
    expect(chrome.userScripts.register).toHaveBeenCalledTimes(1);
    expect(chrome.userScripts.update).toHaveBeenCalledTimes(0);

    const registrations = chrome.userScripts.register.mock.calls[0][0];
    expect(registrations).toHaveLength(2);
    expect(registrations[0].id).toBe('ct-us-s1');
    expect(registrations[0].runAt).toBe('document_end');
    expect(registrations[0].world).toBe('MAIN');
    expect(registrations[0].js[0].code).toContain('GM_setValue');
    expect(registrations[0].js[0].code).toContain('__ctLoadRequires');
    expect(registrations[1].world).toBe('ISOLATED');

    expect(storageData.userScriptRegistrationIds.sort()).toEqual(['ct-us-s1', 'ct-us-s2']);
  });

  it('preserves template literals in embedded user code', async () => {
    const { chrome } = createChromeMock();
    const adapter = new UserScriptsAdapter();

    const scripts = [
      {
        id: 's-esc',
        name: 'Escaper',
        code: 'GM_addStyle(`.x{color:red}`); const t = `${1+1}`;',
        enabled: true,
        runAt: 'document_end',
        targetUrls: ['https://example.com/*'],
      },
    ];

    await adapter.syncEnabledScripts(scripts);

    const registrations = chrome.userScripts.register.mock.calls[0][0];
    const generated = registrations[0].js[0].code;
    expect(generated).toContain('GM_addStyle(`.x{color:red}`)');
    expect(generated).toContain('const t = `${1+1}`');
  });

  it('generates syntactically valid bootstrap for tricky template-heavy user code', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();

    const trickyUserCode = `
const panelId = "tm-tester-panel";
GM_addStyle(\`
  #\${panelId} {
    color: red;
  }
\`);
const note = \`value=\${1 + 2}\`;
const rx = /^http:\\/\\//i;
if (!rx.test("https://example.com")) {
  throw new Error("regex sanity failed");
}
`;

    const registration = await adapter.toRegistration({
      id: 's-sanitize',
      name: 'Sanitize Test',
      code: trickyUserCode,
      enabled: true,
      runAt: 'document_end',
      targetUrls: ['https://example.com/*'],
    });

    const generated = registration.js[0].code;

    expect(() => new Function(generated)).not.toThrow();
    expect(generated).toContain('GM_addStyle(`');
    expect(generated).toContain('#${panelId}');
    expect(generated).toContain('const note = `value=${1 + 2}`');
    expect(generated).toContain('const rx = /^http:\\/\\//i;');
    expect(generated).toContain('const safePayload = __ctToCloneable({');
    expect(generated).toContain('payload: safePayload');
  });

  it('preserves dollar patterns in user code during bootstrap injection', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();

    const dollarCode = 'const a = "$& $\' $| $1"; $("div").text(a);';
    const registration = await adapter.toRegistration({
      id: 's-dollar',
      name: 'Dollar Test',
      code: dollarCode,
      enabled: true,
      runAt: 'document_end',
      targetUrls: ['https://example.com/*'],
    });

    const generated = registration.js[0].code;
    expect(generated).toContain(dollarCode);
    expect(() => new Function(generated)).not.toThrow();
  });

  it('toRegistration handles minimal script configuration', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const reg = await adapter.toRegistration({
      id: 'min',
      enabled: true,
      code: 'console.log(1)',
      targetUrls: [],
    });
    expect(reg.id).toBe('ct-us-min');
    expect(reg.matches).toEqual([]);
  });

  it('toRegistration handles complex script with resources and requires', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const reg = await adapter.toRegistration({
      id: 'complex',
      enabled: true,
      code: 'console.log(1)',
      targetUrls: ['https://*/*'],
      requires: ['https://lib.js'],
      resources: [{ name: 'res', url: 'https://res.png' }],
      resourceContents: { res: 'data' },
    });
    expect(reg.js[0].code).toContain('"requires":["https://lib.js"]');
    expect(reg.js[0].code).toContain('"res":"https://res.png"');
  });

  it('uses scripting API as fallback for Safari and transforms registrations correctly', async () => {
    const storageData = { userScriptRegistrationIds: [] };
    global.chrome = {
      runtime: { id: 'ext-id', getManifest: () => ({ version: '1.0.0' }) },
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: storageData[key] })),
          set: vi.fn(async (obj) => Object.assign(storageData, obj)),
        },
      },
      userScripts: undefined,
      scripting: {
        registerContentScripts: vi.fn().mockResolvedValue(),
        unregisterContentScripts: vi.fn().mockResolvedValue(),
      },
    };

    const adapter = new UserScriptsAdapter();
    const script = {
      id: 's-safari',
      name: 'Safari Test',
      code: 'console.log("safari")',
      enabled: true,
      targetUrls: ['https://example.com/*'],
      runAt: 'document-start',
      injectInto: 'main',
    };

    const result = await adapter.syncEnabledScripts([script]);

    expect(result.usingUserScripts).toBe(true);
    expect(global.chrome.scripting.registerContentScripts).toHaveBeenCalled();
    const regs = global.chrome.scripting.registerContentScripts.mock.calls[0][0];
    expect(regs).toHaveLength(1);
    expect(regs[0]).toEqual(
      expect.objectContaining({
        id: 'ct-us-s-safari',
        matches: ['https://example.com/*'],
        runAt: 'document_start',
        world: 'MAIN',
        persistAcrossSessions: true,
      })
    );
    expect(regs[0].js[0].code).toContain('console.log("safari")');
  });

  it('returns unsupported result if both scripting APIs are missing', async () => {
    global.chrome = {
      runtime: { id: 'ext-id', getManifest: () => ({ version: '1.0.0' }) },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      userScripts: undefined,
      scripting: undefined,
    };

    const adapter = new UserScriptsAdapter();
    await expect(
      adapter.syncEnabledScripts([
        {
          id: 's1',
          code: 'console.log(1)',
          enabled: true,
          targetUrls: ['https://example.com/*'],
        },
      ])
    ).resolves.toEqual({ usingUserScripts: false });
  });

  it('should handle concurrent sync calls using mutex', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const mockSync = vi.spyOn(adapter, '_doSyncEnabledScripts').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { usingUserScripts: true };
    });

    const p1 = adapter.syncEnabledScripts([]);
    const p2 = adapter.syncEnabledScripts([]);

    await Promise.all([p1, p2]);

    expect(mockSync).toHaveBeenCalledTimes(2);
  });

  it('should handle registration error and cleanup', async () => {
    const script = {
      id: 's1',
      name: 'Test',
      code: 'console.log(1)',
      enabled: true,
      targetUrls: ['https://example.com/*'],
    };

    global.chrome = {
      runtime: { id: 'ext-id', getManifest: () => ({ version: '1.0.0' }) },
      storage: {
        local: {
          get: vi.fn(async () => ({ userScriptRegistrationIds: ['old-id'] })),
          set: vi.fn(async () => {}),
        },
      },
      userScripts: {
        unregister: vi.fn().mockResolvedValue(),
        register: vi.fn().mockRejectedValue(new Error('Register failed')),
      },
    };

    const adapter = new UserScriptsAdapter();
    const result = await adapter.syncEnabledScripts([script]);
    expect(result.usingUserScripts).toBe(false);
  });
});
