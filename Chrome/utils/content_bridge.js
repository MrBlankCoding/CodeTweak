// This runs in the isolated world
// Acts as a bridge between user scripts and the extension itself for saftey

const extensionId = chrome.runtime.id;

window.addEventListener('message', (event) => {
  // Only accept messages from OUR api
  if (
    event.source !== window || 
    !event.data || 
    event.data.type !== 'GM_API_REQUEST' || 
    event.data.extensionId !== extensionId
  ) {
    return;
  }

  const { messageId, action, payload: originalPayload } = event.data;

  // create the payload for the background
  chrome.runtime.sendMessage({ 
    type: 'GM_API_REQUEST', 
    payload: { 
      action: action, 
      ...originalPayload 
    },
  }, (response) => {
    let responsePayload = {};
    if (chrome.runtime.lastError) {
      console.error(`CodeTweak: Error in background for GM_API action ${action}:`, chrome.runtime.lastError.message);
      responsePayload.error = chrome.runtime.lastError.message;
    } else if (response && response.error) {
      console.error(`CodeTweak: Error from background for GM_API action ${action}:`, response.error);
      responsePayload.error = response.error;
    } else {
      responsePayload.result = response ? response.result : undefined;
    }

    window.postMessage({
      type: 'GM_API_RESPONSE',
      extensionId: extensionId,
      messageId,
      ...responsePayload
    }, '*'); // post back to main world
  });
});

