(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/utils/editor_settings.js
  var import_state = __require("@codemirror/state");
  var import_view = __require("@codemirror/view");
  var import_codemirror = __require("codemirror");
  var import_lang_javascript = __require("@codemirror/lang-javascript");
  var import_commands = __require("@codemirror/commands");

  // src/utils/metadataParser.js
  function parseUserScriptMetadata(content) {
    const metadata = {
      gmApis: {}
    };
    const grantToGmApi = {
      // GM_ style (traditional)
      GM_setValue: "gmSetValue",
      GM_getValue: "gmGetValue",
      GM_deleteValue: "gmDeleteValue",
      GM_listValues: "gmListValues",
      GM_openInTab: "gmOpenInTab",
      GM_notification: "gmNotification",
      GM_getResourceText: "gmGetResourceText",
      GM_getResourceURL: "gmGetResourceURL",
      GM_setClipboard: "gmSetClipboard",
      GM_addStyle: "gmAddStyle",
      GM_addElement: "gmAddElement",
      GM_registerMenuCommand: "gmRegisterMenuCommand",
      GM_xmlhttpRequest: "gmXmlhttpRequest",
      unsafeWindow: "unsafeWindow",
      // GM. style (modern)
      "GM.setValue": "gmSetValue",
      "GM.getValue": "gmGetValue",
      "GM.deleteValue": "gmDeleteValue",
      "GM.listValues": "gmListValues",
      "GM.openInTab": "gmOpenInTab",
      "GM.notification": "gmNotification",
      "GM.getResourceText": "gmGetResourceText",
      "GM.getResourceURL": "gmGetResourceURL",
      "GM.setClipboard": "gmSetClipboard",
      "GM.addStyle": "gmAddStyle",
      "GM.addElement": "gmAddElement",
      "GM.registerMenuCommand": "gmRegisterMenuCommand",
      "GM.xmlhttpRequest": "gmXmlhttpRequest"
    };
    const metaMatch = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!metaMatch)
      return metadata;
    const metaBlock = metaMatch[1];
    const lines = metaBlock.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const match = line.match(/@(\w+)\s+(.+)/);
      if (!match)
        continue;
      const [, key, value] = match;
      switch (key.toLowerCase()) {
        case "match":
        case "include":
          if (!metadata.matches)
            metadata.matches = [];
          metadata.matches.push(value);
          break;
        case "require":
          if (!metadata.requires)
            metadata.requires = [];
          metadata.requires.push(value);
          break;
        case "resource": {
          if (!metadata.resources)
            metadata.resources = [];
          const [name, url] = value.split(/\s+/);
          if (name && url) {
            metadata.resources.push({ name, url });
          }
          break;
        }
        case "run-at":
          metadata.runAt = value;
          break;
        case "grant": {
          const grantValue = value.trim();
          if (grantValue === "none") {
            metadata.gmApis = {};
          } else if (grantValue === "unsafeWindow") {
            metadata.gmApis.unsafeWindow = true;
          } else {
            const apiFlag = grantToGmApi[grantValue];
            if (apiFlag) {
              metadata.gmApis[apiFlag] = true;
            }
          }
          break;
        }
        case "license":
          metadata.license = value.trim();
          break;
        case "icon":
          metadata.icon = value.trim();
          break;
        default:
          metadata[key] = value;
      }
    }
    return metadata;
  }

  // src/utils/editor_settings.js
  var import_theme_one_dark = __require("@codemirror/theme-one-dark");
  var import_codemirror_theme_solarized_dark = __require("@fsegurai/codemirror-theme-solarized-dark");
  var import_codemirror_theme_solarized_light = __require("@fsegurai/codemirror-theme-solarized-light");
  var import_codemirror_theme_dracula = __require("@fsegurai/codemirror-theme-dracula");
  var import_codemirror_theme_material_dark = __require("@fsegurai/codemirror-theme-material-dark");
  var import_codemirror_theme_monokai = __require("@fsegurai/codemirror-theme-monokai");
  var import_autocomplete = __require("@codemirror/autocomplete");
  var import_language = __require("@codemirror/language");
  var import_lint = __require("@codemirror/lint");
  var import_matchbrackets = __require("@codemirror/matchbrackets");
  var import_jshint = __require("jshint");
  var import_js_beautify = __require("js-beautify");
  var CodeEditorManager = class {
    constructor(elements, state, config, gmApiDefinitions) {
      this.elements = elements;
      this.state = state;
      this.config = config;
      this.gmApiDefinitions = gmApiDefinitions;
      this.codeEditor = null;
      this.defaultSettings = {
        theme: "oneDark",
        fontSize: 14,
        tabSize: 2,
        lineNumbers: true,
        lineWrapping: false,
        matchBrackets: true,
        minimap: true
      };
      this.currentSettings = { ...this.defaultSettings };
      this.theme = new import_state.Compartment();
      this.lint = new import_state.Compartment();
      this.largeFileOptimized = false;
      this.LARGE_FILE_LINE_COUNT = 3e3;
      this.HUGE_FILE_LINE_COUNT = 1e4;
      this.LARGE_FILE_CHAR_COUNT = 2e5;
      this.HUGE_FILE_CHAR_COUNT = 8e5;
      this.currentPerfTier = "normal";
      this._perfCheckTimer = null;
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "local" && changes.editorSettings) {
          this.currentSettings = { ...this.defaultSettings, ...changes.editorSettings.newValue };
          this.applySettings(this.currentSettings);
        }
      });
    }
    async initializeCodeEditor() {
      if (!this.elements.codeEditor) {
        throw new Error("Code editor element not found");
      }
      await this.loadSettings();
      const startState = import_state.EditorState.create({
        doc: this.elements.codeEditor.value,
        extensions: [
          import_codemirror.basicSetup,
          (0, import_lang_javascript.javascript)(),
          this.getEditorKeybindings(),
          (0, import_view.lineNumbers)(),
          (0, import_view.gutter)({ class: "cm-gutters" }),
          this.theme.of(import_theme_one_dark.oneDark),
          this.lint.of((0, import_lint.linter)(this.getLintOptions(true, this.getEnabledGmApis()))),
          (0, import_autocomplete.autocompletion)(),
          (0, import_language.foldGutter)(),
          (0, import_lint.lintGutter)(),
          (0, import_matchbrackets.matchBrackets)(),
          import_view.EditorView.lineWrapping,
          import_view.EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.onChangeCallback?.();
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
      this.codeEditor = new import_view.EditorView({
        state: startState,
        parent: this.elements.codeEditor.parentElement
      });
      this.elements.codeEditor.style.display = "none";
      this.applyLargeFileOptimizations();
      this.setupEditorEventHandlers();
      this.updateEditorLintAndAutocomplete();
      this.state.codeEditor = this.codeEditor;
      this.applySettings(this.currentSettings);
      return this.codeEditor;
    }
    applyLargeFileOptimizations() {
      if (!this.codeEditor)
        return;
      const lineCount = this.codeEditor.state.doc.lines;
      const charCount = this.codeEditor.state.doc.length;
      let nextTier = "normal";
      if (lineCount >= this.HUGE_FILE_LINE_COUNT || charCount >= this.HUGE_FILE_CHAR_COUNT) {
        nextTier = "huge";
      } else if (lineCount >= this.LARGE_FILE_LINE_COUNT || charCount >= this.LARGE_FILE_CHAR_COUNT) {
        nextTier = "large";
      }
      if (nextTier !== this.currentPerfTier) {
        this.applyPerformanceTier(nextTier);
      }
    }
    applyPerformanceTier(tier) {
      if (!this.codeEditor)
        return;
      this.currentPerfTier = tier;
      this.largeFileOptimized = tier !== "normal";
      this.updatePerfBadge(tier);
    }
    updatePerfBadge(tier) {
      try {
        const el = document.getElementById("perfTierBadge");
        if (!el)
          return;
        el.classList.remove("tier-large", "tier-huge");
        const lineCount = this.codeEditor?.state.doc.lines ?? 0;
        const charCount = this.codeEditor?.state.doc.length ?? 0;
        const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if (tier === "normal") {
          el.classList.add("hidden");
          el.textContent = "";
          el.title = "";
        } else if (tier === "large") {
          el.classList.remove("hidden");
          el.classList.add("tier-large");
          el.textContent = "Optimized: lint/minimap off";
          el.title = `Large file detected (lines: ${fmt(lineCount)}, chars: ${fmt(charCount)}). Disabled: linting, minimap, code folding, match brackets, trailing spaces, auto-close brackets. Polling slowed.`;
        } else if (tier === "huge") {
          el.classList.remove("hidden");
          el.classList.add("tier-huge");
          el.textContent = "Optimized: gutters/line# off";
          el.title = `Huge file detected (lines: ${fmt(lineCount)}, chars: ${fmt(charCount)}). Disabled: linting, minimap, code folding, match brackets, trailing spaces, auto-close brackets, gutters & line numbers. Polling greatly reduced.`;
        }
      } catch {
      }
    }
    getEditorKeybindings() {
      return import_view.keymap.of([
        ...import_commands.defaultKeymap,
        import_commands.indentWithTab,
        { key: "Ctrl-s", run: () => {
          this.onSaveCallback?.();
          return true;
        } },
        { key: "Cmd-s", run: () => {
          this.onSaveCallback?.();
          return true;
        } },
        { key: "Alt-f", run: () => {
          this.formatCode(true);
          return true;
        } },
        { key: "F11", run: (view) => {
          if (view.dom.requestFullscreen) {
            view.dom.requestFullscreen();
          }
          return true;
        } },
        { key: "Escape", run: (view) => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          return true;
        } }
      ]);
    }
    toggleMinimap(cm) {
    }
    loadSettings() {
      return new Promise((resolve) => {
        chrome.storage.local.get(["editorSettings"], (result) => {
          if (result.editorSettings) {
            this.currentSettings = { ...this.defaultSettings, ...result.editorSettings };
          } else {
            this.currentSettings = { ...this.defaultSettings };
          }
          resolve(this.currentSettings);
        });
      });
    }
    saveSettings(settings) {
      this.currentSettings = { ...this.currentSettings, ...settings };
      chrome.storage.local.set({ editorSettings: this.currentSettings });
      this.applySettings(settings);
    }
    applySettings(settings) {
      if (!this.codeEditor)
        return;
      const themeMap = {
        oneDark: import_theme_one_dark.oneDark,
        solarizedDark: import_codemirror_theme_solarized_dark.solarizedDark,
        solarizedLight: import_codemirror_theme_solarized_light.solarizedLight,
        dracula: import_codemirror_theme_dracula.dracula,
        materialDark: import_codemirror_theme_material_dark.materialDark,
        monokai: import_codemirror_theme_monokai.monokai
      };
      if (settings.theme && themeMap[settings.theme]) {
        this.codeEditor.dispatch({
          effects: this.theme.reconfigure(themeMap[settings.theme])
        });
      }
    }
    resetToDefaultSettings() {
      this.saveSettings({ ...this.defaultSettings });
      return { ...this.defaultSettings };
    }
    parseUserScriptHeader(content) {
      return parseUserScriptMetadata(content);
    }
    async handlePaste(event) {
      if (!this.onImportCallback)
        return;
      try {
        const clipboardData = event.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData("text/plain");
        if (pastedText.includes("==UserScript==") && pastedText.includes("==/UserScript==")) {
          const metadata = this.parseUserScriptHeader(pastedText);
          if (metadata) {
            event.preventDefault();
            const shouldImport = confirm("This looks like a UserScript. Would you like to import its metadata?");
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
        console.error("Error handling paste:", error);
      }
    }
    setupEditorEventHandlers() {
      this.codeEditor.dom.addEventListener("paste", (event) => this.handlePaste(event));
    }
    getEnabledGmApis() {
      return Object.values(this.gmApiDefinitions).filter((api) => this.elements[api.el] && this.elements[api.el].checked).map((api) => api.name);
    }
    updateEditorLintAndAutocomplete() {
      if (!this.codeEditor)
        return;
      const enabledApiNames = this.getEnabledGmApis();
      const lintOptions = this.getLintOptions(
        this.state.lintingEnabled,
        enabledApiNames
      );
      this.codeEditor.dispatch({
        effects: this.lint.reconfigure((0, import_lint.linter)(lintOptions))
      });
    }
    getLintOptions(enable, enabledApiNames = []) {
      if (!enable)
        return () => [];
      const globals = {
        chrome: false,
        CodeMirror: false,
        GM: false
      };
      enabledApiNames.forEach((name) => {
        globals[name] = false;
      });
      return (view) => {
        (0, import_jshint.JSHINT)(view.state.doc.toString(), {
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
          globals
        });
        return import_jshint.JSHINT.errors.map((err) => ({
          from: view.state.doc.line(err.line).from + err.character - 1,
          to: view.state.doc.line(err.line).from + err.character,
          message: err.reason,
          severity: err.code?.startsWith("E") ? "error" : "warning"
        }));
      };
    }
    toggleLinting(enabled) {
      this.state.lintingEnabled = enabled;
      this.updateEditorLintAndAutocomplete();
      localStorage.setItem("lintingEnabled", this.state.lintingEnabled);
      return this.state.lintingEnabled;
    }
    async formatCode(showMessage = true, onFormatComplete) {
      try {
        if (!this.codeEditor) {
          throw new Error("Code editor not initialized");
        }
        const unformattedCode = this.getValue();
        const formattedCode = (0, import_js_beautify.js_beautify)(unformattedCode, {
          indent_size: 2,
          space_in_empty_paren: true
        });
        this.setValue(formattedCode);
        if (showMessage && this.onStatusCallback) {
          this.onStatusCallback("Code formatted", "success");
          setTimeout(
            () => this.onStatusCallback(null),
            this.config.STATUS_TIMEOUT
          );
        }
        if (typeof onFormatComplete === "function") {
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
      this.setValue(wrappedCode);
      this.formatCode(false);
    }
    insertDefaultTemplate() {
      const defaultCode = `(function() {
    'use strict';
    
    // Your code here...
    console.log('CodeTweak: Custom script is running!');
  
  })();`;
      this.setValue(defaultCode);
      this.formatCode(false);
    }
    getValue() {
      return this.codeEditor ? this.codeEditor.state.doc.toString() : "";
    }
    setValue(code) {
      if (this.codeEditor) {
        this.codeEditor.dispatch({
          changes: { from: 0, to: this.codeEditor.state.doc.length, insert: code }
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
  };
})();
