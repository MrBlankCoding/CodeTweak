document.addEventListener("DOMContentLoaded", () => {
  const THEMES = {
    LIGHT: "default",
    DARK: "ayu-dark",
  };

  const RUN_MODES = {
    ELEMENT_READY: "element_ready",
  };

  const DEFAULT_VERSION = "1.0.0";
  const SIDEBAR_BREAKPOINT = 900;
  const AUTOSAVE_DELAY = 1220;

  // cache dom
  const elements = Object.fromEntries([
    ["pageTitle", document.getElementById("pageTitle")],
    ["scriptName", document.getElementById("scriptName")],
    ["scriptAuthor", document.getElementById("scriptAuthor")],
    ["targetUrl", document.getElementById("targetUrl")],
    ["runAt", document.getElementById("runAt")],
    ["scriptVersion", document.getElementById("scriptVersion")],
    ["scriptDescription", document.getElementById("scriptDescription")],
    ["domAccess", document.getElementById("domAccess")],
    ["storageAccess", document.getElementById("storageAccess")],
    ["ajaxAccess", document.getElementById("ajaxAccess")],
    ["cookieAccess", document.getElementById("cookieAccess")],
    ["cspDisabled", document.getElementById("cspDisabled")],
    ["saveBtn", document.getElementById("saveBtn")],
    ["sidebarToggle", document.getElementById("sidebarToggle")],
    ["selectorContainer", document.getElementById("selectorContainer")],
    ["waitForSelector", document.getElementById("waitForSelector")],
    ["statusMessage", document.getElementById("statusMessage")],
    ["formatBtn", document.getElementById("formatBtn")],
    ["lintBtn", document.getElementById("lintBtn")],
    ["lintBtnText", document.getElementById("lintBtnText")],
    ["cursorInfo", document.getElementById("cursorInfo")],
    ["scriptStatusBadge", document.getElementById("scriptStatusBadge")],
    ["autosaveBtn", document.getElementById("autosaveBtn")],
    ["autosaveBtnText", document.getElementById("autosaveBtnText")],
    ["codeEditor", document.getElementById("codeEditor")],
  ]);

  // I got lazy.
  elements.sidebar = document.querySelector(".sidebar");
  elements.sectionToggles = document.querySelectorAll(".section-toggle");
  elements.mainContent = document.querySelector(".main-content");

  // Main state
  const state = {
    isEditMode: false,
    scriptId: null,
    isDarkMode: window.matchMedia("(prefers-color-scheme: dark)").matches,
    currentTheme: null,
    hasUnsavedChanges: false,
    isSidebarVisible: window.innerWidth > SIDEBAR_BREAKPOINT,
    lintingEnabled: localStorage.getItem("lintingEnabled") === "true",
    codeEditor: null,
    isAutosaveEnabled: localStorage.getItem("autosaveEnabled") === "true",
    autosaveTimeout: null,
    hasUserInteraction: false,
  };

  state.currentTheme = state.isDarkMode ? THEMES.DARK : THEMES.LIGHT;

  function init() {
    initDarkMode();
    setDefaultValues();
    initializeCodeEditor();
    parseUrlParams(); 
    setupEditorMode();
    initializeCollapsibleSections();
    updateSidebarState();
    registerEventListeners();
    setupBackgroundConnection();
    setTimeout(() => state.codeEditor?.focus(), 100);
  }

  function parseUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    state.scriptId = urlParams.get("id");
    const initialTargetUrl = urlParams.get("targetUrl");
    const template = urlParams.get("template");
    state.isEditMode = Boolean(state.scriptId);

    if (initialTargetUrl && elements.targetUrl) {
      elements.targetUrl.value = decodeURIComponent(initialTargetUrl);
      addUrlToList(decodeURIComponent(initialTargetUrl));
    }
    if (template) {
      const decodedTemplate = decodeURIComponent(template);
      state.codeEditor.setValue(`(function() {
  'use strict';
  
${decodedTemplate}

})();`);
      formatCode(false);
    } else if (!state.isEditMode && !state.codeEditor.getValue()) {
      insertDefaultTemplate();
    }
  }

  function setDefaultValues() {
    if (!elements.scriptVersion.value) {
      elements.scriptVersion.value = DEFAULT_VERSION;
    }
    elements.autosaveBtnText.textContent = `Autosave: ${
      state.isAutosaveEnabled ? "On" : "Off"
    }`;
    elements.lintBtnText.textContent = `Lint: ${
      state.lintingEnabled ? "On" : "Off"
    }`;
  }

  function initializeCodeEditor() {
    if (!elements.codeEditor) {
      console.error("Code editor element not found");
      return;
    }

    // Code mirror init
    state.codeEditor = CodeMirror.fromTextArea(elements.codeEditor, {
      mode: "javascript",
      theme: state.currentTheme,
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
      lint:
        typeof getLintOptions === "function"
          ? getLintOptions(state.lintingEnabled)
          : false,
      gutters: [
        "CodeMirror-linenumbers",
        "CodeMirror-foldgutter",
        "CodeMirror-lint-markers",
      ],
      extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-S": (cm) => {
          event.preventDefault(); 
          saveScript();
        },
        "Cmd-S": (cm) => {
          event.preventDefault();
          saveScript();
        },
        "Alt-F": (cm) => formatCode(true),
        F11: (cm) => cm.setOption("fullScreen", !cm.getOption("fullScreen")),
        Esc: (cm) => {
          if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
        },
        Tab: (cm) => {
          if (cm.somethingSelected()) {
            cm.indentSelection("add");
          } else {
            const spaces = " ".repeat(cm.getOption("indentUnit"));
            cm.replaceSelection(spaces, "end", "+input");
          }
        },
        "Ctrl-/": (cm) => cm.toggleComment({ indent: true }),
        "Cmd-/": (cm) => cm.toggleComment({ indent: true }),
      },
      scrollbarStyle: "simple",
    });
    state.codeEditor.on("cursorActivity", (cm) => {
      const cursor = cm.getCursor();
      if (elements.cursorInfo) {
        elements.cursorInfo.textContent = `Line: ${cursor.line + 1}, Col: ${
          cursor.ch + 1
        }`;
      }
    });

    state.codeEditor.on("change", () => {
      if (!state.hasUnsavedChanges) {
        markAsUnsaved();
      }

      if (state.isAutosaveEnabled && state.hasUserInteraction) {
        triggerAutosave();
      }
    });
  }

  function triggerAutosave() {
    if (state.autosaveTimeout) {
      clearTimeout(state.autosaveTimeout);
    }

    state.autosaveTimeout = setTimeout(() => {
      saveScript(true);
      state.autosaveTimeout = null;
    }, AUTOSAVE_DELAY);
  }

  function getLintOptions(enable) {
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

  function initializeCollapsibleSections() {
    elements.sectionToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        this.closest(".collapsible").classList.toggle("collapsed");
      });
    });
  }

  function updateSidebarState() {
    const { sidebar, mainContent } = elements;

    sidebar.classList.toggle("active", state.isSidebarVisible);

    if (window.innerWidth > SIDEBAR_BREAKPOINT) {
      mainContent.style.gridTemplateColumns = state.isSidebarVisible
        ? "280px 1fr"
        : "0 1fr";
    }
    setTimeout(() => state.codeEditor?.refresh(), 300);
  }

  function setupEditorMode() {
    elements.pageTitle.textContent = state.isEditMode
      ? "Edit UserScript"
      : "Create UserScript";

    if (state.isEditMode) {
      loadScript(state.scriptId);
    } else if (!state.codeEditor.getValue()) {
      insertDefaultTemplate();
    }

    const isElementReady = elements.runAt.value === RUN_MODES.ELEMENT_READY;
    elements.selectorContainer.style.display = isElementReady
      ? "block"
      : "none";
    elements.waitForSelector.required = isElementReady;

    updateScriptStatus();
  }

  function registerEventListeners() {
    const trackUserInteraction = () => {
      state.hasUserInteraction = true;
    };
    document.addEventListener("mousedown", trackUserInteraction, {
      once: true,
    });
    document.addEventListener("keydown", trackUserInteraction, { once: true });
    window.addEventListener("beforeunload", (e) => {
      if (state.hasUnsavedChanges && state.hasUserInteraction) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    });

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    //buttons
    elements.sidebarToggle.addEventListener("click", toggleSidebar);
    elements.lintBtn.addEventListener("click", toggleLinting);
    elements.saveBtn.addEventListener("click", saveScript);
    elements.formatBtn.addEventListener("click", () => formatCode(true));
    elements.autosaveBtn.addEventListener("click", toggleAutosave);

    // form
    elements.runAt.addEventListener("change", function () {
      const isElementReady = this.value === RUN_MODES.ELEMENT_READY;
      elements.selectorContainer.style.display = isElementReady
        ? "block"
        : "none";
      elements.waitForSelector.required = isElementReady;
      markAsUnsaved();
    });
    const formElements = [
      elements.scriptName,
      elements.scriptAuthor,
      elements.scriptVersion,
      elements.scriptDescription,
      elements.targetUrl,
      elements.waitForSelector,
      elements.domAccess,
      elements.storageAccess,
      elements.ajaxAccess,
      elements.cookieAccess,
      elements.cspDisabled,
    ];

    formElements.forEach((element) => {
      if (element) {
        element.addEventListener("change", markAsUnsaved);
      }
    });

    // CSP warning... (Need to comply with policy)
    elements.cspDisabled.addEventListener("change", function () {
      if (this.checked) {
        showStatusMessage(
          "Warning: Disabling CSP can expose the site to security vulnerabilities. Only use this if absolutely necessary.",
          "warning"
        );
        setTimeout(clearStatusMessage, 5000);
      } else {
        clearStatusMessage();
        // notif background
        const urls = Array.from(document.querySelectorAll(".url-item")).map(
          (item) => item.dataset.url
        );

        urls.forEach((url) => {
          chrome.runtime.sendMessage({
            action: "cspStateChanged",
            data: { url, enabled: false },
          });
        });
      }
    });
    document.getElementById("addUrlBtn").addEventListener("click", () => {
      const url = elements.targetUrl.value.trim();
      if (url) {
        addUrlToList(url);
      }
    });

    document.getElementById("urlList").addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-url-btn")) {
        e.target.closest(".url-item").remove();
        markAsUnsaved();
      }
    });
    // Handle Enter key for adding URLS (We all like our shortcuts)
    elements.targetUrl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = elements.targetUrl.value.trim();
        if (url) {
          addUrlToList(url);
        }
      }
    });
  }

  function handleDocumentClick(event) {
    if (
      window.innerWidth <= SIDEBAR_BREAKPOINT &&
      elements.sidebar.classList.contains("active") &&
      !elements.sidebar.contains(event.target) &&
      event.target !== elements.sidebarToggle
    ) {
      state.isSidebarVisible = false;
      updateSidebarState();
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveScript();
    }
    // Toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      toggleSidebar(e);
    }
  }

  function toggleSidebar(e) {
    if (e) e.stopPropagation();
    state.isSidebarVisible = !state.isSidebarVisible;
    updateSidebarState();
  }

  function toggleLinting() {
    state.lintingEnabled = !state.lintingEnabled;
    state.codeEditor.setOption("lint", getLintOptions(state.lintingEnabled));
    elements.lintBtnText.textContent = `Lint: ${
      state.lintingEnabled ? "On" : "Off"
    }`;
    localStorage.setItem("lintingEnabled", state.lintingEnabled);
  }

  function toggleAutosave() {
    state.isAutosaveEnabled = !state.isAutosaveEnabled;
    elements.autosaveBtnText.textContent = `Autosave: ${
      state.isAutosaveEnabled ? "On" : "Off"
    }`;
    localStorage.setItem("autosaveEnabled", state.isAutosaveEnabled);
  }

  function markAsUnsaved() {
    state.hasUnsavedChanges = true;
    updateScriptStatus();
  }

  function insertDefaultTemplate() {
    state.codeEditor.setValue(`(function() {
  'use strict';
  
  // Your code here...
  console.log('CodeTweak: Custom script is running!');

})();`);

    formatCode(false);
  }

  function generateUniqueId() {
    return `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .substring(2)}`;
  }

  async function loadScript(id) {
    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      const script = scripts.find((s) => s.id === id);

      if (!script) {
        showStatusMessage("Script not found.", "error");
        return;
      }

      elements.scriptName.value = script.name || "";
      elements.scriptAuthor.value = script.author || "";
      if (Array.isArray(script.targetUrls)) {
        script.targetUrls.forEach((url) => addUrlToList(url));
      } else if (script.targetUrl) {
        // legacy support
        addUrlToList(script.targetUrl);
      }

      elements.runAt.value = script.runAt || "document_idle";
      elements.scriptVersion.value = script.version || DEFAULT_VERSION;
      elements.scriptDescription.value = script.description || "";
      state.codeEditor.setValue(script.code || "");

      const permissions = script.permissions || {};
      elements.domAccess.checked = permissions.domAccess ?? true;
      elements.storageAccess.checked = permissions.storageAccess ?? false;
      elements.ajaxAccess.checked = permissions.ajaxAccess ?? false;
      elements.cookieAccess.checked = permissions.cookieAccess ?? false;
      elements.cspDisabled.checked = permissions.cspDisabled ?? false; // Add this line

      if (script.runAt === RUN_MODES.ELEMENT_READY) {
        elements.selectorContainer.style.display = "block";
        elements.waitForSelector.value = script.waitForSelector || "";
      }

      state.hasUnsavedChanges = false;
      updateScriptStatus();
    } catch (error) {
      console.error("Error loading script:", error);
      showStatusMessage(`Failed to load script: ${error.message}`, "error");
    }
  }

  function validateForm() {
    if (!elements.scriptName.value.trim()) {
      showStatusMessage("Please enter a script name.", "error");
      return false;
    }
    const urlList = Array.from(document.querySelectorAll(".url-item")).map(
      (item) => item.dataset.url
    );
    const currentUrl = elements.targetUrl.value.trim();

    if (urlList.length === 0 && !currentUrl) {
      showStatusMessage("Please add at least one target URL.", "error");
      return false;
    }

    if (
      elements.runAt.value === RUN_MODES.ELEMENT_READY &&
      !elements.waitForSelector.value.trim()
    ) {
      showStatusMessage("Please specify an element selector.", "error");
      return false;
    }

    // another CSP warning
    if (elements.cspDisabled.checked) {
      if (
        !confirm(
          "Warning: Disabling CSP can expose the site to security vulnerabilities. Are you sure you want to continue?"
        )
      ) {
        return false;
      }
    }

    return true;
  }

  function gatherScriptData() {
    const urlList = Array.from(document.querySelectorAll(".url-item")).map(
      (item) => item.dataset.url
    );
    const currentUrl = elements.targetUrl.value.trim();
    if (currentUrl && !urlList.includes(currentUrl)) {
      urlList.push(currentUrl);
    }

    const scriptData = {
      name: elements.scriptName.value.trim(),
      author: elements.scriptAuthor.value.trim() || "Anonymous",
      targetUrls: urlList,
      runAt: elements.runAt.value,
      version: elements.scriptVersion.value.trim() || DEFAULT_VERSION,
      description: elements.scriptDescription.value.trim(),
      code: state.codeEditor.getValue(),
      enabled: true,
      permissions: {
        domAccess: elements.domAccess.checked,
        storageAccess: elements.storageAccess.checked,
        ajaxAccess: elements.ajaxAccess.checked,
        cookieAccess: elements.cookieAccess.checked,
        cspDisabled: elements.cspDisabled.checked,
      },
      updatedAt: new Date().toISOString(),
    };

    if (elements.runAt.value === RUN_MODES.ELEMENT_READY) {
      scriptData.waitForSelector = elements.waitForSelector.value.trim();
    }

    return scriptData;
  }

  async function saveScript(quiet = false) {
    try {
      if (!validateForm()) return;

      const scriptData = gatherScriptData();
      const { scripts = [] } = await chrome.storage.local.get("scripts");

      if (state.isEditMode && state.scriptId) {
        const scriptIndex = scripts.findIndex((s) => s.id === state.scriptId);
        if (scriptIndex !== -1) {
          scriptData.id = state.scriptId;
          scriptData.createdAt =
            scripts[scriptIndex].createdAt || scriptData.updatedAt;
          scripts[scriptIndex] = scriptData;
        } else {
          if (!quiet) showStatusMessage("Script not found.", "error");
          return;
        }
      } else {
        scriptData.id = generateUniqueId();
        scriptData.createdAt = scriptData.updatedAt;
        scripts.push(scriptData);
      }

      await chrome.storage.local.set({ scripts });

      // Notify bg. (This code is cauing some weird behavior, need to investigate)
      try {
        const port = chrome.runtime.connect({ name: "CodeTweak" });
        await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "scriptsUpdated" },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "Background sync warning:",
                  chrome.runtime.lastError
                );
                // Continue 
              }
              resolve();
            }
          );
        });
      } catch (error) {
        // Log 
        console.warn("Background sync warning:", error);
      }
      if (!state.isEditMode) {
        state.isEditMode = true;
        state.scriptId = scriptData.id;
        window.history.replaceState({}, "", `editor.html?id=${scriptData.id}`);
      }

      state.hasUnsavedChanges = false;
      updateScriptStatus();

      if (!quiet) {
        showStatusMessage("Script saved successfully!", "success");
        setTimeout(clearStatusMessage, 2000);
      }
    } catch (error) {
      console.error("Error saving script:", error);
      if (!quiet) {
        showStatusMessage(`Failed to save script: ${error.message}`, "error");
      }
    }
  }

  function formatCode(showMessage = true) {
    try {
      const unformattedCode = state.codeEditor.getValue();

      const formattedCode = js_beautify(unformattedCode, {
        indent_size: 2,
        space_in_empty_paren: true,
      });

      state.codeEditor.setValue(formattedCode);

      if (showMessage) {
        showStatusMessage("Code formatted", "success");
        setTimeout(clearStatusMessage, 2000);
      }
    } catch (error) {
      console.error("Error formatting code:", error);
      if (showMessage) {
        showStatusMessage("Could not format code", "error");
      }
    }
  }

  function updateScriptStatus() {
    const badge = elements.scriptStatusBadge;

    if (state.hasUnsavedChanges) {
      badge.textContent = "Unsaved Changes";
      badge.style.backgroundColor = state.isDarkMode ? "#4B5563" : "#F3F4F6";
      badge.style.color = state.isDarkMode ? "#D1D5DB" : "#4B5563";
    } else {
      badge.textContent = "Saved";
      badge.style.backgroundColor = state.isDarkMode ? "#065F46" : "#D1FAE5";
      badge.style.color = state.isDarkMode ? "#A7F3D0" : "#065F46";
    }
  }

  function showStatusMessage(message, type = "success") {
    const { statusMessage } = elements;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = "block";
  }

  function clearStatusMessage() {
    const { statusMessage } = elements;
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
    statusMessage.style.display = "none";
  }

  function addUrlToList(url) {
    const urlList = document.getElementById("urlList");
    const urlItem = document.createElement("div");
    urlItem.className = "url-item";
    urlItem.dataset.url = url;
    urlItem.innerHTML = `
      <span>${url}</span>
      <button type="button" class="remove-url-btn">×</button>
    `;
    urlList.appendChild(urlItem);
    elements.targetUrl.value = "";
    markAsUnsaved();
  }

  function setupBackgroundConnection() {
    try {
      const port = chrome.runtime.connect({ name: "CodeTweak" });
      port.onDisconnect.addListener(() => {
        console.log("Background connection closed, will reconnect when needed");
      });
    } catch (error) {
      console.warn("Initial background connection failed:", error);
    }
  }

  init();
});
