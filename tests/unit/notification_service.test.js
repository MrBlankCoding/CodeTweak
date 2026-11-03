import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../../src/services/NotificationService.js';

describe('NotificationService', () => {
  afterEach(() => {
    delete global.chrome;
  });

  it('does not show userscript notifications when notifications are disabled', async () => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({ settings: { showNotifications: false } })),
        },
      },
      notifications: { create: vi.fn() },
    };

    await expect(new NotificationService().showNotification('hello')).resolves.toEqual({
      result: null,
    });
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('shows userscript notifications when the setting is enabled', async () => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({ settings: { showNotifications: true } })),
        },
      },
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
      notifications: {
        create: vi.fn((_id, _options, callback) => callback('notification-id')),
      },
    };

    await expect(new NotificationService().showNotification('hello')).resolves.toEqual({
      result: { notificationId: 'notification-id' },
    });
    expect(chrome.notifications.create).toHaveBeenCalledOnce();
  });

  it('shows a first-run notice once when the setting is enabled', async () => {
    const stored = {
      settings: { confirmFirstRun: true, showNotifications: true },
      firstRunNotifiedScripts: [],
    };
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.map((key) => [key, stored[key]]));
          }),
          set: vi.fn(async (values) => Object.assign(stored, values)),
        },
      },
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
      notifications: {
        create: vi.fn((_id, _options, callback) => callback('notification-id')),
      },
    };

    const service = new NotificationService();
    const script = { id: 'script-1', name: 'Example Script' };
    await expect(service.showFirstRunNotification(script)).resolves.toEqual({
      result: { notificationId: 'notification-id' },
    });
    await expect(service.showFirstRunNotification(script)).resolves.toEqual({ result: null });

    expect(chrome.notifications.create).toHaveBeenCalledOnce();
    expect(chrome.notifications.create.mock.calls[0][1]).toEqual(
      expect.objectContaining({ title: 'Example Script ran for the first time' })
    );
    expect(stored.firstRunNotifiedScripts).toEqual(['script-1']);
  });

  it('does not show first-run notices when either notification setting is disabled', async () => {
    const stored = {
      settings: { confirmFirstRun: true, showNotifications: false },
      firstRunNotifiedScripts: [],
    };
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.map((key) => [key, stored[key]]));
          }),
          set: vi.fn(async (values) => Object.assign(stored, values)),
        },
      },
      notifications: { create: vi.fn() },
    };

    await expect(
      new NotificationService().showFirstRunNotification({ id: 'script-2', name: 'Muted' })
    ).resolves.toEqual({ result: null });
    expect(chrome.notifications.create).not.toHaveBeenCalled();
    expect(stored.firstRunNotifiedScripts).toEqual([]);
  });
});
