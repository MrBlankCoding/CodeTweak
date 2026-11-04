import logger from '../shared/utils/logger.js';
import { webcrack } from 'webcrack';

// Best-effort tripwire, not a security boundary: it only throws away decoder
// snippets that look like they try to escape the sandbox below. Deobfuscating
// UNTRUSTED scripts should ideally run in a sandboxed offscreen context, not
// the editor page (TODO: evaluate decoder expressions in an offscreen worker).
const BLOCKED =
  /\b(?:chrome|browser|window|globalThis|self|top|parent|global|process|document|eval|Function|constructor|import|require|fetch|XMLHttpRequest|WebSocket|Worker|IndexedDB|indexedDB|Notification|MessageChannel)\b/i;

export class Deobfuscator {
  constructor(ui, codeEditorManager, state) {
    this.ui = ui;
    this.codeEditorManager = codeEditorManager;
    this.state = state;
  }

  createSandbox() {
    return async (code) => {
      if (typeof code !== 'string' || code.length > 50_000 || BLOCKED.test(code)) {
        throw new Error('webcrack decoder expression blocked for safety');
      }
      const evaluator = new Function(`"use strict"; return (${code});`);
      return evaluator();
    };
  }

  async deobfuscate(button) {
    if (button?.disabled) return;

    const code = this.codeEditorManager.getValue();
    if (!code || !code.trim()) {
      this.ui.showStatusMessage('No code to deobfuscate', 'warning');
      return;
    }

    // Explicit consent first: webcrack may evaluate decoder snippets in this page.
    if (
      !window.confirm('Deobfuscation may execute parts of this script to decode strings. Run it?')
    ) {
      this.ui.showStatusMessage('Deobfuscation cancelled', 'warning');
      return;
    }

    if (button) {
      button.disabled = true;
      button.classList.add('loading');
    }

    this.ui.showStatusMessage('Running webcrack deobfuscation...', 'success');

    try {
      const result = await webcrack(code, {
        unpack: false,
        sandbox: this.createSandbox(),
      });

      if (!result?.code || result.code === code) {
        // Nothing changed: keep the buffer as-is and warn instead of faking success.
        this.ui.showStatusMessage('No changes produced by webcrack', 'warning');
        return;
      }

      this.codeEditorManager.setValue(result.code);
      this.state.hasUnsavedChanges = true;
      this.ui.updateScriptStatus(true);
      this.ui.showStatusMessage('Code deobfuscated with webcrack', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('webcrack deobfuscation failed:', error);
      this.ui.showStatusMessage(`webcrack failed: ${message}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove('loading');
      }
    }
  }
}
