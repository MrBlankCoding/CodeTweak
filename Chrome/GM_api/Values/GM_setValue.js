if (typeof GM_setValue === 'undefined') {
  // Synchronous implementation using localStorage for immediate persistence.
  window.GM_setValue = (name, value) => {
    try {
      localStorage.setItem(`GM_value_${name}`, JSON.stringify(value));
    } catch (e) {
      console.error('GM_setValue exception:', e);
    }
  };
}
