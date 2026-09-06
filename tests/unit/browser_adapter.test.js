import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { getBrowserApi, promisifyChromeCall, isSafari } from '../../src/shared/browserAdapter.js';

describe('browserAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete global.browser;
    delete global.chrome;
    delete global.safari;
  });

  it('prefers browser global when available', () => {
    global.browser = { runtime: { id: 'browser-id' } };
    global.chrome = { runtime: { id: 'chrome-id' } };

    expect(getBrowserApi().runtime.id).toBe('browser-id');
  });

  it('falls back to chrome global', () => {
    global.chrome = { runtime: { id: 'chrome-id' } };
    expect(getBrowserApi().runtime.id).toBe('chrome-id');
  });

  it('identifies Safari correctly', () => {
    // Via global safari object
    global.safari = {};
    expect(isSafari()).toBe(true);
    delete global.safari;

    // Via userAgent (Desktop Safari)
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    });
    expect(isSafari()).toBe(true);

    // Mobile Safari
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    });
    expect(isSafari()).toBe(true);

    // Chrome should not be identified as Safari
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    });
    expect(isSafari()).toBe(false);

    // Edge should not be identified as Safari
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
    });
    expect(isSafari()).toBe(false);
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
