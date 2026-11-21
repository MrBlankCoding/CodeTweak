import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isUserScriptsSupported,
  renderUserScriptsBanner,
} from '../../src/shared/userScriptsBanner.js';

describe('userScriptsBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete global.chrome;
    document.body.innerHTML = '<div id="slot"></div>';
  });

  const slot = () => document.getElementById('slot');

  it('detects support only when register is a function', () => {
    expect(isUserScriptsSupported()).toBe(false);

    global.chrome = {};
    expect(isUserScriptsSupported()).toBe(false);

    global.chrome = { userScripts: {} };
    expect(isUserScriptsSupported()).toBe(false);

    global.chrome = { userScripts: { register: async () => {} } };
    expect(isUserScriptsSupported()).toBe(true);
  });

  it('mounts the red banner when unsupported', () => {
    global.chrome = {};
    const banner = renderUserScriptsBanner(slot());

    expect(banner).toBeTruthy();
    expect(banner.classList.contains('ct-userscripts-banner')).toBe(true);
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('User scripts are disabled');
    expect(banner.textContent).toContain('How to enable');
    expect(slot().firstChild).toBe(banner);
  });

  it('removes the banner when supported', () => {
    global.chrome = {};
    renderUserScriptsBanner(slot());
    expect(slot().querySelector('.ct-userscripts-banner')).toBeTruthy();

    global.chrome = { userScripts: { register: async () => {} } };
    const result = renderUserScriptsBanner(slot());
    expect(result).toBeNull();
    expect(slot().querySelector('.ct-userscripts-banner')).toBeNull();
  });

  it('is idempotent across repeated calls', () => {
    global.chrome = {};
    renderUserScriptsBanner(slot());
    renderUserScriptsBanner(slot());
    expect(slot().querySelectorAll('.ct-userscripts-banner')).toHaveLength(1);
  });

  it('handles missing containers without throwing', () => {
    expect(renderUserScriptsBanner(null)).toBeNull();
    expect(renderUserScriptsBanner(undefined)).toBeNull();
    expect(() => renderUserScriptsBanner(document.createElement('div'))).not.toThrow();
  });

  it('opens chrome://extensions via guide button by default', () => {
    const create = vi.fn();
    global.chrome = { tabs: { create } };
    const banner = renderUserScriptsBanner(slot());
    banner.querySelector('.ct-userscripts-banner-btn').click();
    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions' });
  });

  it('prefers a custom onOpenGuide handler when provided', () => {
    const create = vi.fn();
    global.chrome = { tabs: { create } };
    const onOpenGuide = vi.fn();
    const banner = renderUserScriptsBanner(slot(), { onOpenGuide });
    banner.querySelector('.ct-userscripts-banner-btn').click();
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  describe('on Firefox', () => {
    const firefoxRuntime = { getURL: (p) => `moz-extension://id/${p}` };

    it('offers a permission grant instead of the chrome://extensions guide', () => {
      global.chrome = { runtime: firefoxRuntime };
      const banner = renderUserScriptsBanner(slot());
      expect(banner.textContent).toContain('Grant permission');
      expect(banner.textContent).not.toContain('chrome://extensions');
    });

    it('requests the optional userScripts permission and removes the banner on grant', async () => {
      const request = vi.fn(async () => true);
      const create = vi.fn();
      global.chrome = { runtime: firefoxRuntime, permissions: { request }, tabs: { create } };
      const banner = renderUserScriptsBanner(slot());
      banner.querySelector('.ct-userscripts-banner-btn').click();
      await vi.waitFor(() => expect(slot().querySelector('.ct-userscripts-banner')).toBeNull());
      expect(request).toHaveBeenCalledWith({ permissions: ['userScripts'] });
      expect(create).not.toHaveBeenCalled();
    });

    it('keeps the banner when the permission is declined', async () => {
      const request = vi.fn(async () => false);
      global.chrome = { runtime: firefoxRuntime, permissions: { request } };
      const banner = renderUserScriptsBanner(slot());
      banner.querySelector('.ct-userscripts-banner-btn').click();
      await vi.waitFor(() => expect(request).toHaveBeenCalled());
      await Promise.resolve();
      expect(slot().querySelector('.ct-userscripts-banner')).toBe(banner);
    });
  });
});
