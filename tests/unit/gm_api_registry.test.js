import { describe, expect, it, vi } from 'vitest';

const allEnabled = {
  gmSetValue: true,
  gmGetValue: true,
  gmDeleteValue: true,
  gmListValues: true,
  gmAddValueChangeListener: true,
  gmRemoveValueChangeListener: true,
  gmOpenInTab: true,
  gmNotification: true,
  gmGetResourceText: true,
  gmGetResourceURL: true,
  gmSetClipboard: true,
  gmDownload: true,
  gmAddStyle: true,
  gmAddElement: true,
  gmRegisterMenuCommand: true,
  gmUnregisterMenuCommand: true,
  gmXmlhttpRequest: true,
  unsafeWindow: true,
  gmLog: true,
};

async function buildRegistry() {
  vi.resetModules();
  window.GMBridge = {};
  await import('../../src/GM/gm_api_registry.js');
  const Registry = window.GMBridge.GMAPIRegistry;

  const bridge = {
    call: vi.fn(async (action, payload) => {
      if (action === 'getValue') {
        return payload.defaultValue ?? null;
      }
      if (action === 'listValues') {
        return ['k1', 'k2'];
      }
      if (action === 'xmlhttpRequest') {
        return {
          readyState: 4,
          responseHeaders: 'content-type: text/plain',
          responseText: 'ok',
          response: 'ok',
          status: 200,
          statusText: 'OK',
          finalUrl: payload.details.url,
        };
      }
      return null;
    }),
  };

  const resourceManager = {
    getText: vi.fn((name) => (name === 'txt' ? 'hello' : null)),
    getURL: vi.fn((name) => (name === 'img' ? 'https://cdn.example/img.png' : null)),
  };

  const registry = new Registry(bridge, resourceManager);
  registry.initializeCache({ foo: 'bar' });
  registry.registerAll(allEnabled);

  return { registry, bridge, resourceManager };
}

describe('GMAPIRegistry', () => {
  it('registers GM APIs on window and GM namespace', async () => {
    await buildRegistry();

    expect(typeof window.GM_setValue).toBe('function');
    expect(typeof window.GM_getValue).toBe('function');
    expect(typeof window.GM_deleteValue).toBe('function');
    expect(typeof window.GM_listValues).toBe('function');
    expect(typeof window.GM_addValueChangeListener).toBe('function');
    expect(typeof window.GM_removeValueChangeListener).toBe('function');
    expect(typeof window.GM_openInTab).toBe('function');
    expect(typeof window.GM_notification).toBe('function');
    expect(typeof window.GM_getResourceText).toBe('function');
    expect(typeof window.GM_getResourceURL).toBe('function');
    expect(typeof window.GM_setClipboard).toBe('function');
    expect(typeof window.GM_download).toBe('function');
    expect(typeof window.GM_addStyle).toBe('function');
    expect(typeof window.GM_addElement).toBe('function');
    expect(typeof window.GM_registerMenuCommand).toBe('function');
    expect(typeof window.GM_unregisterMenuCommand).toBe('function');
    expect(typeof window.GM_xmlhttpRequest).toBe('function');
    expect(typeof window.GM_log).toBe('function');
    expect(window.unsafeWindow).toBe(window);
  });

  it('handles storage APIs and value-change listeners', async () => {
    const { bridge } = await buildRegistry();

    await window.GM_setValue('alpha', 1);
    expect(bridge.call).toHaveBeenCalledWith('setValue', { name: 'alpha', value: 1 });

    expect(window.GM_getValue('foo', 'fallback')).toBe('bar');
    expect(await window.GM.getValue('foo', 'fallback')).toBe('bar');

    await window.GM_deleteValue('foo');
    expect(bridge.call).toHaveBeenCalledWith('deleteValue', { name: 'foo' });

    const id = window.GM_addValueChangeListener('listen', vi.fn());
    expect(typeof id).toBe('number');

    const callback = vi.fn();
    const listenerId = window.GM_addValueChangeListener('watched', callback);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'GM_VALUE_CHANGED',
          payload: { name: 'watched', oldValue: 1, newValue: 2, remote: true },
        },
      })
    );
    expect(callback).toHaveBeenCalledWith('watched', 1, 2, true);

    window.GM_removeValueChangeListener(listenerId);
  });

  it('handles UI/resource/network APIs', async () => {
    const { bridge } = await buildRegistry();

    const style = window.GM_addStyle('body { color: red; }');
    expect(style.tagName).toBe('STYLE');
    expect(document.head.querySelector('style')).toBeTruthy();

    const el = window.GM_addElement('div', { id: 'a', textContent: 'x' });
    expect(el.id).toBe('a');
    expect(document.body.querySelector('#a')?.textContent).toBe('x');

    expect(window.GM_getResourceText('txt')).toBe('hello');
    expect(window.GM_getResourceURL('img')).toContain('https://cdn.example');

    window.GM_openInTab('https://example.com/a', { active: false });
    window.GM_notification('hello world');
    window.GM_setClipboard('copy');
    window.GM_download('https://example.com/file.js', 'file.js');

    expect(bridge.call).toHaveBeenCalledWith('openInTab', {
      url: 'https://example.com/a',
      options: { active: false },
    });
    expect(bridge.call).toHaveBeenCalledWith('setClipboard', { data: 'copy', type: undefined });
    expect(bridge.call).toHaveBeenCalledWith('download', {
      url: 'https://example.com/file.js',
      name: 'file.js',
    });

    const commandId = window.GM_registerMenuCommand('Do Thing', () => {});
    expect(commandId).toContain('gm_menu_');
    expect(window.__gmMenuCommands.length).toBe(1);
    window.GM_unregisterMenuCommand(commandId);
    expect(window.__gmMenuCommands.length).toBe(0);
  });

  it('runs GM_xmlhttpRequest through bridge callbacks', async () => {
    await buildRegistry();

    const onload = vi.fn();
    const onprogress = vi.fn();
    const onreadystatechange = vi.fn();

    window.GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://example.com/data.txt',
      onload,
      onprogress,
      onreadystatechange,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onreadystatechange).toHaveBeenCalled();
    expect(onprogress).toHaveBeenCalled();
    expect(onload).toHaveBeenCalled();
    expect(onload.mock.calls[0][0].status).toBe(200);
  });
});
