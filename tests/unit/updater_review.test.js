import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ScriptUpdater } from '../../src/services/scripts/ScriptUpdater.js';
import { hashCode } from '../../src/shared/utils/hash.js';

const header = (version, extra = '') =>
  `// ==UserScript==\n// @name Test\n// @version ${version}\n// @match https://example.com/*\n${extra}// ==/UserScript==\n`;

function response(text, { status = 200, etag } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'etag' ? etag : null) },
    text: async () => text,
  };
}

describe('ScriptUpdater pending review actions', () => {
  let data;
  let storageApi;
  let onScriptsUpdated;

  const makeUpdater = (fetchImpl) =>
    new ScriptUpdater(storageApi, { onScriptsUpdated, fetchImpl, concurrency: 2 });

  const scriptWithPending = (code, pendingVersion = '1.1.0') => ({
    id: '1',
    name: 'Test',
    version: '1.0.0',
    updateURL: 'https://example.com/update.js',
    code,
    gmSetValue: true,
    upstreamHash: null,
    updateInfo: {
      pendingVersion,
      pendingReason: 'permissions',
      pendingChanges: { grants: ['gmNotification'], matches: [], connect: [], escalated: true },
    },
  });

  beforeEach(() => {
    data = {};
    storageApi = {
      local: {
        get: vi.fn(async (key) => ({ [key]: data[key] })),
        set: vi.fn(async (obj) => Object.assign(data, obj)),
      },
    };
    onScriptsUpdated = vi.fn(async () => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.chrome = {
      runtime: { sendMessage: vi.fn() },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
        get: vi.fn((name, cb) => cb(null)),
      },
    };
  });

  it('refuses when there is no pending update', async () => {
    data.scripts = [
      { id: '1', name: 'Test', version: '1.0.0', code: header('1.0.0'), updateInfo: {} },
    ];
    const updater = makeUpdater(vi.fn());

    const result = await updater.applyPendingUpdate('1');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No pending update/);
  });

  it('applies an approved update: replaces code, clears pending info, snapshots, syncs', async () => {
    const oldCode = header('1.0.0', '// @grant GM_setValue\n');
    const newCode = header('1.1.0', '// @grant GM_setValue\n// @grant GM_notification\n');
    data.scripts = [scriptWithPending(oldCode)];
    const updater = makeUpdater(vi.fn(async () => response(newCode)));

    const result = await updater.applyPendingUpdate('1');

    expect(result).toEqual({ ok: true, version: '1.1.0' });
    const applied = data.scripts[0];
    expect(applied.version).toBe('1.1.0');
    expect(applied.gmSetValue).toBe(true);
    expect(applied.gmNotification).toBe(true);
    expect(applied.code).toBe(newCode);
    expect(applied.upstreamHash).toBe(await hashCode(newCode));
    expect(applied.updateInfo.pendingVersion).toBeUndefined();
    expect(applied.updateInfo.version).toBe('1.1.0');
    expect(onScriptsUpdated).toHaveBeenCalledOnce();
    const history = data['script-history-1'];
    expect(Array.isArray(history)).toBe(true);
    expect(history[0]).toEqual(
      expect.objectContaining({ reason: 'reviewed-update', version: '1.0.0' })
    );
    expect(history[0].code).toBe(oldCode);
  });

  it('does not silently apply when upstream moved beyond the reviewed version', async () => {
    const oldCode = header('1.0.0');
    data.scripts = [scriptWithPending(oldCode, '1.1.0')];
    const updater = makeUpdater(vi.fn(async () => response(header('1.2.0'))));

    const result = await updater.applyPendingUpdate('1');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/different version/);
    expect(result.newVersion).toBe('1.2.0');
    expect(data.scripts[0].version).toBe('1.0.0');
    expect(data.scripts[0].code).toBe(oldCode);
    expect(data.scripts[0].updateInfo.pendingVersion).toBe('1.2.0');
    expect(data.scripts[0].updateInfo.pendingReason).toBe('modified');
  });

  it('clears a stale pending flag when the source no longer offers the update', async () => {
    const oldCode = header('1.0.0');
    data.scripts = [scriptWithPending(oldCode)];
    const updater = makeUpdater(vi.fn(async () => response(oldCode)));

    const result = await updater.applyPendingUpdate('1');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no longer available/);
    expect(data.scripts[0].code).toBe(oldCode);
    expect(data.scripts[0].updateInfo.pendingVersion).toBeUndefined();
    expect(data.scripts[0].updateInfo.lastChecked).toEqual(expect.any(Number));
  });

  it('rejects a pending update without touching code or version', async () => {
    const oldCode = header('1.0.0');
    data.scripts = [scriptWithPending(oldCode)];
    const updater = makeUpdater(vi.fn());

    const result = await updater.rejectPendingUpdate('1');
    const script = data.scripts[0];

    expect(result.ok).toBe(true);
    expect(script.version).toBe('1.0.0');
    expect(script.code).toBe(oldCode);
    expect(script.updateInfo.pendingVersion).toBeUndefined();
    expect(script.updateInfo.pendingReason).toBeUndefined();
    expect(script.updateInfo.pendingChanges).toBeUndefined();
    expect(onScriptsUpdated).not.toHaveBeenCalled();
  });

  it('rejects when there is no pending update', async () => {
    data.scripts = [
      { id: '1', name: 'Test', version: '1.0.0', code: header('1.0.0'), updateInfo: {} },
    ];
    const updater = makeUpdater(vi.fn());

    const result = await updater.rejectPendingUpdate('1');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No pending update/);
  });
});
