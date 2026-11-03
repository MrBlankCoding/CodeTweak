import logger from '../../shared/utils/logger.js';
import {
  buildMetadata,
  extractMetadataBlock,
  parseUserScriptMetadata,
  scriptFieldsFromMetadata,
} from '../../services/scripts/MetadataParser.js';
import { hashCode } from '../../shared/utils/hash.js';

// Header-only settings the sidebar has no controls for.
const HEADER_ONLY_FIELDS = ['connect', 'excludes', 'includeRegexes', 'noframes'];

export class EditorActions {
  constructor(editor) {
    this.editor = editor;
  }

  async saveScript(quiet = false) {
    const { validator, metadataSync, storage, state, ui } = this.editor;

    try {
      if (!validator.validateForm()) return null;

      const scriptData = metadataSync.gatherScriptData();
      if (!scriptData.name?.trim()) {
        scriptData.name = `Untitled Script ${new Date().toISOString().slice(0, 10)}`;
      }

      const isNewScript = !state.scriptId;
      if (!state.hasUnsavedChanges && !isNewScript) return null;

      // @require/@resource contents are fetched and cached by the background.
      if (extractMetadataBlock(scriptData.code)) {
        const headerFields = scriptFieldsFromMetadata(parseUserScriptMetadata(scriptData.code));
        HEADER_ONLY_FIELDS.forEach((key) => {
          scriptData[key] = headerFields[key];
        });
      }

      if (isNewScript && state.importedSource) {
        scriptData.upstreamHash = await hashCode(state.importedSource.code);
        if (state.importedSource.sourceUrl) {
          scriptData.updateInfo = { sourceUrl: state.importedSource.sourceUrl };
        }
      }

      const savedScript = await storage.saveScript(scriptData, state.scriptId, state.isEditMode);

      state.scriptId = savedScript.id;
      state.importedSource = null;
      state.hasUnsavedChanges = false;
      ui.updateScriptStatus(false);

      if (isNewScript) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('id', savedScript.id);
        window.history.pushState({}, '', newUrl);
        state.isEditMode = true;
      }

      this.editor.notifyBackgroundScript();

      if (!quiet) {
        ui.showStatusMessage(`Script ${isNewScript ? 'created' : 'saved'} successfully`, 'success');
        setTimeout(() => {
          if (!state.hasUnsavedChanges) ui.clearStatusMessage();
        }, 3000);
      }

      return savedScript;
    } catch (error) {
      logger.error('Error saving script:', error);
      ui.showStatusMessage(`Failed to save script: ${error.message || 'Unknown error'}`, 'error');
      setTimeout(() => {
        if (state.hasUnsavedChanges) ui.showStatusMessage('Unsaved changes', 'warning');
        else ui.clearStatusMessage();
      }, 5000);
      throw error;
    }
  }

  exportScript() {
    const { metadataSync, ui } = this.editor;
    try {
      const scriptData = metadataSync.gatherScriptData();
      const metadata = buildMetadata(scriptData);
      const content = `${metadata}\n\n${scriptData.code}`;
      const fileNameSafe =
        (scriptData.name || 'script')
          .replace(/[^a-z0-9_-]+/gi, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_|_$/g, '') || 'script';

      const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileNameSafe}.user.js`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ui.showStatusMessage('Script exported', 'success');
    } catch (err) {
      logger.error('Export failed:', err);
      ui.showStatusMessage('Export failed', 'error');
    }
  }

  generateHeader() {
    const { metadataSync, codeEditorManager, ui } = this.editor;
    try {
      const scriptData = metadataSync.gatherScriptData();
      const metadata = buildMetadata(scriptData);
      const currentCode = codeEditorManager.getValue();
      const existingHeaderMatch = currentCode.match(
        /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/
      );

      let newCode = existingHeaderMatch
        ? currentCode.replace(existingHeaderMatch[0], metadata)
        : metadata + '\n\n' + currentCode;
      codeEditorManager.setValue(newCode);
      this.editor.markAsDirty();
      ui.showStatusMessage(
        existingHeaderMatch ? 'Metadata updated' : 'Metadata generated',
        'success'
      );
    } catch (err) {
      logger.error('Generate header failed:', err);
      ui.showStatusMessage('Failed to generate header', 'error');
    }
  }
}
