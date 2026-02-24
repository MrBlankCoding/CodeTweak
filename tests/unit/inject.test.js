import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeChromeMock({ failMain = false } = {}) {
  const executeScript = vi.fn(async (payload) => {
    if (failMain && payload.func?.name === 'createWorldExecutor' && payload.world === 'MAIN') {
      throw new TypeError('main failed');
    }
    if (payload.func?.name === 'createWorldExecutor') {
      return [{ result: true }];
    }
    return [{ result: true }];
  });

  return {
    tabs: {
      get: vi.fn(async () => ({ id: 1, url: 'https://example.com' })),
    },
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (key === 'settings') {
            return {
              settings: {
                enhancedDebugging: true,
                showNotifications: false,
                confirmFirstRun: false,
              },
            };
          }
          if (typeof key === 'string' && key.startsWith('script-values-')) {
            return { [key]: { saved: 1 } };
          }
          return {};
        }),
        set: vi.fn(async () => {}),
      },
    },
    scripting: {
      executeScript,
    },
    runtime: {
      id: 'ext-1',
      getURL: vi.fn((p) => `chrome-extension://ext-1/${p}`),
      getManifest: vi.fn(() => ({ version: '1.2.3' })),
    },
  };
}

function hasFunction(value) {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => hasFunction(v));
  return Object.values(value).some((v) => hasFunction(v));
}

describe('script injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('injects script and sanitizes executeScript args', async () => {
    global.chrome = makeChromeMock();
    vi.resetModules();

    const { injectScriptsForStage, INJECTION_TYPES } = await import('../../src/utils/inject.js');

    const getFilteredScripts = vi.fn(async () => [
      {
        id: 's1',
        name: 'Script One',
        version: '1.0.0',
        description: 'desc',
        author: 'author',
        namespace: 'ns',
        runAt: 'document_end',
        targetUrls: ['*://*/*'],
        enabled: true,
        injectInto: 'default',
        code: 'window.__ran = true;',
        requires: ['https://cdn.example/lib.js'],
        resources: [{ name: 'x', url: 'https://example.com/x' }],
        weird: () => 'not cloneable',
      },
    ]);

    await injectScriptsForStage(
      { frameId: 0, tabId: 1, url: 'https://example.com' },
      INJECTION_TYPES.DOCUMENT_END,
      getFilteredScripts
    );

    const calls = chrome.scripting.executeScript.mock.calls.map(([arg]) => arg);
    const userScriptCall = calls.find((c) => c.func?.name === 'createWorldExecutor');

    expect(userScriptCall).toBeTruthy();
    expect(Array.isArray(userScriptCall.args)).toBe(true);
    expect(hasFunction(userScriptCall.args)).toBe(false);
  });

  it('falls back to ISOLATED when MAIN fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.chrome = makeChromeMock({ failMain: true });
    vi.resetModules();

    const { injectScriptsForStage, INJECTION_TYPES } = await import('../../src/utils/inject.js');

    const getFilteredScripts = vi.fn(async () => [
      {
        id: 's2',
        name: 'Script Two',
        runAt: 'document_end',
        targetUrls: ['*://*/*'],
        enabled: true,
        injectInto: 'default',
        code: '1+1',
      },
    ]);

    await injectScriptsForStage(
      { frameId: 0, tabId: 1, url: 'https://example.com' },
      INJECTION_TYPES.DOCUMENT_END,
      getFilteredScripts
    );

    const worlds = chrome.scripting.executeScript.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.func?.name === 'createWorldExecutor')
      .map((payload) => payload.world);

    expect(worlds).toContain('MAIN');
    expect(worlds).toContain('ISOLATED');
    expect(warnSpy).toHaveBeenCalled();
  });
});
