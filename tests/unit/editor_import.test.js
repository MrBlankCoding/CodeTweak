import { describe, expect, it, vi } from 'vitest';
import { ScriptEditor } from '../../src/editor/editor.js';

describe('editor import initialization', () => {
  function createEditor({ isEditMode = false, importedSource = null, prefill } = {}) {
    const editor = Object.create(ScriptEditor.prototype);
    editor.state = { isEditMode, importedSource, prefill };
    editor.codeEditorManager = { insertDefaultTemplate: vi.fn() };
    editor.ui = { addUrlToList: vi.fn() };
    editor.updateSectionVisibility = vi.fn();
    editor.markAsDirty = vi.fn();
    return editor;
  }

  it('preserves imported source instead of inserting the blank-editor template', () => {
    const editor = createEditor({
      importedSource: {
        code: 'console.log("imported");',
        sourceUrl: 'https://example.com/script.user.js',
      },
    });

    editor.setupEditorMode();

    expect(editor.codeEditorManager.insertDefaultTemplate).not.toHaveBeenCalled();
    expect(editor.updateSectionVisibility).toHaveBeenCalledOnce();
    expect(editor.markAsDirty).toHaveBeenCalledOnce();
  });

  it('inserts a default template for a blank new script', () => {
    const editor = createEditor();

    editor.setupEditorMode();

    expect(editor.codeEditorManager.insertDefaultTemplate).toHaveBeenCalledOnce();
    expect(editor.updateSectionVisibility).toHaveBeenCalledOnce();
    expect(editor.markAsDirty).toHaveBeenCalledOnce();
  });

  it('fills in the target site and generated code for new scripts', () => {
    const editor = createEditor({
      prefill: { targetUrl: 'https://example.com/*', template: 'document.body.remove();' },
    });

    editor.setupEditorMode();

    expect(editor.codeEditorManager.insertDefaultTemplate).toHaveBeenCalledWith(
      'document.body.remove();'
    );
    expect(editor.ui.addUrlToList).toHaveBeenCalledWith('https://example.com/*');
  });

  it('adds no target site when none was passed', () => {
    const editor = createEditor({ prefill: { targetUrl: null, template: null } });

    editor.setupEditorMode();

    expect(editor.codeEditorManager.insertDefaultTemplate).toHaveBeenCalledWith(undefined);
    expect(editor.ui.addUrlToList).not.toHaveBeenCalled();
  });
});
