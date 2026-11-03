import logger from '../shared/utils/logger.js';
import { bytesToBase64 } from '../shared/utils/hash.js';

const MAX_RESPONSE_BYTES = 5_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const BINARY_TYPES = new Set(['arraybuffer', 'blob']);

// abort handels for inflight responses
const inflight = new Map();

export function abortCrossOriginRequest(key) {
  const controller = inflight.get(key);
  if (!controller) return false;
  controller.abort('user');
  inflight.delete(key);
  return true;
}

export async function handleCrossOriginXmlhttpRequest(details, { abortKey } = {}) {
  const { settings = {} } = await chrome.storage.local.get('settings');

  if (!settings.allowExternalResources) {
    return {
      error: 'Cross-origin requests are disabled by a security setting.',
    };
  }

  const { url, method = 'GET', headers, data, responseType } = details;

  if (!url) {
    logger.error('CodeTweak: Cross-origin request failed: No URL provided.');
    return { error: 'No URL provided.' };
  }
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { error: `Invalid URL: ${url}` };
  }
  const upperMethod = String(method).toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    return { error: `Unsupported method: ${method}` };
  }
  if (headers && (typeof headers !== 'object' || Array.isArray(headers))) {
    return { error: 'Invalid headers.' };
  }
  if (typeof data === 'string' && data.length > 1_000_000) {
    return { error: 'Request body exceeds 1MB limit.' };
  }

  const requestOptions = { method: upperMethod, headers };
  if (data && !['GET', 'HEAD'].includes(upperMethod)) {
    requestOptions.body = data;
  }

  const timeoutMs =
    Number.isFinite(details.timeout) && details.timeout > 0
      ? Math.min(details.timeout, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);
  requestOptions.signal = controller.signal;
  if (abortKey) inflight.set(abortKey, controller);

  try {
    const response = await fetch(url, requestOptions);

    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    const mime = (response.headers.get?.('content-type') || '').split(';')[0].trim();

    const result = {
      readyState: 4,
      responseHeaders: Object.entries(responseHeaders)
        .map(([name, value]) => `${name}: ${value}`)
        .join('\n'),
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      mime,
    };

    // handle bianary by converying to base64 string
    if (BINARY_TYPES.has(responseType)) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        return { error: 'Response exceeds 5MB limit.' };
      }
      result.responseBase64 = bytesToBase64(buffer);
      result.responseText = '';
      return { result };
    }

    const responseText = await response.text();
    if (responseText.length > MAX_RESPONSE_BYTES) {
      return { error: 'Response exceeds 5MB limit.' };
    }
    result.responseText = responseText;
    if (responseType === 'json') {
      try {
        result.response = JSON.parse(responseText);
      } catch {
        result.response = null;
      }
    } else {
      result.response = responseText;
    }
    return { result };
  } catch (error) {
    if (controller.signal.reason === 'user') {
      return { error: 'Request aborted.' };
    }
    logger.error('CodeTweak: Cross-origin request failed:', {
      error,
      url,
      method,
    });

    let errorMessage = error.message;
    if (error?.name === 'AbortError' || controller.signal.reason === 'timeout') {
      errorMessage = `Request timed out after ${Math.round(timeoutMs / 1000)}s. URL: ${url}`;
    } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
      errorMessage = `Network request failed. This could be due to a CORS issue, network error, or invalid URL. URL: ${url}`;
    }

    return { error: errorMessage };
  } finally {
    clearTimeout(timeoutId);
    if (abortKey) inflight.delete(abortKey);
  }
}
