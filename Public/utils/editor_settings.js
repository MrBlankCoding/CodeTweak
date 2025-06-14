/* global chrome, CodeMirror, js_beautify */

import { parseUserScriptMetadata } from './metadataParser.js';

// Settings for the editor
export class CodeEditorManager {
  constructor(elements, state, config, gmApiDefinitions) {
    this.elements = elements;
    this.state = state;
    this.config = config;
    this.gmApiDefinitions = gmApiDefinitions;
    this.codeEditor = null;
    
    // Default settings
    this.defaultSettings = {
      theme: 'ayu-dark',
      fontSize: 14,
      tabSize: 2,
      lineNumbers: true,
      lineWrapping: false,
      matchBrackets: true
    };
    
    this.currentSettings = {...this.defaultSettings};

    // Large file optimization settings
    this.largeFileOptimized = false; // flag to ensure we only optimize once per large file
    this.LARGE_FILE_LINE_COUNT = 5000; // threshold to consider a script "large"

    // Add storage change listener
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

    // Ensure settings are loaded first
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
      scrollbarStyle: "simple",
      extraKeys: this.getEditorKeybindings(),
    };

    this.codeEditor = CodeMirror.fromTextArea(
      this.elements.codeEditor,
      editorConfig
    );

    this.codeEditor.on("inputRead", (cm, change) => {
      if (
        change.text[0] &&
        /[\w.]/.test(change.text[0]) &&
        !cm.state.completionActive
      ) {
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
      }
    });

    // Apply optimizations straight away (handles pre-loaded textarea content)
    this.applyLargeFileOptimizations();

    this.setupEditorEventHandlers();
    this.updateEditorLintAndAutocomplete(); // call after editor setup

    // Update state reference first
    this.state.codeEditor = this.codeEditor;

    // Apply all current settings to the editor
    this.applySettings(this.currentSettings);

    return this.codeEditor;
  }

  // === Performance helpers ===
  applyLargeFileOptimizations() {
    if (!this.codeEditor || this.largeFileOptimized) return;

    const lineCount = this.codeEditor.lineCount();
    if (lineCount <= this.LARGE_FILE_LINE_COUNT) return;

    // Disable heavy features
    this.codeEditor.setOption("lint", false);
    this.codeEditor.setOption("lineWrapping", false);
    this.codeEditor.setOption("foldGutter", false);
    this.codeEditor.setOption("matchBrackets", false);
    this.codeEditor.setOption("showTrailingSpace", false);
    this.codeEditor.setOption("autoCloseBrackets", false);
    this.codeEditor.setOption("viewportMargin", 20); // keep a small margin around viewport

    // Remove fold gutter from the gutter list if present
    const gutters = (this.codeEditor.getOption("gutters") || []).filter(
      (g) => g !== "CodeMirror-foldgutter"
    );
    this.codeEditor.setOption("gutters", gutters);

    this.largeFileOptimized = true;
    console.warn(
      `CodeMirror: Large file (${lineCount} lines) detected – heavy features disabled for performance.`
    );
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
    };
  }

  // Settings Management
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

    // Refresh editor after applying settings to ensure changes take effect
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
    // Delegate to the shared metadata parser
    return parseUserScriptMetadata(content);
  }

  async handlePaste(editor, event) {
    // Only handle if we have a callback for handling imports
    if (!this.onImportCallback) return;
    
    try {
      const clipboardData = event.clipboardData || window.clipboardData;
      const pastedText = clipboardData.getData('text/plain');
      
      // Check if the pasted content has a UserScript header
      if (pastedText.includes('==UserScript==') && pastedText.includes('==/UserScript==')) {
        const metadata = this.parseUserScriptHeader(pastedText);
        if (metadata) {
          event.preventDefault();
          
          const shouldImport = confirm('This looks like a UserScript. Would you like to import its metadata?');
          if (shouldImport) {
            // Let the editor handle the import
            this.onImportCallback({
              code: pastedText,
              ...metadata
            });
            // Don't insert the pasted content, let the callback handle it
            return;
          }
        }
      }
      
      // Default paste behavior
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
    
    // Add paste event listener
    this.codeEditor.on('paste', (cm, event) => this.handlePaste(cm, event));

    // Re-evaluate optimizations on each change (cheap: just track line count flag)
    this.codeEditor.on('change', () => this.applyLargeFileOptimizations());
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
  getLintOptions(enable) {
    // Skip linting entirely for large files to avoid freezes
    if (this.largeFileOptimized || !enable || typeof window.JSHINT === "undefined") return false;

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
            globals: {
              chrome: false,
              CodeMirror: false,
              GM: false,
            },
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
    const lintOptions = this.getLintOptions(this.state.lintingEnabled);
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

      // Use CodeMirror's operation to make this an atomic operation
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
      
      // Call the completion callback if provided and wait for it to complete
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
      // Re-check if we need to optimize for large documents
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
