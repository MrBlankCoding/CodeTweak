import logger from '../shared/utils/logger.js';

export async function handleCrossOriginXmlhttpRequest(details) {
  const browser = globalThis.browser ?? globalThis.chrome;
  const { settings = {} } = await browser.storage.local.get('settings');

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  requestOptions.signal = controller.signal;

  try {
    const response = await fetch(url, requestOptions);

    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });

    const responseClone = response.clone();
    const responseText = await responseClone.text();
    if (responseText.length > 5_000_000) {
      return { error: 'Response exceeds 5MB limit.' };
    }

    let responseData;
    if (responseType === 'blob') {
      const blob = await response.blob();
      responseData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else if (responseType === 'arraybuffer') {
      responseData = await response.arrayBuffer();
    } else if (responseType === 'json') {
      responseData = JSON.parse(responseText);
    } else {
      responseData = responseText;
    }

    return {
      result: {
        readyState: 4,
        responseHeaders: Object.entries(responseHeaders)
          .map(([name, value]) => `${name}: ${value}`)
          .join('\n'),
        responseText,
        response: responseData,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        context: details.context,
      },
    };
  } catch (error) {
    logger.error('CodeTweak: Cross-origin request failed:', {
      error,
      url,
      method,
      headers,
    });

    let errorMessage = error.message;
    if (error?.name === 'AbortError') {
      errorMessage = `Request timed out after 30s. URL: ${url}`;
    } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
      errorMessage = `Network request failed. This could be due to a CORS issue, network error, or invalid URL. URL: ${url}`;
    }

    return { error: errorMessage };
  } finally {
    clearTimeout(timeoutId);
  }
}
