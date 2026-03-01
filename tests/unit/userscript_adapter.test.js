import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserScriptsAdapter } from '../../src/core/userscriptAdapter.js';

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
    expect(chrome.userScripts.unregister).toHaveBeenCalledWith({ ids: ['ct-us-old-script'] });
    expect(chrome.userScripts.register).toHaveBeenCalledTimes(1);
    expect(chrome.userScripts.update).toHaveBeenCalledTimes(0);

    const registrations = chrome.userScripts.register.mock.calls[0][0];
    expect(registrations).toHaveLength(2);
    expect(registrations[0].id).toBe('ct-us-s1');
    expect(registrations[0].runAt).toBe('document_end');
    expect(registrations[0].world).toBe('MAIN');
    expect(registrations[0].js[0].code).toContain('GM_setValue');
    expect(registrations[0].js[0].code).toContain("replace(/^http:\\/\\//i, 'https://')");
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

  it('returns unsupported result if userScripts API is missing', async () => {
    global.chrome = {
      runtime: { id: 'ext-id', getManifest: () => ({ version: '1.0.0' }) },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      userScripts: undefined,
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
});
