import { describe, expect, it } from 'vitest';
import {
  GM_API_CATEGORIES,
  GM_API_DEFINITIONS,
  getApiByElementId,
  getApiElementIds,
  getApisByCategory,
  getGrantNames,
  getTypeScriptSignatures,
} from '../../src/GM/gmApiDefinitions.js';

describe('gmApiDefinitions', () => {
  it('returns all element ids', () => {
    const ids = getApiElementIds();
    expect(ids.length).toBe(Object.keys(GM_API_DEFINITIONS).length);
    expect(ids).toContain('gmSetValue');
    expect(ids).toContain('gmXmlhttpRequest');
  });

  it('groups APIs by category', () => {
    const grouped = getApisByCategory();
    expect(Object.keys(grouped)).toContain(GM_API_CATEGORIES.STORAGE);
    expect(Object.keys(grouped)).toContain(GM_API_CATEGORIES.BROWSER_UI);
    expect(grouped[GM_API_CATEGORIES.STORAGE].some((api) => api.key === 'GM_setValue')).toBe(true);
  });

  it('finds api by element id', () => {
    expect(getApiByElementId('gmSetValue')?.tmName).toBe('GM_setValue');
    expect(getApiByElementId('missing')).toBeNull();
  });

  it('builds grants and TS signatures from enabled api map', () => {
    const enabled = {
      gmSetValue: true,
      gmGetValue: true,
      gmXmlhttpRequest: true,
      gmLog: false,
      missing: true,
    };

    const grants = getGrantNames(enabled);
    expect(grants).toEqual(['GM_setValue', 'GM_getValue', 'GM_xmlhttpRequest']);

    const signatures = getTypeScriptSignatures(enabled);
    expect(signatures.some((s) => s.includes('GM_setValue'))).toBe(true);
    expect(signatures.some((s) => s.includes('GM_xmlhttpRequest'))).toBe(true);
  });
});
