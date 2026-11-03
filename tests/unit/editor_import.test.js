import { describe, expect, it, vi } from 'vitest';
import { ScriptEditor } from '../../src/editor/editor.js';

describe('editor import initialization', () => {
  function createEditor({ isEditMode = false, importedSource = null } = {}) {
    const editor = Object.create(ScriptEditor.prototype);
    editor.state = { isEditMode, importedSource };
    editor.codeEditorManager = { insertDefaultTemplate: vi.fn() };
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
});
