window.applyTheme = function() {
  chrome.storage.local.get('settings', function(result) {
    if (result.settings && result.settings.accentColor) {
      document.documentElement.style.setProperty('--accent-color', result.settings.accentColor);
    } else {
      document.documentElement.style.setProperty('--accent-color', '#007bff');
    }
  });
}