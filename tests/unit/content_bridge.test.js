import { describe, expect, it, vi } from 'vitest';

async function setupBridge({ hasSendMessage = true, lastError = null } = {}) {
  vi.resetModules();
  let runtimeMessageListener;

  const sendMessage = hasSendMessage
    ? vi.fn((payload, cb) => {
        if (cb) cb({ result: 42 });
      })
    : undefined;

  global.chrome = {
    runtime: {
      id: 'ext-1',
      lastError,
      onMessage: {
        addListener: (fn) => {
          runtimeMessageListener = fn;
        },
      },
      sendMessage,
    },
  };

  const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  await import('../../src/content/contentBridge.js');

  return { runtimeMessageListener, postSpy, errSpy, sendMessage };
}

describe('content_bridge', () => {
  it('forwards GM_VALUE_CHANGED from runtime to window', async () => {
    const { runtimeMessageListener, postSpy } = await setupBridge();
    runtimeMessageListener({ type: 'GM_VALUE_CHANGED', payload: { name: 'k' } });
    expect(postSpy).toHaveBeenCalledWith({ type: 'GM_VALUE_CHANGED', payload: { name: 'k' } }, '*');
  });

  it('forwards SCRIPT_ERROR events to runtime', async () => {
    const { sendMessage } = await setupBridge();
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { type: 'SCRIPT_ERROR', scriptId: 's1', error: { message: 'boom' } },
      })
    );

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCRIPT_ERROR', scriptId: 's1' }),
      expect.any(Function)
    );
  });

  it('bridges GM_API_REQUEST to background and returns response', async () => {
    const { postSpy, sendMessage } = await setupBridge();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'GM_API_REQUEST',
          extensionId: 'ext-1',
          messageId: 'm1',
          action: 'getValue',
          payload: { name: 'x' },
        },
      })
    );

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GM_API_REQUEST' }),
      expect.any(Function)
    );
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GM_API_RESPONSE', messageId: 'm1', result: 42 }),
      '*'
    );
  });

  it('returns error when runtime sendMessage is unavailable or payload unserializable', async () => {
    const { postSpy } = await setupBridge({ hasSendMessage: false });

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'GM_API_REQUEST',
          extensionId: 'ext-1',
          messageId: 'm2',
          action: 'getValue',
          payload: { name: 'x' },
        },
      })
    );

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GM_API_RESPONSE',
        messageId: 'm2',
        error: expect.stringContaining('invalidated'),
      }),
      '*'
    );

    const setup2 = await setupBridge();
    const circular = {};
    circular.self = circular;
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'GM_API_REQUEST',
          extensionId: 'ext-1',
          messageId: 'm3',
          action: 'setValue',
          payload: circular,
        },
      })
    );

    expect(setup2.postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm3', error: 'Request payload is not serializable.' }),
      '*'
    );
  });

  it('triggers injection fallback in Safari (no userScripts API)', async () => {
    vi.resetModules();
    const mockScripts = [
      { id: 's1', code: 'console.log("fallback-main")', injectInto: 'main' },
      { id: 's2', code: 'console.log("fallback-isolated")', injectInto: 'isolated' },
    ];

    global.chrome = {
      runtime: {
        id: 'ext-safari',
        sendMessage: vi.fn((payload, cb) => {
          if (payload.action === 'getScriptsForUrl') {
            cb({ scripts: mockScripts });
          }
        }),
        onMessage: { addListener: vi.fn() },
      },
      userScripts: undefined, // Simulate Safari
    };

    const appendSpy = vi.spyOn(document.head, 'appendChild');

    await import('../../src/content/contentBridge.js');

    // The injection fallback is async, so we wait a bit
    await new Promise((r) => setTimeout(r, 0));

    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'getScriptsForUrl' }),
      expect.any(Function)
    );

    // Both scripts inject via page script tags (eval is banned by MV3 CSP)
    expect(appendSpy).toHaveBeenCalled();
    expect(appendSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('handles injection fallback errors gracefully', async () => {
    vi.resetModules();
    global.chrome = {
      runtime: {
        id: 'ext-safari-err',
        sendMessage: vi.fn((_payload, _cb) => {
          throw new Error('Network error');
        }),
        onMessage: { addListener: vi.fn() },
      },
      userScripts: undefined,
    };

    const logger = await import('../../src/shared/utils/logger.js');
    const debugSpy = vi.spyOn(logger.default, 'debug').mockImplementation(() => {});

    await import('../../src/content/contentBridge.js');
    await new Promise((r) => setTimeout(r, 0));

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('fallback failed'),
      expect.any(Error)
    );
  });
});
