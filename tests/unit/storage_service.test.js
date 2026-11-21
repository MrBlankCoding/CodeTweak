import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StorageService', () => {
  let data;
  let storageService;

  beforeEach(async () => {
    vi.resetModules();
    data = {};
    globalThis.chrome = {
      runtime: { sendMessage: vi.fn(async () => ({ success: true })) },
      storage: {
        local: {
          get: vi.fn(async (key) => {
            const keys = Array.isArray(key) ? key : [key];
            return Object.fromEntries(
              keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])
            );
          }),
          set: vi.fn(async (obj) => Object.assign(data, structuredClone(obj))),
          remove: vi.fn(async (keys) => [].concat(keys).forEach((k) => delete data[k])),
        },
      },
    };
    ({ storageService } = await import('../../src/services/storage/StorageService.js'));
  });

  const newScript = (overrides = {}) => ({ name: 'S', code: 'x()', targetUrls: [], ...overrides });

  it('enables new scripts by default', async () => {
    const saved = await storageService.saveScript(newScript());
    expect(saved.enabled).toBe(true);
  });

  it('respects "Enable scripts by default" when it is off', async () => {
    data.settings = { enableAllScripts: false };
    const saved = await storageService.saveScript(newScript());
    expect(saved.enabled).toBe(false);
  });

  it('keeps an explicit enabled value on new scripts', async () => {
    data.settings = { enableAllScripts: false };
    const saved = await storageService.saveScript(newScript({ enabled: true }));
    expect(saved.enabled).toBe(true);
  });

  it('does not re-enable a disabled script when it is edited', async () => {
    data.scripts = [{ id: 'a', name: 'S', code: 'old()', enabled: false, targetUrls: [] }];
    const saved = await storageService.saveScript(newScript({ code: 'new()' }), 'a', true);
    expect(saved.enabled).toBe(false);
    expect(data.scripts[0]).toEqual(expect.objectContaining({ code: 'new()', enabled: false }));
  });

  it('deletes stored values and errors along with the script', async () => {
    data.scripts = [
      { id: 'a', name: 'S' },
      { id: 'b', name: 'T' },
    ];
    data['script-values-a'] = { k: 1 };
    data['scriptErrors_a'] = [{ message: 'x' }];
    data['script-values-b'] = { k: 2 };

    await storageService.deleteScript('a');

    expect(data.scripts.map((s) => s.id)).toEqual(['b']);
    expect(data['script-values-a']).toBeUndefined();
    expect(data['scriptErrors_a']).toBeUndefined();
    expect(data['script-values-b']).toEqual({ k: 2 });
  });

  it('clears only the chosen script values', async () => {
    data['script-values-a'] = { k: 1 };
    data['script-values-b'] = { k: 2 };
    await storageService.clearScriptValues('a');
    expect(data['script-values-a']).toBeUndefined();
    expect(data['script-values-b']).toEqual({ k: 2 });
  });
});
