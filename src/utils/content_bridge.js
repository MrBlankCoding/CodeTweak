// This runs in the isolated world
// Acts as a bridge between user scripts and the extension itself for saftey

const extensionId =
  typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id
    ? chrome.runtime.id
    : null;

function toCloneable(value) {
  return JSON.parse(JSON.stringify(value));
}

if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  typeof chrome.runtime.onMessage?.addListener === "function"
) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "GM_VALUE_CHANGED") {
      window.postMessage(
        {
          type: "GM_VALUE_CHANGED",
          payload: message.payload,
        },
        "*"
      );
    }
    return false;
  });
}

window.addEventListener("message", (event) => {
  // Only accept messages from our extension
  if (event.source !== window || !event.data) {
    return;
  }

  // Handle script error messages
  if (event.data.type === "SCRIPT_ERROR") {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      chrome.runtime.sendMessage(
        {
          type: "SCRIPT_ERROR",
          scriptId: event.data.scriptId,
          error: event.data.error,
        },
        () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error(
              "[CodeTweak Content Bridge] Error forwarding SCRIPT_ERROR:",
              chrome.runtime.lastError
            );
          }
        }
      );
    }
    return;
  }

  // Handle GM API requests
  if (
    event.data.type !== "GM_API_REQUEST" ||
    event.data.extensionId !== extensionId
  ) {
    return;
  }

  const { messageId, action, payload: originalPayload } = event.data;

  if (
    !(
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    )
  ) {
    console.error(
      "CodeTweak: chrome.runtime.sendMessage is not available. Cannot bridge GM_API request."
    );
    window.postMessage(
      {
        type: "GM_API_RESPONSE",
        extensionId: extensionId,
        messageId: messageId,
        error:
          "Extension context has been invalidated. Please reload the page.",
      },
      "*"
    );
    return;
  }

  let payload;
  try {
    payload = toCloneable({
      action: action,
      ...originalPayload,
    });
  } catch {
    window.postMessage(
      {
        type: "GM_API_RESPONSE",
        extensionId: extensionId,
        messageId,
        error: "Request payload is not serializable.",
      },
      "*"
    );
    return;
  }

  // create the payload for the background
  chrome.runtime.sendMessage(
    {
      type: "GM_API_REQUEST",
      payload,
    },
    (_response) => {
      let responsePayload = {};
      if (chrome.runtime.lastError) {
        console.error(
          `CodeTweak: Error in background for GM_API action ${action}:`,
          chrome.runtime.lastError.message
        );
        responsePayload.error = chrome.runtime.lastError.message;
      } else if (_response && _response.error) {
        console.error(
          `CodeTweak: Error from background for GM_API action ${action}:`,
          _response.error
        );
        responsePayload.error = _response.error;
      } else {
        responsePayload.result = _response ? _response.result : undefined;
      }

      window.postMessage(
        {
          type: "GM_API_RESPONSE",
          extensionId: extensionId,
          messageId,
          ...responsePayload,
        },
        "*"
      ); // post back to main world
    }
  );
});
