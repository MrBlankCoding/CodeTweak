import logger from '../../utils/logger.js';
if (typeof GM_setValue === 'undefined') {
  window.GM_setValue = (name, value) => {
    try {
      localStorage.setItem(`GM_value_${name}`, JSON.stringify(value));
    } catch (e) {
      logger.error('GM_setValue exception:', e);
    }
  };
}
