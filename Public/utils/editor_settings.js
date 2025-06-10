class CodeEditorManager {
  constructor(elements, state, config, gmApiDefinitions) {
    this.elements = elements;
    this.state = state;
    this.config = config;
    this.gmApiDefinitions = gmApiDefinitions;
    this.codeEditor = null;
  }
  // main code config
  initializeCodeEditor() {
    if (!this.elements.codeEditor) {
      throw new Error("Code editor element not found");
    }

    const editorConfig = {
      mode: "javascript",
      theme: "ayu-dark",
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

    this.setupEditorEventHandlers();
    this.updateEditorLintAndAutocomplete(); // call after editor setup

    // Update state reference
    this.state.codeEditor = this.codeEditor;

    return this.codeEditor;
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

  // tab override
  handleTabKey(cm) {
    if (cm.somethingSelected()) {
      cm.indentSelection("add");
    } else {
      const spaces = " ".repeat(cm.getOption("indentUnit"));
      cm.replaceSelection(spaces, "end", "+input");
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
    if (!enable || typeof window.JSHINT === "undefined") return false;

    return {
      getAnnotations: (text) => {
        const errors = [];

        if (
          !window.JSHINT(text, {
            esversion: 9,
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

  toggleLinting() {
    this.state.lintingEnabled = !this.state.lintingEnabled;
    this.codeEditor.setOption(
      "lint",
      this.getLintOptions(this.state.lintingEnabled)
    );
    this.elements.lintBtnText.textContent = `Lint: ${
      this.state.lintingEnabled ? "On" : "Off"
    }`;
    localStorage.setItem("lintingEnabled", this.state.lintingEnabled);
  }

  formatCode(showMessage = true) {
    try {
      if (!this.codeEditor) {
        throw new Error("Code editor not initialized");
      }

      const unformattedCode = this.codeEditor.getValue();
      const formattedCode = js_beautify(unformattedCode, {
        indent_size: 2,
        space_in_empty_paren: true,
      });

      this.codeEditor.setValue(formattedCode);

      if (showMessage && this.onStatusCallback) {
        this.onStatusCallback("Code formatted", "success");
        setTimeout(
          () => this.onStatusCallback(null),
          this.config.STATUS_TIMEOUT
        );
      }
    } catch (error) {
      console.error("Error formatting code:", error);
      if (showMessage && this.onStatusCallback) {
        this.onStatusCallback("Could not format code", "error");
      }
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

  setStatusCallback(callback) {
    this.onStatusCallback = callback;
  }

  getEditor() {
    return this.codeEditor;
  }
}
