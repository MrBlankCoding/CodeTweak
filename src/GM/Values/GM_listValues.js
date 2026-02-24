import logger from '../../utils/logger.js';
if (typeof GM_listValues === 'undefined') {
  window.GM_listValues = () => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('GM_value_'));
      return keys.map((k) => k.replace('GM_value_', ''));
    } catch (e) {
      logger.error('GM_listValues exception:', e);
      return [];
    }
  };
}
