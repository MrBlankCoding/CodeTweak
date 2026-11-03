import logger from '../../shared/utils/logger.js';
import { bytesToBase64, bytesToHex, digest } from '../../shared/utils/hash.js';

export const DEPENDENCY_KEY_PREFIX = 'dep:';
const MAX_DEPENDENCY_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 30_000;
const SRI_ALGORITHMS = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };

// hash depenency
// compare
export function parseIntegrity(url) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return [];
  return url
    .slice(hashIndex + 1)
    .split(/[,;]/)
    .map((part) => part.trim().match(/^(sha256|sha384|sha512)[=-](.+)$/i))
    .filter(Boolean)
    .map(([, algorithm, value]) => ({ algorithm: algorithm.toLowerCase(), value }));
}

async function verifyIntegrity(url, bytes) {
  const expected = parseIntegrity(url);
  if (expected.length === 0) return;
  for (const { algorithm, value } of expected) {
    const hash = await digest(SRI_ALGORITHMS[algorithm], bytes);
    if (bytesToHex(hash) === value.toLowerCase() || bytesToBase64(hash) === value) return;
  }
  throw new Error(`Integrity check failed for ${url}`);
}

function stripFragment(url) {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function inferMime(url, headerType) {
  if (headerType) return headerType.split(';')[0].trim();
  const lower = stripFragment(url).split('?')[0].toLowerCase();
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.js')) return 'application/javascript';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return 'text/plain';
}

// prevent scripts loading dependencies live
export class DependencyCache {
  constructor(storageApi, fetchImpl = (...args) => globalThis.fetch(...args)) {
    this.storageApi = storageApi;
    this.fetchImpl = fetchImpl;
    this.inflight = new Map();
  }

  key(kind, url) {
    return `${DEPENDENCY_KEY_PREFIX}${kind}:${url}`;
  }

  async download(kind, url) {
    const allowed = kind === 'require' ? /^https:\/\//i : /^https?:\/\//i;
    if (!allowed.test(url)) {
      throw new Error(`Blocked @${kind} with disallowed URL: ${url}`);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(stripFragment(url), {
        signal: controller.signal,
        credentials: 'omit',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_DEPENDENCY_BYTES) {
        throw new Error(`@${kind} exceeds 5MB: ${url}`);
      }
      await verifyIntegrity(url, bytes);
      const entry = { url, fetchedAt: Date.now() };
      if (kind === 'require') {
        entry.text = new TextDecoder().decode(bytes);
      } else {
        entry.base64 = bytesToBase64(bytes);
        entry.mime = inferMime(url, response.headers?.get?.('content-type'));
      }
      await this.storageApi.local.set({ [this.key(kind, url)]: entry });
      return entry;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get(kind, url, { refresh = false } = {}) {
    const key = this.key(kind, url);
    if (!refresh) {
      const { [key]: cached } = await this.storageApi.local.get(key);
      if (cached) return cached;
    }
    if (!this.inflight.has(key)) {
      this.inflight.set(
        key,
        this.download(kind, url).finally(() => this.inflight.delete(key))
      );
    }
    return this.inflight.get(key);
  }

  // Resolves every dependency for a script. Failures are reported in `missing`
  // rather than thrown so one bad URL is visible to the script as an error.
  async resolve(script, { refresh = false } = {}) {
    const requireUrls = Array.isArray(script.requires) ? script.requires : [];
    const resourceList = Array.isArray(script.resources) ? script.resources : [];
    const missing = [];

    const requires = await Promise.all(
      requireUrls
        .filter((url) => typeof url === 'string' && url)
        .map(async (url) => {
          try {
            return (await this.get('require', url, { refresh })).text;
          } catch (error) {
            logger.warn(`Failed to load @require ${url}:`, error.message);
            missing.push(url);
            return null;
          }
        })
    );

    const resources = {};
    await Promise.all(
      resourceList
        .filter((res) => res?.name && typeof res.url === 'string')
        .map(async ({ name, url }) => {
          try {
            const entry = await this.get('resource', url, { refresh });
            resources[name] = { url, mime: entry.mime, base64: entry.base64 };
          } catch (error) {
            logger.warn(`Failed to load @resource ${name}:`, error.message);
            missing.push(url);
          }
        })
    );

    return { requires: requires.filter((text) => text !== null), resources, missing };
  }

  // Drops cached dependencies no script references any more.
  async prune(scripts) {
    if (typeof this.storageApi.local.getKeys !== 'function') return;
    const keep = new Set();
    for (const script of scripts) {
      (script.requires || []).forEach((url) => keep.add(this.key('require', url)));
      (script.resources || []).forEach(
        (res) => res?.url && keep.add(this.key('resource', res.url))
      );
    }
    const keys = await this.storageApi.local.getKeys();
    const stale = keys.filter((key) => key.startsWith(DEPENDENCY_KEY_PREFIX) && !keep.has(key));
    if (stale.length > 0) await this.storageApi.local.remove(stale);
  }
}
