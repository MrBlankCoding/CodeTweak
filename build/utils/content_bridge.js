(() => {
  // src/utils/content_bridge.js
  var extensionId = chrome.runtime.id;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "GM_API_REQUEST" || event.data.extensionId !== extensionId) {
      return;
    }
    const { messageId, action, payload: originalPayload } = event.data;
    chrome.runtime.sendMessage({
      type: "GM_API_REQUEST",
      payload: {
        action,
        ...originalPayload
      }
    }, (response) => {
      let responsePayload = {};
      if (chrome.runtime.lastError) {
        console.error(`CodeTweak: Error in background for GM_API action ${action}:`, chrome.runtime.lastError.message);
        responsePayload.error = chrome.runtime.lastError.message;
      } else if (response && response.error) {
        console.error(`CodeTweak: Error from background for GM_API action ${action}:`, response.error);
        responsePayload.error = response.error;
      } else {
        responsePayload.result = response ? response.result : void 0;
      }
      window.postMessage({
        type: "GM_API_RESPONSE",
        extensionId,
        messageId,
        ...responsePayload
      }, "*");
    });
  });
})();
