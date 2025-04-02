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

  // Cache DOM elements using object destructuring for cleaner access
  const elements = Object.fromEntries(
    [
      "pageTitle",
      "scriptName",
      "targetUrl",
      "runAt",
      "scriptVersion",
      "scriptDescription",
      "domAccess",
      "storageAccess",
      "ajaxAccess",
      "cookieAccess",
      "cspDisabled", // Add this line
      "saveBtn",
      "sidebarToggle",
      "selectorContainer",
      "waitForSelector",
      "statusMessage",
      "formatBtn",
      "lintBtn",
      "lintBtnText",
      "cursorInfo",
      "scriptStatusBadge",
      "autosaveBtn",
      "autosaveBtnText",
    ].map((id) => [id, document.getElementById(id)])
  );

  // Additional DOM elements that don't follow the ID pattern
  elements.sidebar = document.querySelector(".sidebar");
  elements.sectionToggles = document.querySelectorAll(".section-toggle");
  elements.mainContent = document.querySelector(".main-content");

  // State management with default values from localStorage
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
    hasUserInteraction: false, // Add this line
  };

  // Set initial theme based on system preference
  state.currentTheme = state.isDarkMode ? THEMES.DARK : THEMES.LIGHT;

  function init() {
    initDarkMode();
    setDefaultValues();
    initializeCodeEditor();
    parseUrlParams(); // Move this after editor initialization
    setupEditorMode();
    initializeCollapsibleSections();
    updateSidebarState();
    registerEventListeners();
    setupBackgroundConnection();

    // Focus editor after initialization
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
      addUrlToList(decodeURIComponent(initialTargetUrl)); // Auto-add the URL to the list
    }

    // Now we can safely set the template because the editor is initialized
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

    // Set initial button states
    elements.autosaveBtnText.textContent = `Autosave: ${
      state.isAutosaveEnabled ? "On" : "Off"
    }`;
    elements.lintBtnText.textContent = `Lint: ${
      state.lintingEnabled ? "On" : "Off"
    }`;
  }

  function initializeCodeEditor() {
    const editor = CodeMirror.fromTextArea(
      document.getElementById("codeEditor"),
      {
        mode: "javascript",
        theme: state.isDarkMode ? THEMES.DARK : THEMES.LIGHT,
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        foldGutter: true,
        lint: getLintOptions(state.lintingEnabled),
        gutters: [
          "CodeMirror-linenumbers",
          "CodeMirror-foldgutter",
          "CodeMirror-lint-markers",
        ],
        extraKeys: {
          "Ctrl-Space": "autocomplete",
          "Ctrl-S": saveScript,
          F11: (cm) => cm.setOption("fullScreen", !cm.getOption("fullScreen")),
          Esc: (cm) => {
            if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
          },
        },
      }
    );

    // Theme change observer using MutationObserver
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
          const theme = document.documentElement.getAttribute("data-theme");
          editor.setOption(
            "theme",
            theme === "dark" ? THEMES.DARK : THEMES.LIGHT
          );
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Editor event listeners
    editor.on("cursorActivity", (cm) => {
      const cursor = cm.getCursor();
      elements.cursorInfo.textContent = `Line: ${cursor.line + 1}, Col: ${
        cursor.ch + 1
      }`;
    });

    editor.on("change", () => {
      if (!state.hasUnsavedChanges) {
        markAsUnsaved();
      }

      if (state.isAutosaveEnabled) {
        triggerAutosave();
      }
    });

    state.codeEditor = editor;
    return editor;
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

    // Refresh editor after sidebar animation completes
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
    // Add user interaction tracking
    const trackUserInteraction = () => {
      state.hasUserInteraction = true;
    };

    // Track interactions on form elements and editor
    document.addEventListener("mousedown", trackUserInteraction, {
      once: true,
    });
    document.addEventListener("keydown", trackUserInteraction, { once: true });

    // Global events
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

    // Button events
    elements.sidebarToggle.addEventListener("click", toggleSidebar);
    elements.lintBtn.addEventListener("click", toggleLinting);
    elements.saveBtn.addEventListener("click", saveScript);
    elements.formatBtn.addEventListener("click", () => formatCode(true));
    elements.autosaveBtn.addEventListener("click", toggleAutosave);

    // Form element events
    elements.runAt.addEventListener("change", function () {
      const isElementReady = this.value === RUN_MODES.ELEMENT_READY;
      elements.selectorContainer.style.display = isElementReady
        ? "block"
        : "none";
      elements.waitForSelector.required = isElementReady;
      markAsUnsaved();
    });

    // Add change listeners to all form elements
    const formElements = [
      elements.scriptName,
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

    // Add CSP warning
    elements.cspDisabled.addEventListener("change", function () {
      if (this.checked) {
        showStatusMessage(
          "Warning: Disabling CSP can expose the site to security vulnerabilities. Only use this if absolutely necessary.",
          "warning"
        );
        setTimeout(clearStatusMessage, 5000);
      } else {
        clearStatusMessage();
      }
    });

    // Add URL list management
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

    // Add keyboard support for URL input
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
    // Save shortcut (Ctrl+S or Command+S)
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveScript();
    }

    // Toggle sidebar shortcut (Ctrl+B or Command+B)
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
  console.log('Scripty: Custom script is running!');

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

      // Handle multiple URLs
      if (Array.isArray(script.targetUrls)) {
        script.targetUrls.forEach((url) => addUrlToList(url));
      } else if (script.targetUrl) {
        // Handle legacy single URL format
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

    // Check for URLs in both the list and current input
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

    // Add confirmation for CSP disable
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
    // Get all URLs from the list
    const urlList = Array.from(document.querySelectorAll(".url-item")).map(
      (item) => item.dataset.url
    );
    // Add current URL if not empty
    const currentUrl = elements.targetUrl.value.trim();
    if (currentUrl && !urlList.includes(currentUrl)) {
      urlList.push(currentUrl);
    }

    const scriptData = {
      name: elements.scriptName.value.trim(),
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
        cspDisabled: elements.cspDisabled.checked, // Add this line
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

      // Notify background script with improved error handling
      try {
        const port = chrome.runtime.connect({ name: "scripty" });
        await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "scriptsUpdated" },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "Background sync warning:",
                  chrome.runtime.lastError
                );
                // Continue anyway as this is not critical
              }
              resolve();
            }
          );
        });
      } catch (error) {
        // Log but don't block saving
        console.warn("Background sync warning:", error);
      }

      // Update URL if this was a new script
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
      state.codeEditor.operation(() => {
        for (let i = 0; i < state.codeEditor.lineCount(); i++) {
          state.codeEditor.indentLine(i);
        }
      });

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
      const port = chrome.runtime.connect({ name: "scripty" });
      port.onDisconnect.addListener(() => {
        console.log("Background connection closed, will reconnect when needed");
      });
    } catch (error) {
      console.warn("Initial background connection failed:", error);
    }
  }

  init();
});
