import { diff_match_patch } from 'diff-match-patch';
import { applyPatch as standardApplyPatch, diffLines, createPatch } from 'diff';

const dmp = new diff_match_patch();
dmp.Match_Threshold = 0.5;
dmp.Patch_Margin = 4;
dmp.Match_MaxBits = 1024; // Support longer search patterns

export class AIDiffHelper {
  static createUnifiedDiff(oldCode, newCode, fileName = 'script.user.js') {
    return createPatch(fileName, oldCode, newCode);
  }

  static parsePatches(text) {
    const patches = [];

    // 1. SEARCH/REPLACE blocks
    const searchReplacePattern = /<<<<<< SEARCH\n([\s\S]*?)\n======\n([\s\S]*?)\n>>>>>> REPLACE/g;
    let match;
    while ((match = searchReplacePattern.exec(text)) !== null) {
      patches.push({
        type: 'search-replace',
        search: match[1],
        replace: match[2],
      });
    }

    // 2. Diff blocks
    const fencedDiffPattern = /```diff\n([\s\S]*?)\n```/g;
    let textToSearch = text;
    while ((match = fencedDiffPattern.exec(text)) !== null) {
      const diffContent = match[1].trim();
      if (diffContent.includes('---') && diffContent.includes('+++')) {
        patches.push({
          type: 'unified',
          diff: this.fixUnifiedDiffHeaders(diffContent),
        });
        textToSearch = textToSearch.replace(match[0], '');
      }
    }

    // 3. Fallback to unified diff outside fences
    const unifiedDiffPattern = /^--- .*\n\+\+\+ .*\n(?:@@ .*\n(?:[ +-].*\n|\\.*\n)*)+/gm;
    while ((match = unifiedDiffPattern.exec(textToSearch)) !== null) {
      patches.push({
        type: 'unified',
        diff: this.fixUnifiedDiffHeaders(match[0].trim()),
      });
    }

    // 4. Full Script detection
    if (patches.length === 0 && this.isFullScript(text)) {
      const codeMatch = text.match(/```(?:javascript|js|ts)?\s*([\s\S]*?)```/i);
      if (codeMatch) {
        patches.push({
          type: 'full-replacement',
          code: codeMatch[1].trim(),
        });
      }
    }

    return patches;
  }

  static applyPatches(code, patches) {
    let updatedCode = code;
    const results = {
      successCount: 0,
      failedCount: 0,
      finalCode: code,
    };

    for (const patch of patches) {
      try {
        let patchApplied = false;

        if (patch.type === 'full-replacement') {
          updatedCode = patch.code;
          patchApplied = true;
        } else if (patch.type === 'unified') {
          const patched = standardApplyPatch(updatedCode, patch.diff);
          if (patched !== false) {
            updatedCode = patched;
            patchApplied = true;
          } else {
            const fuzzyResult = this.applyFuzzyUnifiedDiff(updatedCode, patch.diff);
            if (fuzzyResult.success) {
              updatedCode = fuzzyResult.code;
              patchApplied = true;
            }
          }
        } else if (patch.type === 'search-replace') {
          const srResult = this.applySearchReplaceAdvanced(
            updatedCode,
            patch.search,
            patch.replace
          );
          if (srResult.success) {
            updatedCode = srResult.code;
            patchApplied = true;
          }
        }

        if (patchApplied) {
          results.successCount++;
        } else {
          results.failedCount++;
        }
      } catch (e) {
        console.error('Advanced Diff Error:', e);
        results.failedCount++;
      }
    }

    results.finalCode = updatedCode;
    return results;
  }

  static applySearchReplaceAdvanced(code, search, replace) {
    const normalize = (str) => str.replace(/\s+/g, ' ').trim();

    // 1. Exact Match
    if (code.includes(search)) {
      return { success: true, code: code.replace(search, replace) };
    }

    // 2. Normalized Line-by-Line Sliding Window
    const codeLines = code.split('\n');
    const searchLinesRaw = search.split('\n');
    const searchLines = searchLinesRaw.map((l) => ({ raw: l, norm: normalize(l) }));
    const meaningfulSearchLines = searchLines.filter((l) => l.norm.length > 0);

    if (meaningfulSearchLines.length === 0) return { success: false, code };

    let bestMatch = { score: 0, index: -1, size: 0 };

    for (let i = 0; i <= codeLines.length - searchLines.length; i++) {
      let matches = 0;
      let windowSize = searchLines.length;

      for (let j = 0; j < windowSize; j++) {
        const cLine = normalize(codeLines[i + j]);
        const sLine = searchLines[j].norm;

        if (sLine.length === 0 && cLine.length === 0) {
          matches += 1;
        } else if (
          sLine.length > 0 &&
          (cLine === sLine || cLine.includes(sLine) || sLine.includes(cLine))
        ) {
          // Weighted match based on length
          matches += 1;
        }
      }

      const score = matches / windowSize;
      if (score > bestMatch.score) {
        bestMatch = { score, index: i, size: windowSize };
      }
    }

    if (bestMatch.score >= 0.85) {
      const newLines = [...codeLines];
      newLines.splice(bestMatch.index, bestMatch.size, replace);
      return { success: true, code: newLines.join('\n') };
    }

    const loc = dmp.match_main(code, search, 0);
    if (loc !== -1) {
      const diffs = dmp.diff_main(search, replace);
      const patches = dmp.patch_make(search, diffs);
      const [newCode, results] = dmp.patch_apply(patches, code);
      if (results.some((r) => r === true)) {
        return { success: true, code: newCode };
      }
    }

    return { success: false, code };
  }

