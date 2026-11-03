import logger from './logger.js';
let cachedMessages = null;
let cachedLanguage = null;
let cachedCustomLanguage = false;

export async function getEffectiveLanguage() {
  try {
    const { settings = {} } = await chrome.storage.local.get('settings');
    const userLanguage = settings.language || 'auto';

    if (userLanguage === 'auto') {
      // Use Chrome's automatic detection
      return chrome.i18n.getUILanguage().split('-')[0]; // e.g., 'en-US' -> 'en'
    }

    return userLanguage;
  } catch (error) {
    logger.error('Error getting language:', error);
    return 'en';
  }
}

async function loadMessages(lang) {
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);

    if (!response.ok) {
      const fallbackUrl = chrome.runtime.getURL('_locales/en/messages.json');
      const fallbackResponse = await fetch(fallbackUrl);
      return await fallbackResponse.json();
    }

    return await response.json();
  } catch (error) {
    logger.error('Error loading messages:', error);
    return {};
  }
}

export async function applyTranslations() {
  const effectiveLang = await getEffectiveLanguage();
  const { settings = {} } = await chrome.storage.local.get('settings');
  const useCustomLanguage = settings.language && settings.language !== 'auto';
  cachedCustomLanguage = Boolean(useCustomLanguage);

  if (useCustomLanguage) {
    if (!cachedMessages || cachedLanguage !== effectiveLang) {
      cachedMessages = await loadMessages(effectiveLang);
      cachedLanguage = effectiveLang;
    }
  }

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    const attr = element.getAttribute('data-i18n-attr');

    let text;
    if (useCustomLanguage && cachedMessages) {
      text = cachedMessages[key]?.message || chrome.i18n.getMessage(key) || key;
    } else {
      text = chrome.i18n.getMessage(key) || key;
    }

    if (attr) {
      element.setAttribute(attr, text);
    } else {
      element.textContent = text;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const key = element.getAttribute('data-i18n-title');
    if (!key) return;

    const text =
      useCustomLanguage && cachedMessages
        ? cachedMessages[key]?.message || chrome.i18n.getMessage(key) || key
        : chrome.i18n.getMessage(key) || key;

    element.setAttribute('title', text);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (!key) return;

    const text =
      useCustomLanguage && cachedMessages
        ? cachedMessages[key]?.message || chrome.i18n.getMessage(key) || key
        : chrome.i18n.getMessage(key) || key;

    element.setAttribute('placeholder', text);
  });

  document.documentElement.setAttribute('lang', effectiveLang);
}

export function getMessageSync(key) {
  try {
    if (cachedCustomLanguage && cachedMessages?.[key]?.message) {
      return cachedMessages[key].message;
    }

    const chromeMessage = chrome.i18n.getMessage(key);
    if (chromeMessage) {
      return chromeMessage;
    }

    return key;
  } catch {
    return key;
  }
}
