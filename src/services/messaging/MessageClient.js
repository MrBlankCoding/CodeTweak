import { browser } from '../../shared/browserAdapter.js';
import logger from '../../shared/utils/logger.js';

class MessageClient {
  async send(action, data = {}) {
    try {
      return await browser.runtime.sendMessage({ action, ...data });
    } catch (error) {
      logger.warn(`Message failed: ${action}`, error);
      return { error: error.message };
    }
  }

  async sendToTab(tabId, action, data = {}) {
    try {
      return await browser.tabs.sendMessage(tabId, { action, ...data });
    } catch (error) {
      logger.warn(`Message to tab ${tabId} failed: ${action}`, error);
      return { error: error.message };
    }
  }

  connect(name = 'CodeTweak') {
    return browser.runtime.connect({ name });
  }
}

export const messageClient = new MessageClient();
