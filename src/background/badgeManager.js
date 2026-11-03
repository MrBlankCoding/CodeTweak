import logger from '../shared/utils/logger.js';

const DEFAULT_BADGE_COLOR = '#61afef';
let badgeColor = DEFAULT_BADGE_COLOR;

export function setBadgeColor(color) {
  badgeColor = /^#[\da-f]{6}$/i.test(color || '') ? color : DEFAULT_BADGE_COLOR;
  return badgeColor;
}

export function isIgnorableTabError(error) {
  const ignorableMessages = ['No tab with id', 'Invalid tab ID', 'Receiving end does not exist'];
  return ignorableMessages.some((msg) => error.message?.includes(msg));
}

export function safeSetBadge(tabId, text = '', color = badgeColor) {
  chrome.action.setBadgeText({ tabId, text }).catch((err) => {
    if (!isIgnorableTabError(err)) {
      logger.warn(`Error setting badge for tab ${tabId}:`, err.message);
    }
  });

  if (text) {
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  }
}

export async function updateBadgeForTab(tabId, url, getFilteredScripts) {
  if (!url?.startsWith('http')) {
    safeSetBadge(tabId);
    return;
  }

  try {
    const scriptsToRun = await getFilteredScripts(url);
    const count = Array.isArray(scriptsToRun) ? scriptsToRun.length : 0;
    safeSetBadge(tabId, count > 0 ? count.toString() : '');
  } catch (error) {
    logger.error(`Error updating badge for tab ${tabId}:`, error);
    safeSetBadge(tabId);
  }
}

export async function updateAllTabBadges(updateBadgeForTab) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (error) {
    logger.warn('Failed to query tabs for badges:', error.message);
    return;
  }

  await Promise.allSettled(
    tabs.map((tab) => {
      if (tab.id && tab.url) {
        return updateBadgeForTab(tab.id, tab.url);
      } else if (tab.id) {
        safeSetBadge(tab.id);
      }
      return Promise.resolve();
    })
  );
}
