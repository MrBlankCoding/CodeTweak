import logger from '../../shared/utils/logger.js';
import { GMAPIHandler } from '../gmApiHandler.js';
import { storeScriptError, clearScriptErrors } from '../errorLogger.js';
import { browser } from '../../shared/browserAdapter.js';

export class MessageRouter {
  constructor({ state, scriptRegistry, messageHandlers, displayService }) {
    this.state = state;
    this.scriptRegistry = scriptRegistry;
    this.messageHandlers = messageHandlers;
    this.displayService = displayService;
  }

  handleMessage(message, sender, sendResponse) {
    logger.info('Message received:', message.type || message.action);

    if (message.type === 'GM_API_REQUEST') {
      this.handleGmApiRequest(message, sender, sendResponse);
      return true;
    }

    if (message.type === 'SCRIPT_ERROR') {
      this.handleScriptError(message, sendResponse);
      return true;
    }

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

  handleGmApiRequest(message, sender, sendResponse) {
    if (!message.payload) {
      logger.error('GM_API_REQUEST received with no payload.');
      sendResponse({ error: 'Request payload is missing.' });
      return;
    }

    const { action, scriptId, ...payload } = message.payload;
    const handler = new GMAPIHandler(scriptId, sender, this.state);

    if (typeof handler[action] !== 'function' || action === 'authorize') {
      sendResponse({ error: `Unknown GM API action: ${action}` });
      return;
    }

    Promise.resolve()
      .then(() => handler.authorize(action))
      .then((authError) => {
        if (authError) {
          sendResponse({ error: authError });
          return null;
        }
        if (action === 'setClipboard') {
          return handler.setClipboard({
            ...payload,
            setupOffscreenDocument: () => this.displayService.setupOffscreenDocument(),
          });
        }
        return handler[action](payload);
      })
      .then((response) => {
        if (response !== null) sendResponse(response ?? { result: null });
      })
      .catch((error) => {
        logger.error(`GM API error [${action}]:`, error);
        sendResponse({ error: error.message });
      });
  }

  handleScriptError(message, sendResponse) {
    if (typeof message.scriptId !== 'string' || !message.error) {
      sendResponse({ error: 'Invalid script error payload.' });
      return;
    }
    storeScriptError(message.scriptId, message.error).then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ error: error.message })
    );
  }

  handleClearScriptErrors(message, sendResponse) {
    clearScriptErrors(message.scriptId).then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ error: error.message })
    );
  }

  handleGetScriptErrors(message, sendResponse) {
    const storageKey = `scriptErrors_${message.scriptId}`;
    browser.storage.local.get(storageKey).then(
      (result) => {
        const errors = result[storageKey];
        sendResponse({ errors: Array.isArray(errors) ? errors : [] });
      },
      (error) => sendResponse({ error: error.message })
    );
  }

  handleGenericAction(handler, message, sender, sendResponse) {
    Promise.resolve(handler(message, sender))
      .then(sendResponse)
      .catch((error) => {
        logger.error(`Message handler error [${message.action}]:`, error);
        sendResponse({ error: error.message });
      });
  }
}
