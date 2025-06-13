import {
  buildTampermonkeyMetadata,
  extractMetadataBlock,
} from "../utils/metadataParser.js";

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

async function loadSettings(settingsElements) {
  try {
    const { settings = {} } = await chrome.storage.local.get("settings");

    // default values
    const defaultSettings = {
      enableAllScripts: true,
      showNotifications: true,
      confirmBeforeRunning: false,
      darkMode: true,
    };

    // Apply defaults and update storage if needed
    let shouldSaveDefaults = false;
    Object.entries(defaultSettings).forEach(([key, defaultValue]) => {
      const element = settingsElements[key];
      if (element) {
        if (settings[key] === undefined) {
          settings[key] = defaultValue;
          shouldSaveDefaults = true;
        }
        element.checked = settings[key];
      }
    });

    // Save defaults to storage if any were missing
    if (shouldSaveDefaults) {
      await chrome.storage.local.set({ settings });
    }

    // Apply theme based on darkMode setting
    applyTheme(settings.darkMode);
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

    // Apply theme immediately
    applyTheme(settings.darkMode);
  } catch (error) {
    console.error("Error saving settings:", error);
    showNotification("Failed to save settings: " + error.message, "error");
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

// Helper to toggle theme
function applyTheme(isDark) {
  const body = document.body;
  if (isDark) {
    body.classList.remove("light-theme");
  } else {
    body.classList.add("light-theme");
  }
}

// Export current script in Tampermonkey format (.user.js)
function exportScript(script) {
  try {
    const code = script.code || "";
    const hasMetadata = !!extractMetadataBlock(code);
    const metadata = hasMetadata ? "" : buildTampermonkeyMetadata(script);
    const content = hasMetadata ? code : `${metadata}\n\n${code}`;

    const fileNameSafe = (script.name || "script")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "") || "script";

    const blob = new Blob([content], {
      type: "text/javascript;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileNameSafe}.user.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification("Script exported", "success");
  } catch (error) {
    console.error("Export failed:", error);
    showNotification("Export failed", "error");
  }
}

// Attach functions to global so dashboard-ui can use them
window.exportScript = exportScript;
window.toggleScript = toggleScript;
window.editScript = editScript;
window.deleteScript = deleteScript;
window.checkForUpdates = checkForUpdates;
window.refreshDashboard = refreshDashboard;

export {
  loadScripts,
  filterScripts,
  toggleScript,
  editScript,
  deleteScript,
  loadSettings,
  saveSettings,
  checkForUpdates,
  refreshDashboard,
  applyTheme,
  exportScript,
};
