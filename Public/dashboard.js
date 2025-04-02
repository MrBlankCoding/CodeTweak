document.addEventListener("DOMContentLoaded", initDashboard);

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
      debugMode: document.getElementById("debugMode"),
      allowThirdPartyScripts: document.getElementById("allowThirdPartyScripts"),
      confirmBeforeRunning: document.getElementById("confirmBeforeRunning"),
    },
    import: {
      importBtn: document.getElementById("importBtn"),
      importInput: document.getElementById("importInput"),
    },
  };

  const state = {
    allScripts: [],
    debouncedFilterTimer: null,
  };

  setupEventListeners(elements, state);
  loadScripts(elements, state);
  loadSettings(elements.settings);
  setupTabs(elements.tabs, elements.tabContents);
  initDarkMode();
}

function setupEventListeners(elements, state) {
  // Navigation
  elements.createScriptBtn.addEventListener("click", () => {
    window.location.href = "/editor.html";
  });

  elements.emptyStateCreateBtn?.addEventListener("click", () => {
    window.location.href = "/editor.html";
  });

  // Settings
  elements.saveSettingsBtn.addEventListener("click", () =>
    saveSettings(elements.settings)
  );

  // Filters
  elements.filters.scriptSearch.addEventListener(
    "input",
    debounce(() => filterScripts(elements, state), 300)
  );

  const filterChangeHandler = () => filterScripts(elements, state);
  elements.filters.websiteFilter.addEventListener(
    "change",
    filterChangeHandler
  );
  elements.filters.statusFilter.addEventListener("change", filterChangeHandler);
  elements.filters.runAtFilter.addEventListener("change", filterChangeHandler);

  // Import
  elements.import.importBtn.addEventListener("click", () => {
    elements.import.importInput.click();
  });

  elements.import.importInput.addEventListener("change", (event) => {
    handleScriptImport(event, elements, state);
  });
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

function setupTabs(tabsContainer, tabContents) {
  if (!tabsContainer) return;

  const tabs = tabsContainer.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });

      tabContents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      const tabId = `${tab.getAttribute("data-tab")}-tab`;
      document.getElementById(tabId)?.classList.add("active");
    });
  });
}

async function loadScripts(elements, state) {
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    // Convert legacy scripts to use targetUrls array
    state.allScripts = scripts.map((script) => ({
      ...script,
      targetUrls:
        script.targetUrls || (script.targetUrl ? [script.targetUrl] : []),
    }));

    updateWebsiteFilterOptions(
      state.allScripts,
      elements.filters.websiteFilter
    );
    filterScripts(elements, state);
  } catch (error) {
    console.error("Error loading scripts:", error);
    showNotification("Error loading scripts", "error");
  }
}

function updateWebsiteFilterOptions(scripts, websiteFilter) {
  try {
    const websites = new Set();

    for (const script of scripts) {
      for (const url of script.targetUrls) {
        try {
          websites.add(new URL(url).hostname);
        } catch {
          websites.add(url);
        }
      }
    }

    websiteFilter.innerHTML = '<option value="">All Websites</option>';

    Array.from(websites)
      .sort()
      .forEach((website) => {
        const option = document.createElement("option");
        option.value = website;
        option.textContent = website;
        websiteFilter.appendChild(option);
      });
  } catch (error) {
    console.error("Error updating website filter options:", error);
  }
}

function filterScripts(elements, state) {
  const searchTerm = elements.filters.scriptSearch.value.toLowerCase();
  const websiteValue = elements.filters.websiteFilter.value;
  const statusValue = elements.filters.statusFilter.value;
  const runAtValue = elements.filters.runAtFilter.value;

  const filteredScripts = state.allScripts.filter((script) => {
    if (!script.name.toLowerCase().includes(searchTerm)) return false;

    if (websiteValue) {
      const matchesWebsite = script.targetUrls.some((url) => {
        try {
          return new URL(url).hostname === websiteValue;
        } catch {
          return url === websiteValue;
        }
      });
      if (!matchesWebsite) return false;
    }

    if (statusValue) {
      const isEnabled = statusValue === "enabled";
      if (script.enabled !== isEnabled) return false;
    }

    if (runAtValue && script.runAt !== runAtValue) return false;

    return true;
  });

  updateScriptsList(filteredScripts, elements);
}

