import { describe, expect, it, vi } from 'vitest';

import { ScriptRegistry } from '../../src/services/scripts/ScriptRegistry.js';
import { ScriptUpdater } from '../../src/services/scripts/ScriptUpdater.js';
import { AIDiffHelper } from '../../src/shared/utils/ai_diff_helper.js';

describe('registry/updater/diff hardening', () => {
  function storageWith(scripts, { getImpl } = {}) {
    const data = { scripts };
    return {
      local: {
        get: getImpl ?? vi.fn(async (key) => ({ [key]: data[key] })),
        set: vi.fn(async (obj) => Object.assign(data, obj)),
      },
      data,
    };
  }

  it('registry drops malformed entries instead of crashing refresh', async () => {
    const storage = storageWith([
      null,
      undefined,
      42,
      'string-entry',
      { id: 'no-urls', code: '1', enabled: true },
      { id: 'bad-urls', code: '1', enabled: true, targetUrls: 'https://a.com/*' },
      { id: 'num-urls', code: '1', enabled: true, targetUrls: [42, null] },
      { id: 'tm', code: '1', enabled: true, targetUrls: ['http*://a.com/*'] },
    ]);
    const registry = new ScriptRegistry(storage, { syncEnabledScripts: vi.fn(async () => ({})) });
    const scripts = await registry.refresh();
    expect(scripts.every(Boolean)).toBe(true);
    expect(scripts.find((s) => s.id === 'tm').targetUrls).toEqual(['*://a.com/*']);
  });

  it('registry normalizes legacy targetUrl and TM schemes', async () => {
    const storage = storageWith([
      { id: 'legacy', code: '1', enabled: true, targetUrl: 'http*://a.com/*' },
    ]);
    const registry = new ScriptRegistry(storage, { syncEnabledScripts: vi.fn(async () => ({})) });
    const [script] = await registry.refresh();
    expect(script.targetUrls).toEqual(['*://a.com/*']);
  });

  it('registry cache TTL expires and concurrent refresh is safe', async () => {
    const storage = storageWith([{ id: 's', code: '1', enabled: true, targetUrls: ['*://*/*'] }]);
    const registry = new ScriptRegistry(storage, { syncEnabledScripts: vi.fn(async () => ({})) });
    await registry.ensureLoaded();
    expect(registry.isCacheValid()).toBe(true);
    registry.lastCacheUpdate = Date.now() - 10_000;
    expect(registry.isCacheValid()).toBe(false);
    const [a, b] = await Promise.all([registry.ensureLoaded(), registry.ensureLoaded()]);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });

  it('updater survives fetch failures, bad versions, and hostile payloads', async () => {
    const scripts = [
      { id: '1', name: 'A', version: '1.0.0', updateURL: 'https://x/a.js' },
      { id: '2', name: 'B', version: 'not-a-version', updateURL: 'https://x/b.js' },
      { id: '3', name: 'C', version: '1.0.0' }, // no updateURL: skipped
    ];
    const storage = storageWith(scripts);
    global.chrome = { runtime: { sendMessage: vi.fn() } };
    const updater = new ScriptUpdater(storage);
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/a.js')) throw new Error('network down');
      return { ok: false, status: 500 };
    });
    await expect(updater.checkAndPerformUpdates()).resolves.toBeUndefined();

    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => 'garbage with no metadata at all ((((',
    }));
    await expect(updater.checkAndPerformUpdates()).resolves.toBeUndefined();

    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () =>
        '// ==UserScript==\n// @version ' + '9'.repeat(5000) + '\n// ==/UserScript==',
    }));
    await expect(updater.checkAndPerformUpdates()).resolves.toBeUndefined();
  });

  it('updater ignores downgrade payloads', async () => {
    const oldScript = {
      id: '1',
      name: 'T',
      version: '2.0.0',
      updateURL: 'https://x/u.js',
      code: 'old',
    };
    const storage = storageWith([oldScript]);
    global.chrome = { runtime: { sendMessage: vi.fn() } };
    const updater = new ScriptUpdater(storage);
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '// ==UserScript==\n// @version 1.0.0\n// ==/UserScript==\nnew',
    }));
    await updater.checkAndPerformUpdates();
    expect(storage.data.scripts[0].code).toBe('old');
  });

  it('diff helper handles empty/garbage/fuzzed patches', () => {
    expect(AIDiffHelper.parsePatches('')).toEqual([]);
    expect(AIDiffHelper.parsePatches('<<<<<< SEARCH\nunclosed')).toEqual([]);
    expect(AIDiffHelper.applyPatches('hello', [{ type: 'unknown-type' }]).failedCount).toBe(1);
    const res = AIDiffHelper.applyPatches('line1\nline2\n', [
      { type: 'search-replace', search: 'line1', replace: 'LINE1' },
      { type: 'search-replace', search: 'nonexistent-xyz', replace: 'NOPE' },
    ]);
    expect(res.successCount).toBe(1);
    expect(res.failedCount).toBe(1);
    expect(res.finalCode).toContain('LINE1');
  });

  it('diff fuzzer: random mutations never throw or lose input', () => {
    const base = 'function add(a, b) {\n  return a + b;\n}\n';
    const alphabet = ['x', ' ', '\n', '{', '}', '$', '`', '\\', '(', ')', '*', '@'];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      let mutated = base;
      const ops = 1 + Math.floor(rand() * 4);
      for (let o = 0; o < ops; o++) {
        const pos = Math.floor(rand() * (mutated.length + 1));
        const ch = alphabet[Math.floor(rand() * alphabet.length)];
        mutated = mutated.slice(0, pos) + ch + mutated.slice(pos);
      }
      let parsed;
      expect(() => {
        parsed = AIDiffHelper.parsePatches(mutated);
      }).not.toThrow();
      expect(() => AIDiffHelper.applyPatches(base, parsed)).not.toThrow();
      const applied = AIDiffHelper.applyPatches(base, parsed);
      expect(typeof applied.finalCode).toBe('string');
    }
  });
});
