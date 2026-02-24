import { describe, expect, it } from 'vitest';
import { ScriptAnalyzer } from '../../src/utils/scriptAnalyzer.js';

describe('ScriptAnalyzer', () => {
  it('detects GM api usage in classic/modern/window syntax', () => {
    const code = `GM_setValue('a',1); GM.getValue('a'); window.GM_xmlhttpRequest({url:'https://x'}); unsafeWindow.test=1;`;
    const apis = ScriptAnalyzer.detectGMApiUsage(code);
    expect(apis.gmSetValue).toBe(true);
    expect(apis.gmGetValue).toBe(true);
    expect(apis.gmXmlhttpRequest).toBe(true);
    expect(apis.unsafeWindow).toBe(true);
  });

  it('suggests runAt and enhances metadata', () => {
    expect(
      ScriptAnalyzer.suggestRunAt("document.addEventListener('DOMContentLoaded',()=>{})")
    ).toBe('document_start');
    expect(ScriptAnalyzer.suggestRunAt('document.querySelector("#x")')).toBe('document_end');

    const enhanced = ScriptAnalyzer.validateAndEnhanceMetadata('GM_setValue("a",1);', {
      url: 'https://example.com/a',
      hostname: 'www.example.com',
      userPrompt: 'hide popup',
    });

    expect(enhanced.name).toContain('Example');
    expect(enhanced.version).toBe('1.0.0');
    expect(enhanced.namespace).toBe('https://codetweak.local');
    expect(enhanced.author).toBe('CodeTweak AI');
    expect(enhanced.matches).toEqual(['https://example.com/*']);
    expect(enhanced.gmApis.gmSetValue).toBe(true);
    expect(Array.isArray(enhanced.warnings)).toBe(true);
  });

  it('extracts and rebuilds metadata + code helpers', () => {
    const code = `// ==UserScript==\n// @name T\n// @version 1.2.3\n// @run-at document-start\n// @grant GM_setValue\n// ==/UserScript==\n(function(){'use strict';\nconsole.log(1);\n})();`;

    const meta = ScriptAnalyzer.extractMetadata(code);
    expect(meta.name).toBe('T');
    expect(meta.runAt).toBe('document_start');
    expect(meta.gmApis.gmSetValue).toBe(true);

    const rebuilt = ScriptAnalyzer.rebuildWithEnhancedMetadata(code, {
      ...meta,
      name: 'Renamed',
      gmApis: { gmSetValue: true },
      matches: ['https://example.com/*'],
      runAt: 'document_end',
    });
    expect(rebuilt).toContain('@name         Renamed');
    expect(rebuilt).toContain('@grant        GM_setValue');

    expect(ScriptAnalyzer.extractCodeFromIIFE(code)).toContain('console.log(1)');
    expect(ScriptAnalyzer.incrementVersion('1.2.3')).toBe('1.2.4');
    expect(ScriptAnalyzer.incrementVersion('bad')).toBe('bad');
    expect(ScriptAnalyzer.incrementVersion()).toBe('1.0.1');
  });

  it('detects metadata issues', () => {
    const warnings = ScriptAnalyzer.detectIssues('GM_addStyle("x"); document.body.innerHTML="x";', {
      gmApis: {},
      runAt: 'document_start',
      matches: [],
    });

    expect(warnings.some((w) => w.type === 'missing_grant')).toBe(true);
    expect(warnings.some((w) => w.type === 'timing_issue')).toBe(true);
    expect(warnings.some((w) => w.type === 'missing_match')).toBe(true);
  });
});
