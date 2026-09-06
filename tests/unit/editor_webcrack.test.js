import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('editor webcrack integration', () => {
  let Deobfuscator;
  let webcrackMock;
  let codeEditorInstance;
  let uiInstance;
  let state;

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
    state = { hasUnsavedChanges: false };

    vi.doMock('webcrack', () => ({
      webcrack: webcrackMock,
    }));

    vi.doMock('../../src/shared/utils/logger.js', () => ({
      default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      },
    }));

    ({ Deobfuscator } = await import('../../src/editor/deobfuscator.js'));

    uiInstance = { showStatusMessage: vi.fn(), updateScriptStatus: vi.fn() };
    codeEditorInstance = { getValue: vi.fn().mockReturnValue(''), setValue: vi.fn() };
  });

  const makeDeobfuscator = () => new Deobfuscator(uiInstance, codeEditorInstance, state);

  it('shows warning and skips webcrack when editor is empty', async () => {
    const deobfuscator = makeDeobfuscator();
    codeEditorInstance.getValue.mockReturnValue('   ');

    await deobfuscator.deobfuscate(document.getElementById('deobfuscateBtn'));

    expect(webcrackMock).not.toHaveBeenCalled();
    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith('No code to deobfuscate', 'warning');
  });

  it('deobfuscates code and updates editor content', async () => {
    const deobfuscator = makeDeobfuscator();
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');
    webcrackMock.mockResolvedValue({ code: 'deobfuscated();' });

    await deobfuscator.deobfuscate(document.getElementById('deobfuscateBtn'));

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
    const deobfuscator = makeDeobfuscator();
    const button = document.getElementById('deobfuscateBtn');
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');
    webcrackMock.mockRejectedValue(new Error('decode failed'));

    await deobfuscator.deobfuscate(button);

    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith(
      'webcrack failed: decode failed',
      'error'
    );
    expect(button.disabled).toBe(false);
    expect(button.classList.contains('loading')).toBe(false);
  });
});
