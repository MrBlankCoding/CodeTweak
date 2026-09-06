import { normalizeMatchPattern, isValidMatchPattern } from '../../../shared/utils/urls.js';

export const REGISTRATION_PREFIX = 'ct-us-';

export const GM_FLAG_KEYS = [
  'gmSetValue',
  'gmGetValue',
  'gmDeleteValue',
  'gmListValues',
  'gmAddValueChangeListener',
  'gmRemoveValueChangeListener',
  'gmOpenInTab',
  'gmNotification',
  'gmGetResourceText',
  'gmGetResourceURL',
  'gmSetClipboard',
  'gmDownload',
  'gmAddStyle',
  'gmAddElement',
  'gmRegisterMenuCommand',
  'gmUnregisterMenuCommand',
  'gmXmlhttpRequest',
  'unsafeWindow',
  'gmLog',
];

export { normalizeRunAt } from '../../../shared/utils/urls.js';

export function normalizeMatches(script) {
  const raw = Array.isArray(script.targetUrls) ? script.targetUrls : [script.targetUrl];
  const matches = raw.filter((m) => typeof m === 'string');

  const uniqueMatches = [...new Set(matches.map((m) => m.trim()))]
    .filter(Boolean)
    .filter((match) => !/^https?:\/\/$/.test(match))
    .map((m) => normalizeMatchPattern(m))
    .filter((m) => isValidMatchPattern(m));

  return [...new Set(uniqueMatches)];
}

export function normalizeInjectInto(injectInto) {
  if (injectInto === 'isolated') return 'ISOLATED';
  return 'MAIN';
}

export function getRegistrationId(scriptId) {
  return `${REGISTRATION_PREFIX}${scriptId}`;
}

export function buildEnabledApis(script) {
  return Object.fromEntries(GM_FLAG_KEYS.map((key) => [key, Boolean(script[key])]));
}

export function buildResourceMaps(script) {
  const resourceURLs = {};
  if (Array.isArray(script.resources)) {
    script.resources.forEach((resource) => {
      if (resource?.name && resource?.url) {
        resourceURLs[resource.name] = resource.url;
      }
    });
  }

  return {
    contents: script.resourceContents || {},
    urls: resourceURLs,
  };
}

export function buildGmInfo(script, extensionVersion) {
  return {
    script: {
      id: script.id,
      name: script.name || '',
      version: script.version || '',
      description: script.description || '',
      author: script.author || '',
      namespace: script.namespace || '',
    },
    scriptHandler: 'CodeTweak',
    version: extensionVersion,
  };
}
