import { browser } from '../shared/browserAdapter.js';
import logger from '../shared/utils/logger.js';

export class NotificationService {
  async showNotification(details, ondone) {
    const options =
      typeof details === 'object' && details ? details : { text: details, title: ondone };

    const baseOptions = {
      type: 'basic',
      title: options.title || 'CodeTweak Notification',
      message: options.text || '',
    };

    const defaultIconUrl = browser.runtime.getURL('assets/icons/icon128.png');

    return new Promise((resolve) => {
      browser.notifications.create({ ...baseOptions, iconUrl: defaultIconUrl }, () => {
        if (browser.runtime.lastError) {
          logger.warn('Notification creation failed:', browser.runtime.lastError.message);
          resolve({ error: browser.runtime.lastError.message });
          return;
        }
        resolve({ result: null });
      });
    });
  }
}
