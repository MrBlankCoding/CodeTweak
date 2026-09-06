import logger from '../shared/utils/logger.js';
import feather from 'feather-icons';
import {
  urlMatchesPattern,
  formatRunAt,
  getScriptDescription,
  isValidWebpage,
  generateUrlMatchPattern,
} from '../shared/utils/urls.js';
import { applyTranslations, getMessageSync } from '../shared/utils/i18n.js';
import { renderUserScriptsBanner } from '../shared/userScriptsBanner.js';
import { storageService as ScriptManager } from '../services/storage/StorageService.js';
import { browser } from '../shared/browserAdapter.js';

document.addEventListener('DOMContentLoaded', async () => {
  feather.replace();

  const scriptList = document.getElementById('scriptList');
  const emptyState = document.getElementById('emptyState');
  const createScriptBtn = document.getElementById('createScript');
  const openDashboardBtn = document.getElementById('openDashboard');
  const aiEditorBtn = document.getElementById('aiEditorBtn');
  const reportIssueLink = document.getElementById('reportIssue');

  let currentTabUrl = '';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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
    browser.tabs.create({ url });
  });

  openDashboardBtn.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('dashboard/dashboard.html') });
  });

  aiEditorBtn.addEventListener('click', async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (!isValidWebpage(tab.url)) {
        alert('Please navigate to a webpage first to use the AI DOM Editor.');
        return;
      }

      browser.tabs.sendMessage(tab.id, { action: 'openAIEditor' }, (response) => {
        if (browser.runtime.lastError || !response || response.success !== true) {
          browser.windows.create({
            url: browser.runtime.getURL('ai_dom_editor/sidebar/ai_sidebar_window.html'),
            type: 'popup',
            width: 440,
            height: 800,
            top: 80,
            left: screen.availWidth - 460,
          });
        }
      });
      window.close();
    } catch {
      browser.windows.create({
        url: browser.runtime.getURL('ai_dom_editor/ai_sidebar_window.html'),
        type: 'popup',
        width: 440,
        height: 800,
        top: 80,
        left: screen.availWidth - 460,
      });
      window.close();
    }
  });

  reportIssueLink.addEventListener('click', (e) => {
    e.preventDefault();
    browser.tabs.create({ url: 'https://github.com/MrBlankCoding/CodeTweak/issues/new' });
  });

  await applyTheme();
  if (globalThis.__SAFARI_BUILD__ !== 'true') {
    renderUserScriptsBanner(document.getElementById('userScriptsBannerSlot'));
  }
  await applyTranslations();
  await loadScripts(currentTabUrl);
  await loadMenuCommands();

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scriptsUpdated') {
      loadMenuCommands();
    }
  });

  async function loadScripts(url) {
    const scripts = await ScriptManager.getAllScripts();
    const list = Array.isArray(scripts) ? scripts : [];
    const matchingScripts = list.filter((script) => {
      const targets = script.targetUrls || [script.targetUrl];
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
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'file-text');
        iconDiv.appendChild(icon);

        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
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

    feather.replace();
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
      browser.tabs.create({ url: ScriptManager.getEditorUrl(script.id) });
    });

    const name = document.createElement('div');
    name.className = 'script-name';
    name.textContent = script.name;

    const target = document.createElement('div');
    target.className = 'script-target';

    const runAtSpan = document.createElement('span');
    runAtSpan.className = 'script-type';
    runAtSpan.textContent = formatRunAt(script.runAt);

    const descSpan = document.createElement('span');
    descSpan.className = 'script-description';
    descSpan.textContent = getScriptDescription(script);

    target.appendChild(runAtSpan);
    target.appendChild(descSpan);
    info.appendChild(name);
    info.appendChild(target);
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

  async function loadMenuCommands() {
    const menuContainer = document.getElementById('menuCommandList');
    const menuSection = document.getElementById('menuCommandSection');
    menuContainer.replaceChildren();

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const restrictedPatterns = /^(chrome|edge|about|safari-extension):\/\//i;
      const isExtensionPage =
        tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('safari-extension://');

      if (restrictedPatterns.test(tab.url || '') || isExtensionPage) {
        menuSection.style.display = 'none';
        return;
      }

      const [{ result: commands = [] }] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => window.__gmMenuCommands || [],
      });

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
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (commandId) => {
              const command = (window.__gmMenuCommands || []).find(
                (c) => c.commandId === commandId
              );
              if (command && typeof command.onClick === 'function') {
                command.onClick();
              }
            },
            args: [cmd.commandId],
          });
        });
        menuContainer.appendChild(btn);
      });

      feather.replace();
    } catch (error) {
      logger.error('Error loading menu commands:', error);
      menuSection.style.display = 'none';
    }
  }
});
