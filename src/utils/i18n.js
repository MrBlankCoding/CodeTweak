/**
 * Custom i18n helper that allows manual language override
 * Falls back to Chrome's automatic detection if set to 'auto'
 */

let cachedMessages = null;
let cachedLanguage = null;

/**
 * Get the effective language (user's choice or browser default)
 */
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
    console.error('Error getting language:', error);
    return 'en';
  }
}

/**
 * Load messages for a specific language
 */
async function loadMessages(lang) {
  try {
    // Try to load the requested language
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    
    if (!response.ok) {
      // Fallback to English if language not found
      const fallbackUrl = chrome.runtime.getURL('_locales/en/messages.json');
      const fallbackResponse = await fetch(fallbackUrl);
      return await fallbackResponse.json();
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error loading messages:', error);
    return {};
  }
}

/**
 * Get a translated message
 * @param {string} key - Message key (e.g., 'appName', 'settingsTitle')
 * @param {string} [forceLang] - Force a specific language (optional)
 */
export async function getMessage(key, forceLang = null) {
  try {
    const effectiveLang = forceLang || await getEffectiveLanguage();
    
    // Check if user selected 'auto' - use Chrome's built-in
    const { settings = {} } = await chrome.storage.local.get('settings');
    if (settings.language === 'auto' || !settings.language) {
      return chrome.i18n.getMessage(key) || key;
    }
    
    // Load custom language if not cached or language changed
    if (!cachedMessages || cachedLanguage !== effectiveLang) {
      cachedMessages = await loadMessages(effectiveLang);
      cachedLanguage = effectiveLang;
    }
    
    return cachedMessages[key]?.message || key;
  } catch (error) {
    console.error('Error getting message:', error);
    return key;
  }
}

/**
 * Apply translations to all elements with data-i18n attributes
 */
export async function applyTranslations() {
  const effectiveLang = await getEffectiveLanguage();
  
  // Load messages if needed
  const { settings = {} } = await chrome.storage.local.get('settings');
  const useCustomLanguage = settings.language && settings.language !== 'auto';
  
  if (useCustomLanguage) {
    if (!cachedMessages || cachedLanguage !== effectiveLang) {
      cachedMessages = await loadMessages(effectiveLang);
      cachedLanguage = effectiveLang;
    }
  }
  
  // Apply to all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(element => {
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
  
  // Set document language attribute
  document.documentElement.setAttribute('lang', effectiveLang);
}

/**
 * Get message synchronously (for already-loaded messages)
 * @param {string} key - Message key
 */
export function getMessageSync(key) {
  try {
    // First try Chrome's built-in (works for auto/browser default)
    const chromeMessage = chrome.i18n.getMessage(key);
    if (chromeMessage) {
      return chromeMessage;
    }
    
    // Then try cached custom language messages
    if (cachedMessages && cachedMessages[key]) {
      return cachedMessages[key].message;
    }
    
    // Fallback to key itself
    return key;
  } catch {
    return key;
  }
}
