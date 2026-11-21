export const FIREFOX_GECKO_ID = 'MrBlankCoding@CodeTweak';
export const FIREFOX_MIN_VERSION = '140.0';
// Firefox for Android only understands data_collection_permissions from 142.
export const FIREFOX_ANDROID_MIN_VERSION = '142.0';

const UNSUPPORTED_PERMISSIONS = new Set(['offscreen']);
const OPTIONAL_ONLY_PERMISSIONS = new Set(['userScripts']);

export function toFirefoxManifest(chromeManifest) {
  const manifest = structuredClone(chromeManifest);
  const permissions = manifest.permissions || [];

  manifest.permissions = permissions.filter(
    (p) => !UNSUPPORTED_PERMISSIONS.has(p) && !OPTIONAL_ONLY_PERMISSIONS.has(p)
  );
  const optional = permissions.filter((p) => OPTIONAL_ONLY_PERMISSIONS.has(p));
  if (optional.length > 0) {
    manifest.optional_permissions = [
      ...new Set([...(manifest.optional_permissions || []), ...optional]),
    ];
  }

  const { service_worker: serviceWorker, ...background } = manifest.background || {};
  if (serviceWorker) {
    manifest.background = { ...background, scripts: [serviceWorker] };
  }

  manifest.browser_specific_settings = {
    gecko: {
      id: FIREFOX_GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      data_collection_permissions: { required: ['none'] },
    },
    gecko_android: { strict_min_version: FIREFOX_ANDROID_MIN_VERSION },
  };

  return manifest;
}
