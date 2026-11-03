import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExtension } from './harness.js';

const header = (lines) =>
  ['// ==UserScript==', ...lines.map((line) => `// ${line}`), '// ==/UserScript=='].join('\n');

describe('userscripts end to end', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a @grant none script in the page with access to page globals', async () => {
    const ext = await createExtension();
    await ext.install(
      `${header(['@name Page Tweaker', '@match https://example.com/*', '@grant none'])}
      document.title = 'tweaked:' + window.pageConfig.theme;
      document.body.dataset.unsafe = String(unsafeWindow === window);
      document.body.dataset.noGm = typeof GM_setValue;`
    );

    const page = await ext.openPage('https://example.com/home', {
      pageGlobals: { pageConfig: { theme: 'dark' } },
    });

    expect(page.document.title).toBe('tweaked:dark');
    expect(page.document.body.dataset.unsafe).toBe('true');
    expect(page.document.body.dataset.noGm).toBe('undefined');
  });

  it('shows a one-time notice after a script first runs when enabled', async () => {
    const ext = await createExtension({ settings: { confirmFirstRun: true } });
    const script = await ext.install(
      `${header(['@name First Run Notice', '@match https://example.com/*', '@grant none'])}
      document.body.dataset.ran = 'yes';`
    );

    const firstPage = await ext.openPage('https://example.com/');
    await ext.flush();
    const firstRunNotices = ext.notifications.filter(
      ({ options }) => options.title === `${script.name} ran for the first time`
    );
    expect(firstRunNotices).toHaveLength(1);
    expect(firstPage.document.body.dataset.ran).toBe('yes');

    await ext.reload(firstPage);
    await ext.flush();
    expect(
      ext.notifications.filter(
        ({ options }) => options.title === `${script.name} ran for the first time`
      )
    ).toHaveLength(1);
  });

  it('keeps privileged scripts out of the page world', async () => {
    const ext = await createExtension();
    await ext.install(
      `${header(['@name Isolated', '@match https://example.com/*', '@grant GM_setValue'])}
      document.body.dataset.pageGlobal = typeof window.pageConfig;
      document.body.dataset.hasGm = typeof GM_setValue;`
    );

    const page = await ext.openPage('https://example.com/', {
      pageGlobals: { pageConfig: { secret: 1 } },
    });

    // The script shares the DOM but not page globals, and the page sees no GM APIs.
    expect(page.document.body.dataset.pageGlobal).toBe('undefined');
    expect(page.document.body.dataset.hasGm).toBe('function');
    expect(page.window.GM_setValue).toBeUndefined();
    expect(page.window.__codetweak).toBeUndefined();
  });

  it('persists GM values across page loads', async () => {
    const ext = await createExtension();
    const script = await ext.install(
      `${header([
        '@name Visit Counter',
        '@match https://example.com/*',
        '@grant GM_getValue',
        '@grant GM_setValue',
      ])}
      const visits = GM_getValue('visits', 0) + 1;
      GM_setValue('visits', visits);
      document.body.dataset.visits = String(visits);`
    );

    const first = await ext.openPage('https://example.com/');
    expect(first.document.body.dataset.visits).toBe('1');

    const second = await ext.reload(first);
    const third = await ext.reload(second);
    expect(third.document.body.dataset.visits).toBe('3');
    expect(ext.storage[`script-values-${script.id}`]).toEqual({ visits: 3 });
  });

  it('supports the promise-based GM.* API', async () => {
    const ext = await createExtension();
    await ext.install(
      `${header([
        '@name GM4 Style',
        '@match https://example.com/*',
        '@grant GM.getValue',
        '@grant GM.setValue',
        '@grant GM.info',
      ])}
      (async () => {
        const n = await GM.getValue('n', 10);
        await GM.setValue('n', n + 5);
        document.body.dataset.result = GM.info.script.name + ':' + (await GM.getValue('n'));
      })();`
    );

    const page = await ext.openPage('https://example.com/');
    expect(page.document.body.dataset.result).toBe('GM4 Style:15');
  });

  it('delivers value changes to the same script in other tabs', async () => {
    const ext = await createExtension();
    await ext.install(
      `${header([
        '@name Synced Setting',
        '@match https://example.com/*',
        '@grant GM_getValue',
        '@grant GM_setValue',
        '@grant GM_addValueChangeListener',
        '@grant GM_registerMenuCommand',
      ])}
      GM_addValueChangeListener('theme', (name, oldValue, newValue, remote) => {
        document.body.dataset.change = [oldValue, newValue, remote].join('|');
        document.body.dataset.read = GM_getValue('theme');
      });
      GM_registerMenuCommand('Go dark', () => GM_setValue('theme', 'dark'));`
    );

    const tabA = await ext.openPage('https://example.com/a', { tabId: 1 });
    const tabB = await ext.openPage('https://example.com/b', { tabId: 2 });

    // Run tab A's menu command the way the popup does.
    await ext.chrome.userScripts.execute({
      target: { tabId: 1 },
      world: 'USER_SCRIPT',
      js: [
        {
          code: 'void [...globalThis.__codetweak.menu.values()].find((c) => c.caption === "Go dark").onClick()',
        },
      ],
    });
    await ext.flush();

    expect(tabA.document.body.dataset.change).toBe('|dark|false');
    expect(tabB.document.body.dataset.change).toBe('|dark|true');
    expect(tabB.document.body.dataset.read).toBe('dark');
  });

  it('shares scope between @require libraries and the script', async () => {
    const ext = await createExtension({
      server: {
        // A tiny GM_config-style library that relies on the script's grants.
        'https://cdn.test/settings-lib.js': `
          var Settings = {
            get: (key, fallback) => GM_getValue('settings:' + key, fallback),
            set: (key, value) => GM_setValue('settings:' + key, value),
          };`,
      },
    });
    await ext.install(
      `${header([
        '@name Uses Library',
        '@match https://example.com/*',
        '@require https://cdn.test/settings-lib.js',
        '@grant GM_getValue',
        '@grant GM_setValue',
      ])}
      Settings.set('size', Settings.get('size', 1) * 2);
      document.body.dataset.size = String(Settings.get('size'));`
    );

    const page = await ext.openPage('https://example.com/');
    await ext.reload(page).then((next) => {
      expect(next.document.body.dataset.size).toBe('4');
    });
    // The library was fetched once and cached, not loaded by the page.
    expect(ext.requests.filter((r) => r.url === 'https://cdn.test/settings-lib.js')).toHaveLength(
      1
    );
    expect(page.document.querySelector('script[src]')).toBeNull();
  });

  it('refuses to start when a @require fails its integrity check', async () => {
    const ext = await createExtension({
      server: { 'https://cdn.test/lib.js': 'var Lib = "tampered";' },
    });
    const script = await ext.install(
      `${header([
        '@name Pinned',
        '@match https://example.com/*',
        '@require https://cdn.test/lib.js#sha256=0000000000000000000000000000000000000000000000000000000000000000',
        '@grant GM_log',
      ])}
      document.body.dataset.ran = 'yes';`
    );

    const page = await ext.openPage('https://example.com/');
    expect(page.document.body.dataset.ran).toBeUndefined();
    const [error] = await ext.scriptErrors(script.id);
    expect(error.message).toMatch(/Missing dependencies/);
  });

  it('serves @resource text and data URLs', async () => {
    const ext = await createExtension({
      server: {
        'https://cdn.test/theme.css': {
          body: 'body { color: rebeccapurple; }',
          headers: { 'content-type': 'text/css' },
        },
      },
    });
    await ext.install(
      `${header([
        '@name Themed',
        '@match https://example.com/*',
        '@resource theme https://cdn.test/theme.css',
        '@grant GM_getResourceText',
        '@grant GM_getResourceURL',
        '@grant GM_addStyle',
      ])}
      GM_addStyle(GM_getResourceText('theme'));
      document.body.dataset.url = GM_getResourceURL('theme').slice(0, 21);`
    );

    const page = await ext.openPage('https://example.com/');
    expect(page.document.querySelector('style').textContent).toBe('body { color: rebeccapurple; }');
    expect(page.document.body.dataset.url).toBe('data:text/css;base64,');
  });

  it('makes cross-origin requests only to @connect hosts', async () => {
    const ext = await createExtension({
      server: {
        'https://api.test/user': {
          body: JSON.stringify({ name: 'Ada' }),
          headers: { 'content-type': 'application/json' },
        },
        'https://api.test/avatar.png': { body: new Uint8Array([137, 80, 78, 71]) },
      },
    });
    await ext.install(
      `${header([
        '@name Fetcher',
        '@match https://example.com/*',
        '@connect api.test',
        '@grant GM_xmlhttpRequest',
        '@grant GM.xmlHttpRequest',
      ])}
      GM_xmlhttpRequest({
        url: 'https://api.test/user',
        responseType: 'json',
        onload: (r) => { document.body.dataset.user = r.response.name + ':' + r.status; },
      });
      GM_xmlhttpRequest({
        url: 'https://evil.test/steal',
        onerror: (r) => { document.body.dataset.blocked = r.error; },
      });
      GM.xmlHttpRequest({ url: 'https://api.test/avatar.png', responseType: 'arraybuffer' })
        .then((r) => { document.body.dataset.bytes = new Uint8Array(r.response).join(','); });`
    );

    const page = await ext.openPage('https://example.com/');
    expect(page.document.body.dataset.user).toBe('Ada:200');
    expect(page.document.body.dataset.blocked).toMatch(/not in @connect/);
    expect(page.document.body.dataset.bytes).toBe('137,80,78,71');
    expect(ext.requests.some((r) => r.url.startsWith('https://evil.test'))).toBe(false);
  });

  it('respects @exclude and regex @include rules', async () => {
    const ext = await createExtension();
    await ext.install(
      `${header([
        '@name Scoped',
        '@match https://example.com/*',
        '@include /^https:\\/\\/news\\.test\\/article\\/\\d+$/',
        '@exclude https://example.com/private/*',
        '@grant GM_log',
      ])}
      document.body.dataset.ran = 'yes';`
    );

    const ran = async (url) => (await ext.openPage(url)).document.body.dataset.ran === 'yes';
    expect(await ran('https://example.com/public')).toBe(true);
    expect(await ran('https://example.com/private/settings')).toBe(false);
    expect(await ran('https://news.test/article/42')).toBe(true);
    expect(await ran('https://news.test/about')).toBe(false);
  });

  it('calls GM_notification callbacks when the notification is clicked', async () => {
    const ext = await createExtension();
    await ext.install(
      `${header(['@name Notifier', '@match https://example.com/*', '@grant GM_notification'])}
      GM_notification({
        title: 'Hi',
        text: 'Build finished',
        onclick: () => { document.body.dataset.clicked = 'yes'; },
        ondone: () => { document.body.dataset.done = 'yes'; },
      });`
    );

    const page = await ext.openPage('https://example.com/');
    const [notification] = ext.notifications;
    expect(notification.options).toEqual(
      expect.objectContaining({ title: 'Hi', message: 'Build finished' })
    );

    ext.events.onClicked.fns.forEach((fn) => fn(notification.id));
    await ext.flush();
    // onClicked clears the notification, which fires onClosed -> ondone.
    expect(page.document.body.dataset.clicked).toBe('yes');
    expect(page.document.body.dataset.done).toBe('yes');
  });

  it('records errors from isolated and page-world scripts', async () => {
    const ext = await createExtension();
    const isolated = await ext.install(
      `${header(['@name Broken Isolated', '@match https://example.com/*', '@grant GM_setValue'])}
      throw new Error('isolated boom');`
    );
    const pageWorld = await ext.install(
      `${header(['@name Broken Page', '@match https://example.com/*', '@grant none'])}
      throw new Error('page boom');`
    );

    await ext.openPage('https://example.com/');
    await ext.flush();

    expect((await ext.scriptErrors(isolated.id))[0].message).toBe('isolated boom');
    expect((await ext.scriptErrors(pageWorld.id))[0].message).toBe('page boom');
  });

  it('stops injecting a script once it is disabled', async () => {
    const ext = await createExtension();
    const script = await ext.install(
      `${header(['@name Toggle', '@match https://example.com/*', '@grant none'])}
      document.body.dataset.ran = 'yes';`
    );
    expect((await ext.openPage('https://example.com/')).document.body.dataset.ran).toBe('yes');

    ext.storage.scripts = ext.storage.scripts.map((s) =>
      s.id === script.id ? { ...s, enabled: false } : s
    );
    await ext.sync();
    expect((await ext.openPage('https://example.com/')).document.body.dataset.ran).toBeUndefined();
  });

  it('automatically updates a script and runs the new version', async () => {
    const v1 = `${header([
      '@name Updatable',
      '@version 1.0.0',
      '@match https://example.com/*',
      '@updateURL https://scripts.test/u.meta.js',
      '@downloadURL https://scripts.test/u.user.js',
      '@grant none',
    ])}
    document.body.dataset.version = '1';`;
    const v2 = v1.replace('@version 1.0.0', '@version 1.1.0').replace("= '1'", "= '2'");
    const ext = await createExtension({
      server: {
        'https://scripts.test/u.meta.js': v2.split('\n').slice(0, 9).join('\n'),
        'https://scripts.test/u.user.js': v2,
      },
    });
    await ext.install(v1);
    expect((await ext.openPage('https://example.com/')).document.body.dataset.version).toBe('1');

    ext.events.alarm.fns.forEach((listener) => listener({ name: 'codetweak-auto-update' }));
    await ext.flush();

    expect((await ext.openPage('https://example.com/')).document.body.dataset.version).toBe('2');
  });

  it('holds an update that asks for new permissions', async () => {
    const v1 = `${header([
      '@name Careful',
      '@version 1.0.0',
      '@match https://example.com/*',
      '@downloadURL https://scripts.test/c.user.js',
      '@grant none',
    ])}
    document.body.dataset.version = '1';`;
    const v2 = v1
      .replace('@version 1.0.0', '@version 2.0.0')
      .replace('// @grant none', '// @grant GM_xmlhttpRequest')
      .replace("= '1'", "= '2'");
    const ext = await createExtension({ server: { 'https://scripts.test/c.user.js': v2 } });
    const script = await ext.install(v1);

    ext.events.alarm.fns.forEach((listener) => listener({ name: 'codetweak-auto-update' }));
    await ext.flush();

    expect((await ext.openPage('https://example.com/')).document.body.dataset.version).toBe('1');
    const stored = ext.storage.scripts.find((s) => s.id === script.id);
    expect(stored.updateInfo).toEqual(
      expect.objectContaining({ pendingVersion: '2.0.0', pendingReason: 'permissions' })
    );
  });
});
