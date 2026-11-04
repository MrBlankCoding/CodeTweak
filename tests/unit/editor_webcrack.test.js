import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('editor webcrack integration', () => {
  let Deobfuscator;
  let webcrackMock;
  let codeEditorInstance;
  let uiInstance;
  let state;
  let confirmSpy;

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

    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it('skips webcrack when the deobfuscation confirmation is declined', async () => {
    const deobfuscator = makeDeobfuscator();
    confirmSpy.mockReturnValue(false);
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');

    await deobfuscator.deobfuscate(document.getElementById('deobfuscateBtn'));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Deobfuscation may execute parts of this script to decode strings. Run it?'
    );
    expect(webcrackMock).not.toHaveBeenCalled();
    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith('Deobfuscation cancelled', 'warning');
    expect(codeEditorInstance.setValue).not.toHaveBeenCalled();
  });

  it('warns and keeps the buffer when webcrack produces no changes', async () => {
    const deobfuscator = makeDeobfuscator();
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');
    webcrackMock.mockResolvedValue({ code: 'obfuscated();' });

    await deobfuscator.deobfuscate(document.getElementById('deobfuscateBtn'));

    expect(codeEditorInstance.setValue).not.toHaveBeenCalled();
    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith(
      'No changes produced by webcrack',
      'warning'
    );
  });

  it('warns and keeps the buffer when webcrack returns no code', async () => {
    const deobfuscator = makeDeobfuscator();
    codeEditorInstance.getValue.mockReturnValue('obfuscated();');
    webcrackMock.mockResolvedValue({});

    await deobfuscator.deobfuscate(document.getElementById('deobfuscateBtn'));

    expect(codeEditorInstance.setValue).not.toHaveBeenCalled();
    expect(uiInstance.showStatusMessage).toHaveBeenCalledWith(
      'No changes produced by webcrack',
      'warning'
    );
  });

  describe('sandbox tripwire', () => {
    it('evaluates simple decoder expressions', async () => {
      const deobfuscator = makeDeobfuscator();
      const sandbox = deobfuscator.createSandbox();

      await expect(sandbox('(1 + 2)')).resolves.toBe(3);
    });

    it('blocks escape-hatch identifiers', async () => {
      const deobfuscator = makeDeobfuscator();
      const sandbox = deobfuscator.createSandbox();

      for (const code of ['globalThis', 'window', 'document', 'eval(1)', 'self', 'Function("1")']) {
        await expect(sandbox(code)).rejects.toThrow(
          'webcrack decoder expression blocked for safety'
        );
      }
    });

    it('blocks snippets over the 50_000 character cap', async () => {
      const deobfuscator = makeDeobfuscator();
      const sandbox = deobfuscator.createSandbox();

      await expect(sandbox(`'${'a'.repeat(50_001)}'`)).rejects.toThrow(
        'webcrack decoder expression blocked for safety'
      );
    });
  });
});
