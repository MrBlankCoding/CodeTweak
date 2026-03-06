import { describe, expect, it } from 'vitest';
import {
  buildMetadata,
  extractMetadataBlock,
  parseUserScriptMetadata,
} from '../../src/utils/metadataParser.js';

describe('metadataParser', () => {
  it('parses userscript metadata including grants/resources', () => {
    const content = `
// ==UserScript==
// @name       Demo
// @match      https://example.com/*
// @include    https://foo.com/*
// @require    https://cdn.example/lib.js
// @resource   icon https://cdn.example/icon.png
// @run-at     document-start
// @grant      GM_setValue
// @grant      GM.getValue
// @grant      unsafeWindow
// @license    MIT
// @icon       https://cdn.example/i.png
// ==/UserScript==
console.log('x');
`;

    const parsed = parseUserScriptMetadata(content);
    expect(parsed.name).toBe('Demo');
    expect(parsed.matches).toEqual(['https://example.com/*', 'https://foo.com/*']);
    expect(parsed.requires).toEqual(['https://cdn.example/lib.js']);
    expect(parsed.resources).toEqual([{ name: 'icon', url: 'https://cdn.example/icon.png' }]);
    expect(parsed.runAt).toBe('document-start');
    expect(parsed.gmApis.gmSetValue).toBe(true);
    expect(parsed.gmApis.gmGetValue).toBe(true);
    expect(parsed.gmApis.unsafeWindow).toBe(true);
    expect(parsed.license).toBe('MIT');
    expect(parsed.icon).toBe('https://cdn.example/i.png');
  });

  it('handles grant none and missing blocks', () => {
    expect(parseUserScriptMetadata('console.log(1)')).toEqual({ gmApis: {} });

    const withNone = `
// ==UserScript==
// @grant GM_setValue
// @grant none
// ==/UserScript==`;
    const parsed = parseUserScriptMetadata(withNone);
    expect(parsed.gmApis).toEqual({});
  });

  it('extracts metadata block', () => {
    const content = `// ==UserScript==\n// @name X\n// ==/UserScript==\nalert(1)`;
    expect(extractMetadataBlock(content)).toContain('==UserScript==');
    expect(extractMetadataBlock('x')).toBeNull();
  });

  it('builds classic and modern metadata styles', () => {
    const script = {
      name: 'My Script',
      namespace: 'https://ns.example',
      version: '2.0.0',
      description: 'd',
      author: 'a',
      icon: 'https://cdn.example/icon.png',
      targetUrls: ['https://example.com/*'],
      runAt: 'document_end',
      requires: ['https://cdn.example/lib.js'],
      resources: [{ name: 'icon', url: 'https://cdn.example/icon.png' }],
      gmSetValue: true,
      gmGetValue: true,
      unsafeWindow: true,
    };

    const classic = buildMetadata(script, false);
    expect(classic).toContain('@grant      GM_setValue');
    expect(classic).toContain('@grant      GM_getValue');
    expect(classic).toContain('@grant      unsafeWindow');
    expect(classic).toContain('@run-at     document-end');

    const modern = buildMetadata(script, true);
    expect(modern).toContain('@grant      GM.setValue');
    expect(modern).toContain('@grant      GM.getValue');

    const noApis = buildMetadata({ name: 'n' }, false);
    expect(noApis).toContain('@grant      none');
  });

  it('handles edge cases in @resource parsing', () => {
    const content = `
// ==UserScript==
// @resource icon_only_no_url
// @resource icon1 http://some-url.com
// @resource icon2 https://valid.com/image.png
// ==/UserScript==`;
    const parsed = parseUserScriptMetadata(content);
    expect(parsed.resources).toHaveLength(2);
    expect(parsed.resources[0].name).toBe('icon1');
  });

  it('preserves unknown metadata fields', () => {
    const content = '// ==UserScript==\n// @custom-field some value\n// ==/UserScript==';
    const parsed = parseUserScriptMetadata(content);
    expect(parsed['custom-field']).toBe('some value');
  });
});
