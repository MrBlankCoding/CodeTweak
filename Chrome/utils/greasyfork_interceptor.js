/* global chrome */
//intercept installs from greasyfork
//prevent other editors :)
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

      try {
        chrome.runtime.sendMessage({ action: 'greasyForkInstall', url: href });
      } catch (err) {
        // This can happen if the extension context is getting destroyed (e.g., page nav).
        // It's safe to just log and ignore.
        console.warn('CodeTweak: GreasyFork intercept sendMessage failed:', err);
      }
    },
    true // capture phase to intercept before navigation happens
  );
})();
