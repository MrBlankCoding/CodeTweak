import { describe, expect, it, vi } from 'vitest';

import { FirefoxPortHub, FIREFOX_PORT_NAME } from '../../src/shared/firefoxFeatures.js';
import { buildRuntimeBootstrap } from '../../src/services/scripts/adapter/bootstrapBuilder.js';

function fakePort(sender, name = FIREFOX_PORT_NAME) {
  const listeners = { message: [], disconnect: [] };
  return {
    name,
    sender,
    sent: [],
    postMessage: vi.fn(function (msg) {
      this.sent.push(msg);
    }),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn) => listeners.message.push(fn) },
    onDisconnect: { addListener: (fn) => listeners.disconnect.push(fn) },
    receive: (msg) => listeners.message.forEach((fn) => fn(msg)),
    drop: () => listeners.disconnect.forEach((fn) => fn()),
  };
}

describe('buildRuntimeBootstrap', () => {
  const config = { scriptId: 's', scriptName: 'S', world: 'USER_SCRIPT' };

  it('leaves the Firefox bridge out of Chrome bootstraps', () => {
    const code = buildRuntimeBootstrap(config, '');
    expect(code).not.toContain('codetweak-firefox-bridge');
    expect(code).toMatch(/, null\);/);
  });

  it('inlines the Firefox bridge when requested', () => {
    const code = buildRuntimeBootstrap(config, '', [], { firefox: true });
    expect(code).toContain('codetweak-firefox-bridge');
    expect(() => new Function(code)).not.toThrow();
  });
});

describe('FirefoxPortHub', () => {
  const sender = (tabId, frameId = 0) => ({ tab: { id: tabId }, frameId });

  it('only listens once onUserScriptConnect exists', () => {
    const api = { runtime: {} };
    const hub = new FirefoxPortHub(api);
    expect(hub.listen()).toBe(false);
    const addListener = vi.fn();
    api.runtime.onUserScriptConnect = { addListener };
    expect(hub.listen()).toBe(true);
    hub.listen();
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it('rejects ports with another name or no tab', () => {
    const hub = new FirefoxPortHub({});
    hub.accept(fakePort(sender(1), 'other'));
    const noTab = fakePort({});
    hub.accept(noTab);
    expect(noTab.disconnect).toHaveBeenCalled();
    expect(hub.entries.size).toBe(0);
  });

  it('broadcasts value changes to subscribed documents except the sender', () => {
    const hub = new FirefoxPortHub({});
    const source = fakePort(sender(1));
    const sameTabOtherFrame = fakePort(sender(1, 4));
    const otherTab = fakePort(sender(2));
    const unsubscribed = fakePort(sender(3));
    [source, sameTabOtherFrame, otherTab, unsubscribed].forEach((p) => hub.accept(p));
    [source, sameTabOtherFrame, otherTab].forEach((p) =>
      p.receive({ kind: 'hello', scriptIds: ['s1'] })
    );

    hub.broadcastValueChange('s1', { name: 'k', newValue: 1 }, sender(1));

    expect(source.sent).toEqual([]);
    expect(unsubscribed.sent).toEqual([]);
    expect(sameTabOtherFrame.sent[0].data.remote).toBe(false);
    expect(otherTab.sent[0]).toEqual({
      kind: 'dispatch',
      scriptId: 's1',
      type: 'valueChanged',
      data: { name: 'k', newValue: 1, remote: true },
    });
  });

  it('queues a dispatch until the target subscribes, and expires it', () => {
    vi.useFakeTimers();
    try {
      const hub = new FirefoxPortHub({});
      expect(hub.dispatch({ tabId: 1, frameId: 0 }, 's1', 'notification', { a: 1 })).toBe(false);
      const port = fakePort(sender(1));
      hub.accept(port);
      port.receive({ kind: 'subscribe', scriptId: 's1' });
      expect(port.sent).toEqual([
        { kind: 'dispatch', scriptId: 's1', type: 'notification', data: { a: 1 } },
      ]);

      hub.dispatch({ tabId: 2, frameId: 0 }, 's1', 'notification', {});
      vi.advanceTimersByTime(11_000);
      const late = fakePort(sender(2));
      hub.accept(late);
      late.receive({ kind: 'hello', scriptIds: ['s1'] });
      expect(late.sent).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collects menu commands per frame and times out silent documents', async () => {
    const hub = new FirefoxPortHub({});
    const top = fakePort(sender(1, 0));
    const silent = fakePort(sender(1, 7));
    hub.accept(top);
    hub.accept(silent);
    top.postMessage.mockImplementation((msg) => {
      top.receive({
        kind: 'menu:list',
        requestId: msg.requestId,
        commands: [{ commandId: 's:1', caption: 'Go', scriptName: 'S' }, { caption: 42 }],
      });
    });

    const commands = await hub.listMenuCommands(1, 20);
    expect(commands).toEqual([{ commandId: 's:1', caption: 'Go', scriptName: 'S', frameId: 0 }]);
    expect(hub.requests.size).toBe(0);
  });

  it('runs a menu command only in the matching frame', () => {
    const hub = new FirefoxPortHub({});
    const top = fakePort(sender(1, 0));
    const child = fakePort(sender(1, 3));
    hub.accept(top);
    hub.accept(child);
    expect(hub.runMenuCommand(1, 3, 's:1')).toBe(true);
    expect(child.sent).toEqual([{ kind: 'menu:run', commandId: 's:1' }]);
    expect(top.sent).toEqual([]);
    expect(hub.runMenuCommand(9, 0, 's:1')).toBe(false);
  });

  it('forgets a port when it disconnects or fails to post', () => {
    const hub = new FirefoxPortHub({});
    const a = fakePort(sender(1));
    const b = fakePort(sender(2));
    hub.accept(a);
    hub.accept(b);
    a.drop();
    b.postMessage.mockImplementation(() => {
      throw new Error('disconnected');
    });
    expect(hub.runMenuCommand(2, 0, 'x')).toBe(false);
    expect(hub.entries.size).toBe(0);
  });
});
