import { ElementSelector } from './core.js';
import { ElementSelectorMenu } from './menu.js';

const elementSelectorInstance = new ElementSelector();

// inject on demand
if (!globalThis.__ctwkElementSelector) {
  globalThis.__ctwkElementSelector = true;
  chrome.runtime.onMessage.addListener(handleMessage);
}

function handleMessage(message) {
  if (message.action === 'startSelection') {
    const menu = new ElementSelectorMenu(elementSelectorInstance);
    menu.start();
  } else if (message.action === 'stopSelection') {
    elementSelectorInstance.cleanup();
  }
}
