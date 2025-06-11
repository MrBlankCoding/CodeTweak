if (typeof GM_listValues === 'undefined') {
  window.GM_listValues = () => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('GM_value_'));
      return keys.map(k => k.replace('GM_value_', ''));
    } catch (e) {
      console.error('GM_listValues exception:', e);
      return [];
    }
  };
}
