import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('editor webcrack integration', () => {
  let ScriptEditor;
  let webcrackMock;
  let codeEditorInstance;
  let uiInstance;

  beforeEach(async () => {
    vi.resetModules();

    document.body.innerHTML = `
      <button id="deobfuscateBtn"></button>
      <div id="scriptStatusBadge"></div>
      <div class="sidebar"></div>
      <div class="sidebar-icon-bar"></div>
      <div class="sidebar-content-area"></div>
    `;
    global.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    webcrackMock = vi.fn();
    codeEditorInstance = null;
    uiInstance = null;

    vi.doMock('webcrack', () => ({
      webcrack: webcrackMock,
    }));

    vi.doMock('feather-icons', () => ({
      default: { replace: vi.fn() },
    }));

    vi.doMock('../../src/editor/editor_managers.js', () => {
      class MockUIManager {
        constructor() {
          this.showStatusMessage = vi.fn();
          this.updateScriptStatus = vi.fn();
          uiInstance = this;
        }
      }

      return {
        UIManager: MockUIManager,
        StorageManager: class {},
        FormValidator: class {},
      };
    });

    vi.doMock('../../src/editor/editor_settings.js', () => ({
      CodeEditorManager: class {
        constructor() {
          this.getValue = vi.fn().mockReturnValue('');
          this.setValue = vi.fn();
          codeEditorInstance = this;
        }
      },
    }));

    vi.doMock('../../src/utils/metadataParser.js', () => ({
      buildMetadata: vi.fn(() => ''),
      parseUserScriptMetadata: vi.fn(() => ({})),
    }));

    vi.doMock('../../src/GM/gmApiDefinitions.js', () => ({
      GM_API_DEFINITIONS: {},
      getApiElementIds: () => [],
    }));

    vi.doMock('../../src/utils/i18n.js', () => ({
      applyTranslations: vi.fn(async () => {}),
    }));

    vi.doMock('../../src/editor/ai_code_manager.js', () => ({
      AICodeManager: class {},
    }));

    vi.doMock('../../src/utils/logger.js', () => ({
      default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      },
    }));

    ({ ScriptEditor } = await import('../../src/editor/editor.js'));
  });

  it('shows warning and skips webcrack when editor is empty', async () => {
    const editor = new ScriptEditor();
    codeEditorInstance.getValue.mockReturnValue('   ');

    await editor.deobfuscateCode();

    expect(webcrackMock).not.toHaveBeenCalled();
    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith('No code to deobfuscate', 'warning');
  });

  it('deobfuscates code and updates editor content', async () => {
    const editor = new ScriptEditor();
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');
    webcrackMock.mockResolvedValue({ code: 'deobfuscated();' });

    await editor.deobfuscateCode();

    expect(webcrackMock).toHaveBeenCalledTimes(1);
    expect(webcrackMock).toHaveBeenCalledWith(
      'obfuscated();',
      expect.objectContaining({
        unpack: false,
        sandbox: expect.any(Function),
      })
    );
    expect(codeEditorInstance.setValue).toHaveBeenCalledWith('deobfuscated();');
    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith(
      'Code deobfuscated with webcrack',
      'success'
    );
  });

  it('reports errors and restores button state on failure', async () => {
    const editor = new ScriptEditor();
    const button = document.getElementById('deobfuscateBtn');
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');
    webcrackMock.mockRejectedValue(new Error('decode failed'));

    await editor.deobfuscateCode();

    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith(
      'webcrack failed: decode failed',
      'error'
    );
    expect(button.disabled).toBe(false);
    expect(button.classList.contains('loading')).toBe(false);
  });
});
