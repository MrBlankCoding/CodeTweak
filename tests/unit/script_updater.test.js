import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ScriptUpdater } from '../../src/core/scriptUpdater.js';

describe('ScriptUpdater', () => {
  let storageApi;
  let updater;

  beforeEach(() => {
    storageApi = {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    };
    updater = new ScriptUpdater(storageApi);
    global.fetch = vi.fn();
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
      alarms: {
        create: vi.fn(),
        onAlarm: {
          addListener: vi.fn(),
        },
        get: vi.fn((name, cb) => cb(null)),
      },
    };
  });

  it('compares versions correctly', () => {
    expect(updater.compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(updater.compareVersions('1.1.0', '1.0.1')).toBe(1);
    expect(updater.compareVersions('1.0', '1.0.0')).toBe(0);
    expect(updater.compareVersions('2.0-beta', '2.0')).toBe(0);
    expect(updater.compareVersions('1.0.0.1', '1.0.0')).toBe(1);
  });

  it('updates script when a newer version is found', async () => {
    const oldScript = {
      id: '1',
      name: 'Test',
      version: '1.0.0',
      updateURL: 'https://example.com/update.js',
      code: `// ==UserScript==
// @name Test
// @version 1.0.0
// ==/UserScript==`,
    };

    const newCode = `// ==UserScript==
// @name Test
// @version 1.1.0
// ==/UserScript==
console.log("updated");`;

    storageApi.local.get.mockResolvedValue({ scripts: [oldScript] });
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(newCode),
    });

    await updater.checkAndPerformUpdates();

    expect(storageApi.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scripts: expect.arrayContaining([
          expect.objectContaining({
            version: '1.1.0',
            code: newCode,
          }),
        ]),
      })
    );
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'scriptsUpdated' });
  });

  it('does not update when version is the same or older', async () => {
    const oldScript = {
      id: '1',
      name: 'Test',
      version: '1.2.0',
      updateURL: 'https://example.com/update.js',
      code: `// ==UserScript==
// @name Test
// @version 1.2.0
// ==/UserScript==`,
    };

    const sameCode = `// ==UserScript==
// @name Test
// @version 1.2.0
// ==/UserScript==`;

    storageApi.local.get.mockResolvedValue({ scripts: [oldScript] });
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(sameCode),
    });

    await updater.checkAndPerformUpdates();

    expect(storageApi.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        scripts: expect.arrayContaining([
          expect.objectContaining({
            version: '1.2.0',
            code: sameCode,
          }),
        ]),
      })
    );
  });
});
