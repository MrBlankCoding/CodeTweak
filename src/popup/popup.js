import logger from '../shared/utils/logger.js';
import { createIcon, renderIcons } from '../shared/utils/icons.js';
import {
  urlMatchesPattern,
  isValidWebpage,
  generateUrlMatchPattern,
} from '../shared/utils/urls.js';
import { applyTranslations, getMessageSync } from '../shared/utils/i18n.js';
import { renderUserScriptsBanner } from '../shared/userScriptsBanner.js';
import { storageService as ScriptManager } from '../services/storage/StorageService.js';

document.addEventListener('DOMContentLoaded', async () => {
  renderIcons();

  const scriptList = document.getElementById('scriptList');
  const emptyState = document.getElementById('emptyState');
  const createScriptBtn = document.getElementById('createScript');
  const openDashboardBtn = document.getElementById('openDashboard');
  const reportIssueLink = document.getElementById('reportIssue');
  const versionLabel = document.getElementById('extensionVersion');
  const version = chrome.runtime.getManifest?.().version;
  if (versionLabel && version) versionLabel.textContent = `v${version}`;

  let currentTabUrl = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab?.url || '';
  } catch (err) {
    logger.error('Error getting current tab:', err);
  }

  createScriptBtn.addEventListener('click', () => {
    let url = ScriptManager.getEditorUrl();
    if (currentTabUrl && isValidWebpage(currentTabUrl)) {
      const pattern = generateUrlMatchPattern(currentTabUrl, 'domain');
      if (pattern) {
        url += `?targetUrl=${encodeURIComponent(pattern)}`;
      }
    }
    chrome.tabs.create({ url });
  });

  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  reportIssueLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/MrBlankCoding/CodeTweak/issues/new' });
  });

  await applyTheme();
  renderUserScriptsBanner(document.getElementById('userScriptsBannerSlot'));
  await applyTranslations();
  await loadScripts(currentTabUrl);
  await loadMenuCommands();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scriptsUpdated') {
      loadMenuCommands();
    }
  });

  async function loadScripts(url) {
    const scripts = await ScriptManager.getAllScripts();
    const list = Array.isArray(scripts) ? scripts : [];
    const matchingScripts = list.filter((script) => {
      const targets = Array.isArray(script.targetUrls) ? script.targetUrls : [];
      if (!Array.isArray(targets)) return false;
      return targets.some((pattern) => urlMatchesPattern(url, pattern));
    });

    emptyState.style.display = 'none';

    if (matchingScripts.length === 0) {
      emptyState.style.display = 'flex';
      emptyState.replaceChildren();

      if (list.length === 0) {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'empty-icon';
        iconDiv.appendChild(createIcon('file-text'));

        const p = document.createElement('p');
        p.appendChild(document.createTextNode(getMessageSync('popupCreateFirst')));

        emptyState.appendChild(iconDiv);
        emptyState.appendChild(p);
      } else {
        const p = document.createElement('p');
        p.appendChild(document.createTextNode(getMessageSync('popupNoScriptsForPage')));
        p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(getMessageSync('popupCreateOrVisit')));
        emptyState.appendChild(p);
      }
      return;
    }

    matchingScripts.sort((a, b) => a.name.localeCompare(b.name));

    matchingScripts.forEach((script) => {
      scriptList.appendChild(createScriptElement(script));
    });
  }

  function createScriptElement(script) {
    const item = document.createElement('div');
    item.className = 'script-item';
    item.dataset.id = script.id;

    if (script.enabled === false) {
      item.classList.add('script-disabled');
    }

    if (script.icon && /^(https?:|data:image\/)/i.test(script.icon)) {
      const iconImg = document.createElement('img');
      iconImg.src = script.icon;
      iconImg.alt = '';
      iconImg.className = 'script-icon';
      iconImg.onerror = () => iconImg.remove();
      item.appendChild(iconImg);
    }

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'script-toggle';

    const label = document.createElement('label');
    label.className = 'toggle-switch';
    label.title =
      script.enabled !== false
        ? getMessageSync('popupDisableScript')
        : getMessageSync('popupEnableScript');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = script.enabled !== false;
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleScript(script.id, checkbox.checked);
    });

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.appendChild(checkbox);
    label.appendChild(slider);
    toggleContainer.appendChild(label);
    item.appendChild(toggleContainer);

    const info = document.createElement('div');
    info.className = 'script-info';
    info.addEventListener('click', () => {
      chrome.tabs.create({ url: ScriptManager.getEditorUrl(script.id) });
    });

    const name = document.createElement('div');
    name.className = 'script-name';
    name.textContent = script.name;

    info.appendChild(name);
    item.appendChild(info);

    return item;
  }

  async function toggleScript(scriptId, enabled) {
    try {
      const result = await ScriptManager.toggleScript(scriptId, enabled);
      if (result.success) {
        const item = document.querySelector(`[data-id="${scriptId}"]`);
        if (item) {
          const label = item.querySelector('.toggle-switch');
          item.classList.toggle('script-disabled', !enabled);
          label.title = enabled
            ? getMessageSync('popupDisableScript')
            : getMessageSync('popupEnableScript');
        }
      }
    } catch (err) {
      logger.error('Error toggling script:', err);
    }
  }

  async function runInUserScriptWorld(tabId, code) {
    let userScripts;
    try {
      userScripts = chrome.userScripts;
    } catch {
      return [];
    }
    if (typeof userScripts?.execute !== 'function') return [];
    const [first] = await userScripts.execute({
      target: { tabId },
      world: 'USER_SCRIPT',
      js: [{ code }],
    });
    return first?.result ?? [];
  }

  async function loadMenuCommands() {
    const menuContainer = document.getElementById('menuCommandList');
    const menuSection = document.getElementById('menuCommandSection');
    menuContainer.replaceChildren();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const restrictedPatterns = /^(chrome|edge|about):\/\//i;
      const isExtensionPage = tab.url?.startsWith('chrome-extension://');

      if (restrictedPatterns.test(tab.url || '') || isExtensionPage) {
        menuSection.style.display = 'none';
        return;
      }

      // Menu commands live in the USER_SCRIPT world registry, out of reach
      // of the page; userScripts.execute runs in that same world.
      const commands = await runInUserScriptWorld(
        tab.id,
        `Array.from(globalThis.__codetweak?.menu?.entries() ?? [], ([commandId, c]) => ({
          commandId, caption: c.caption, scriptName: c.scriptName,
        }))`
      );

      if (!commands.length) {
        menuSection.style.display = 'none';
        return;
      }

      const uniqueCommands = [];
      const seen = new Set();

      commands.forEach((cmd) => {
        const key = `${cmd.commandId}|${cmd.caption}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCommands.push(cmd);
        }
      });

      menuSection.style.display = 'block';

      uniqueCommands.forEach((cmd) => {
        const btn = document.createElement('button');
        btn.className = 'menu-command-btn primary';
        btn.textContent = cmd.caption;

        btn.addEventListener('click', () => {
          runInUserScriptWorld(
            tab.id,
            `void globalThis.__codetweak?.menu?.get(${JSON.stringify(cmd.commandId)})?.onClick?.()`
          ).catch((error) => logger.warn('Menu command failed:', error));
        });
        menuContainer.appendChild(btn);
      });
    } catch (error) {
      logger.error('Error loading menu commands:', error);
      menuSection.style.display = 'none';
    }
  }
});
