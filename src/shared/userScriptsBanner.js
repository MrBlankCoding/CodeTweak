import { isFirefox, USER_SCRIPTS_PERMISSION } from './utils/browser.js';

export function isUserScriptsSupported() {
  try {
    return typeof globalThis.chrome?.userScripts?.register === 'function';
  } catch {
    return false;
  }
}

function buildBanner(doc, { onOpenGuide } = {}) {
  const firefox = isFirefox();
  const banner = doc.createElement('div');
  banner.className = 'ct-userscripts-banner';
  banner.setAttribute('role', 'alert');

  const icon = doc.createElement('span');
  icon.className = 'ct-userscripts-banner-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '!';
  banner.appendChild(icon);

  const textWrap = doc.createElement('div');
  textWrap.className = 'ct-userscripts-banner-text';

  const title = doc.createElement('strong');
  title.className = 'ct-userscripts-banner-title';
  title.setAttribute('data-i18n', 'userScriptsBannerTitle');
  title.textContent = 'User scripts are disabled';
  textWrap.appendChild(title);

  const body = doc.createElement('span');
  body.className = 'ct-userscripts-banner-body';
  if (firefox) {
    body.setAttribute('data-i18n', 'userScriptsBannerBodyFirefox');
    body.textContent = 'CodeTweak needs your permission to run user scripts.';
  } else {
    body.setAttribute('data-i18n', 'userScriptsBannerBody');
    body.textContent =
      'Enable "Allow user scripts" for CodeTweak in chrome://extensions so your scripts can run.';
  }
  textWrap.appendChild(body);
  banner.appendChild(textWrap);

  const actionBtn = doc.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = 'ct-userscripts-banner-btn';
  if (firefox) {
    actionBtn.setAttribute('data-i18n', 'userScriptsBannerGrant');
    actionBtn.textContent = 'Grant permission';
  } else {
    actionBtn.setAttribute('data-i18n', 'userScriptsBannerGuide');
    actionBtn.textContent = 'How to enable';
  }
  actionBtn.addEventListener('click', async () => {
    if (typeof onOpenGuide === 'function') {
      onOpenGuide();
      return;
    }
    const chromeApi = globalThis.chrome;
    if (firefox) {
      try {
        if (await chromeApi?.permissions?.request?.(USER_SCRIPTS_PERMISSION)) banner.remove();
      } catch {
        // Request dismissed or unavailable; leave the banner in place.
      }
      return;
    }
    if (chromeApi?.tabs?.create) {
      chromeApi.tabs.create({ url: 'chrome://extensions' });
    }
  });
  banner.appendChild(actionBtn);

  return banner;
}

export function renderUserScriptsBanner(container, options = {}) {
  if (!container?.ownerDocument) return null;
  const doc = container.ownerDocument;
  const existing = container.querySelector(':scope > .ct-userscripts-banner');

  if (isUserScriptsSupported()) {
    existing?.remove();
    return null;
  }

  if (existing) return existing;
  const banner = buildBanner(doc, options);
  container.prepend(banner);
  return banner;
}
