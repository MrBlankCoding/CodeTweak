import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/shared/browserAdapter.js', () => ({ browser: {} }));
vi.mock('../../src/shared/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('DisplayService', () => {
  let DisplayService;
  let browser;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    browser = (await import('../../src/shared/browserAdapter.js')).browser;
    DisplayService = (await import('../../src/services/DisplayService.js')).DisplayService;
  });

  it('returns early if offscreen API is missing', async () => {
    browser.offscreen = {};
    const svc = new DisplayService();
    await svc.setupOffscreenDocument();
    expect(svc.creatingOffscreenDocument).toBeNull();
  });

  it('returns early if hasDocument is not a function', async () => {
    browser.offscreen = { hasDocument: 'not-a-function', createDocument: vi.fn() };
    const svc = new DisplayService();
    await svc.setupOffscreenDocument();
  });

  it('returns early if createDocument is not a function', async () => {
    browser.offscreen = { hasDocument: vi.fn(async () => false), createDocument: 'not-a-function' };
    const svc = new DisplayService();
    await svc.setupOffscreenDocument();
  });

  it('returns early if document already exists', async () => {
    browser.offscreen = {
      hasDocument: vi.fn(async () => true),
      createDocument: vi.fn(),
    };
    const svc = new DisplayService();
    await svc.setupOffscreenDocument();
    expect(browser.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('creates offscreen document if none exists', async () => {
    browser.offscreen = {
      hasDocument: vi.fn(async () => false),
      createDocument: vi.fn(async () => {}),
    };
    const svc = new DisplayService();
    await svc.setupOffscreenDocument();
    expect(browser.offscreen.createDocument).toHaveBeenCalledOnce();
    expect(svc.creatingOffscreenDocument).toBeNull();
  });

  it('awaits in-progress creation if already creating', async () => {
    let resolveFirst;
    const firstPromise = new Promise((r) => {
      resolveFirst = r;
    });
    browser.offscreen = {
      hasDocument: vi.fn(async () => false),
      createDocument: vi
        .fn()
        .mockReturnValueOnce(firstPromise)
        .mockReturnValueOnce(Promise.resolve()),
    };
    const svc = new DisplayService();

    const p1 = svc.setupOffscreenDocument();
    resolveFirst();
    await p1;

    await svc.setupOffscreenDocument();
    expect(svc.creatingOffscreenDocument).toBeNull();
  });

  it('handles createDocument failure gracefully', async () => {
    browser.offscreen = {
      hasDocument: vi.fn(async () => false),
      createDocument: vi.fn(async () => {
        throw new Error('fail');
      }),
    };
    const svc = new DisplayService();
    await svc.setupOffscreenDocument();
    expect(svc.creatingOffscreenDocument).toBeNull();
  });
});
