import logger from '../shared/utils/logger.js';

const FIRST_RUN_NOTIFICATION_KEY = 'firstRunNotifiedScripts';
let firstRunNotificationQueue = Promise.resolve();

export class NotificationService {
  async showNotification(details) {
    const { settings = {} } = await chrome.storage.local.get('settings');
    if (settings.showNotifications === false) {
      return { result: null };
    }

    const options = typeof details === 'object' && details ? details : { text: details };

    const baseOptions = {
      type: 'basic',
      title: options.title || 'CodeTweak Notification',
      message: String(options.text || ''),
      silent: options.silent === true,
    };

    const defaultIconUrl = chrome.runtime.getURL('assets/icons/icon128.png');
    const notificationId = `ct-${crypto.randomUUID()}`;

    return new Promise((resolve) => {
      chrome.notifications.create(
        notificationId,
        { ...baseOptions, iconUrl: defaultIconUrl },
        (createdId) => {
          if (chrome.runtime.lastError) {
            logger.warn('Notification creation failed:', chrome.runtime.lastError.message);
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          const id = createdId || notificationId;
          if (Number.isFinite(options.timeout) && options.timeout > 0) {
            setTimeout(() => chrome.notifications.clear(id, () => {}), options.timeout);
          }
          resolve({ result: { notificationId: id } });
        }
      );
    });
  }

  showFirstRunNotification(script) {
    const run = firstRunNotificationQueue.then(() => this.notifyFirstRun(script));
    firstRunNotificationQueue = run.catch(() => {});
    return run;
  }

  async notifyFirstRun(script) {
    const { settings = {}, [FIRST_RUN_NOTIFICATION_KEY]: notifiedIds = [] } =
      await chrome.storage.local.get(['settings', FIRST_RUN_NOTIFICATION_KEY]);
    if (
      settings.confirmFirstRun !== true ||
      settings.showNotifications === false ||
      !script?.id ||
      (Array.isArray(notifiedIds) && notifiedIds.includes(script.id))
    ) {
      return { result: null };
    }

    const response = await this.showNotification({
      title: `${script.name || 'Script'} ran for the first time`,
      text: 'CodeTweak will run it automatically on matching websites.',
    });
    if (!response?.result?.notificationId) return response;

    const notified = Array.isArray(notifiedIds) ? notifiedIds : [];
    await chrome.storage.local.set({
      [FIRST_RUN_NOTIFICATION_KEY]: [...notified, script.id],
    });
    return response;
  }
}
