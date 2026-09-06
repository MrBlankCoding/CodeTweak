import { describe, expect, it } from 'vitest';

import {
  parseUserScriptMetadata,
  buildMetadata,
} from '../../src/services/scripts/MetadataParser.js';
import { ScriptAnalyzer } from '../../src/services/scripts/ScriptAnalyzer.js';

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

  it('ScriptAnalyzer never throws on hostile code', () => {
    const hostile = [
      '',
      null,
      undefined,
      42,
      '('.repeat(10000),
      '/* unterminated',
      '// @match [(((((',
      'GM_setValue((((',
      '😈'.repeat(5000),
      'a'.repeat(500_000),
    ];
    for (const code of hostile) {
      expect(() => ScriptAnalyzer.detectGMApiUsage(code)).not.toThrow();
      expect(() => ScriptAnalyzer.suggestRunAt(code)).not.toThrow();
      expect(() => ScriptAnalyzer.extractMetadata(code)).not.toThrow();
      expect(() => ScriptAnalyzer.detectIssues(code, { gmApis: {}, matches: [] })).not.toThrow();
    }
  });

  it('ScriptAnalyzer handles analyzer-vs-grant mismatch both directions', () => {
    const code = 'GM_setValue("k", 1); GM_getValue("k");';
    const warnings = ScriptAnalyzer.detectIssues(code, { gmApis: {}, matches: ['*://*/*'] });
    expect(warnings.some((w) => w.apiEl === 'gmSetValue')).toBe(true);
    const noWarn = ScriptAnalyzer.detectIssues(code, {
      gmApis: { gmSetValue: true, gmGetValue: true },
      matches: ['*://*/*'],
    });
    expect(noWarn.filter((w) => w.type === 'missing_grant')).toHaveLength(0);
  });
});
