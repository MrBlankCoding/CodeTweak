import logger from '../shared/utils/logger.js';
import { webcrack } from 'webcrack';

export class Deobfuscator {
  constructor(ui, codeEditorManager, state) {
    this.ui = ui;
    this.codeEditorManager = codeEditorManager;
    this.state = state;
  }

  createSandbox() {
    const BLOCKED =
      /chrome|browser|process|globalThis|window|document|eval|Function|import|require|fetch|XMLHttpRequest/i;
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
