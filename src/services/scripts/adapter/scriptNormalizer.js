import {
  normalizeMatchPattern,
  isValidMatchPattern,
  normalizeRunAt,
} from '../../../shared/utils/urls.js';
import { GM_API_DEFINITIONS } from '../../../shared/constants/gmApiDefinitions.js';

const GM_API_FLAGS = Object.values(GM_API_DEFINITIONS).map((api) => api.el);

export const REGISTRATION_PREFIX = 'ct-us-';
export const ERROR_BRIDGE_ID = 'ct-sys-error-bridge';

// APIs that need the extension (storage, network, tabs, menus). They only work
// in the USER_SCRIPT world, where the page cannot reach them.
export const PRIVILEGED_FLAGS = [
  'gmSetValue',
  'gmGetValue',
  'gmDeleteValue',
  'gmListValues',
  'gmAddValueChangeListener',
  'gmRemoveValueChangeListener',
  'gmOpenInTab',
  'gmNotification',
  'gmSetClipboard',
  'gmDownload',
  'gmXmlhttpRequest',
  'gmRegisterMenuCommand',
  'gmUnregisterMenuCommand',
];

export { normalizeRunAt };

export function normalizeMatches(script) {
  const raw = Array.isArray(script.targetUrls) ? script.targetUrls : [];
  const matches = raw.filter((m) => typeof m === 'string');

  const uniqueMatches = [...new Set(matches.map((m) => m.trim()))]
    .filter(Boolean)
    .filter((match) => !/^https?:\/\/$/.test(match))
    .map((m) => normalizeMatchPattern(m))
    .filter((m) => isValidMatchPattern(m));

  return [...new Set(uniqueMatches)];
}

const escapeRegex = (text) => text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// Tampermonkey @exclude globs: `*` matches anything, `?` one character.
export function globToRegexSource(glob) {
  return `^${escapeRegex(glob).replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
}

export function matchPatternToRegexSource(pattern) {
  if (pattern === '<all_urls>') return '^(?:https?|file|ftp)://';
  const match = String(pattern).match(/^([^:]+):\/\/([^/]*)(\/.*)?$/);
  if (!match) return null;
  const [, scheme, host, path = '/*'] = match;
  const schemeSource = scheme === '*' ? 'https?' : escapeRegex(scheme);
  let hostSource;
  if (host === '*') hostSource = '[^/]*';
  else if (host.startsWith('*.')) hostSource = `(?:[^/]*\\.)?${escapeRegex(host.slice(2))}`;
  else hostSource = escapeRegex(host);
  const pathSource = escapeRegex(path).replace(/\*/g, '.*');
  return `^${schemeSource}://${hostSource}(?::\\d+)?${pathSource}$`;
}

function regexRule(rule) {
  const match = String(rule).match(/^\/(.+)\/[a-z]*$/i);
  return match ? match[1] : null;
}

// URL gate beyond what match patterns can express: @include regexes widen the
// match, @exclude rules (globs or /regex/) veto it. Sources are case-insensitive.
export function gateFor(script) {
  const includeRegexes = (
    Array.isArray(script?.includeRegexes) ? script.includeRegexes : []
  ).filter((source) => typeof source === 'string' && source);
  const excludeRegexes = (Array.isArray(script?.excludes) ? script.excludes : [])
    .filter((rule) => typeof rule === 'string' && rule.trim())
    .map((rule) => regexRule(rule.trim()) ?? globToRegexSource(rule.trim()));
  return { includeRegexes, excludeRegexes };
}

export function excludeGlobsFor(script) {
  return (Array.isArray(script?.excludes) ? script.excludes : [])
    .filter((rule) => typeof rule === 'string' && rule.trim() && !regexRule(rule.trim()))
    .map((rule) => rule.trim());
}

export function usesPrivilegedApis(script) {
  return PRIVILEGED_FLAGS.some((flag) => script?.[flag] === true);
}

// 'main'/'page' always run in the page. 'isolated'/'content' always run in the
// USER_SCRIPT world. Otherwise ('default'), scripts with privileged grants are
// isolated and @grant none scripts run in the page, like Violentmonkey's auto.
export function resolveWorld(script) {
  const mode = String(script?.injectInto || '').toLowerCase();
  if (mode === 'main' || mode === 'page') return 'MAIN';
  if (mode === 'isolated' || mode === 'content') return 'USER_SCRIPT';
  return usesPrivilegedApis(script) ? 'USER_SCRIPT' : 'MAIN';
}

export function getRegistrationId(scriptId) {
  return `${REGISTRATION_PREFIX}${scriptId}`;
}

export function buildEnabledApis(script) {
  return Object.fromEntries(GM_API_FLAGS.map((key) => [key, script[key] === true]));
}

export function buildGmInfo(script, extensionVersion, world) {
  const metaMatch = String(script.code ?? '').match(
    /\/\/\s*==UserScript==[\s\S]*?==\/UserScript==/
  );
  return {
    script: {
      id: script.id,
      name: script.name || '',
      version: script.version || '',
      description: script.description || '',
      author: script.author || '',
      namespace: script.namespace || '',
      matches: normalizeMatches(script),
      requires: Array.isArray(script.requires) ? script.requires : [],
      resources: Array.isArray(script.resources) ? script.resources : [],
      'run-at': normalizeRunAt(script.runAt, 'document_idle').replace(/_/g, '-'),
    },
    scriptMetaStr: metaMatch ? metaMatch[0] : '',
    scriptHandler: 'CodeTweak',
    version: extensionVersion,
    injectInto: world === 'MAIN' ? 'page' : 'content',
  };
}
