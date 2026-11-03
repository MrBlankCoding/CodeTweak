import logger from '../../shared/utils/logger.js';
import { GM_API_DEFINITIONS } from '../../shared/constants/gmApiDefinitions.js';
import {
  normalizeMatchPattern,
  isValidMatchPattern,
  normalizeRunAt,
} from '../../shared/utils/urls.js';

// Map classic style to ours
function buildGrantToApiMapping() {
  const grantToGmApi = {};

  Object.values(GM_API_DEFINITIONS).forEach((api) => {
    // Original GM style
    grantToGmApi[api.tmName] = api.el;

    // Modern GM
    if (api.tmName !== 'unsafeWindow') {
      const modernName = api.tmName.replace('GM_', 'GM.');
      grantToGmApi[modernName] = api.el;
    }
  });

  // GM4 spellings that differ from the GM_ names.
  grantToGmApi['GM.xmlHttpRequest'] = 'gmXmlhttpRequest';
  grantToGmApi['GM.getResourceUrl'] = 'gmGetResourceURL';

  return grantToGmApi;
}

// `/pattern/flags` in @include/@exclude is a regex rule; returns its source.
function parseRegexRule(value) {
  const match = String(value).match(/^\/(.+)\/([a-z]*)$/i);
  if (!match) return null;
  try {
    new RegExp(match[1]);
    return match[1];
  } catch {
    return null;
  }
}

function parseUserScriptMetadata(content) {
  const metadata = {
    gmApis: {},
  };

  const grantToGmApi = buildGrantToApiMapping();

  const metaMatch = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
  if (!metaMatch) return metadata;

  const metaBlock = metaMatch[1];
  const lines = metaBlock.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    const match = line.match(/@([\w-]+)(?:\s+(.*\S))?\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue ?? '';

    // Flag-style keys that take no value.
    if (key.toLowerCase() === 'noframes') {
      metadata.noframes = true;
      continue;
    }
    if (!value) continue;

    switch (key.toLowerCase()) {
      case 'match':
      case 'include': {
        const trimmed = value.trim();
        const regex = key.toLowerCase() === 'include' ? parseRegexRule(trimmed) : null;
        if (regex) {
          if (!metadata.includeRegexes) metadata.includeRegexes = [];
          metadata.includeRegexes.push(regex);
          break;
        }
        if (!metadata.matches) metadata.matches = [];
        const normalized = normalizeMatchPattern(trimmed);
        if (isValidMatchPattern(normalized) && !metadata.matches.includes(normalized)) {
          metadata.matches.push(normalized);
        }
        break;
      }

      case 'exclude':
      case 'exclude-match': {
        if (!metadata.excludes) metadata.excludes = [];
        const trimmed = value.trim();
        if (!metadata.excludes.includes(trimmed)) metadata.excludes.push(trimmed);
        break;
      }

      case 'connect': {
        if (!metadata.connect) metadata.connect = [];
        const host = value.trim().toLowerCase();
        if (host && !metadata.connect.includes(host)) metadata.connect.push(host);
        break;
      }

      case 'inject-into': {
        const mode = value.trim().toLowerCase();
        if (['page', 'content', 'auto'].includes(mode)) {
          metadata.injectInto = { page: 'main', content: 'isolated', auto: 'default' }[mode];
        }
        break;
      }

      case 'require': {
        if (!metadata.requires) metadata.requires = [];
        const trimmed = value.trim();
        if (/^https:\/\//i.test(trimmed)) {
          metadata.requires.push(trimmed);
        } else if (/^http:\/\//i.test(trimmed)) {
          const upgraded = trimmed.replace(/^http:/i, 'https:');
          metadata.requires.push(upgraded);
          logger.warn(`CodeTweak: Upgrading @require URL to HTTPS: "${trimmed}"`);
        } else {
          logger.warn(`CodeTweak: Dropping @require with unsupported URL: "${trimmed}"`);
        }
        break;
      }

      case 'resource': {
        if (!metadata.resources) metadata.resources = [];
        const urlMatch = value.match(/(https?:\/\/[^)\s]+)/);
        if (urlMatch) {
          const url = urlMatch[0];
          const name = value.substring(0, urlMatch.index).trim().split(/\s+/)[0];
          if (name) {
            metadata.resources.push({ name, url });
          } else {
            logger.warn(`CodeTweak: Could not parse @resource, no name found for URL: ${url}`);
          }
        } else {
          logger.warn(`CodeTweak: Could not parse @resource, no valid URL found in: "${value}"`);
        }
        break;
      }

      case 'run-at':
        metadata.runAt = value;
        break;

      case 'grant': {
        const grantValue = value.trim();
        if (grantValue === 'none') {
          metadata.gmApis = {};
        } else if (grantValue === 'unsafeWindow') {
          metadata.gmApis.unsafeWindow = true;
        } else {
          const apiFlag = grantToGmApi[grantValue];
          if (apiFlag) {
            metadata.gmApis[apiFlag] = true;
          }
        }
        break;
      }

      case 'license':
        metadata.license = value.trim();
        break;

      case 'icon':
        metadata.icon = value.trim();
        break;

      default:
        metadata[key] = value;
    }
  }

  return metadata;
}

