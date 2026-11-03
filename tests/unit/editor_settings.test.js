import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indentUnit } from '@codemirror/language';
import { registerEditorEventListeners } from '../../src/editor/events.js';

describe('editor settings', () => {
  let CodeEditorManager;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <div id="editorContainer"><textarea id="codeEditor"></textarea></div>
      <div id="cursorInfo"></div>
      <div id="perfTierBadge" class="hidden"></div>
    `;
    globalThis.localStorage = { setItem: vi.fn() };
    globalThis.chrome = {
      storage: {
        local: {
          get: (_keys, callback) => callback({}),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    };

    ({ CodeEditorManager } = await import('../../src/editor/editor_settings.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete globalThis.chrome;
    delete globalThis.localStorage;
  });

  it('toggles line numbers and keeps tab indentation in sync with tab size', async () => {
    const manager = new CodeEditorManager(
      { codeEditor: document.getElementById('codeEditor') },
      { lintingEnabled: false },
      {},
      {}
    );

    await manager.initializeCodeEditor();
    expect(manager.codeEditor.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(manager.codeEditor.state.facet(indentUnit)).toBe('  ');

    manager.applySettings({ lineNumbers: false, tabSize: 4 });
    expect(manager.codeEditor.dom.querySelector('.cm-lineNumbers')).toBeNull();
    expect(manager.codeEditor.state.facet(indentUnit)).toBe('    ');

    manager.applySettings({ lineNumbers: true });
    expect(manager.codeEditor.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
    manager.codeEditor.destroy();
  });

  it('updates autosave state and cancels pending saves when disabled', () => {
    vi.useFakeTimers();
    const listeners = new Map();
    const state = { autosaveTimeout: setTimeout(() => {}, 1000) };
    const ui = {
      on: (eventName, handler) => listeners.set(eventName, handler),
      setupSettingsModal: vi.fn(),
      setupUrlManagement: vi.fn(),
      setupResourceManagement: vi.fn(),
    };
    const editor = {
      ui,
      elements: {},
      state,
      codeEditorManager: { applySettings: vi.fn(), toggleLinting: vi.fn() },
      gmApiDefinitions: {},
      setupSidebarIconHandlers: vi.fn(),
      setupResourceApiListeners: vi.fn(),
      updateSectionVisibility: vi.fn(),
    };

    registerEditorEventListeners(editor);
    listeners.get('autosaveToggled')({ enabled: false });
    expect(state.isAutosaveEnabled).toBe(false);
    expect(state.autosaveTimeout).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    listeners.get('autosaveToggled')({ enabled: true });
    expect(state.isAutosaveEnabled).toBe(true);
    vi.useRealTimers();
  });
});
