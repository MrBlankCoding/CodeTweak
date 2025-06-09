chrome.runtime.onMessage.addListener(async (request) => {
  if (request.target !== 'offscreen') {
    return;
  }

  if (request.type === 'copy-to-clipboard') {
    try {
      const tempInput = document.createElement('textarea');
      document.body.appendChild(tempInput);
      tempInput.value = request.data;
      tempInput.focus();
      tempInput.select(); // Select the text
      try {
        // try the new API
        await navigator.clipboard.writeText(request.data);
      } catch (copyError) {
        // fall back for older browserss
        console.warn('navigator.clipboard.writeText failed, trying document.execCommand:', copyError);
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (execCommandError) {
          console.error('document.execCommand also failed:', execCommandError);
          throw execCommandError; // Re-throw if execCommand itself errors
        }
        if (!success) {
          throw new Error('Failed to copy using document.execCommand.');
        }
      }
      document.body.removeChild(tempInput);
      chrome.runtime.sendMessage({
        type: 'offscreen-clipboard-response',
        success: true,
        requestId: request.requestId
      });
    } catch (e) {
      console.error('Offscreen document: Failed to copy to clipboard:', e);
      chrome.runtime.sendMessage({
        type: 'offscreen-clipboard-response',
        success: false,
        error: e.message || 'Failed to copy',
        requestId: request.requestId
      });
    }
  }
});
