document.addEventListener("DOMContentLoaded", initDashboard);
// Need to add a cache
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
    allScripts: [],
  };

  setupEventListeners(elements, state);
  loadScripts(elements, state);
  loadSettings(elements.settings);
  setupTabs(elements.tabs, elements.tabContents);
  setupGreasyfork(elements.greasyfork);
}

function setupEventListeners(elements, state) {
  // nav
  elements.createScriptBtn?.addEventListener("click", () => {
    window.location.href = "/editor.html";
  });

  elements.emptyStateCreateBtn?.addEventListener("click", () => {
    window.location.href = "/editor.html";
  });

  // settings
  elements.saveSettingsBtn?.addEventListener("click", () =>
    saveSettings(elements.settings)
  );

  // filter
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

    // convert from legacy
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
  if (!websiteFilter) return;

  try {
    const websites = new Set();

    for (const script of scripts) {
      for (const url of script.targetUrls || []) {
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
  if (!elements.scriptsList) return;

  const searchTerm = (elements.filters.scriptSearch?.value || "").toLowerCase();
  const websiteValue = elements.filters.websiteFilter?.value || "";
  const statusValue = elements.filters.statusFilter?.value || "";
  const runAtValue = elements.filters.runAtFilter?.value || "";

  const filteredScripts = state.allScripts.filter((script) => {
    if (searchTerm && !script.name.toLowerCase().includes(searchTerm)) {
      return false;
    }
    if (websiteValue) {
      const matchesWebsite = (script.targetUrls || []).some((url) => {
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
  if (!elements.scriptsList) return;

  elements.scriptsList.innerHTML = "";

  // empty state
  if (scripts.length === 0) {
    if (elements.scriptsTable) elements.scriptsTable.style.display = "none";
    if (elements.emptyState) elements.emptyState.style.display = "block";
    return;
  }

  // show scripts
  if (elements.scriptsTable) elements.scriptsTable.style.display = "table";
  if (elements.emptyState) elements.emptyState.style.display = "none";

  const fragment = document.createDocumentFragment();
  scripts.forEach((script) => {
    fragment.appendChild(createScriptRow(script));
  });

  elements.scriptsList.appendChild(fragment);
}

function createScriptRow(script) {
  const row = document.createElement("tr");
  row.dataset.scriptId = script.id;

  // Status toggle cell
  row.appendChild(createStatusToggleCell(script));

  // Name cell
  const nameCell = document.createElement("td");
  nameCell.textContent = script.name;
  row.appendChild(nameCell);

  // Author cell
  const authorCell = document.createElement("td");
  authorCell.textContent = script.author || "Anonymous";
  authorCell.className = "script-author";
  row.appendChild(authorCell);

  // Favicon cell
  row.appendChild(createFaviconCell(script));

  // Run At cell
  const runAtCell = document.createElement("td");
  const timingInfo = document.createElement("div");
  timingInfo.className = "timing-info";

  const timingSpan = document.createElement("span");
  timingSpan.textContent = formatRunAt(script.runAt);

  timingInfo.appendChild(timingSpan);
  runAtCell.appendChild(timingInfo);
  row.appendChild(runAtCell);

  // Version cell
  const versionCell = document.createElement("td");
  versionCell.textContent = script.version || "1.0.0";
  row.appendChild(versionCell);

  // Actions cell
  row.appendChild(createActionsCell(script));

  return row;
}

function createStatusToggleCell(script) {
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

  return statusCell;
}

function createFaviconCell(script) {
  const faviconCell = document.createElement("td");
  const faviconContainer = document.createElement("div");
  faviconContainer.className = "favicon-container";

  // mutli favs
  const uniqueHosts = new Set();

  // get fav for each
  if (script.targetUrls && script.targetUrls.length > 0) {
    script.targetUrls.forEach((url) => {
      try {
        let hostname;
        if (url.includes("://")) {
          hostname = new URL(url).hostname;
        } else {
          hostname = url.split("/")[0];
        }

        if (!uniqueHosts.has(hostname)) {
          uniqueHosts.add(hostname);

          if (faviconContainer.children.length < 3) {
            const faviconWrapper = createFaviconWrapper(hostname);
            faviconContainer.appendChild(faviconWrapper);
          }
        }
      } catch (error) {
        // skip invalid (e.g. "about:blank") URLs
      }
    });
  }
  if (uniqueHosts.size > 3) {
    const extraHosts = Array.from(uniqueHosts).slice(3);
    const counterElement = createFaviconCounter(extraHosts);
    faviconContainer.appendChild(counterElement);
  }

  // FALLBACK!
  if (faviconContainer.children.length === 0) {
    const fallback = document.createElement("div");
    fallback.className = "favicon-fallback";
    fallback.textContent = (script.name[0] || "?").toUpperCase();
    faviconContainer.appendChild(fallback);
  }

  faviconCell.appendChild(faviconContainer);
  return faviconCell;
}

function createFaviconWrapper(hostname) {
  const faviconWrapper = document.createElement("div");
  faviconWrapper.className = "favicon-wrapper";
  faviconWrapper.title = hostname;

  const faviconImg = document.createElement("img");
  const faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${hostname}`;

  console.log(`Fetching favicon for ${hostname}:`, faviconUrl);

  faviconImg.src = faviconUrl;
  faviconImg.alt = "";
  faviconImg.className = "favicon";
  faviconImg.onerror = function () {
    console.warn(`Failed to load favicon for ${hostname}`);
    const fallbackText = hostname.replace(/\*\./g, "").charAt(0).toUpperCase();
    this.parentElement.innerHTML = `<div class='favicon-fallback'>${fallbackText}</div>`;
  };

  faviconWrapper.appendChild(faviconImg);
  return faviconWrapper;
}


function createFaviconCounter(extraHosts) {
  const counter = document.createElement("div");
  counter.className = "favicon-counter";
  counter.textContent = `+${extraHosts.length}`;
  const dropdown = document.createElement("div");
  dropdown.className = "favicon-dropdown";

  const urlList = document.createElement("ul");
  urlList.className = "favicon-url-list";

  extraHosts.forEach((hostname) => {
    const listItem = document.createElement("li");
    listItem.className = "favicon-url-item";
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
  return counter;
}

function createActionsCell(script) {
  const actionsCell = document.createElement("td");
  actionsCell.className = "script-actions";

  const actions = [
    {
      icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>`,
      title: "Edit Script",
      handler: () => editScript(script.id),
    }
  ];

  // check for update button
  if (script.updateInfo?.source === "greasyfork") {
    actions.push({
      icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 12a9 9 0 0 0 15 6.7L21 16"></path>
              <path d="M21 22v-6h-6"></path>
            </svg>`,
      title: "Check for Updates",
      handler: () => checkForUpdates(script),
    });
  }

  actions.push({
    icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>`,
    title: "Delete Script",
    handler: () => deleteScript(script.id),
  });

  actions.forEach(({ icon, title, handler }) => {
    const button = document.createElement("button");
    button.className = "icon-button";
    button.innerHTML = icon;
    button.title = title;
    button.addEventListener("click", handler);
    actionsCell.appendChild(button);
  });

  return actionsCell;
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
  };

  return formats[runAt] || runAt;
}

async function loadSettings(settingsElements) {
  try {
    const { settings = {} } = await chrome.storage.local.get("settings");

    // default values
    Object.entries({
      enableAllScripts: true,
      showNotifications: true,
      debugMode: false,
      confirmBeforeRunning: false,
    }).forEach(([key, defaultValue]) => {
      const element = settingsElements[key];
      if (element) {
        element.checked =
          settings[key] !== undefined ? settings[key] : defaultValue;
      }
    });
  } catch (error) {
    console.error("Error loading settings:", error);
    showNotification("Error loading settings", "error");
  }
}

async function saveSettings(settingsElements) {
  try {
    const settings = {};

    // get values from elements
    Object.keys(settingsElements).forEach((key) => {
      const element = settingsElements[key];
      if (element) {
        settings[key] = element.checked;
      }
    });

    await chrome.storage.local.set({ settings });
    showNotification("Settings saved successfully", "success");
    chrome.runtime.sendMessage({ action: "settingsUpdated" });
  } catch (error) {
    console.error("Error saving settings:", error);
    showNotification("Failed to save settings: " + error.message, "error");
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

  // remove 
  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add("notification-hide");
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function setupGreasyfork(elements) {
  if (!elements.button) return;

  elements.button.addEventListener("click", () => {
    elements.modal.setAttribute("aria-hidden", "false");
  });

  elements.closeBtn.addEventListener("click", () => {
    elements.modal.setAttribute("aria-hidden", "true");
  });

  elements.modal.addEventListener("click", (e) => {
    if (
      e.target === elements.modal ||
      e.target.classList.contains("modal-overlay")
    ) {
      elements.modal.setAttribute("aria-hidden", "true");
    }
  });

  elements.searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      searchGreasyfork(elements);
    }
  });

  elements.searchBtn.addEventListener("click", () => {
    searchGreasyfork(elements);
  });
}

async function searchGreasyfork(elements) {
  const query = elements.searchInput.value.trim();
  if (!query) return;

  elements.results.innerHTML = "";
  elements.loading.style.display = "block";

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.greasyfork.org/en/scripts.json?q=${encodedQuery}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const scripts = await response.json();

    if (scripts.length === 0) {
      elements.results.innerHTML = `
        <div class="no-results">
          No scripts found for "${escapeHtml(
            query
          )}". Try a different search term.
        </div>
      `;
    } else {
      elements.results.innerHTML = scripts
        .map((script) => createScriptCard(script))
        .join("");

      elements.results
        .querySelectorAll(".import-greasy-fork")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const codeUrl = button.closest(".script-card").dataset.codeUrl;
            importGreasyforkScript(codeUrl);
          });
        });
    }
  } catch (error) {
    console.error("Error searching Greasy Fork:", error);
    elements.results.innerHTML = `
      <div class="error-message">
        Error searching Greasy Fork: ${error.message}. Please try again later.
      </div>
    `;
  } finally {
    elements.loading.style.display = "none";
  }
}

