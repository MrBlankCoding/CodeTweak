/* global showNotification */
import { setupGreasyfork } from "./dashboard-greasyfork.js";
import {
  loadScripts,
  loadSettings,
  saveSettings,
  filterScripts,
} from "./dashboard-logic.js";
import { setupTabs, setupAboutNav } from "./dashboard-ui.js";
import { parseUserScriptMetadata } from "../utils/metadataParser.js";

function initDashboard() {
  const elements = {
    createScriptBtn: document.getElementById("createScriptBtn"),
    scriptsTable: document.getElementById("scriptsTable"),
    scriptsList: document.getElementById("scriptsList"),
    emptyState: document.getElementById("emptyState"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    exportAllBtn: document.getElementById("exportAllBtn"),
    tabs: document.querySelector(".tabs"),
    tabContents: document.querySelectorAll(".tab-content"),
    emptyStateCreateBtn: document.getElementById("emptyStateCreateBtn"),
    filters: {
      scriptSearch: document.getElementById("scriptSearch"),
      websiteFilter: document.getElementById("websiteFilter"),
      statusFilter: document.getElementById("statusFilter"),
      runAtFilter: document.getElementById("runAtFilter"),
    },
    settings: {
      enableAllScripts: document.getElementById("enableAllScripts"),
      showNotifications: document.getElementById("showNotifications"),
      darkMode: document.getElementById("darkMode"),
    },
    greasyfork: {
      button: document.getElementById("greasyforkBtn"),
      modal: document.getElementById("greasyforkModal"),
      closeBtn: document.querySelector(".modal-close"),
      searchInput: document.getElementById("greasyforkSearch"),
      searchBtn: document.getElementById("greasyforkSearchBtn"),
      results: document.getElementById("greasyforkResults"),
      loading: document.getElementById("greasyforkLoading"),
    },
  };

  const state = {
    allScripts: [], // This will be populated by loadScripts
  };

  setupEventListeners(elements, state);
  loadScripts(elements, state);
  loadSettings(elements.settings);
  setupTabs(elements.tabs, elements.tabContents);
  // about tab sidebar
  setupAboutNav(document.querySelector("#about-tab .about-container"));
  setupGreasyfork(elements.greasyfork);
  setupFileDragAndDrop();

  // Listen for runtime messages to reflect updates from other parts of the extension
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "scriptsUpdated") {
      showNotification("Dashboard refreshed", "success");
      // reload scripts while preserving filters
      loadScripts(elements, state);
    } else if (message.action === "settingsUpdated") {
      showNotification("Settings updated", "success");
    }
  });
}

function setupEventListeners(elements, state) {
  elements.createScriptBtn?.addEventListener("click", () => {
    window.location.href = "/editor.html";
  });

  elements.emptyStateCreateBtn?.addEventListener("click", () => {
    window.location.href = "/editor.html";
  });

  elements.saveSettingsBtn?.addEventListener("click", () =>
    saveSettings(elements.settings)
  );

  elements.resetSettingsBtn?.addEventListener("click", () => {
    showNotification("Settings reset to defaults", "success");
  });

  // bulk export
  elements.exportAllBtn?.addEventListener("click", exportAllScripts);

  elements.filters.scriptSearch?.addEventListener(
    "input",
    debounce(() => filterScripts(elements, state), 300)
  );

  const filterChangeHandler = () => filterScripts(elements, state);
  elements.filters.websiteFilter?.addEventListener(
    "change",
    filterChangeHandler
  );
  elements.filters.statusFilter?.addEventListener(
    "change",
    filterChangeHandler
  );
  elements.filters.runAtFilter?.addEventListener("change", filterChangeHandler);
}

function setupFileDragAndDrop() {
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((evt) => {
    document.addEventListener(evt, prevent, false);
  });

  document.addEventListener(
    "drop",
    async (e) => {
      prevent(e);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;

      const validFiles = files.filter((f) => {
        const ext = f.name.split(".").pop().toLowerCase();
        return ["js", "txt"].includes(ext);
      });

      if (!validFiles.length) {
        showNotification("Only .js and .txt files are supported", "warning");
        return;
      }

      try {
        const { scripts = [] } = await chrome.storage.local.get("scripts");
        for (const file of validFiles) {
          const code = await file.text();
          const metadata = parseUserScriptMetadata(code);

          const scriptData = {
            name:
              metadata.name ||
              file.name.replace(/\.(txt|js)$/i, "") ||
              "Imported Script",
            author: metadata.author || "Anonymous",
            description: metadata.description || "",
            version: metadata.version || "1.0.0",
            targetUrls: metadata.matches || ["*://*/*"],
            code,
            runAt: metadata.runAt || "document_end",
            enabled: true,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...(metadata.resources && { resources: metadata.resources }),
            ...(metadata.requires && { requires: metadata.requires }),
            ...(metadata.license && { license: metadata.license }),
            ...(metadata.icon && { icon: metadata.icon }),
          };

          if (metadata.gmApis) {
            Object.keys(metadata.gmApis).forEach((flag) => {
              scriptData[flag] = metadata.gmApis[flag];
            });
          }

          scripts.push(scriptData);
        }

        await chrome.storage.local.set({ scripts });
        chrome.runtime.sendMessage({ action: "scriptsUpdated" });
        showNotification("Scripts imported successfully", "success");

        // Refresh dashboard view
        window.location.reload();
      } catch (err) {
        console.error("Import failed:", err);
        showNotification("Failed to import scripts", "error");
      }
    },
    false
  );
}

async function exportAllScripts() {
  console.log("Exporting all scripts");
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    if (!scripts.length) {
      showNotification("No scripts to export", "warning");
      return;
    }
    for (const script of scripts) {
      const blob = new Blob([script.code], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const safeName = (script.name || "script")
        .replace(/[^a-z0-9\- _]/gi, "_")
        .replace(/\s+/g, "_");
      chrome.downloads.download({
        url,
        filename: `CodeTweak Export/${safeName}.user.js`,
        saveAs: false,
      });
    }
    showNotification("All scripts exported", "success");
  } catch (err) {
    console.error("Export failed", err);
    showNotification("Failed to export scripts", "error");
  }
}

function debounce(func, delay) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

document.addEventListener("DOMContentLoaded", initDashboard);