/* eslint-disable no-unused-vars */

import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { parseUserScriptMetadata } from '../utils/metadataParser.js';
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { bracketMatching } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { showMinimap } from '@replit/codemirror-minimap';
import { oneDark } from '@codemirror/theme-one-dark';

export class CodeEditorManager {
  constructor(elements, state, config, gmApiDefinitions) {
    this.elements = elements;
    this.state = state;
    this.config = config;
    this.gmApiDefinitions = gmApiDefinitions;
    this.codeEditor = null;
    
    this.defaultSettings = {
      fontSize: 14,
      tabSize: 2,
      lineNumbers: true,
      lineWrapping: false,
      matchBrackets: true,
      minimap: true
    };
    
    this.currentSettings = {...this.defaultSettings};
    this.lint = new Compartment();
    this.tabSize = new Compartment();
    this.lineNumbers = new Compartment();
    this.lineWrapping = new Compartment();
    this.matchBrackets = new Compartment();
    this.minimap = new Compartment();

    this.largeFileOptimized = false;
    this.LARGE_FILE_LINE_COUNT = 3000;
    this.HUGE_FILE_LINE_COUNT = 10000;
    this.LARGE_FILE_CHAR_COUNT = 200_000; // ~200 KB text
    this.HUGE_FILE_CHAR_COUNT = 800_000;  // ~800 KB text
    this.currentPerfTier = 'normal'; // 'normal' | 'large' | 'huge'
    this._perfCheckTimer = null;

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.editorSettings) {
        this.currentSettings = {...this.defaultSettings, ...changes.editorSettings.newValue};
        this.applySettings(this.currentSettings);
      }
    });
  }

  async initializeCodeEditor() {
    if (!this.elements.codeEditor) {
      throw new Error("Code editor element not found");
    }

    await this.loadSettings();

    const startState = EditorState.create({
      doc: this.elements.codeEditor.value,
      extensions: [
        basicSetup,
        oneDark,
        javascript(),
        this.getEditorKeybindings(),
        this.lint.of(linter(this.getLintOptions(true, this.getEnabledGmApis()))),
        autocompletion(),
        closeBrackets(),
        lintGutter(),
        
        // Settings compartments
        this.tabSize.of(EditorState.tabSize.of(this.currentSettings.tabSize)),
        this.lineNumbers.of(this.currentSettings.lineNumbers ? [lineNumbers()] : []),
        this.lineWrapping.of(this.currentSettings.lineWrapping ? EditorView.lineWrapping : []),
        this.matchBrackets.of(this.currentSettings.matchBrackets ? bracketMatching() : []),
        this.minimap.of(this.currentSettings.minimap ? showMinimap.compute(['doc'], () => {
          return {
            create: () => {
              const dom = document.createElement('div');
              return { dom };
            },
            displayText: 'blocks',
            showOverlay: 'always'
          };
        }) : []),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                this.onChangeCallback?.();
                if (this._perfCheckTimer) clearTimeout(this._perfCheckTimer);
                this._perfCheckTimer = setTimeout(() => this.applyLargeFileOptimizations(), 500);
            }
            if (update.selectionSet) {
                const cursor = update.state.selection.main;
                if (this.elements.cursorInfo) {
                    const line = update.state.doc.lineAt(cursor.from);
                    this.elements.cursorInfo.textContent = `Line: ${line.number}, Col: ${cursor.from - line.from}`;
                }
            }
        })
      ]
    });

    this.codeEditor = new EditorView({
      state: startState,
      parent: this.elements.codeEditor.parentElement
    });

    this.elements.codeEditor.style.display = 'none';

    this.applyLargeFileOptimizations();
    this.setupEditorEventHandlers();
    this.updateEditorLintAndAutocomplete(); 
    this.state.codeEditor = this.codeEditor;
    this.applySettings(this.currentSettings);

    return this.codeEditor;
  }

  applyLargeFileOptimizations() {
    if (!this.codeEditor) return;

    const lineCount = this.codeEditor.state.doc.lines;
    const charCount = this.codeEditor.state.doc.length;

    let nextTier = 'normal';
    if (lineCount >= this.HUGE_FILE_LINE_COUNT || charCount >= this.HUGE_FILE_CHAR_COUNT) {
      nextTier = 'huge';
    } else if (lineCount >= this.LARGE_FILE_LINE_COUNT || charCount >= this.LARGE_FILE_CHAR_COUNT) {
      nextTier = 'large';
    }

    if (nextTier !== this.currentPerfTier) {
      this.applyPerformanceTier(nextTier);
    }
  }

  reconfigureExtensions() {
    if (!this.codeEditor) return;

    const effects = [];
    const { currentPerfTier, currentSettings } = this;

    // Apply font size directly to the DOM
    this.codeEditor.dom.style.fontSize = `${currentSettings.fontSize}px`;
    
    // Tab size is not performance-related
    effects.push(this.tabSize.reconfigure(EditorState.tabSize.of(currentSettings.tabSize)));

    // Performance-sensitive settings
    const isNormalTier = currentPerfTier === 'normal';
    const isHugeTier = currentPerfTier === 'huge';

    // Line Wrapping
    const shouldWrap = isNormalTier && currentSettings.lineWrapping;
    effects.push(this.lineWrapping.reconfigure(shouldWrap ? EditorView.lineWrapping : []));
    
    // Bracket Matching
    const shouldMatchBrackets = isNormalTier && currentSettings.matchBrackets;
    effects.push(this.matchBrackets.reconfigure(shouldMatchBrackets ? bracketMatching() : []));
    
    // Minimap
    const shouldShowMinimap = isNormalTier && currentSettings.minimap;
    effects.push(this.minimap.reconfigure(shouldShowMinimap ? showMinimap.compute(['doc'], () => ({
      create: () => ({ dom: document.createElement('div') }),
      displayText: 'blocks',
      showOverlay: 'always'
    })) : []));

    // Line Numbers
    const shouldShowLineNumbers = !isHugeTier && currentSettings.lineNumbers;
    effects.push(this.lineNumbers.reconfigure(shouldShowLineNumbers ? [lineNumbers()] : []));

    // Linting
    const shouldLint = isNormalTier && this.state.lintingEnabled;
    effects.push(this.lint.reconfigure(linter(this.getLintOptions(shouldLint, this.getEnabledGmApis()))));
    
    if (effects.length > 0) {
      this.codeEditor.dispatch({ effects });
    }
    
    this.updatePerfBadge(currentPerfTier);
  }

  applyPerformanceTier(tier) {
    if (!this.codeEditor || tier === this.currentPerfTier) return;
    
    this.currentPerfTier = tier;
    this.largeFileOptimized = tier !== 'normal';
    this.reconfigureExtensions();
  }

  updatePerfBadge(tier) {
    try {
      const el = document.getElementById('perfTierBadge');
      if (!el) return;
      el.classList.remove('tier-large', 'tier-huge');
      const lineCount = this.codeEditor?.state.doc.lines ?? 0;
      const charCount = this.codeEditor?.state.doc.length ?? 0;
      const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (tier === 'normal') {
        el.classList.add('hidden');
        el.textContent = '';
        el.title = '';
      } else if (tier === 'large') {
        el.classList.remove('hidden');
        el.classList.add('tier-large');
        el.textContent = 'Optimized: lint/minimap off';
        el.title = `Large file detected (lines: ${fmt(lineCount)}, chars: ${fmt(charCount)}). Disabled: linting, minimap, code folding, match brackets, trailing spaces, auto-close brackets. Polling slowed.`;
      } else if (tier === 'huge') {
        el.classList.remove('hidden');
        el.classList.add('tier-huge');
        el.textContent = 'Optimized: gutters/line# off';
        el.title = `Huge file detected (lines: ${fmt(lineCount)}, chars: ${fmt(charCount)}). Disabled: linting, minimap, code folding, match brackets, trailing spaces, auto-close brackets, gutters & line numbers. Polling greatly reduced.`;
      }
    } catch {
      // non-fatal UI update issue
    }
  }

        getEditorKeybindings() {

          return keymap.of([

              ...defaultKeymap,

              indentWithTab,

              { key: "Ctrl-s", run: () => { this.onSaveCallback?.(); return true; } },

              { key: "Cmd-s", run: () => { this.onSaveCallback?.(); return true; } },

              { key: "F11", run: (view) => {

                  if (view.dom.requestFullscreen) {

                      view.dom.requestFullscreen();

                  }

                  return true;

              }},

              { key: "Escape", run: (view) => {

                  if (document.fullscreenElement) {

                      document.exitFullscreen();

                  }

                  return true;

              }},

          ]);

        }

  toggleMinimap() {
    // Minimap functionality is not available out-of-the-box in CodeMirror 6.
    // It would require a custom extension.
  }

  loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['editorSettings'], (result) => {
        if (result.editorSettings) {
          this.currentSettings = {...this.defaultSettings, ...result.editorSettings};
        } else {
          this.currentSettings = {...this.defaultSettings};
        }
        resolve(this.currentSettings);
      });
    });
  }

  saveSettings(settings) {
    this.currentSettings = {...this.currentSettings, ...settings};
    chrome.storage.local.set({ editorSettings: this.currentSettings });
    this.applySettings(settings);
  }

  applySettings(settings) {
    if (!this.codeEditor) return;
    this.currentSettings = { ...this.currentSettings, ...settings };
    this.reconfigureExtensions();
  }

  resetToDefaultSettings() {
    this.saveSettings({...this.defaultSettings});
    return {...this.defaultSettings};
  }

  parseUserScriptHeader(content) {
    return parseUserScriptMetadata(content);
  }

  async handlePaste(event) {
    if (!this.onImportCallback) return;
    
    try {
      const clipboardData = event.clipboardData || window.clipboardData;
      const pastedText = clipboardData.getData('text/plain');
      
      if (pastedText.includes('==UserScript==') && pastedText.includes('==/UserScript==')) {
        const metadata = this.parseUserScriptHeader(pastedText);
        if (metadata) {
          event.preventDefault();
          
          const shouldImport = confirm('This looks like a UserScript. Would you like to import its metadata?');
          if (shouldImport) {
            this.onImportCallback({
              code: pastedText,
              ...metadata
            });
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error handling paste:', error);
    }
  }

  setupEditorEventHandlers() {
    this.codeEditor.dom.addEventListener('paste', (event) => this.handlePaste(event));
  }

  getEnabledGmApis() {
    return Object.values(this.gmApiDefinitions)
      .filter((api) => this.elements[api.el] && this.elements[api.el].checked)
      .map((api) => api.name);
  }

  updateEditorLintAndAutocomplete() {
    if (!this.codeEditor) return;

    try {
      const enabledApiNames = this.getEnabledGmApis();
      const lintOptions = this.getLintOptions(
        this.state.lintingEnabled,
        enabledApiNames
      );
      this.codeEditor.dispatch({
          effects: this.lint.reconfigure(linter(lintOptions))
      });
    } catch (error) {
      console.warn('Failed to update linting configuration:', error);
      // Try to disable linting as fallback
      try {
        this.codeEditor.dispatch({
            effects: this.lint.reconfigure(linter(() => []))
        });
      } catch (fallbackError) {
        console.error('Failed to apply fallback linting:', fallbackError);
      }
    }
  }

  getLintOptions(enable, enabledApiNames = []) {
    if (!enable) return () => [];

    const globals = {
      chrome: false,
      CodeMirror: false,
      GM: false,
    };
    enabledApiNames.forEach((name) => {
      globals[name] = false; // treat as read-only globals
    });

    return (view) => {
        // JSHINT is loaded globally via script tag in editor.html
        /* global JSHINT */
        if (typeof JSHINT === 'undefined') return [];
        JSHINT(view.state.doc.toString(), {
            esversion: 11,
            asi: true,
            browser: true,
            devel: true,
            undef: true,
            unused: true,
            curly: true,
            eqeqeq: true,
            laxbreak: true,
            loopfunc: true,
            sub: true,
            shadow: false,
            strict: true,
            globals,
        });

        return JSHINT.errors.map(err => ({
            from: this.codeEditor.state.doc.line(err.line).from + err.character - 1,
            to: this.codeEditor.state.doc.line(err.line).from + err.character,
            message: err.reason,
            severity: err.code?.startsWith("E") ? "error" : "warning",
        }));
    };
  }

  toggleLinting(enabled) {
    this.state.lintingEnabled = enabled;
    this.updateEditorLintAndAutocomplete();
    localStorage.setItem("lintingEnabled", this.state.lintingEnabled);
    return this.state.lintingEnabled;
  }

  insertTemplateCode(template) {
    const wrappedCode = `(function() {
    'use strict';
    
  ${template}
  
  })();`;
    this.setValue(wrappedCode);
  }

  insertDefaultTemplate() {
    const defaultCode = `(function() {
    'use strict';
    
    // Your code here...
  
  })();`;

    this.setValue(defaultCode);
  }

  getValue() {
    return this.codeEditor ? this.codeEditor.state.doc.toString() : "";
  }

  setValue(code) {
    if (this.codeEditor) {
      this.codeEditor.dispatch({
        changes: {from: 0, to: this.codeEditor.state.doc.length, insert: code}
      });
      this.applyLargeFileOptimizations();
    }
  }

  focus() {
    if (this.codeEditor) {
      this.codeEditor.focus();
    }
  }

  setSaveCallback(callback) {
    this.onSaveCallback = callback;
  }

  setChangeCallback(callback) {
    this.onChangeCallback = callback;
  }
  
  setImportCallback(callback) {
    this.onImportCallback = callback;
  }

  setStatusCallback(callback) {
    this.onStatusCallback = callback;
  }

  getEditor() {
    return this.codeEditor;
  }
}