import logger from '../../utils/logger.js';
if (typeof GM_deleteValue === 'undefined') {
  window.GM_deleteValue = (name) => {
    try {
      localStorage.removeItem(`GM_value_${name}`);
    } catch (e) {
      logger.error('GM_deleteValue exception:', e);
    }
  };
}
