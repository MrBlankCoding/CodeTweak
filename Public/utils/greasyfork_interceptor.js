/* global chrome */
// Greasy Fork Install Interceptor
// Listens for clicks on Greasy Fork "Install" buttons, prevents default navigation,
// and forwards the script URL to the background service worker so the user can
// review it inside CodeTweak's editor before installation.

(function interceptGreasyForkInstall() {
  if (!location.hostname.includes('greasyfork.org')) return;

  // Delegate click handling for any anchor that links to a .user.js file
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target.closest('a');
      if (!anchor) return;

      const href = anchor.href;
      if (!href || !/\.user\.js(\?|$)/i.test(href)) return;

      // Only intercept simple left-clicks without modifier keys
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return; // allow default behavior for modified clicks
      }

      event.preventDefault();
      event.stopPropagation();

      chrome.runtime.sendMessage({ action: 'greasyForkInstall', url: href }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('CodeTweak: GreasyFork intercept error:', chrome.runtime.lastError.message);
        } else if (response && response.error) {
          console.error('CodeTweak: GreasyFork install error:', response.error);
        }
      });
    },
    true // capture phase to intercept before navigation happens
  );
})();
