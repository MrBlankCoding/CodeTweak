import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('theme-manager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete window.applyTheme;
  });

  it('applies the accent color from settings', async () => {
    const get = vi.fn((key, cb) => cb({ settings: { accentColor: '#ff0000' } }));
    global.chrome = { storage: { local: { get } } };
    await import('../../src/shared/utils/theme_manager.js');
    window.applyTheme();
    expect(document.documentElement.style.getPropertyValue('--accent-color')).toBe('#ff0000');
  });

  it('falls back to default blue without settings', async () => {
    const get = vi.fn((key, cb) => cb({}));
    global.chrome = { storage: { local: { get } } };
    await import('../../src/shared/utils/theme_manager.js');
    window.applyTheme();
    expect(document.documentElement.style.getPropertyValue('--accent-color')).toBe('#007bff');
  });
});
