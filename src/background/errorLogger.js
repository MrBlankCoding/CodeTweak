import logger from '../shared/utils/logger.js';

export function normalizeStackTrace(stack) {
  if (!stack) return '';
  return stack
    .replace(/blob:[^\s)]+/g, 'blob:URL')
    .replace(/:\d+:\d+/g, '')
    .replace(/at\s+blob:URL/g, 'at blob:URL')
    .trim();
}

export async function storeScriptError(scriptId, error) {
  try {
    const { settings = {} } = await chrome.storage.local.get('settings');
    if (!settings.enhancedDebugging) {
      return;
    }

    const storageKey = `scriptErrors_${scriptId}`;
    const { [storageKey]: stored = [] } = await chrome.storage.local.get(storageKey);
    const existingErrors = Array.isArray(stored) ? stored : [];
    const normalizedNewStack = normalizeStackTrace(error.stack);
    const isDuplicate = existingErrors.some((existingError) => {
      const normalizedExistingStack = normalizeStackTrace(existingError.stack);
      return (
        existingError.message === error.message && normalizedExistingStack === normalizedNewStack
      );
    });

    if (isDuplicate) {
      return;
    }

    const updatedErrors = [error, ...existingErrors].slice(0, 50);
    await chrome.storage.local.set({ [storageKey]: updatedErrors });

    chrome.runtime
      .sendMessage({
        type: 'SCRIPT_ERROR_UPDATE',
        scriptId,
        error,
      })
      .catch(() => {
        // Editor might not be open, ignore
      });
  } catch (err) {
    logger.error('Failed to store script error:', err);
  }
}

export async function clearScriptErrors(scriptId) {
  try {
    const storageKey = `scriptErrors_${scriptId}`;
    await chrome.storage.local.remove(storageKey);
  } catch (err) {
    logger.error('Failed to clear script errors:', err);
  }
}
