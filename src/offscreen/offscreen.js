import logger from '../shared/utils/logger.js';
(globalThis.browser ?? globalThis.chrome).runtime.onMessage.addListener(async (request) => {
  if (request.target !== 'offscreen' || request.type !== 'copy-to-clipboard') {
    return;
  }

  try {
    await navigator.clipboard.writeText(request.data);

    (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({
      type: 'offscreen-clipboard-response',
      success: true,
      requestId: request.requestId,
    });
  } catch (error) {
    logger.error('Failed to copy to clipboard:', error);

    (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({
      type: 'offscreen-clipboard-response',
      success: false,
      error: error.message,
      requestId: request.requestId,
    });
  }
});
