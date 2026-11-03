import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ScriptUpdater,
  describePermissionChanges,
} from '../../src/services/scripts/ScriptUpdater.js';
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

describe('ScriptUpdater', () => {
  let data;
  let storageApi;
  let onScriptsUpdated;

  const makeUpdater = (fetchImpl) =>
    new ScriptUpdater(storageApi, { onScriptsUpdated, fetchImpl, concurrency: 2 });

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

  it('compares versions correctly', () => {
    const updater = makeUpdater(vi.fn());
    expect(updater.compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(updater.compareVersions('1.1.0', '1.0.1')).toBe(1);
    expect(updater.compareVersions('1.0', '1.0.0')).toBe(0);
    expect(updater.compareVersions('2.0-beta', '2.0')).toBe(0);
    expect(updater.compareVersions('1.0.0.1', '1.0.0')).toBe(1);
  });

  it('checks for script updates automatically on its daily alarm', () => {
    data.lastUpdateCheck = Date.now();
    const updater = makeUpdater(vi.fn());
    const checkUpdates = vi
      .spyOn(updater, 'checkAndPerformUpdates')
      .mockResolvedValue({ updated: [], blocked: [] });

    updater.setupAlarm();

    expect(chrome.alarms.create).toHaveBeenCalledWith('codetweak-auto-update', {
      periodInMinutes: 24 * 60,
    });

    const onAlarm = chrome.alarms.onAlarm.addListener.mock.calls[0][0];
    onAlarm({ name: 'another-alarm' });
    expect(checkUpdates).not.toHaveBeenCalled();

    onAlarm({ name: 'codetweak-auto-update' });
    expect(checkUpdates).toHaveBeenCalledOnce();
  });

  it('applies a newer version, maps header fields, and syncs directly', async () => {
    const oldCode = header('1.0.0', '// @grant GM_setValue\n');
    data.scripts = [
      {
        id: '1',
        name: 'Test',
        version: '1.0.0',
        updateURL: 'https://example.com/update.js',
        code: oldCode,
        gmSetValue: true,
        upstreamHash: await hashCode(oldCode),
      },
    ];
    const newCode = header('1.1.0', '// @grant GM_setValue\n') + 'console.log("updated");';
    const updater = makeUpdater(vi.fn(async () => response(newCode)));

    const result = await updater.checkAndPerformUpdates();

    expect(result).toEqual({ updated: ['1'], blocked: [] });
    expect(data.scripts[0]).toEqual(
      expect.objectContaining({
        version: '1.1.0',
        code: newCode,
        targetUrls: ['https://example.com/*'],
        gmSetValue: true,
        upstreamHash: await hashCode(newCode),
      })
    );
    expect(onScriptsUpdated).toHaveBeenCalledTimes(1);
    expect(data['script-history-1']).toHaveLength(1);
  });

  it('checks the meta URL first and only downloads when newer', async () => {
    data.scripts = [
      {
        id: '1',
        name: 'Test',
        version: '1.0.0',
        updateURL: 'https://example.com/t.meta.js',
        downloadURL: 'https://example.com/t.user.js',
        code: header('1.0.0'),
      },
    ];
    const fetchImpl = vi.fn(async (url) =>
      url.endsWith('.meta.js') ? response(header('1.0.0'), { etag: '"v1"' }) : response('nope')
    );
    await makeUpdater(fetchImpl).checkAndPerformUpdates();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(data.scripts[0].updateInfo.etag).toBe('"v1"');

    // Next check sends the stored ETag; a 304 means nothing to do.
    const conditional = vi.fn(async () => response('', { status: 304 }));
    await makeUpdater(conditional).checkAndPerformUpdates();
    expect(conditional.mock.calls[0][1].headers).toEqual({ 'If-None-Match': '"v1"' });
  });

  it('does not update when version is the same or older', async () => {
    data.scripts = [
      {
        id: '1',
        name: 'Test',
        version: '1.2.0',
        updateURL: 'https://example.com/update.js',
        code: header('1.2.0'),
      },
    ];
    const result = await makeUpdater(
      vi.fn(async () => response(header('1.1.0')))
    ).checkAndPerformUpdates();
    expect(result.updated).toEqual([]);
    expect(data.scripts[0].code).toBe(header('1.2.0'));
    expect(onScriptsUpdated).not.toHaveBeenCalled();
  });

  it('holds updates that add grants, sites, or hosts for review', async () => {
    const oldCode = header('1.0.0', '// @connect api.example.com\n');
    data.scripts = [
      { id: '1', name: 'Test', version: '1.0.0', updateURL: 'https://e.com/u.js', code: oldCode },
    ];
    const newCode = header(
      '2.0.0',
      '// @match https://bank.test/*\n// @grant GM_xmlhttpRequest\n// @connect *\n'
    );
    const result = await makeUpdater(vi.fn(async () => response(newCode))).checkAndPerformUpdates();

    expect(result).toEqual({ updated: [], blocked: ['1'] });
    expect(data.scripts[0].code).toBe(oldCode);
    expect(data.scripts[0].updateInfo).toEqual(
      expect.objectContaining({
        pendingVersion: '2.0.0',
        pendingReason: 'permissions',
        pendingChanges: expect.objectContaining({
          grants: ['gmXmlhttpRequest'],
          matches: ['https://bank.test/*'],
          connect: ['*'],
        }),
      })
    );
  });

  it('never overwrites a locally modified script', async () => {
    const upstream = header('1.0.0');
    data.scripts = [
      {
        id: '1',
        name: 'Test',
        version: '1.0.0',
        updateURL: 'https://e.com/u.js',
        code: upstream + '// my local tweak',
        upstreamHash: await hashCode(upstream),
      },
    ];
    const result = await makeUpdater(
      vi.fn(async () => response(header('1.1.0')))
    ).checkAndPerformUpdates();
    expect(result.blocked).toEqual(['1']);
    expect(data.scripts[0].code).toContain('my local tweak');
    expect(data.scripts[0].updateInfo.pendingReason).toBe('modified');
  });

  it('skips the update if the script was edited while the check was running', async () => {
    data.scripts = [
      { id: '1', name: 'Test', version: '1.0.0', updateURL: 'https://e.com/u.js', code: 'v1' },
    ];
    const fetchImpl = vi.fn(async () => {
      data.scripts = [{ ...data.scripts[0], code: 'edited in editor' }];
      return response(header('1.1.0'));
    });
    await makeUpdater(fetchImpl).checkAndPerformUpdates();
    expect(data.scripts[0].code).toBe('edited in editor');
  });

  it('describes permission changes between versions', () => {
    expect(describePermissionChanges(header('1'), header('2'))).toEqual({
      grants: [],
      matches: [],
      connect: [],
      escalated: false,
    });
    expect(
      describePermissionChanges(header('1'), header('2', '// @grant GM_download\n')).grants
    ).toEqual(['gmDownload']);
  });
});
