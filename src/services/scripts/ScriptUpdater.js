import logger from '../../shared/utils/logger.js';
import {
  parseUserScriptMetadata,
  scriptFieldsFromMetadata,
  GM_API_FLAGS,
} from './MetadataParser.js';
import { mutateScripts } from '../storage/StorageService.js';
import { hashCode } from '../../shared/utils/hash.js';
import { saveScriptSnapshot } from './ScriptHistory.js';

const MAX_SCRIPT_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;

function added(before, after) {
  const known = new Set(Array.isArray(before) ? before : []);
  return (Array.isArray(after) ? after : []).filter((item) => !known.has(item));
}

const allowsAnyHost = (connect) =>
  !Array.isArray(connect) || connect.length === 0 || connect.includes('*');

// what does a new version want
export function describePermissionChanges(oldCode, newCode) {
  const before = scriptFieldsFromMetadata(parseUserScriptMetadata(String(oldCode ?? '')));
  const after = scriptFieldsFromMetadata(parseUserScriptMetadata(String(newCode ?? '')));
  const grants = GM_API_FLAGS.filter((flag) => after[flag] && !before[flag]);
  const matches = [
    ...added(before.targetUrls, after.targetUrls),
    ...added(before.includeRegexes, after.includeRegexes).map((source) => `/${source}/`),
  ];
  let connect = [];
  if (!allowsAnyHost(before.connect)) {
    connect = allowsAnyHost(after.connect) ? ['*'] : added(before.connect, after.connect);
  }
  return {
    grants,
    matches,
    connect,
    escalated: grants.length + matches.length + connect.length > 0,
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export class ScriptUpdater {
  constructor(storageApi, { onScriptsUpdated, dependencyCache, fetchImpl, concurrency = 4 } = {}) {
    this.storageApi = storageApi;
    this.onScriptsUpdated = onScriptsUpdated;
    this.dependencies = dependencyCache;
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.concurrency = concurrency;
  }

  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const parts1 = String(v1)
      .split(/[.-]/)
      .map((p) => parseInt(p, 10) || 0);
    const parts2 = String(v2)
      .split(/[.-]/)
      .map((p) => parseInt(p, 10) || 0);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  // `check` is fetched to compare versions (ideally a light .meta.js);
  // `download` provides the full code. Header URLs fill in missing fields.
  resolveUrls(script) {
    const header = parseUserScriptMetadata(String(script.code ?? ''));
    const info = script.updateInfo || {};
    const download =
      script.downloadURL ||
      header.downloadURL ||
      info.sourceUrl ||
      script.updateURL ||
      header.updateURL ||
      null;
    const check = script.updateURL || header.updateURL || download;
    return { check: check || null, download };
  }

  resolveUpdateUrl(script) {
    return this.resolveUrls(script).check;
  }

  async fetchText(url, headers = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers,
        cache: 'no-cache',
      });
      const result = {
        status: response.status,
        ok: response.ok,
        etag: response.headers?.get?.('etag') || undefined,
        lastModified: response.headers?.get?.('last-modified') || undefined,
        text: '',
      };
      if (response.ok) {
        result.text = await response.text();
        if (result.text.length > MAX_SCRIPT_BYTES) {
          throw new Error(`payload exceeds 2MB: ${url}`);
        }
      }
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async checkScript(script) {
    const { check, download } = this.resolveUrls(script);
    if (!check) return null;
    if (![check, download].every((url) => typeof url === 'string' && /^https:\/\//i.test(url))) {
      logger.warn(`Skipping update for ${script.name}: non-HTTPS update URL.`);
      return null;
    }

    const installedVersion =
      script.version || parseUserScriptMetadata(String(script.code ?? '')).version;
    const info = script.updateInfo || {};
    const conditional = {};
    if (info.etagUrl === check) {
      if (info.etag) conditional['If-None-Match'] = info.etag;
      if (info.lastModified) conditional['If-Modified-Since'] = info.lastModified;
    }

    try {
      logger.info(`Checking update for script: ${script.name} at ${check}`);
      const probe = await this.fetchText(check, conditional);
      const checkMeta = { etagUrl: check, etag: probe.etag, lastModified: probe.lastModified };
      if (probe.status === 304) return { id: script.id, unchanged: true, checkMeta };
      if (!probe.ok) {
        logger.warn(`Failed to fetch update for ${script.name}: ${probe.status}`);
        return null;
      }

      const probeVersion = parseUserScriptMetadata(probe.text).version;
      if (!probeVersion) {
        logger.warn(`Could not find version in updated script ${script.name}`);
        return null;
      }
      if (this.compareVersions(probeVersion, installedVersion) <= 0) {
        logger.info(`Script ${script.name} is up to date (${installedVersion})`);
        return { id: script.id, unchanged: true, checkMeta };
      }

      let newCode = probe.text;
      if (download !== check) {
        const full = await this.fetchText(download);
        if (!full.ok) {
          logger.warn(`Failed to download update for ${script.name}: ${full.status}`);
          return null;
        }
        newCode = full.text;
      }

      const newMetadata = parseUserScriptMetadata(newCode);
      if (
        !newMetadata.version ||
        this.compareVersions(newMetadata.version, installedVersion) <= 0
      ) {
        return { id: script.id, unchanged: true, checkMeta };
      }
      return { id: script.id, codeAtCheck: script.code, newCode, newMetadata, checkMeta };
    } catch (error) {
      logger.error(`Error updating script ${script.name}:`, error);
      return null;
    }
  }

  async checkAndPerformUpdates() {
    logger.info('Starting automatic script update check...');
    const { scripts = [] } = await this.storageApi.local.get('scripts');
    if (!Array.isArray(scripts)) {
      logger.warn('Stored scripts corrupted; skipping update check.');
      return { updated: [], blocked: [] };
    }

    const results = (
      await mapWithConcurrency(scripts, this.concurrency, (script) => this.checkScript(script))
    ).filter(Boolean);

    const applied = [];
    const blocked = [];
    const snapshots = [];

    if (results.length > 0) {
      // Network work happened outside the lock; re-read and apply per script
      // so edits made meanwhile are never overwritten.
      await mutateScripts(this.storageApi, async (current) => {
        for (const result of results) {
          const script = current.find((s) => s.id === result.id);
          if (!script) continue;

          const checkMeta = Object.fromEntries(
            Object.entries(result.checkMeta || {}).filter(([, value]) => value !== undefined)
          );
          script.updateInfo = { ...script.updateInfo, ...checkMeta, lastChecked: Date.now() };
          if (result.unchanged || script.code !== result.codeAtCheck) continue;

          const locallyModified =
            Boolean(script.upstreamHash) && (await hashCode(script.code)) !== script.upstreamHash;
          const changes = describePermissionChanges(script.code, result.newCode);
          if (locallyModified || changes.escalated) {
            Object.assign(script.updateInfo, {
              pendingVersion: result.newMetadata.version,
              pendingReason: locallyModified ? 'modified' : 'permissions',
              pendingChanges: changes,
            });
            blocked.push(script.id);
            logger.info(
              `Update for ${script.name} needs review (${script.updateInfo.pendingReason}).`
            );
            continue;
          }

          snapshots.push({ ...script });
          Object.assign(script, scriptFieldsFromMetadata(result.newMetadata), {
            code: result.newCode,
            upstreamHash: await hashCode(result.newCode),
            updatedAt: new Date().toISOString(),
          });
          delete script.updateInfo.pendingVersion;
          delete script.updateInfo.pendingReason;
          delete script.updateInfo.pendingChanges;
          script.updateInfo.version = result.newMetadata.version;
          logger.info(`Updated script ${script.name} to ${result.newMetadata.version}`);
          applied.push({ ...script });
        }
      });
    }

    await Promise.all(
      snapshots.map((script) => saveScriptSnapshot(this.storageApi, script, 'auto-update'))
    );

    if (applied.length > 0) {
      if (this.dependencies) {
        await Promise.all(
          applied.map((script) =>
            this.dependencies.resolve(script, { refresh: true }).catch((error) => {
              logger.warn(`Dependency refresh failed for ${script.name}:`, error);
            })
          )
        );
      }
      try {
        await this.onScriptsUpdated?.();
      } catch (error) {
        logger.warn('Post-update sync failed:', error);
      }
      logger.info('Automatic updates completed. Some scripts were updated.');
    } else {
      logger.info('Automatic update check finished. No updates applied.');
    }

    await this.storageApi.local.set({ lastUpdateCheck: Date.now() });
    return { updated: applied.map((s) => s.id), blocked };
  }

  setupAlarm() {
    const ALARM_NAME = 'codetweak-auto-update';
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        this.checkAndPerformUpdates().catch((error) => {
          logger.error('Scheduled update check failed:', error);
        });
      }
    });

    chrome.alarms.get(ALARM_NAME, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(ALARM_NAME, {
          periodInMinutes: 24 * 60, // Once a day
        });
      }
    });

    this.checkIfInitialCheckNeeded();
  }

  async checkIfInitialCheckNeeded() {
    const { lastUpdateCheck } = await this.storageApi.local.get('lastUpdateCheck');
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (!lastUpdateCheck || now - lastUpdateCheck > ONE_DAY) {
      setTimeout(() => {
        this.checkAndPerformUpdates().catch((error) => {
          logger.error('Initial update check failed:', error);
        });
      }, 5000);
    }
  }
}
