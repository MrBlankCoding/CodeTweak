export function isUserScriptsSupported() {
  if (typeof safari !== 'undefined') return true;
  const ua = navigator.userAgent;
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/.test(ua)) return true;
  if (typeof globalThis.chrome?.userScripts?.register !== 'function') return false;
  return true;
}

function buildBanner(doc, { onOpenGuide } = {}) {
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
  body.setAttribute('data-i18n', 'userScriptsBannerBody');
  body.textContent =
    'Enable "Allow user scripts" for CodeTweak in chrome://extensions so your scripts can run.';
  textWrap.appendChild(body);
  banner.appendChild(textWrap);

  const guideBtn = doc.createElement('button');
  guideBtn.type = 'button';
  guideBtn.className = 'ct-userscripts-banner-btn';
  guideBtn.setAttribute('data-i18n', 'userScriptsBannerGuide');
  guideBtn.textContent = 'How to enable';
  guideBtn.addEventListener('click', () => {
    if (typeof onOpenGuide === 'function') {
      onOpenGuide();
      return;
    }
    const chromeApi = globalThis.chrome;
    if (chromeApi?.tabs?.create) {
      chromeApi.tabs.create({ url: 'chrome://extensions' });
    }
  });
  banner.appendChild(guideBtn);

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
