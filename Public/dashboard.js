import { setupGreasyfork } from "./dashboard/dashboard-greasyfork.js";
import {
  loadScripts,
  loadSettings,
  saveSettings,
  filterScripts,
} from "./dashboard/dashboard-logic.js";
import { setupTabs } from "./dashboard/dashboard-ui.js";

function initDashboard() {
  const elements = {
    createScriptBtn: document.getElementById("createScriptBtn"),
    scriptsTable: document.getElementById("scriptsTable"),
    scriptsList: document.getElementById("scriptsList"),
    emptyState: document.getElementById("emptyState"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
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
  setupGreasyfork(elements.greasyfork);
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