function extractMetadataBlock(content) {
  const match = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
  return match ? match[0] : null;
}

function buildApiToGrantMapping() {
  const apiToGrant = {};

  Object.values(GM_API_DEFINITIONS).forEach((api) => {
    apiToGrant[api.el] = api.tmName;
  });

  return apiToGrant;
}

const gmApiFlagToGrant = buildApiToGrantMapping();

function buildMetadata(script, useModernStyle = false) {
  const lines = [];
  lines.push('// ==UserScript==');

  const push = (key, value) => {
    if (Array.isArray(value)) {
      value.forEach((v) => lines.push(`// @${key.padEnd(10)} ${v}`));
    } else if (value !== undefined && value !== null && value !== '') {
      lines.push(`// @${key.padEnd(10)} ${value}`);
    }
  };

  push('name', script.name || 'Untitled Script');
  push('namespace', script.namespace || 'https://codetweak.local'); // Need this domain
  push('version', script.version || '1.0.0');
  push('description', script.description || '');
  push('author', script.author || 'Anonymous');
  push('icon', script.icon);

  const matches = script.matches || script.targetUrls;
  if (matches && matches.length) {
    matches.forEach((pattern) => push('match', pattern));
  }
  (script.includeRegexes || []).forEach((source) => push('include', `/${source}/`));
  (script.excludes || []).forEach((rule) => push('exclude', rule));
  (script.connect || []).forEach((host) => push('connect', host));
  if (script.noframes) lines.push('// @noframes');

  const runAt = script.runAt || script.suggestedRunAt;
  if (runAt) {
    push('run-at', String(runAt).replace(/_/g, '-'));
  }

  if (script.requires && script.requires.length) {
    script.requires.forEach((url) => push('require', url));
  }

  if (script.resources && script.resources.length) {
    script.resources.forEach((r) => push('resource', `${r.name} ${r.url}`));
  }

  // Grants: accept flat script[flag] or nested script.gmApis[flag].
  const grants = [];
  let anyApiSelected = false;
  Object.keys(gmApiFlagToGrant).forEach((flag) => {
    if (script[flag] || script.gmApis?.[flag]) {
      let grantName = gmApiFlagToGrant[flag];
      if (useModernStyle && grantName !== 'unsafeWindow') {
        grantName = grantName.replace('GM_', 'GM.');
      }
      grants.push(grantName);
      anyApiSelected = true;
    }
  });

  if (!anyApiSelected) {
    push('grant', 'none');
  } else {
    grants.forEach((g) => push('grant', g));
  }

  if (script.license) {
    push('license', script.license);
  }

  lines.push('// ==/UserScript==');
  return lines.join('\n');
}

const GM_API_FLAGS = Object.values(GM_API_DEFINITIONS).map((api) => api.el);

// maps classic GM names to our flags
function scriptFieldsFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const fields = {};
  for (const key of ['name', 'version', 'description', 'author', 'namespace', 'license', 'icon']) {
    if (typeof metadata[key] === 'string' && metadata[key].trim()) {
      fields[key] = metadata[key].trim();
    }
  }
  if (Array.isArray(metadata.matches) && metadata.matches.length > 0) {
    fields.targetUrls = [...metadata.matches];
  }
  const runAt = normalizeRunAt(metadata.runAt);
  if (runAt) fields.runAt = runAt;
  fields.requires = Array.isArray(metadata.requires) ? [...metadata.requires] : [];
  fields.resources = Array.isArray(metadata.resources) ? [...metadata.resources] : [];
  fields.excludes = Array.isArray(metadata.excludes) ? [...metadata.excludes] : [];
  fields.includeRegexes = Array.isArray(metadata.includeRegexes)
    ? [...metadata.includeRegexes]
    : [];
  fields.noframes = metadata.noframes === true;
  // No @connect means "any host" (legacy behaviour), so clear stale lists.
  fields.connect = Array.isArray(metadata.connect) ? [...metadata.connect] : undefined;
  if (metadata.injectInto) fields.injectInto = metadata.injectInto;
  for (const key of ['updateURL', 'downloadURL']) {
    if (typeof metadata[key] === 'string' && metadata[key].trim()) {
      fields[key] = metadata[key].trim();
    }
  }
  const grants = metadata.gmApis || {};
  for (const flag of GM_API_FLAGS) {
    fields[flag] = grants[flag] === true;
  }
  return fields;
}

export {
  parseUserScriptMetadata,
  extractMetadataBlock,
  buildMetadata,
  scriptFieldsFromMetadata,
  GM_API_FLAGS,
};
