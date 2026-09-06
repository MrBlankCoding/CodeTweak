import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserScriptsAdapter } from '../../src/services/scripts/UserScriptsAdapter.js';

describe('userscript adapter hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete global.browser;
    delete global.chrome;
  });

  function createChromeMock({ registerImpl = async () => {}, seedIds = [] } = {}) {
    const storageData = { userScriptRegistrationIds: seedIds };
    const chrome = {
      runtime: { id: 'ext-id', getManifest: () => ({ version: '1.0.0' }) },
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: storageData[key] })),
          set: vi.fn(async (obj) => Object.assign(storageData, obj)),
        },
      },
      userScripts: {
        register: vi.fn(registerImpl),
        unregister: vi.fn(async () => {}),
      },
    };
    global.chrome = chrome;
    return { chrome, storageData };
  }

  const baseScript = (overrides = {}) => ({
    id: 's1',
    name: 'S',
    code: 'console.log(1)',
    enabled: true,
    runAt: 'document_idle',
    targetUrls: ['https://example.com/*'],
    ...overrides,
  });

  it('keeps every $-substitution sequence verbatim in bootstrap', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const code = [
      'const a = "$&";',
      'const b = "$\'";',
      'const c = "$`";',
      'const d = "$1 $2 $99";',
      'const e = "$<name>";',
      'const f = "$$";',
      'console.log(a,b,c,d,e,f);',
    ].join('\n');
    const reg = await adapter.toRegistration(baseScript({ code }));
    expect(reg.js[0].code).toContain(code);
    expect(() => new Function(reg.js[0].code)).not.toThrow();
  });

  it('survives jQuery-heavy real-world code', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const code = [
      '// ==UserScript==',
      '// @match http*://www.skribbl.io/*',
      '// ==/UserScript==',
      '(function(){',
      "  var $items = $('div.item');",
      "  $items.each(function(){ $(this).toggleClass('x'); });",
      '  document.body.innerHTML += "<div>$& $\' $`</div>";',
      '  const re = /\\$(\\w+)/g;',
      '  const t = `price: ${"$"}${100}`;',
      '  console.log(re, t);',
      '})();',
    ].join('\n');
    const reg = await adapter.toRegistration(
      baseScript({ code, targetUrls: ['http*://www.skribbl.io/*'] })
    );
    expect(reg.matches).toEqual(['*://www.skribbl.io/*']);
    expect(reg.js[0].code).toContain(code);
    expect(() => new Function(reg.js[0].code)).not.toThrow();
  });

  it('survives unicode, emoji, and giant payloads', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const code = `const e='🎮🔥💀'; const z='中文日本語한국어'; const big='${'x'.repeat(200_000)}';`;
    const reg = await adapter.toRegistration(baseScript({ code }));
    expect(reg.js[0].code).toContain('🎮🔥💀');
    expect(() => new Function(reg.js[0].code)).not.toThrow();
  });

  it('survives config-breaking values via JSON escaping', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    const reg = await adapter.toRegistration(
      baseScript({ name: '</script><script>alert(1)</script>', description: '"quoted" \\ slash' })
    );
    expect(() => new Function(reg.js[0].code)).not.toThrow();
  });

  it('treats non-string targetUrls as unusable instead of crashing', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    for (const targetUrls of [[42, null, undefined, {}, []], 'https://example.com/*', 42, null]) {
      const script = baseScript({ targetUrls });
      expect(() => adapter.canUseUserScripts(script)).not.toThrow();
    }
    expect(adapter.canUseUserScripts(baseScript({ targetUrls: [42, null] }))).toBe(false);
  });

  it('dedupes patterns after normalization, not before', async () => {
    const { chrome } = createChromeMock();
    const adapter = new UserScriptsAdapter();
    await adapter.syncEnabledScripts([
      baseScript({ targetUrls: ['http*://example.com/*', '*://example.com/*'] }),
    ]);
    const regs = chrome.userScripts.register.mock.calls[0][0];
    expect(regs).toHaveLength(1);
    expect(regs[0].matches).toEqual(['*://example.com/*']);
  });

  it('isolates one bad registration so siblings still register', async () => {
    const { chrome } = createChromeMock({
      registerImpl: async (regs) => {
        if (regs.some((r) => r.id === 'ct-us-bad')) {
          throw new Error("Script with ID 'ct-us-bad' has invalid value");
        }
      },
    });
    const good = baseScript({ id: 'good', targetUrls: ['https://a.com/*'] });
    const bad = baseScript({ id: 'bad', targetUrls: ['https://b.com/*'] });
    chrome.userScripts.register.mockImplementation(async (regs) => {
      if (Array.isArray(regs) && regs.length > 1) throw new Error('batch poisoned');
      if (regs.some((r) => r.id === 'ct-us-bad')) throw new Error('bad reg');
    });
    const adapter = new UserScriptsAdapter();
    const result = await adapter.syncEnabledScripts([good, bad]);
    expect(result.usingUserScripts).toBe(true);
    const stored = chrome.storage.local.set.mock.calls.at(-1)[0].userScriptRegistrationIds;
    expect(stored).toContain('ct-us-good');
    expect(stored).not.toContain('ct-us-bad');
  });

  it('handles undefined code and missing runAt without crashing', async () => {
    createChromeMock();
    const adapter = new UserScriptsAdapter();
    expect(adapter.canUseUserScripts(baseScript({ code: undefined }))).toBe(false);
    const reg = await adapter.toRegistration(baseScript({ runAt: undefined, code: '' }));
    expect(reg.runAt).toBe('document_idle');
    expect(() => new Function(reg.js[0].code)).not.toThrow();
  });
});
