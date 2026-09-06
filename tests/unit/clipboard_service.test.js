import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/shared/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('ClipboardService', () => {
  let ClipboardService;
  let browser;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const adapter = await import('../../src/shared/browserAdapter.js');
    browser = adapter.browser;
    const mod = await import('../../src/services/ClipboardService.js');
    ClipboardService = mod.ClipboardService;
  });

  it('converts non-string text to string', async () => {
    globalThis.chrome = { runtime: {} };
    browser.offscreen = undefined;
    navigator.clipboard = { writeText: vi.fn(async () => {}) };
    const svc = new ClipboardService();
    const result = await svc.setClipboard(null, {}, vi.fn());
    expect(result).toEqual({ result: null });
  });

  it('returns error for text exceeding 100KB', async () => {
    globalThis.chrome = { runtime: {} };
    const svc = new ClipboardService();
    const result = await svc.setClipboard('x'.repeat(100_001), {}, vi.fn());
    expect(result).toEqual({ error: 'Clipboard data exceeds 100KB limit.' });
  });

  it('uses offscreen document when available', async () => {
    const setupFn = vi.fn();
    globalThis.chrome = {
      runtime: { sendMessage: vi.fn() },
      offscreen: { createDocument: vi.fn(), hasDocument: vi.fn() },
    };
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', {}, setupFn);
    expect(setupFn).toHaveBeenCalledOnce();
    expect(result).toEqual({ result: null });
  });

  it('falls back to scripting when offscreen fails', async () => {
    globalThis.chrome = {
      runtime: { sendMessage: vi.fn() },
      offscreen: { createDocument: vi.fn(), hasDocument: vi.fn() },
      scripting: { executeScript: vi.fn(async () => {}) },
    };
    const setupFn = vi.fn(async () => {
      throw new Error('offscreen fail');
    });
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', { tab: { id: 1 } }, setupFn);
    expect(result).toEqual({ result: null });
  });

  it('falls back to navigator.clipboard when scripting unavailable', async () => {
    globalThis.chrome = { runtime: {} };
    navigator.clipboard = { writeText: vi.fn(async () => {}) };
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', {}, vi.fn());
    expect(result).toEqual({ result: null });
  });

  it('returns error when all clipboard methods fail', async () => {
    globalThis.chrome = { runtime: {} };
    navigator.clipboard = undefined;
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', {}, vi.fn());
    expect(result).toEqual({ error: 'Clipboard API is unavailable in this browser context.' });
  });

  it('falls back when scripting tab id is missing', async () => {
    globalThis.chrome = { runtime: {}, scripting: { executeScript: vi.fn() } };
    navigator.clipboard = { writeText: vi.fn(async () => {}) };
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', {}, vi.fn());
    expect(result).toEqual({ result: null });
  });

  it('handles scripting failure and falls through to navigator.clipboard', async () => {
    globalThis.chrome = {
      runtime: {},
      scripting: {
        executeScript: vi.fn(async () => {
          throw new Error('fail');
        }),
      },
    };
    navigator.clipboard = { writeText: vi.fn(async () => {}) };
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', { tab: { id: 1 } }, vi.fn());
    expect(result).toEqual({ result: null });
  });

  it('handles navigator.clipboard failure', async () => {
    globalThis.chrome = { runtime: {} };
    navigator.clipboard = {
      writeText: vi.fn(async () => {
        throw new Error('fail');
      }),
    };
    const svc = new ClipboardService();
    const result = await svc.setClipboard('hi', {}, vi.fn());
    expect(result).toEqual({ error: 'Clipboard API is unavailable in this browser context.' });
  });
});