function createScriptCard(script) {
  const formatNumber = (num) => {
    return num ? num.toLocaleString() : "0";
  };

  return `
    <div class="script-card" data-code-url="${escapeHtml(script.code_url)}">
      <h3>${escapeHtml(script.name)}</h3>
      <div class="script-card-meta">
        <span>👤 ${formatNumber(script.total_installs)}</span>
        <span>👍 ${formatNumber(script.good_ratings)}</span>
        <span>v${script.version || "1.0.0"}</span>
      </div>
      <p class="script-card-description">${escapeHtml(
        script.description || ""
      )}</p>
      <div class="script-card-actions">
        <a href="${
          script.url
        }" target="_blank" rel="noopener noreferrer" class="secondary">
          View on Greasy Fork
        </a>
        <button class="primary import-greasy-fork">
          Import
        </button>
      </div>
    </div>
  `;
}

async function importGreasyforkScript(codeUrl) {
  if (!codeUrl) {
    showNotification("Invalid script URL", "error");
    return;
  }

  try {
    const response = await fetch(codeUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const code = await response.text();

    // check if metadate is valid 
    const metadataBlock = code.match(
      /==UserScript==([\s\S]*?)==\/UserScript==/
    );
    if (!metadataBlock) {
      throw new Error("No metadata block found in script");
    }

    const metadata = {};
    metadataBlock[1].split("\n").forEach((line) => {
      const match = line.match(/@(\w+)\s+(.+)/);
      if (match) {
        const [, key, value] = match;
        if (key === "match" || key === "include") {
          metadata.matches = metadata.matches || [];
          metadata.matches.push(value);
        } else {
          metadata[key] = value.trim();
        }
      }
    });

    const updateInfo = {
      source: "greasyfork",
      sourceUrl: codeUrl,
      updateUrl: metadata.updateURL || codeUrl,
      downloadUrl: metadata.downloadURL || codeUrl,
      version: metadata.version || "1.0.0",
      lastChecked: Date.now(),
    };

    const scriptData = {
      name: metadata.name || "Imported Script",
      author: metadata.author || "Anonymous",
      description: metadata.description || "",
      version: metadata.version || "1.0.0",
      targetUrls: metadata.matches || ["*://*/*"],
      code: code,
      runAt: metadata.runAt || "document_end",
      enabled: true,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updateInfo, 
    };

    const { scripts = [] } = await chrome.storage.local.get("scripts");
    scripts.push(scriptData);
    await chrome.storage.local.set({ scripts });

    showNotification("Script imported successfully", "success");
    chrome.runtime.sendMessage({ action: "scriptsUpdated" });

    const modal = document.getElementById("greasyforkModal");
    modal.setAttribute("aria-hidden", "true");

    // refresh
    await refreshDashboard();
  } catch (error) {
    console.error("Error importing script:", error);
    showNotification("Error importing script: " + error.message, "error");
  }
}

async function checkForUpdates(script) {
  if (!script.updateInfo?.updateUrl) {
    showNotification("No update URL available", "error");
    return;
  }

  try {
    const response = await fetch(script.updateInfo.updateUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const newCode = await response.text();
    const metadataBlock = newCode.match(
      /==UserScript==([\s\S]*?)==\/UserScript==/
    );
    if (!metadataBlock) {
      throw new Error("Invalid script format");
    }

    const versionMatch = metadataBlock[1].match(/@version\s+(.+)/);
    const newVersion = versionMatch ? versionMatch[1].trim() : null;

    if (!newVersion) {
      throw new Error("Could not determine script version");
    }

    if (newVersion === script.version) {
      showNotification("Script is up to date", "success");
      return;
    }

    const updateConfirmed = confirm(
      `Update available: ${script.version} → ${newVersion}\nWould you like to update now?`
    );

    if (updateConfirmed) {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      const scriptIndex = scripts.findIndex((s) => s.id === script.id);

      if (scriptIndex !== -1) {
        scripts[scriptIndex] = {
          ...scripts[scriptIndex],
          version: newVersion,
          code: newCode,
          updatedAt: Date.now(),
          updateInfo: {
            ...scripts[scriptIndex].updateInfo,
            lastChecked: Date.now(),
            version: newVersion,
          },
        };

        await chrome.storage.local.set({ scripts });
        chrome.runtime.sendMessage({ action: "scriptsUpdated" });
        showNotification("Script updated successfully", "success");
        await refreshDashboard();
      }
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
    showNotification("Error checking for updates: " + error.message, "error");
  }
}

// refresh dash
async function refreshDashboard() {
  const elements = {
    scriptsTable: document.getElementById("scriptsTable"),
    scriptsList: document.getElementById("scriptsList"),
    emptyState: document.getElementById("emptyState"),
    filters: {
      websiteFilter: document.getElementById("websiteFilter"),
      scriptSearch: document.getElementById("scriptSearch"),
      statusFilter: document.getElementById("statusFilter"),
      runAtFilter: document.getElementById("runAtFilter"),
    },
  };

  const { scripts = [] } = await chrome.storage.local.get("scripts");
  const state = { allScripts: scripts };

  updateWebsiteFilterOptions(scripts, elements.filters.websiteFilter);
  filterScripts(elements, state);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
