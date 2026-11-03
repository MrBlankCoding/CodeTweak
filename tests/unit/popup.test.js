import { beforeEach, describe, expect, it, vi } from 'vitest';

async function setupPopup({
  scripts = [],
  menuCommands = [],
  tabUrl = 'https://example.com',
} = {}) {
  vi.resetModules();

  document.body.innerHTML = `
    <div id="userScriptsBannerSlot"></div>
    <div id="extensionVersion"></div>
    <div id="scriptList"></div>
    <div id="emptyState"></div>
    <button id="createScript"></button>
    <button id="openDashboard"></button>
    <a id="reportIssue"></a>
    <div id="menuCommandSection" style="display:none"><div id="menuCommandList"></div></div>
  `;

  global.applyTheme = vi.fn(async () => {});
  global.screen = { availWidth: 1400 };
  window.close = vi.fn();

  let runtimeListener;
  const storage = { scripts: [...scripts] };
  const sendMessage = vi.fn();
  global.chrome = {
    tabs: {
      query: vi.fn(async () => [{ id: 1, url: tabUrl }]),
      create: vi.fn(async () => {}),
      sendMessage: vi.fn((_, __, cb) => cb && cb({ success: false })),
    },
    storage: {
      local: {
        get: vi.fn(async (key) => ({ [key]: storage[key] || [] })),
        set: vi.fn(async (obj) => Object.assign(storage, obj)),
      },
    },
    runtime: {
      lastError: null,
      getURL: vi.fn((p) => `chrome-extension://id/${p}`),
      getManifest: () => ({ version: '4.0.0' }),
      sendMessage,
      onMessage: {
        addListener: (fn) => {
          runtimeListener = fn;
        },
      },
    },
    // Menu commands are read from the USER_SCRIPT world registry.
    userScripts: {
      execute: vi.fn(async () => [{ result: menuCommands }]),
    },
    scripting: {
      executeScript: vi.fn(async () => [{ result: true }]),
      insertCSS: vi.fn(async () => {}),
    },
    action: {},
  };

  vi.doMock('../../src/shared/utils/i18n.js', () => ({
    applyTranslations: vi.fn(async () => {}),
    getMessageSync: (k) => k,
  }));

  await import('../../src/popup/popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 0));

  return { storage, runtimeListener };
}

describe('popup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders matching scripts and toggles enabled state', async () => {
    await setupPopup({
      scripts: [
        {
          id: 's1',
          name: 'A',
          enabled: true,
          runAt: 'document_end',
          gmSetValue: true,
          targetUrls: ['https://example.com/*'],
        },
      ],
    });

    const item = document.querySelector('.script-item');
    expect(item.querySelector('.script-name').textContent).toBe('A');
    expect(item.querySelector('.script-target')).toBeNull();
    expect(item.textContent).not.toMatch(/GM API|DOM|Load|Start/);

    const checkbox = document.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'scriptsUpdated' });
  });

  it('wires top-level actions and menu commands', async () => {
    await setupPopup({
      scripts: [],
      menuCommands: [{ commandId: 'c1', caption: 'Run', onClick: () => {} }],
    });

    document.getElementById('createScript').click();
    document.getElementById('openDashboard').click();
    document
      .getElementById('reportIssue')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 0));

    expect(chrome.tabs.create).toHaveBeenCalled();

    const cmdBtn = document.querySelector('.menu-command-btn');
    expect(cmdBtn).toBeTruthy();
    cmdBtn.click();
    expect(chrome.userScripts.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        world: 'USER_SCRIPT',
        js: [{ code: expect.stringContaining('"c1"') }],
      })
    );
  });

  it('reacts to runtime scriptsUpdated message', async () => {
    const { runtimeListener } = await setupPopup();
    runtimeListener({ action: 'scriptsUpdated' });
    await new Promise((r) => setTimeout(r, 0));
    expect(chrome.userScripts.execute).toHaveBeenCalled();
  });

  it('shows the version from the manifest', async () => {
    await setupPopup();
    expect(document.getElementById('extensionVersion').textContent).toBe('v4.0.0');
  });

  it('hides menu commands on restricted pages', async () => {
    await setupPopup({
      tabUrl: 'chrome://settings',
      scripts: [
        { id: 's1', name: 'A', enabled: true, runAt: 'document_end', targetUrls: ['*://*/*'] },
      ],
    });

    const section = document.getElementById('menuCommandSection');
    expect(section.style.display).toBe('none');
  });
});
