import { describe, expect, it, vi } from 'vitest';

async function setupOffscreen() {
  vi.resetModules();
  let handler;
  const sendMessage = vi.fn();

  global.chrome = {
    runtime: {
      onMessage: {
        addListener: (fn) => {
          handler = fn;
        },
      },
      sendMessage,
    },
  };

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });

  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../../src/offscreen/offscreen.js');
  return { handler, sendMessage, errSpy };
}

describe('offscreen', () => {
  it('ignores unrelated messages', async () => {
    const { handler, sendMessage } = await setupOffscreen();
    await handler({ target: 'x', type: 'y' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('handles successful clipboard write', async () => {
    const { handler, sendMessage } = await setupOffscreen();
    await handler({ target: 'offscreen', type: 'copy-to-clipboard', data: 'abc', requestId: 'r1' });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-clipboard-response',
      success: true,
      requestId: 'r1',
    });
  });

  it('handles clipboard errors', async () => {
    const { handler, sendMessage, errSpy } = await setupOffscreen();
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await handler({ target: 'offscreen', type: 'copy-to-clipboard', data: 'abc', requestId: 'r2' });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'offscreen-clipboard-response',
      success: false,
      error: 'denied',
      requestId: 'r2',
    });
    expect(errSpy).toHaveBeenCalled();
  });
});
