import { describe, expect, it, vi } from 'vitest';

import { getBrowserApi, promisifyChromeCall } from '../../src/shared/browserAdapter.js';

describe('browserAdapter', () => {
  it('prefers browser global when available', () => {
    global.browser = { runtime: { id: 'browser-id' } };
    global.chrome = { runtime: { id: 'chrome-id' } };

    expect(getBrowserApi().runtime.id).toBe('browser-id');

    delete global.browser;
    delete global.chrome;
  });

  it('falls back to chrome global', () => {
    global.chrome = { runtime: { id: 'chrome-id' } };
    expect(getBrowserApi().runtime.id).toBe('chrome-id');
    delete global.chrome;
  });

  it('promisifies callback chrome APIs and surfaces lastError', async () => {
    global.chrome = { runtime: { lastError: null } };

    const callbackApi = vi.fn((value, cb) =>
      typeof cb === 'function' ? cb(value + 1) : undefined
    );
    await expect(promisifyChromeCall(callbackApi, null, 2)).resolves.toBe(3);

    const errorApi = vi.fn((_value, cb) => {
      if (typeof cb !== 'function') return undefined;
      global.chrome.runtime.lastError = { message: 'boom' };
      cb(undefined);
      global.chrome.runtime.lastError = null;
      return undefined;
    });
    await expect(promisifyChromeCall(errorApi, null, 1)).rejects.toThrow('boom');

    delete global.chrome;
  });

  it('returns native promise when API already returns promise', async () => {
    const asyncApi = vi.fn(async (value) => value * 2);
    await expect(promisifyChromeCall(asyncApi, null, 7)).resolves.toBe(14);
  });
});
