chrome.runtime.onMessage.addListener(async (request) => {
  if (request.target !== 'offscreen' || request.type !== 'copy-to-clipboard') {
    return;
  }

  try {
    await navigator.clipboard.writeText(request.data);
    
    chrome.runtime.sendMessage({
      type: 'offscreen-clipboard-response',
      success: true,
      requestId: request.requestId
    });
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    
    chrome.runtime.sendMessage({
      type: 'offscreen-clipboard-response',
      success: false,
      error: error.message,
      requestId: request.requestId
    });
  }
});