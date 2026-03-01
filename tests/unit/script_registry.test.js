import { describe, expect, it, vi } from 'vitest';

import { ScriptRegistry } from '../../src/core/scriptRegistry.js';

describe('ScriptRegistry', () => {
  function createStorage(scripts = []) {
    const data = { scripts };
    return {
      local: {
        get: vi.fn(async (key) => ({ [key]: data[key] })),
        set: vi.fn(async (obj) => Object.assign(data, obj)),
      },
      data,
    };
  }

  it('normalizes scripts on refresh and persists normalized data', async () => {
    const storage = createStorage([
      {
        name: 'A',
        code: 'console.log(1)',
        enabled: true,
        targetUrl: 'https://example.com/*',
      },
    ]);
    const adapter = { syncEnabledScripts: vi.fn(async () => ({ usingUserScripts: true })) };

    const registry = new ScriptRegistry(storage, adapter);
    const scripts = await registry.refresh();

    expect(scripts[0].id).toBeTypeOf('string');
    expect(scripts[0].targetUrls).toEqual(['https://example.com/*']);
    expect(storage.local.set).toHaveBeenCalledWith({ scripts: expect.any(Array) });
  });

  it('filters by url and runAt (hyphen/underscore tolerant)', async () => {
    const storage = createStorage([
      {
        id: 's1',
        name: 'A',
        code: '1',
        enabled: true,
        runAt: 'document-end',
        targetUrls: ['https://example.com/*'],
      },
      {
        id: 's2',
        name: 'B',
        code: '2',
        enabled: true,
        runAt: 'document_start',
        targetUrls: ['https://another.com/*'],
      },
      {
        id: 's3',
        name: 'C',
        code: '3',
        enabled: false,
        runAt: 'document_end',
        targetUrls: ['https://example.com/*'],
      },
    ]);

    const registry = new ScriptRegistry(storage, {
      syncEnabledScripts: vi.fn(async () => ({ usingUserScripts: true })),
    });

    const filtered = await registry.getFilteredScripts('https://example.com/page', 'document_end');
    expect(filtered.map((s) => s.id)).toEqual(['s1']);
  });

  it('syncs registrations with adapter', async () => {
    const storage = createStorage([
      {
        id: 's1',
        name: 'A',
        code: '1',
        enabled: true,
        targetUrls: ['https://example.com/*'],
      },
    ]);
    const syncEnabledScripts = vi.fn(async () => ({ usingUserScripts: true }));

    const registry = new ScriptRegistry(storage, { syncEnabledScripts });
    const result = await registry.syncRuntimeRegistration();

    expect(syncEnabledScripts).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Object)]));
    expect(result).toEqual({ usingUserScripts: true });
  });
});
