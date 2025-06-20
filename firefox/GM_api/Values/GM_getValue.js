if (typeof GM_getValue === 'undefined') {
  // GM_getValue should be synchronous per Greasemonkey/Tampermonkey spec.
  // Store values in localStorage so we can return them immediately.
  window.GM_getValue = (name, defaultValue) => {
    try {
      const raw = localStorage.getItem(`GM_value_${name}`);
      if (raw === null) {
        return defaultValue;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.error('GM_getValue exception:', e);
      return defaultValue;
    }
  };
}
