import logger from '../../shared/utils/logger.js';
import { GMAPIHandler } from '../gmApiHandler.js';
import { clearScriptErrors } from '../errorLogger.js';

// only allow these API's to be called from the userscript world
// prevent malcious scripts from calling internal handler methods
// (value change listeners are page-side; the background pushes changes)
export const GM_API_ACTIONS = new Set([
  'getAllValues',
  'setValue',
  'deleteValue',
  'xhrAbort',
  'reportError',
  'openInTab',
  'notification',
  'setClipboard',
  'download',
  'xmlhttpRequest',
]);

export class MessageRouter {
  constructor({ state, scriptRegistry, messageHandlers, displayService }) {
    this.state = state;
    this.scriptRegistry = scriptRegistry;
    this.messageHandlers = messageHandlers;
    this.displayService = displayService;
  }

  handleMessage(message, sender, sendResponse) {
    logger.info('Message received:', message.type || message.action);

    if (message.type === 'CLEAR_SCRIPT_ERRORS') {
      this.handleClearScriptErrors(message, sendResponse);
      return true;
    }

    if (message.type === 'GET_SCRIPT_ERRORS') {
      this.handleGetScriptErrors(message, sendResponse);
      return true;
    }

    const handler = this.messageHandlers[message.action];
    if (handler) {
      this.handleGenericAction(handler, message, sender, sendResponse);
      return true;
    }

    if (message.type !== 'offscreen-clipboard-response') {
      sendResponse({ error: 'Unknown action' });
    }
    return false;
  }

  // Messages from userscripts (runtime.onUserScriptMessage). Only GM API
  // requests are accepted on this channel; extension actions are not.
  handleUserScriptMessage(message, sender, sendResponse) {
    if (message?.type === 'CODETWEAK_FIRST_RUN') {
      this.handleGenericAction(this.messageHandlers.scriptFirstRun, message, sender, sendResponse);
      return true;
    }

    if (message?.type !== 'GM_API_REQUEST') {
      sendResponse({ error: 'Unsupported message.' });
      return false;
    }
    this.handleGmApiRequest(message, sender, sendResponse);
    return true;
  }

  async handleGmApiRequest(message, sender, sendResponse) {
    if (!message.payload) {
      logger.error('GM_API_REQUEST received with no payload.');
      sendResponse({ error: 'Request payload is missing.' });
      return;
    }

    const { action, scriptId, ...payload } = message.payload;
    const handler = new GMAPIHandler(scriptId, sender, this.state);

    if (!GM_API_ACTIONS.has(action)) {
      sendResponse({ error: `Unknown GM API action: ${action}` });
      return;
    }

    try {
      const authError = await handler.authorize(action, payload);
      if (authError) {
        sendResponse({ error: authError });
        return;
      }

      let response;
      if (action === 'setClipboard') {
        response = await handler.setClipboard({
          ...payload,
          setupOffscreenDocument: () => this.displayService.setupOffscreenDocument(),
        });
      } else {
        response = await handler[action](payload);
      }

      if (response !== null) {
        sendResponse(response ?? { result: null });
      }
    } catch (error) {
      logger.error(`GM API error [${action}]:`, error);
      sendResponse({ error: error.message });
    }
  }

  async handleClearScriptErrors(message, sendResponse) {
    try {
      await clearScriptErrors(message.scriptId);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async handleGetScriptErrors(message, sendResponse) {
    try {
      const storageKey = `scriptErrors_${message.scriptId}`;
      const result = await chrome.storage.local.get(storageKey);
      const errors = result[storageKey];
      sendResponse({ errors: Array.isArray(errors) ? errors : [] });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async handleGenericAction(handler, message, sender, sendResponse) {
    try {
      const response = await handler(message, sender);
      sendResponse(response);
    } catch (error) {
      logger.error(`Message handler error [${message.action}]:`, error);
      sendResponse({ error: error.message });
    }
  }
}
