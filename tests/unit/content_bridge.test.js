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
      onMessage: { addListener: (fn) => { runtimeMessageListener = fn; } },
      sendMessage,
    },
  };

  const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  await import('../../src/utils/content_bridge.js');

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
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: 'SCRIPT_ERROR', scriptId: 's1', error: { message: 'boom' } },
    }));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCRIPT_ERROR', scriptId: 's1' }),
      expect.any(Function)
    );
  });

  it('bridges GM_API_REQUEST to background and returns response', async () => {
    const { postSpy, sendMessage } = await setupBridge();

    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: {
        type: 'GM_API_REQUEST',
        extensionId: 'ext-1',
        messageId: 'm1',
        action: 'getValue',
        payload: { name: 'x' },
      },
    }));

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

    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: {
        type: 'GM_API_REQUEST',
        extensionId: 'ext-1',
        messageId: 'm2',
        action: 'getValue',
        payload: { name: 'x' },
      },
    }));

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GM_API_RESPONSE', messageId: 'm2', error: expect.stringContaining('invalidated') }),
      '*'
    );

    const setup2 = await setupBridge();
    const circular = {};
    circular.self = circular;
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: {
        type: 'GM_API_REQUEST',
        extensionId: 'ext-1',
        messageId: 'm3',
        action: 'setValue',
        payload: circular,
      },
    }));

    expect(setup2.postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm3', error: 'Request payload is not serializable.' }),
      '*'
    );
  });
});
