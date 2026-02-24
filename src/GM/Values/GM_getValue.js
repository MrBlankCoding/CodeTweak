import logger from '../../utils/logger.js';
if (typeof GM_getValue === 'undefined') {
  window.GM_getValue = (name, defaultValue) => {
    try {
      const raw = localStorage.getItem(`GM_value_${name}`);
      if (raw === null) {
        return defaultValue;
      }
      return JSON.parse(raw);
    } catch (e) {
      logger.error('GM_getValue exception:', e);
      return defaultValue;
    }
  };
}
