//intercept installs from greasyfork
//prevent other editors :)
(function interceptGreasyForkInstall() {
  if (!location.hostname.includes('greasyfork.org')) return;

  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target.closest('a');
      if (!anchor) return;

      const href = anchor.href;
      if (!href || !/\.user\.js(\?|$)/i.test(href)) return;

      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return; 
      }

      event.preventDefault();
      event.stopPropagation();

      try {
        chrome.runtime.sendMessage({ action: 'greasyForkInstall', url: href });
      } catch (err) {
        console.warn('CodeTweak: GreasyFork intercept sendMessage failed:', err);
      }
    },
    true 
  );
})();
