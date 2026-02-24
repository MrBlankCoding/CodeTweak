import { describe, expect, it, vi } from 'vitest';
import { GMBridge, ResourceManager } from '../../src/GM/gm_bridge.js';

describe('ResourceManager', () => {
  it('reads text and builds data urls', () => {
    const rm = ResourceManager.fromScript({
      resources: [{ name: 'css', url: 'https://cdn.example/style.css' }],
      resourceContents: { css: 'body{color:red;}' },
    });

    expect(rm.getText('css')).toBe('body{color:red;}');
    expect(rm.getURL('css')).toContain('data:text/css;base64,');
  });
});

describe('GMBridge', () => {
  it('uses postMessage in MAIN world and resolves response', async () => {
    const posted = [];
    const originalPostMessage = window.postMessage;
    window.postMessage = vi.fn((msg) => posted.push(msg));

    const bridge = new GMBridge('script-1', 'ext-1', 'MAIN');
    const promise = bridge.call('getValue', { name: 'k' });

    const request = posted[0];
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'GM_API_RESPONSE',
          extensionId: 'ext-1',
          messageId: request.messageId,
          result: 123,
        },
      })
    );

    await expect(promise).resolves.toBe(123);
    window.postMessage = originalPostMessage;
  });

  it('uses runtime.sendMessage in ISOLATED world', async () => {
    global.chrome = {
      runtime: {
        sendMessage: vi.fn((payload, cb) => cb({ result: 'ok' })),
      },
    };

    const bridge = new GMBridge('script-2', 'ext-2', 'ISOLATED');
    await expect(bridge.call('setValue', { name: 'n', value: 1 })).resolves.toBe('ok');

    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });

  it('rejects MAIN world promise on response error', async () => {
    const posted = [];
    const originalPostMessage = window.postMessage;
    window.postMessage = vi.fn((msg) => posted.push(msg));

    const bridge = new GMBridge('script-3', 'ext-3', 'MAIN');
    const promise = bridge.call('getValue', { name: 'k' });
    const request = posted[0];

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          type: 'GM_API_RESPONSE',
          extensionId: 'ext-3',
          messageId: request.messageId,
          error: 'boom',
        },
      })
    );

    await expect(promise).rejects.toThrow('boom');
    window.postMessage = originalPostMessage;
  });

  it('rejects ISOLATED call when sendMessage is unavailable or lastError exists', async () => {
    global.chrome = { runtime: {} };
    const bridgeMissing = new GMBridge('script-4', 'ext-4', 'ISOLATED');
    await expect(bridgeMissing.callIsolated('setValue', { name: 'n', value: 1 })).rejects.toThrow(
      'sendMessage is not available'
    );

    global.chrome = {
      runtime: {
        sendMessage: vi.fn((_payload, cb) => {
          chrome.runtime.lastError = { message: 'runtime fail' };
          cb(undefined);
          chrome.runtime.lastError = null;
        }),
        lastError: null,
      },
    };
    const bridgeError = new GMBridge('script-5', 'ext-5', 'ISOLATED');
    await expect(bridgeError.callIsolated('setValue', { name: 'n', value: 1 })).rejects.toThrow(
      'runtime fail'
    );
  });
});
