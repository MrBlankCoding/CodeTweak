if (typeof GM_deleteValue === 'undefined') {
  window.GM_deleteValue = (name) => {
    try {
      localStorage.removeItem(`GM_value_${name}`);
    } catch (e) {
      console.error('GM_deleteValue exception:', e);
    }
  };
}
