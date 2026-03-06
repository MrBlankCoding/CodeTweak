import { describe, it, expect } from 'vitest';
import { AIDiffHelper } from '../../src/utils/ai_diff_helper.js';

describe('AIDiffHelper', () => {
  describe('parsePatches', () => {
    it('should parse SEARCH/REPLACE blocks correctly', () => {
      const text = '<<<<<< SEARCH\nold code\n======\nnew code\n>>>>>> REPLACE';
      const patches = AIDiffHelper.parsePatches(text);
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        type: 'search-replace',
        search: 'old code',
        replace: 'new code',
      });
    });

    it('should parse multiple SEARCH/REPLACE blocks', () => {
      const text =
        '<<<<<< SEARCH\nblock 1\n======\nreplacement 1\n>>>>>> REPLACE\n\nSome text\n\n<<<<<< SEARCH\nblock 2\n======\nreplacement 2\n>>>>>> REPLACE';
      const patches = AIDiffHelper.parsePatches(text);
      expect(patches).toHaveLength(2);
      expect(patches[0].replace).toBe('replacement 1');
      expect(patches[1].replace).toBe('replacement 2');
    });

    it('should parse unified diffs from fenced code blocks', () => {
      const diffContent = '--- script.js\n+++ script.js\n@@ -1,1 +1,1 @@\n-old\n+new';
      const text = '```diff\n' + diffContent + '\n```';
      const patches = AIDiffHelper.parsePatches(text);
      expect(patches).toHaveLength(1);
      expect(patches[0].type).toBe('unified');
      expect(patches[0].diff).toContain('-old');
      expect(patches[0].diff).toContain('+new');
    });

    it('should detect full script replacement if no patches found', () => {
      const text =
        'Here is the full script:\n```javascript\n// ==UserScript==\n// @name Test\n// ==/UserScript==\nconsole.log("hello");\n```';
      const patches = AIDiffHelper.parsePatches(text);
      expect(patches).toHaveLength(1);
      expect(patches[0].type).toBe('full-replacement');
      expect(patches[0].code).toContain('// ==UserScript==');
    });

    it('should return empty patches for irrelevant text', () => {
      const text = 'Just some discussion about the code without actual changes.';
      const patches = AIDiffHelper.parsePatches(text);
      expect(patches).toHaveLength(0);
    });
  });

  describe('fixUnifiedDiffHeaders', () => {
    it('should handle diffs with no hunk headers', () => {
      const diff = '--- a\n+++ b\n-old\n+new';
      const fixed = AIDiffHelper.fixUnifiedDiffHeaders(diff);
      expect(fixed).toBe(diff);
    });

    it('should fix incorrect hunk headers', () => {
      const brokenDiff =
        '--- a\n+++ b\n@@ -1,1 +1,1 @@\n-line 1\n-line 2\n+line 1 fixed\n+line 2 fixed';
      const fixedDiff = AIDiffHelper.fixUnifiedDiffHeaders(brokenDiff);
      expect(fixedDiff).toContain('@@ -1,2 +1,2 @@');
    });

    it('should add missing context space prefix', () => {
      const brokenDiff = '--- a\n+++ b\n@@ -1,1 +1,1 @@\ncontext line\n-old\n+new';
      const fixedDiff = AIDiffHelper.fixUnifiedDiffHeaders(brokenDiff);
      expect(fixedDiff).toContain(' context line');
      expect(fixedDiff).toContain('@@ -1,2 +1,2 @@');
    });
  });

  describe('applyPatches', () => {
    it('should apply search-replace patches exactly', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const patches = [
        { type: 'search-replace', search: 'const x = 1;', replace: 'const x = 10;' },
      ];
      const results = AIDiffHelper.applyPatches(code, patches);
      expect(results.successCount).toBe(1);
      expect(results.finalCode).toBe('const x = 10;\nconst y = 2;');
    });

    it('should apply search-replace patches with normalization', () => {
      const code = '  const x   =   1;';
      const patches = [
        { type: 'search-replace', search: 'const x = 1;', replace: 'const x = 10;' },
      ];
      const results = AIDiffHelper.applyPatches(code, patches);
      expect(results.successCount).toBe(1);
      expect(results.finalCode).toBe('const x = 10;');
    });

    it('should apply search-replace patches using sliding window', () => {
      const code =
        'function init() {\n  console.log("start");\n  // some comment\n  doSomething();\n}';
      const patches = [
        {
          type: 'search-replace',
          search: 'console.log("start");\ndoSomething();',
          replace: 'console.log("fixed");\ndoSomethingElse();',
        },
      ];
      const results = AIDiffHelper.applyPatches(code, patches);
      expect(results.successCount).toBe(1);
      expect(results.finalCode).toContain('console.log("fixed")');
      expect(results.finalCode).toContain('doSomethingElse()');
    });

    it('should handle failed search-replace patch', () => {
      const code = 'const x = 1;';
      const patches = [{ type: 'search-replace', search: 'non-existent', replace: 'new' }];
      const results = AIDiffHelper.applyPatches(code, patches);
      expect(results.successCount).toBe(0);
      expect(results.failedCount).toBe(1);
    });

    it('should handle failed unified patch', () => {
      const code = 'line 1';
      const diff = '--- a\n+++ b\n@@ -1,1 +1,1 @@\n-wrong context\n+new';
      const patches = [{ type: 'unified', diff }];
      const results = AIDiffHelper.applyPatches(code, patches);
      expect(results.failedCount).toBe(1);
    });

    it('should apply unified diff using fuzzy fallback', () => {
      const code = 'line 1\nline 2\nline 3';
      const diff =
        '--- a\n+++ b\n@@ -1,3 +1,3 @@\n line 1\n-line 2 context mismatch\n+line 2 fixed\n line 3';
      const patches = [{ type: 'unified', diff }];
      const results = AIDiffHelper.applyPatches(code, patches);
      expect(results.successCount).toBe(1);
      expect(results.finalCode).toBe('line 1\nline 2 fixed\nline 3');
    });
  });

  describe('generateDiffHtml', () => {
    it('should generate HTML with add/remove classes', () => {
      const oldCode = 'line 1';
      const newCode = 'line 1 added';
      const html = AIDiffHelper.generateDiffHtml(oldCode, newCode);
      expect(html).toContain('ai-diff-view');
      expect(html).toContain('diff-line-remove');
      expect(html).toContain('diff-line-add');
    });
  });
});
