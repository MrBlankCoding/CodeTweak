import { describe, expect, it } from 'vitest';

import {
  parseUserScriptMetadata,
  buildMetadata,
} from '../../src/services/scripts/MetadataParser.js';

describe('metadata adversarial', () => {
  it('normalizes hostile @match values instead of passing them through', () => {
    const content = [
      '// ==UserScript==',
      '// @name X',
      '// @match http*://www.skribbl.io/*',
      '// @match HTTP*://evil.com/*',
      '// @match chrome://settings/*',
      '// @match javascript:alert(1)',
      '// @match',
      '// @match    ',
      '// ==/UserScript==',
    ].join('\n');
    const parsed = parseUserScriptMetadata(content);
    expect(parsed.matches).toContain('*://www.skribbl.io/*');
    expect(parsed.matches).toContain('*://evil.com/*');
    expect(parsed.matches).not.toContain('chrome://settings/*');
    expect(parsed.matches).not.toContain('javascript:alert(1)');
  });

  it('trims @require whitespace (URL with trailing space 404s otherwise)', () => {
    const content = [
      '// ==UserScript==',
      '// @require    https://cdn.example/lib.js   ',
      '// ==/UserScript==',
    ].join('\n');
    expect(parseUserScriptMetadata(content).requires).toEqual(['https://cdn.example/lib.js']);
  });

  it('upgrades HTTP @require URLs to HTTPS and rejects unsupported schemes', () => {
    const content = [
      '// ==UserScript==',
      '// @require http://code.jquery.com/jquery-3.3.1.min.js',
      '// @require ftp://cdn.example/lib.js',
      '// ==/UserScript==',
    ].join('\n');

    expect(parseUserScriptMetadata(content).requires).toEqual([
      'https://code.jquery.com/jquery-3.3.1.min.js',
    ]);
  });

  it('handles duplicate/conflicting directives without crashing', () => {
    const content = [
      '// ==UserScript==',
      '// @name A',
      '// @name B',
      '// @grant GM_setValue',
      '// @grant none',
      '// @grant GM_setValue',
      '// @match https://a.com/*',
      '// @match https://a.com/*',
      '// @match http*://a.com/*',
      '// ==/UserScript==',
    ].join('\n');
    const parsed = parseUserScriptMetadata(content);
    expect(parsed.name).toBe('B');
    expect(parsed.gmApis.gmSetValue).toBe(true);
    expect(parsed.matches.filter((m) => m === 'https://a.com/*')).toHaveLength(1);
    expect(parsed.matches).toContain('*://a.com/*');
  });

  it('ignores metadata-like content inside code strings', () => {
    const content = [
      '// ==UserScript==',
      '// @name Real',
      '// ==/UserScript==',
      'const s = "// @match https://evil.com/*";',
      'const b = "// ==UserScript==\\n// @name Fake\\n// ==/UserScript==";',
    ].join('\n');
    const parsed = parseUserScriptMetadata(content);
    expect(parsed.name).toBe('Real');
    expect(parsed.matches ?? []).not.toContain('https://evil.com/*');
  });

  it('survives CRLF endings, missing values, and giant blocks', () => {
    const giant = `// @match https://example.com/${'a'.repeat(5000)}/*`;
    const content = `// ==UserScript==\r\n// @name CRLF\r\n${giant}\r\n// @grant\r\n// ==/UserScript==`;
    expect(() => parseUserScriptMetadata(content)).not.toThrow();
  });

  it('round-trips hostile patterns through buildMetadata without producing invalid output', () => {
    const out = buildMetadata({
      name: 'X',
      targetUrls: ['http*://a.com/*', 'chrome://x/*'],
      runAt: 'document_idle',
    });
    expect(out).toContain('*://a.com/*');
  });
});
