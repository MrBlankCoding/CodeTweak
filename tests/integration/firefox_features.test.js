import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExtension } from './harness.js';

const header = (lines) =>
  ['// ==UserScript==', ...lines.map((line) => `// ${line}`), '// ==/UserScript=='].join('\n');

const createFirefox = (options = {}) => createExtension({ ...options, browser: 'firefox' });

describe('Firefox features (no userScripts.execute)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const syncedScript = `${header([
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
  GM_registerMenuCommand('Go dark', () => GM_setValue('theme', 'dark'));`;

  it('lists and runs popup menu commands over the port', async () => {
    const ext = await createFirefox();
    await ext.install(syncedScript);
    const page = await ext.openPage('https://example.com/a', { tabId: 1 });

    const { commands } = await ext.sendFromPopup({ action: 'getMenuCommands', tabId: 1 });
    expect(commands).toEqual([
      expect.objectContaining({ caption: 'Go dark', scriptName: 'Synced Setting', frameId: 0 }),
    ]);

    const run = await ext.sendFromPopup({
      action: 'runMenuCommand',
      tabId: 1,
      frameId: 0,
      commandId: commands[0].commandId,
    });
    expect(run).toEqual({ success: true });
    await ext.flush();
    expect(page.document.body.dataset.change).toBe('|dark|false');
  });

  it('delivers value changes to the same script in other tabs', async () => {
    const ext = await createFirefox();
    await ext.install(syncedScript);
    const tabA = await ext.openPage('https://example.com/a', { tabId: 1 });
    const tabB = await ext.openPage('https://example.com/b', { tabId: 2 });

    const { commands } = await ext.sendFromPopup({ action: 'getMenuCommands', tabId: 1 });
    await ext.sendFromPopup({ action: 'runMenuCommand', tabId: 1, ...commands[0] });
    await ext.flush();

    expect(tabA.document.body.dataset.change).toBe('|dark|false');
    expect(tabB.document.body.dataset.change).toBe('|dark|true');
    expect(tabB.document.body.dataset.read).toBe('dark');
  });

  it('calls GM_notification callbacks when the notification is clicked', async () => {
    const ext = await createFirefox();
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
    ext.events.onClicked.fns.forEach((fn) => fn(notification.id));
    await ext.flush();

    expect(page.document.body.dataset.clicked).toBe('yes');
    expect(page.document.body.dataset.done).toBe('yes');
  });

  it('reconnects after the event page is suspended and keeps delivering', async () => {
    const ext = await createFirefox();
    await ext.install(syncedScript);
    const tabA = await ext.openPage('https://example.com/a', { tabId: 1 });
    const tabB = await ext.openPage('https://example.com/b', { tabId: 2 });
    expect(ext.ports).toHaveLength(2);

    ext.dropPorts();
    await ext.flush();
    expect(ext.ports.filter((pair) => pair.isOpen())).toHaveLength(2);

    const { commands } = await ext.sendFromPopup({ action: 'getMenuCommands', tabId: 2 });
    expect(commands.map((cmd) => cmd.caption)).toEqual(['Go dark']);
    await ext.sendFromPopup({ action: 'runMenuCommand', tabId: 2, ...commands[0] });
    await ext.flush();

    expect(tabA.document.body.dataset.change).toBe('|dark|true');
    expect(tabB.document.body.dataset.change).toBe('|dark|false');
  });

  it('holds a notification click until the document reconnects', async () => {
    const ext = await createFirefox();
    await ext.install(
      `${header(['@name Notifier', '@match https://example.com/*', '@grant GM_notification'])}
      GM_notification({ text: 'Done', onclick: () => { document.body.dataset.clicked = 'yes'; } });`
    );
    const page = await ext.openPage('https://example.com/');
    const [notification] = ext.notifications;

    ext.dropPorts();
    ext.events.onClicked.fns.forEach((fn) => fn(notification.id));
    await ext.flush();

    expect(page.document.body.dataset.clicked).toBe('yes');
  });

  it('only opens a port for scripts that need background events', async () => {
    const ext = await createFirefox();
    await ext.install(
      `${header(['@name Plain', '@match https://example.com/*', '@grant GM_setValue'])}
      GM_setValue('x', 1);`
    );
    await ext.openPage('https://example.com/');
    expect(ext.ports).toHaveLength(0);
  });

  it('ignores menu requests that do not come from an extension page', async () => {
    const ext = await createFirefox();
    await ext.install(syncedScript);
    await ext.openPage('https://example.com/a', { tabId: 1 });

    const listed = await ext.sendRuntime(
      { action: 'getMenuCommands', tabId: 1 },
      { url: 'https://evil.test/', tab: { id: 5 } }
    );
    expect(listed).toEqual({ commands: [] });

    const run = await ext.sendRuntime(
      { action: 'runMenuCommand', tabId: 1, frameId: 0, commandId: 'script-1:1' },
      { url: 'https://evil.test/', tab: { id: 5 } }
    );
    expect(run).toEqual({ success: false });
  });

  it('drops a closed document from menu listings', async () => {
    const ext = await createFirefox();
    await ext.install(syncedScript);
    const page = await ext.openPage('https://example.com/a', { tabId: 1 });
    await page.close();
    await ext.flush();

    const { commands } = await ext.sendFromPopup({ action: 'getMenuCommands', tabId: 1 });
    expect(commands).toEqual([]);
  });
});
