import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

import {
  FIREFOX_GECKO_ID,
  FIREFOX_MIN_VERSION,
  toFirefoxManifest,
} from '../../buildScripts/firefoxManifest.js';

const chromeManifest = JSON.parse(readFileSync('src/manifest.chrome.json', 'utf8'));

describe('toFirefoxManifest', () => {
  const manifest = toFirefoxManifest(chromeManifest);

  it('keeps version and entry points in sync with the Chrome manifest', () => {
    expect(manifest.version).toBe(chromeManifest.version);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.action).toEqual(chromeManifest.action);
    expect(manifest.content_scripts).toEqual(chromeManifest.content_scripts);
    expect(manifest.host_permissions).toEqual(chromeManifest.host_permissions);
  });

  it('runs the background as a module event page', () => {
    expect(manifest.background).toEqual({
      scripts: [chromeManifest.background.service_worker],
      type: 'module',
    });
  });

  it('moves userScripts to optional permissions and drops offscreen', () => {
    expect(manifest.permissions).not.toContain('userScripts');
    expect(manifest.permissions).not.toContain('offscreen');
    expect(manifest.optional_permissions).toEqual(['userScripts']);
    expect(manifest.permissions).toContain('storage');
  });

  it('declares gecko settings required by AMO', () => {
    expect(manifest.browser_specific_settings.gecko).toEqual({
      id: FIREFOX_GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      data_collection_permissions: { required: ['none'] },
    });
  });

  it('does not mutate the Chrome manifest', () => {
    expect(chromeManifest.permissions).toContain('userScripts');
    expect(chromeManifest.background.service_worker).toBeTruthy();
    expect(chromeManifest.browser_specific_settings).toBeUndefined();
  });
});