function updateScriptsList(scripts, elements) {
  elements.scriptsList.innerHTML = "";

  if (scripts.length === 0) {
    elements.scriptsTable.style.display = "none";
    elements.emptyState.style.display = "block";
    return;
  }

  elements.scriptsTable.style.display = "table";
  elements.emptyState.style.display = "none";

  const fragment = document.createDocumentFragment();
  scripts.forEach((script) => {
    fragment.appendChild(createScriptRow(script));
  });

  elements.scriptsList.appendChild(fragment);
}

function createScriptRow(script) {
  const row = document.createElement("tr");
  row.dataset.scriptId = script.id;

  // Status cell with toggle
  const statusCell = document.createElement("td");
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle-switch";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = script.enabled;
  toggleInput.addEventListener("change", () =>
    toggleScript(script.id, toggleInput.checked)
  );

  const slider = document.createElement("span");
  slider.className = "slider";

  toggleLabel.append(toggleInput, slider);
  statusCell.appendChild(toggleLabel);

  // Name cell
  const nameCell = document.createElement("td");
  nameCell.textContent = script.name;

  // Favicon cell
  const faviconCell = document.createElement("td");
  const faviconContainer = document.createElement("div");
  faviconContainer.className = "favicon-container";
  // Handle multiple favicons
  const uniqueHosts = new Set();
  script.targetUrls?.forEach((url) => {
    try {
      const hostname = new URL(url).hostname;
      if (!uniqueHosts.has(hostname)) {
        uniqueHosts.add(hostname);
        const faviconWrapper = document.createElement("div");
        faviconWrapper.className = "favicon-wrapper";
        faviconWrapper.title = hostname;

        const faviconImg = document.createElement("img");
        faviconImg.src = `https://${hostname}/favicon.ico`;
        faviconImg.alt = "";
        faviconImg.className = "favicon";
        faviconImg.onerror = function () {
          this.parentElement.innerHTML = `<div class='favicon-fallback'>${hostname[0].toUpperCase()}</div>`;
        };

        faviconWrapper.appendChild(faviconImg);
        faviconContainer.appendChild(faviconWrapper);

        // Only show first 3 favicons
        if (faviconContainer.children.length === 3 && uniqueHosts.size > 3) {
          const remaining = uniqueHosts.size - 3;
          const counter = document.createElement("div");
          counter.className = "favicon-counter";
          counter.textContent = `+${remaining}`;

          // Create dropdown container
          const dropdown = document.createElement("div");
          dropdown.className = "favicon-dropdown";

          // Create URL list
          const urlList = document.createElement("ul");
          urlList.className = "favicon-url-list";

          // Add all remaining URLs to the dropdown
          Array.from(uniqueHosts)
            .slice(3)
            .forEach((hostname) => {
              const listItem = document.createElement("li");
              listItem.className = "favicon-url-item";

              // Try to add favicon
              const favicon = document.createElement("img");
              favicon.src = `https://${hostname}/favicon.ico`;
              favicon.alt = "";
              favicon.onerror = () => {
                favicon.outerHTML = `<div class='favicon-fallback'>${hostname[0].toUpperCase()}</div>`;
              };

              const domain = document.createElement("span");
              domain.textContent = hostname;

              listItem.append(favicon, domain);
              urlList.appendChild(listItem);
            });

          dropdown.appendChild(urlList);
          counter.appendChild(dropdown);
          faviconContainer.appendChild(counter);
          return;
        }
      }
    } catch {
      if (faviconContainer.children.length === 0) {
        const fallback = document.createElement("div");
        fallback.className = "favicon-fallback";
        fallback.textContent = script.name[0].toUpperCase();
        faviconContainer.appendChild(fallback);
      }
    }
  });

  // If no favicons were added, show fallback
  if (faviconContainer.children.length === 0) {
    const fallback = document.createElement("div");
    fallback.className = "favicon-fallback";
    fallback.textContent = script.name[0].toUpperCase();
    faviconContainer.appendChild(fallback);
  }

  faviconCell.appendChild(faviconContainer);

  // Target URL cell with multiple URL support
  const targetCell = document.createElement("td");

  if (!script.targetUrls?.length) {
    targetCell.textContent = "No target URL";
  } else {
    const urlContainer = document.createElement("div");
    urlContainer.className = "url-list";

    try {
      const primaryUrl = script.targetUrls[0];
      const primaryUrlSpan = document.createElement("a");
      primaryUrlSpan.className = "primary-url";
      primaryUrlSpan.href = primaryUrl;
      primaryUrlSpan.textContent = new URL(primaryUrl).hostname;
      primaryUrlSpan.target = "_blank";
      primaryUrlSpan.rel = "noopener noreferrer";
      urlContainer.appendChild(primaryUrlSpan);

      if (script.targetUrls.length > 1) {
        const urlCounter = document.createElement("span");
        urlCounter.className = "url-counter";
        urlCounter.textContent = `+${script.targetUrls.length - 1}`;

        // Create dropdown
        const dropdown = document.createElement("div");
        dropdown.className = "url-dropdown";

        // Add all URLs to the dropdown
        script.targetUrls.forEach((url) => {
          const urlItem = document.createElement("div");
          urlItem.className = "url-list-item";
          try {
            const urlObj = new URL(url);
            const urlLink = document.createElement("a");
            urlLink.href = urlObj.toString();
            urlLink.textContent = urlObj.toString();
            urlLink.target = "_blank";
            urlLink.rel = "noopener noreferrer";
            urlItem.appendChild(urlLink);
          } catch {
            urlItem.textContent = url;
          }
          dropdown.appendChild(urlItem);
        });

        urlCounter.appendChild(dropdown);
        urlContainer.appendChild(urlCounter);
      }
    } catch {
      urlContainer.textContent = script.targetUrls[0];
    }

    targetCell.appendChild(urlContainer);
  }

  // Run At cell
  const runAtCell = document.createElement("td");
  const timingInfo = document.createElement("div");
  timingInfo.className = "timing-info";

  const timingSpan = document.createElement("span");
  timingSpan.textContent = formatRunAt(script.runAt);

  timingInfo.appendChild(timingSpan);
  runAtCell.appendChild(timingInfo);

  // Version cell
  const versionCell = document.createElement("td");
  versionCell.textContent = script.version || "1.0.0";

  // Actions cell
  const actionsCell = document.createElement("td");
  actionsCell.className = "script-actions";

  const actions = [
    {
      icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>`,
      title: "Edit Script",
      handler: () => editScript(script.id),
    },
    {
      icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>`,
      title: "Export Script",
      handler: () => downloadScript(script),
    },
    {
      icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>`,
      title: "Delete Script",
      handler: () => deleteScript(script.id),
    },
  ];

  actions.forEach(({ icon, title, handler }) => {
    const button = document.createElement("button");
    button.className = "icon-button";
    button.innerHTML = icon;
    button.title = title; // Keep the title for tooltip
    button.addEventListener("click", handler);
    actionsCell.appendChild(button);
  });

  row.append(
    statusCell,
    nameCell,
    faviconCell,
    targetCell,
    runAtCell,
    versionCell,
    actionsCell
  );
  return row;
}

async function toggleScript(scriptId, enabled) {
  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const scriptIndex = scripts.findIndex((s) => s.id === scriptId);

    if (scriptIndex !== -1) {
      scripts[scriptIndex].enabled = enabled;
      await chrome.storage.local.set({ scripts });
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });
      showNotification(`Script ${enabled ? "enabled" : "disabled"}`, "success");
    }
  } catch (error) {
    console.error("Error toggling script:", error);
    showNotification("Error toggling script", "error");
  }
}

function editScript(scriptId) {
  window.location.href = `editor.html?id=${scriptId}`;
}

async function deleteScript(scriptId) {
  if (!confirm("Are you sure you want to delete this script?")) {
    return;
  }

  try {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const scriptToDelete = scripts.find((s) => s.id === scriptId);
    const updatedScripts = scripts.filter((s) => s.id !== scriptId);

    await chrome.storage.local.set({ scripts: updatedScripts });
    document.dispatchEvent(new CustomEvent("scriptsChanged"));
    chrome.runtime.sendMessage({ action: "scriptsUpdated" });

    showNotification(
      `Deleted script: ${scriptToDelete?.name || "Unknown"}`,
      "success"
    );

    const elements = {
      scriptsTable: document.getElementById("scriptsTable"),
      scriptsList: document.getElementById("scriptsList"),
      emptyState: document.getElementById("emptyState"),
      filters: {
        websiteFilter: document.getElementById("websiteFilter"),
      },
    };

    const state = { allScripts: updatedScripts };
    updateWebsiteFilterOptions(updatedScripts, elements.filters.websiteFilter);
    updateScriptsList(updatedScripts, elements);
  } catch (error) {
    console.error("Error deleting script:", error);
    showNotification("Error deleting script", "error");
  }
}

function formatRunAt(runAt) {
  const formats = {
    document_start: "Page Start",
    document_end: "DOM Ready",
    document_idle: "Page Load",
    element_ready: "Element Ready",
  };

  return formats[runAt] || runAt;
}

async function loadSettings(settingsElements) {
  try {
    const { settings = {} } = await chrome.storage.local.get("settings");

    settingsElements.enableAllScripts.checked =
      settings.enableAllScripts !== false;
    settingsElements.showNotifications.checked =
      settings.showNotifications !== false;
    settingsElements.debugMode.checked = settings.debugMode === true;
    settingsElements.allowThirdPartyScripts.checked =
      settings.allowThirdPartyScripts === true;
    settingsElements.confirmBeforeRunning.checked =
      settings.confirmBeforeRunning === true;
  } catch (error) {
    console.error("Error loading settings:", error);
    showNotification("Error loading settings", "error");
  }
}

async function saveSettings(settingsElements) {
  try {
    const settings = {
      enableAllScripts: settingsElements.enableAllScripts.checked,
      showNotifications: settingsElements.showNotifications.checked,
      debugMode: settingsElements.debugMode.checked,
      allowThirdPartyScripts: settingsElements.allowThirdPartyScripts.checked,
      confirmBeforeRunning: settingsElements.confirmBeforeRunning.checked,
    };

    await chrome.storage.local.set({ settings });
    showNotification("Settings saved successfully", "success");
    chrome.runtime.sendMessage({ action: "settingsUpdated" });
  } catch (error) {
    console.error("Error saving settings:", error);
    showNotification("Failed to save settings: " + error.message, "error");
  }
}

function downloadScript(script) {
  try {
    const scriptData = {
      name: script.name,
      code: script.code,
      targetUrls: script.targetUrls || [script.targetUrl], // Support both new and legacy format
      runAt: script.runAt,
      enabled: script.enabled,
      version: script.version || "1.0.0",
      description: script.description || "",
      permissions: {
        ...script.permissions,
        cspDisabled: script.permissions?.cspDisabled || false,
      },
      settings: {
        requiresConfirmation: script.settings?.requiresConfirmation || false,
        showNotifications: script.settings?.showNotifications || false,
        customCss: script.settings?.customCss || "",
        customSettings: script.settings?.customSettings || {},
        elementSelector: script.settings?.elementSelector || "",
        timeout: script.settings?.timeout || 0,
        dependencies: script.settings?.dependencies || [],
        ...script.settings, // Include any other custom settings
      },
      exportedAt: new Date().toISOString(),
      metadata: {
        scriptId: script.id,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
      },
    };

    const fileName = `${script.name
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}.json`;
    const blob = new Blob([JSON.stringify(scriptData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    showNotification(`Exported: ${script.name}`, "success");
  } catch (error) {
    console.error("Error exporting script:", error);
    showNotification("Error exporting script", "error");
  }
}

async function handleScriptImport(event, elements, state) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const fileContent = await file.text();
    const scriptData = JSON.parse(fileContent);
    const { settings = {} } = await chrome.storage.local.get("settings");

    // Validate required fields
    if (
      !scriptData.name ||
      !scriptData.code ||
      (!scriptData.targetUrls && !scriptData.targetUrl)
    ) {
      throw new Error("Invalid script file format");
    }

    let { scripts = [] } = await chrome.storage.local.get("scripts");
    const newScript = {
      ...scriptData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      enabled: settings.enableAllScripts !== false, // Set initial enabled state based on settings
      targetUrls: scriptData.targetUrls || [scriptData.targetUrl], // Handle legacy format
      permissions: {
        domAccess: scriptData.permissions?.domAccess ?? true,
        storageAccess: scriptData.permissions?.storageAccess ?? false,
        ajaxAccess: scriptData.permissions?.ajaxAccess ?? false,
        cookieAccess: scriptData.permissions?.cookieAccess ?? false,
        cspDisabled: scriptData.permissions?.cspDisabled ?? false,
      },
    };

    // Check for duplicates
    const duplicate = scripts.find((s) => s.name === newScript.name);
    if (duplicate) {
      const overwrite = confirm(
        `Script with name "${newScript.name}" already exists. Do you want to overwrite it?`
      );
      if (!overwrite) return;
      scripts = scripts.filter((s) => s.id !== duplicate.id);
    }

    scripts.push(newScript);
    await chrome.storage.local.set({ scripts });

    // Update the UI
    state.allScripts = scripts;
    updateWebsiteFilterOptions(scripts, elements.filters.websiteFilter);
    filterScripts(elements, state);
    event.target.value = "";

    showNotification("Script imported successfully", "success");
    chrome.runtime.sendMessage({ action: "scriptsUpdated" });
  } catch (error) {
    console.error("Error importing script:", error);
    showNotification("Failed to import script: " + error.message, "error");
  }
}

function showNotification(message, type = "info") {
  let notificationContainer = document.querySelector(".notification-container");
  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.className = "notification-container";
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;

  // Create icon
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "notification-icon icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "20");
  icon.setAttribute("height", "20");

  switch (type) {
    case "success":
      icon.innerHTML = `<circle cx="12" cy="12" r="10" stroke="var(--success)"/><path stroke="var(--success)" d="M8 12l3 3 5-5"/>`;
      break;
    case "error":
      icon.innerHTML = `<circle cx="12" cy="12" r="10" stroke="var(--error)"/><path stroke="var(--error)" d="M15 9l-6 6M9 9l6 6"/>`;
      break;
    case "warning":
      icon.innerHTML = `<circle cx="12" cy="12" r="10" stroke="var(--warning)"/><line stroke="var(--warning)" x1="12" y1="8" x2="12" y2="12"/><line stroke="var(--warning)" x1="12" y1="16" x2="12" y2="16"/>`;
      break;
    default:
      icon.innerHTML = `<circle cx="12" cy="12" r="10" stroke="var(--primary)"/><line stroke="var(--primary)" x1="12" y1="8" x2="12" y2="12"/><line stroke="var(--primary)" x1="12" y1="16" x2="12" y2="16"/>`;
  }

  const content = document.createElement("div");
  content.className = "notification-content";
  content.textContent = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "notification-close";
  closeBtn.innerHTML = "×";
  closeBtn.addEventListener("click", () => {
    notification.classList.add("notification-hide");
    setTimeout(() => notification.remove(), 300);
  });

  notification.append(icon, content, closeBtn);
  notificationContainer.appendChild(notification);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add("notification-hide");
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}
