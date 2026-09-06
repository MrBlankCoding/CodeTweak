import { browser } from '../shared/browserAdapter.js';
import logger from '../shared/utils/logger.js';

export class ClipboardService {
  async setClipboard(text, sender, setupOffscreenDocument) {
    const textToCopy = typeof text === 'string' ? text : String(text ?? '');
    if (textToCopy.length > 100_000) {
      return { error: 'Clipboard data exceeds 100KB limit.' };
    }

    if (browser.offscreen?.['createDocument'] && browser.offscreen?.['hasDocument']) {
      try {
        await setupOffscreenDocument();
        browser.runtime.sendMessage({
          target: 'offscreen',
          type: 'copy-to-clipboard',
          data: textToCopy,
        });
        return { result: null };
      } catch (e) {
        logger.warn('Offscreen clipboard failed:', e);
      }
    }

    const tabId = sender?.tab?.id;
    if (tabId && browser.scripting) {
      try {
        await browser.scripting.executeScript({
          target: { tabId },
          func: (t) => {
            const el = document.createElement('textarea');
            el.value = t;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
          },
          args: [textToCopy],
        });
        return { result: null };
      } catch (e) {
        logger.warn('Scripting clipboard fallback failed:', e);
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        return { result: null };
      } catch (e) {
        logger.debug('navigator.clipboard.writeText failed:', e);
      }
    }

    return { error: 'Clipboard API is unavailable in this browser context.' };
  }
}
