import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserscriptHandler } from '../../src/ai_dom_editor/editor/helpers/userscript_handler.js';

describe('UserscriptHandler', () => {
  let handler;
  let mockEditor;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockEditor = {
      currentScript: null,
      chatManager: {
        addMessage: vi.fn(),
      },
      setCurrentScript: vi.fn(),
    };

    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ scripts: [] }),
        },
      },
    };

    handler = new UserscriptHandler(mockEditor);
  });

  describe('createUserscript', () => {
    it('should send createScript message to background after getting tab', async () => {
      // Mock the first call (getCurrentTab) returning a Promise
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ tab: { url: 'https://example.com' } })
        // Mock the second call (createScriptFromAI) which uses a callback
        .mockImplementationOnce((msg, callback) => {
          callback({ success: true, script: { id: 's1', name: 'Test' } });
        });

      await handler.createUserscript('console.log(1)', 'Test Script');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'getCurrentTab' })
      );
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'createScriptFromAI' }),
        expect.any(Function)
      );
    });
  });

  describe('wrapInIIFE', () => {
    it('should wrap code in IIFE if not already wrapped', () => {
      const code = 'console.log(1);';
      const wrapped = handler.wrapInIIFE(code);
      expect(wrapped).toContain('(function() {');
      expect(wrapped).toContain("'use strict';");
    });

    it('should not wrap if already contains function wrapper', () => {
      const code = '(function() { console.log(1); })();';
      const wrapped = handler.wrapInIIFE(code);
      expect(wrapped).toBe(code);
    });
  });

  describe('updateUserscript', () => {
    it('should handle full script replacement with metadata', async () => {
      const existingScript = {
        id: 's1',
        name: 'Old',
        code: '// ==UserScript==\n// @name Old\n// ==/UserScript==\n',
      };
      mockEditor.currentScript = existingScript;

      chrome.storage.local.get.mockResolvedValue({ scripts: [existingScript] });

      const newFullCode = '// ==UserScript==\n// @name New\n// ==/UserScript==\nconsole.log(2);';
      await handler.updateUserscript('Old', newFullCode);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'updateScript',
          code: expect.stringContaining('// ==UserScript=='),
        }),
        expect.any(Function)
      );
    });

    it('should show error if no script found to update', async () => {
      chrome.storage.local.get.mockResolvedValue({ scripts: [] });
      await handler.updateUserscript('NonExistent', 'code');
      expect(mockEditor.chatManager.addMessage).toHaveBeenCalledWith(
        'assistant',
        expect.stringContaining('not found'),
        expect.objectContaining({ error: true })
      );
    });

    it('should use currentScript if scriptName is not found by name', async () => {
      const existingScript = { id: 's1', name: 'Old', code: 'old' };
      mockEditor.currentScript = existingScript;
      chrome.storage.local.get.mockResolvedValue({ scripts: [existingScript] });

      await handler.updateUserscript('MissingName', 'new code');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ scriptId: 's1' }),
        expect.any(Function)
      );
    });
  });
});