  static applyFuzzyUnifiedDiff(code, diffText) {
    const lines = diffText.split('\n');
    let currentCode = code;
    let appliedAny = false;
    let currentHunk = null;

    for (const line of lines) {
      if (line.startsWith('---') || line.startsWith('+++')) continue;

      if (line.startsWith('@@')) {
        if (currentHunk) {
          const result = this.applyHunkAdvanced(currentCode, currentHunk);
          if (result.success) {
            currentCode = result.code;
            appliedAny = true;
          }
        }
        currentHunk = { search: '', replace: '' };
        continue;
      }

      if (currentHunk) {
        const prefix = line[0];
        const content = line.substring(1);
        if (prefix === ' ') {
          currentHunk.search += content + '\n';
          currentHunk.replace += content + '\n';
        } else if (prefix === '-') {
          currentHunk.search += content + '\n';
        } else if (prefix === '+') {
          currentHunk.replace += content + '\n';
        }
      }
    }

    if (currentHunk) {
      const result = this.applyHunkAdvanced(currentCode, currentHunk);
      if (result.success) {
        currentCode = result.code;
        appliedAny = true;
      }
    }

    return { success: appliedAny, code: currentCode };
  }

  static applyHunkAdvanced(code, hunk) {
    const search = hunk.search.trimEnd();
    const replace = hunk.replace.trimEnd();
    if (!search) return { success: true, code };
    return this.applySearchReplaceAdvanced(code, search, replace);
  }

  static fixUnifiedDiffHeaders(diffText) {
    const lines = diffText.replace(/\r\n/g, '\n').split('\n');
    const fixedLines = [];
    let currentHunkHeaderIndex = -1;
    let oldStart = 0,
      oldCount = 0;
    let newStart = 0,
      newCount = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      line = line.replace(/^[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/, ' ');

      if (line.startsWith('---') || line.startsWith('+++')) {
        fixedLines.push(line);
        continue;
      }

      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          currentHunkHeaderIndex = fixedLines.length;
          oldStart = parseInt(match[1], 10);
          newStart = parseInt(match[2], 10);
          oldCount = 0;
          newCount = 0;
          fixedLines.push(line);
        }
        continue;
      }

      if (currentHunkHeaderIndex !== -1) {
        if (!/^[ +-/\\]/.test(line)) line = ' ' + line;
        const prefix = line[0];
        if (prefix === ' ') {
          oldCount++;
          newCount++;
        } else if (prefix === '-') {
          oldCount++;
        } else if (prefix === '+') {
          newCount++;
        }

        fixedLines.push(line);

        const nextLine = lines[i + 1];
        if (!nextLine || nextLine.startsWith('@@') || nextLine.startsWith('---')) {
          fixedLines[currentHunkHeaderIndex] =
            `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
        }
      } else {
        fixedLines.push(line);
      }
    }

    return fixedLines.join('\n');
  }

  static isFullScript(text) {
    return (
      text.includes('// ==UserScript==') ||
      text.includes('function()') ||
      text.split('\n').length > 50
    );
  }

  static generateDiffHtml(oldCode, newCode) {
    const changes = diffLines(oldCode, newCode);
    let html = '<div class="ai-diff-view">';
    changes.forEach((part) => {
      const colorClass = part.added ? 'diff-line-add' : part.removed ? 'diff-line-remove' : '';
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      lines.forEach((line) => {
        html += `<div class="diff-line ${colorClass}"><span>${this.escapeHtml(line)}</span></div>`;
      });
    });
    return html + '</div>';
  }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static getSystemInstructions() {
    return `When editing existing code, you MUST use surgical edits.

PREFERRED FORMAT: SEARCH/REPLACE blocks.
Format:
<<<<<< SEARCH
[exact code snippet from current script]
======
[new code to replace it with]
>>>>>> REPLACE

If the change is massive (over 60% of the file), you may provide a FULL userscript replacement in a standard javascript code block.`;
  }
}

export default AIDiffHelper;
