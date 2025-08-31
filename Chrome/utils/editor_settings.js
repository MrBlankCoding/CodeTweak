/* global chrome, CodeMirror, js_beautify */

import { parseUserScriptMetadata } from './metadataParser.js';

export class CodeEditorManager {
  constructor(elements, state, config, gmApiDefinitions) {
    this.elements = elements;
    this.state = state;
    this.config = config;
    this.gmApiDefinitions = gmApiDefinitions;
    this.codeEditor = null;
    
    // Default 
    this.defaultSettings = {
      theme: 'ayu-dark',
      fontSize: 14,
      tabSize: 2,
      lineNumbers: true,
      lineWrapping: false,
      matchBrackets: true,
      minimap: true
    };
    
    this.currentSettings = {...this.defaultSettings};

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
  // main code config
  async initializeCodeEditor() {
    if (!this.elements.codeEditor) {
      throw new Error("Code editor element not found");
    }

    await this.loadSettings();

    const editorConfig = {
      mode: "javascript",
      theme: this.currentSettings?.theme || 'ayu-dark',
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      smartIndent: true,
      electricChars: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      showTrailingSpace: true,
      continueComments: true,
      foldGutter: true,
      lint: this.getLintOptions(
        this.state.lintingEnabled,
        this.getEnabledGmApis()
      ),
      gutters: [
        "CodeMirror-linenumbers",
        "CodeMirror-foldgutter",
        "CodeMirror-lint-markers",
      ],
      scrollbarStyle: "native",
      extraKeys: this.getEditorKeybindings(),
      minimap: this.currentSettings?.minimap !== false ? {
        width: 120,
        fontSize: 2,
        showViewport: true,
        viewportColor: 'rgba(255, 255, 255, 0.1)',
        viewportBorderColor: 'rgba(255, 255, 255, 0.3)',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        textColor: 'rgba(255, 255, 255, 0.6)',
        updateDelay: 100
      } : false,
    };

    this.codeEditor = CodeMirror.fromTextArea(
      this.elements.codeEditor,
      editorConfig
    );

    this.codeEditor.on("inputRead", (cm, change) => {
      if (
        change.text[0] &&
        /[\w.]/.test(change.text[0]) &&
        !cm.state.completionActive &&
        this.currentPerfTier === 'normal'
      ) {
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
      }
    });

    this.applyLargeFileOptimizations();

    this.setupEditorEventHandlers();
    this.updateEditorLintAndAutocomplete(); 

    this.state.codeEditor = this.codeEditor;

    this.applySettings(this.currentSettings);

    return this.codeEditor;
  }

  applyLargeFileOptimizations() {
    if (!this.codeEditor) return;

    const lineCount = this.codeEditor.lineCount();
    const charCount = this.codeEditor.getValue().length;

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

  applyPerformanceTier(tier) {
    if (!this.codeEditor) return;

    const prev = this.currentPerfTier;
    this.currentPerfTier = tier;
    this.largeFileOptimized = tier !== 'normal'; // keep backward compatibility with other checks

    const baseGutters = [
      "CodeMirror-linenumbers",
      "CodeMirror-foldgutter",
      "CodeMirror-lint-markers",
    ];

    this.codeEditor.operation(() => {
      if (tier === 'normal') {
        const lintOptions = this.getLintOptions(this.state.lintingEnabled, this.getEnabledGmApis());
        this.codeEditor.setOption('lint', lintOptions);
        this.codeEditor.setOption('lineWrapping', this.currentSettings.lineWrapping);
        this.codeEditor.setOption('foldGutter', true);
        this.codeEditor.setOption('matchBrackets', true);
        this.codeEditor.setOption('showTrailingSpace', true);
        this.codeEditor.setOption('autoCloseBrackets', true);
        this.codeEditor.setOption('pollInterval', 100);
        this.codeEditor.setOption('gutters', baseGutters);
        if (this.currentSettings.minimap) {
          this.codeEditor.setOption('minimap', {
            width: 120,
            fontSize: 2,
            showViewport: true,
            viewportColor: 'rgba(255, 255, 255, 0.1)',
            viewportBorderColor: 'rgba(255, 255, 255, 0.3)',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            textColor: 'rgba(255, 255, 255, 0.6)',
            updateDelay: 100
          });
        } else {
          this.codeEditor.setOption('minimap', false);
        }
        this.codeEditor.setOption('lineNumbers', true);
        this.codeEditor.setOption('viewportMargin', 10);
        if (prev !== 'normal') {
          console.info('CodeMirror: Restored full features (file size back to normal).');
        }
      } else if (tier === 'large') {
        this.codeEditor.setOption('lint', false);
        this.codeEditor.setOption('lineWrapping', false);
        this.codeEditor.setOption('foldGutter', false);
        this.codeEditor.setOption('matchBrackets', false);
        this.codeEditor.setOption('showTrailingSpace', false);
        this.codeEditor.setOption('autoCloseBrackets', false);
        this.codeEditor.setOption('minimap', false);
        this.codeEditor.setOption('pollInterval', 300);
        this.codeEditor.setOption('gutters', ["CodeMirror-linenumbers"]);
        this.codeEditor.setOption('lineNumbers', true);
        this.codeEditor.setOption('viewportMargin', 20);
        console.warn(`CodeMirror: Large file detected – applied performance tier 'large' (${this.codeEditor.lineCount()} lines).`);
      } else if (tier === 'huge') {
        this.codeEditor.setOption('lint', false);
        this.codeEditor.setOption('lineWrapping', false);
        this.codeEditor.setOption('foldGutter', false);
        this.codeEditor.setOption('matchBrackets', false);
        this.codeEditor.setOption('showTrailingSpace', false);
        this.codeEditor.setOption('autoCloseBrackets', false);
        this.codeEditor.setOption('minimap', false);
        this.codeEditor.setOption('pollInterval', 1000);
        this.codeEditor.setOption('gutters', []);
        this.codeEditor.setOption('lineNumbers', false);
        this.codeEditor.setOption('viewportMargin', 5);
        console.error(`CodeMirror: Huge file detected – applied performance tier 'huge' (${this.codeEditor.lineCount()} lines).`);
      }
    });
    this.updatePerfBadge(tier);
  }

  updatePerfBadge(tier) {
    try {
      const el = document.getElementById('perfTierBadge');
      if (!el) return;
      el.classList.remove('tier-large', 'tier-huge');
      const lineCount = this.codeEditor?.lineCount?.() ?? 0;
      const charCount = this.codeEditor?.getValue?.().length ?? 0;
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

  //shortcuts
  getEditorKeybindings() {
    return {
      "Ctrl-Space": "autocomplete",
      "Ctrl-S": () => {
        event.preventDefault();
        this.onSaveCallback?.();
      },
      "Cmd-S": () => {
        event.preventDefault();
        this.onSaveCallback?.();
      },
      "Alt-F": () => this.formatCode(true),
      F11: (cm) => cm.setOption("fullScreen", !cm.getOption("fullScreen")),
      Esc: (cm) => {
        if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
      },
      Tab: (cm) => this.handleTabKey(cm),
      "Ctrl-/": (cm) => cm.toggleComment({ indent: true }),
      "Cmd-/": (cm) => cm.toggleComment({ indent: true }),
      "Ctrl-M": (cm) => this.toggleMinimap(cm),
      "Cmd-M": (cm) => this.toggleMinimap(cm),
    };
  }

  toggleMinimap(cm) {
    const minimap = cm.getOption('minimap');
    cm.setOption('minimap', minimap ? false : {
      width: 120,
      fontSize: 2,
      showViewport: true,
      viewportColor: 'rgba(255, 255, 255, 0.1)',
      viewportBorderColor: 'rgba(255, 255, 255, 0.3)',
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      textColor: 'rgba(255, 255, 255, 0.6)',
      updateDelay: 100
    });
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
    const refreshEditor = () => {
      this.codeEditor.refresh();
      if (this.onStatusCallback) {
        this.onStatusCallback('Settings updated', 'success');
        setTimeout(() => this.onStatusCallback(null), this.config.STATUS_TIMEOUT);
      }
    };

    if (settings.theme !== undefined) {
      const theme = settings.theme || this.defaultSettings.theme;
      const themeLink = document.querySelector('link[href*="codemirror/theme/"]');
      if (themeLink) {
        themeLink.href = `codemirror/theme/${theme}.css`;
      }
      this.codeEditor.setOption('theme', theme);
      refreshEditor();
    }

    if (settings.minimap !== undefined) {
      if (settings.minimap && !this.largeFileOptimized) {
        this.codeEditor.setOption('minimap', {
          width: 120,
          fontSize: 2,
          showViewport: true,
          viewportColor: 'rgba(255, 255, 255, 0.1)',
          viewportBorderColor: 'rgba(255, 255, 255, 0.3)',
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          textColor: 'rgba(255, 255, 255, 0.6)',
          updateDelay: 100
        });
      } else {
        this.codeEditor.setOption('minimap', false);
      }
      refreshEditor();
    }

    if (settings.fontSize !== undefined) {
      const size = settings.fontSize || this.defaultSettings.fontSize;
      this.codeEditor.getWrapperElement().style.fontSize = `${size}px`;
      refreshEditor();
    }

    if (settings.tabSize !== undefined) {
      const tabSize = settings.tabSize || this.defaultSettings.tabSize;
      this.codeEditor.setOption('tabSize', tabSize);
      this.codeEditor.setOption('indentUnit', tabSize);
      refreshEditor();
    }

    if (settings.lineNumbers !== undefined) {
      this.codeEditor.setOption('lineNumbers', settings.lineNumbers);
      refreshEditor();
    }

    if (settings.lineWrapping !== undefined) {
      this.codeEditor.setOption('lineWrapping', settings.lineWrapping);
      refreshEditor();
    }

    if (settings.matchBrackets !== undefined) {
      this.codeEditor.setOption('matchBrackets', settings.matchBrackets);
      refreshEditor();
    }
  }

  resetToDefaultSettings() {
    this.saveSettings({...this.defaultSettings});
    return {...this.defaultSettings};
  }

  // tab override
  handleTabKey(cm) {
    if (cm.somethingSelected()) {
      cm.indentSelection("add");
    } else {
      const spaces = " ".repeat(cm.getOption("indentUnit"));
      cm.replaceSelection(spaces, "end", "+input");
    }
  }

  parseUserScriptHeader(content) {
    return parseUserScriptMetadata(content);
  }

  async handlePaste(editor, event) {
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
      
      const doc = editor.getDoc();
      const cursor = doc.getCursor();
      doc.replaceRange(pastedText, cursor);
    } catch (error) {
      console.error('Error handling paste:', error);
    }
  }

  setupEditorEventHandlers() {
    this.codeEditor.on("cursorActivity", (cm) => {
      const cursor = cm.getCursor();
      if (this.elements.cursorInfo) {
        this.elements.cursorInfo.textContent = `Line: ${
          cursor.line + 1
        }, Col: ${cursor.ch + 1}`;
      }
    });

    this.codeEditor.on("change", (cm, change) => {
      if (change.origin !== "setValue") {
        this.state.hasUserInteraction = true;
        this.onChangeCallback?.(cm, change);
      }
    });
    
    this.codeEditor.on('paste', (cm, event) => this.handlePaste(cm, event));

    this.codeEditor.on('change', () => {
      if (this._perfCheckTimer) clearTimeout(this._perfCheckTimer);
      this._perfCheckTimer = setTimeout(() => this.applyLargeFileOptimizations(), 200);
    });
  }

  // enabled APIS
  getEnabledGmApis() {
    return Object.values(this.gmApiDefinitions)
      .filter((api) => this.elements[api.el] && this.elements[api.el].checked)
      .map((api) => api.name);
  }

  updateEditorLintAndAutocomplete() {
    if (!this.codeEditor) return;

    const enabledApiNames = this.getEnabledGmApis();
    const lintOptions = this.getLintOptions(
      this.state.lintingEnabled,
      enabledApiNames
    );
    this.codeEditor.setOption("lint", lintOptions);

    setTimeout(() => {
      if (
        this.codeEditor &&
        (this.state.lintingEnabled || typeof lintOptions === "object")
      ) {
        this.codeEditor.performLint();
      }
    }, 200);

    const globalDefsForHinting = {};
    enabledApiNames.forEach((apiName) => {
      globalDefsForHinting[apiName] = true;
    });

    this.codeEditor.setOption("hintOptions", {
      ...(this.codeEditor.getOption("hintOptions") || {}),
      globals: globalDefsForHinting,
    });
  }

  //lint options
  getLintOptions(enable, enabledApiNames = []) {
    // Skip linting entirely for large files to avoid freezes
    if (this.currentPerfTier !== 'normal' || !enable || typeof window.JSHINT === "undefined") return false;

    // Build globals map including enabled GM_* APIs
    const globals = {
      chrome: false,
      CodeMirror: false,
      GM: false,
    };
    enabledApiNames.forEach((name) => {
      globals[name] = false; // treat as read-only globals
    });

    return {
      getAnnotations: (text) => {
        const errors = [];

        if (
          !window.JSHINT(text, {
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
          })
        ) {
          const jshintErrors = window.JSHINT.errors;

          for (const err of jshintErrors) {
            if (!err) continue;

            errors.push({
              message: err.reason,
              severity: err.code?.startsWith("E") ? "error" : "warning",
              from: CodeMirror.Pos(err.line - 1, err.character - 1),
              to: CodeMirror.Pos(err.line - 1, err.character),
            });
          }
        }

        return errors;
      },
      hasGutters: true,
    };
  }

  toggleLinting(enabled) {
    this.state.lintingEnabled = enabled !== undefined ? enabled : !this.state.lintingEnabled;
    const lintOptions = this.getLintOptions(this.state.lintingEnabled, this.getEnabledGmApis());
    this.codeEditor.setOption("lint", lintOptions);
    
    // Force a re-lint when enabling
    if (this.state.lintingEnabled) {
      setTimeout(() => {
        if (this.codeEditor) {
          this.codeEditor.performLint();
        }
      }, 100);
    }
    
    localStorage.setItem("lintingEnabled", this.state.lintingEnabled);
    return this.state.lintingEnabled;
  }

  async formatCode(showMessage = true, onFormatComplete) {
    try {
      if (!this.codeEditor) {
        throw new Error("Code editor not initialized");
      }

      const unformattedCode = this.codeEditor.getValue();
      const formattedCode = js_beautify(unformattedCode, {
        indent_size: 2,
        space_in_empty_paren: true,
      });

      this.codeEditor.operation(() => {
        const cursor = this.codeEditor.getCursor();
        this.codeEditor.setValue(formattedCode);
        this.codeEditor.setCursor(cursor);
      });

      if (showMessage && this.onStatusCallback) {
        this.onStatusCallback("Code formatted", "success");
        setTimeout(
          () => this.onStatusCallback(null),
          this.config.STATUS_TIMEOUT
        );
      }
      
      if (typeof onFormatComplete === 'function') {
        await onFormatComplete();
      }
    } catch (error) {
      console.error("Error formatting code:", error);
      if (showMessage && this.onStatusCallback) {
        this.onStatusCallback("Could not format code", "error");
      }
      return false;
    }
  }

  insertTemplateCode(template) {
    const wrappedCode = `(function() {
    'use strict';
    
  ${template}
  
  })();`;
    this.codeEditor.setValue(wrappedCode);
    this.formatCode(false);
  }

  insertDefaultTemplate() {
    const defaultCode = `(function() {
    'use strict';
    
    // Your code here...
    console.log('CodeTweak: Custom script is running!');
  
  })();`;

    this.codeEditor.setValue(defaultCode);
    this.formatCode(false);
  }

  //helpers
  getValue() {
    return this.codeEditor ? this.codeEditor.getValue() : "";
  }

  setValue(code) {
    if (this.codeEditor) {
      this.codeEditor.setValue(code);
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
