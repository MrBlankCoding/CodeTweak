(() => {
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
  function extractMetadataBlock(content) {
    const match = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    return match ? match[0] : null;
  }
  var gmApiFlagToGrant = {
    gmSetValue: "GM_setValue",
    gmGetValue: "GM_getValue",
    gmDeleteValue: "GM_deleteValue",
    gmListValues: "GM_listValues",
    gmOpenInTab: "GM_openInTab",
    gmNotification: "GM_notification",
    gmGetResourceText: "GM_getResourceText",
    gmGetResourceURL: "GM_getResourceURL",
    gmSetClipboard: "GM_setClipboard",
    gmAddStyle: "GM_addStyle",
    gmAddElement: "GM_addElement",
    gmRegisterMenuCommand: "GM_registerMenuCommand",
    gmXmlhttpRequest: "GM_xmlhttpRequest",
    unsafeWindow: "unsafeWindow"
  };
  function buildTampermonkeyMetadata(script, useModernStyle = false) {
    const lines = [];
    lines.push("// ==UserScript==");
    const push = (key, value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => lines.push(`// @${key.padEnd(10)} ${v}`));
      } else if (value !== void 0 && value !== null && value !== "") {
        lines.push(`// @${key.padEnd(10)} ${value}`);
      }
    };
    push("name", script.name || "Untitled Script");
    push("namespace", script.namespace || "https://codetweak.local");
    push("version", script.version || "1.0.0");
    push("description", script.description || "");
    push("author", script.author || "Anonymous");
    push("icon", script.icon);
    if (script.targetUrls && script.targetUrls.length) {
      script.targetUrls.forEach((pattern) => push("match", pattern));
    }
    if (script.runAt) {
      let runAt = script.runAt;
      runAt = runAt.replace(/_/g, "-");
      push("run-at", runAt);
    }
    if (script.requires && script.requires.length) {
      script.requires.forEach((url) => push("require", url));
    }
    if (script.resources && script.resources.length) {
      script.resources.forEach((r) => push("resource", `${r.name} ${r.url}`));
    }
    const grants = [];
    let anyApiSelected = false;
    Object.keys(gmApiFlagToGrant).forEach((flag) => {
      if (script[flag]) {
        let grantName = gmApiFlagToGrant[flag];
        if (useModernStyle && grantName !== "unsafeWindow") {
          grantName = grantName.replace("GM_", "GM.");
        }
        grants.push(grantName);
        anyApiSelected = true;
      }
    });
    if (!anyApiSelected) {
      push("grant", "none");
    } else {
      grants.forEach((g) => push("grant", g));
    }
    if (script.license) {
      push("license", script.license);
    }
    lines.push("// ==/UserScript==");
    return lines.join("\n");
  }

  // src/dashboard/dashboard-ui.js
  function setupTabs(tabsContainer, tabContents) {
    if (!tabsContainer)
      return;
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
  function updateWebsiteFilterOptions2(scripts, websiteFilter) {
    if (!websiteFilter)
      return;
    try {
      const websites = /* @__PURE__ */ new Set();
      for (const script of scripts) {
        for (const url of script.targetUrls || []) {
          try {
            websites.add(new URL(url).hostname);
          } catch {
            websites.add(url);
          }
        }
      }
      while (websiteFilter.firstChild) {
        websiteFilter.removeChild(websiteFilter.firstChild);
      }
      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = "All Websites";
      websiteFilter.appendChild(allOption);
      Array.from(websites).sort().forEach((website) => {
        const option = document.createElement("option");
        option.value = website;
        option.textContent = website;
        websiteFilter.appendChild(option);
      });
    } catch (error) {
      console.error("Error updating website filter options:", error);
    }
  }
  function updateScriptsList2(scripts, elements) {
    if (!elements.scriptsList)
      return;
    elements.scriptsList.innerHTML = "";
    if (scripts.length === 0) {
      if (elements.scriptsTable)
        elements.scriptsTable.style.display = "none";
      if (elements.emptyState)
        elements.emptyState.style.display = "block";
      return;
    }
    if (elements.scriptsTable)
      elements.scriptsTable.style.display = "table";
    if (elements.emptyState)
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
    row.appendChild(createStatusToggleCell(script));
    const nameCell = document.createElement("td");
    nameCell.textContent = script.name;
    row.appendChild(nameCell);
    const authorCell = document.createElement("td");
    authorCell.textContent = script.author || "Anonymous";
    authorCell.className = "script-author";
    row.appendChild(authorCell);
    row.appendChild(createIconCell(script));
    const runAtCell = document.createElement("td");
    const timingInfo = document.createElement("div");
    timingInfo.className = "timing-info";
    const timingSpan = document.createElement("span");
    timingSpan.textContent = formatRunAt(script.runAt);
    timingInfo.appendChild(timingSpan);
    runAtCell.appendChild(timingInfo);
    row.appendChild(runAtCell);
    const versionCell = document.createElement("td");
    versionCell.textContent = script.version || "1.0.0";
    row.appendChild(versionCell);
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
    toggleInput.addEventListener(
      "change",
      () => toggleScript(script.id, toggleInput.checked)
    );
    const slider = document.createElement("span");
    slider.className = "slider";
    toggleLabel.append(toggleInput, slider);
    statusCell.appendChild(toggleLabel);
    return statusCell;
  }
  function createIconCell(script) {
    const iconCell = document.createElement("td");
    const container = document.createElement("div");
    container.className = "icon-container";
    if (script.icon) {
      const img = document.createElement("img");
      img.src = script.icon;
      img.alt = "";
      img.className = "script-icon";
      img.onerror = () => {
        img.remove();
        container.textContent = "N/A";
      };
      container.appendChild(img);
    } else {
      container.textContent = "-";
    }
    iconCell.appendChild(container);
    return iconCell;
  }
  function createActionsCell(script) {
    const actionsCell = document.createElement("td");
    actionsCell.className = "script-actions";
    const actions = [
      {
        icon: `<i data-feather="edit-2" class="action-icon"></i>`,
        title: "Edit Script",
        handler: () => editScript(script.id)
      }
    ];
    if (script.updateInfo?.source === "greasyfork") {
      actions.push({
        icon: `<i data-feather="refresh-cw" class="action-icon"></i>`,
        title: "Check for Updates",
        handler: () => checkForUpdates(script)
      });
    }
    actions.push({
      icon: `<i data-feather="download" class="action-icon"></i>`,
      title: "Export Script",
      handler: () => window.exportScript && window.exportScript(script)
    });
    actions.push({
      icon: `<i data-feather="trash-2" class="action-icon"></i>`,
      title: "Delete Script",
      handler: () => deleteScript(script.id)
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
  function formatRunAt(runAt) {
    const formats = {
      document_start: "Page Start",
      document_end: "DOM Ready",
      document_idle: "Page Load"
    };
    return formats[runAt] || runAt;
  }
  function showNotification2(message, type = "info") {
    let notificationContainer = document.querySelector(".notification-container");
    if (!notificationContainer) {
      notificationContainer = document.createElement("div");
      notificationContainer.className = "notification-container";
      document.body.appendChild(notificationContainer);
    }
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    const icon = document.createElement("i");
    icon.setAttribute("data-feather", type === "success" ? "check-circle" : type === "error" ? "x-circle" : type === "warning" ? "alert-triangle" : "info");
    const content = document.createElement("div");
    content.className = "notification-content";
    content.textContent = message;
    const closeBtn = document.createElement("button");
    closeBtn.className = "notification-close";
    closeBtn.innerHTML = "\xD7";
    closeBtn.addEventListener("click", () => {
      notification.classList.add("notification-hide");
      setTimeout(() => notification.remove(), 300);
    });
    notification.append(icon, content, closeBtn);
    notificationContainer.appendChild(notification);
    setTimeout(() => {
      if (notification.parentElement) {
        notification.classList.add("notification-hide");
        setTimeout(() => notification.remove(), 300);
      }
    }, 5e3);
  }
  function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function setupAboutNav(aboutContainer) {
    if (!aboutContainer)
      return;
    const navButtons = aboutContainer.querySelectorAll(".about-nav");
    const sections = aboutContainer.querySelectorAll(".about-section");
    const contentEl = aboutContainer.querySelector(".about-content");
    if (contentEl && !contentEl.querySelector("#exporting")) {
      contentEl.insertAdjacentHTML(
        "beforeend",
        `<div class="about-section" id="exporting">
         <h2>Exporting Scripts</h2>
         <p>Select the export icon in the <em>Scripts</em> table to download a script as a standalone <code>.user.js</code> file for sharing or backups.</p>
       </div>`
      );
    }
    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        navButtons.forEach((b) => {
          b.classList.remove("active");
        });
        sections.forEach((s) => s.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.dataset.section;
        aboutContainer.querySelector(`#${targetId}`)?.classList.add("active");
      });
    });
  }
  window.updateWebsiteFilterOptions = updateWebsiteFilterOptions2;
  window.updateScriptsList = updateScriptsList2;
  window.showNotification = showNotification2;
  window.escapeHtml = escapeHtml;

  // src/dashboard/dashboard-greasyfork.js
  function setupGreasyfork(elements) {
    if (!elements.button)
      return;
    elements.button.addEventListener("click", () => {
      elements.modal.setAttribute("aria-hidden", "false");
      elements.modal.classList.add("show");
    });
    elements.closeBtn.addEventListener("click", () => {
      elements.modal.setAttribute("aria-hidden", "true");
      elements.modal.classList.remove("show");
    });
    elements.modal.addEventListener("click", (e) => {
      if (e.target === elements.modal || e.target.classList.contains("modal-overlay")) {
        elements.modal.setAttribute("aria-hidden", "true");
        elements.modal.classList.remove("show");
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
    if (!query)
      return;
    elements.results.textContent = "";
    elements.loading.style.display = "block";
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://greasyfork.org/en/scripts?q=${encodedQuery}&sort=updated`,
        {
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          credentials: "same-origin"
          // Important for CORS
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Greasy Fork API error:", errorText);
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      const scripts = await response.json();
      console.log("Search results:", scripts);
      elements.results.textContent = "";
      if (!scripts || scripts.length === 0) {
        const div = document.createElement("div");
        div.className = "no-results";
        div.textContent = `No scripts found for "${query}". Try a different search term.`;
        elements.results.appendChild(div);
      } else {
        for (const script of scripts) {
          const card = createScriptCard(script);
          elements.results.appendChild(card);
        }
      }
      elements.results.querySelectorAll(".import-greasy-fork").forEach((button) => {
        button.addEventListener("click", () => {
          const codeUrl = button.closest(".script-card").dataset.codeUrl;
          importGreasyforkScript(codeUrl);
        });
      });
    } catch (error) {
      console.error("Error searching Greasy Fork:", error);
      const errorDiv = document.createElement("div");
      errorDiv.className = "error-message";
      errorDiv.textContent = `Error searching Greasy Fork: ${error.message}. Please try again later.`;
      elements.results.appendChild(errorDiv);
    } finally {
      elements.loading.style.display = "none";
    }
  }
  function createScriptCard(script) {
    const formatNumber = (num) => num ? num.toLocaleString() : "0";
    const card = document.createElement("div");
    card.className = "script-card";
    card.dataset.codeUrl = script.code_url;
    const title = document.createElement("h3");
    title.textContent = script.name;
    card.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "script-card-meta";
    meta.innerHTML = `
    <span>\u{1F464} ${formatNumber(script.total_installs)}</span>
    <span>\u{1F44D} ${formatNumber(script.good_ratings)}</span>
    <span>v${script.version || "1.0.0"}</span>
  `;
    card.appendChild(meta);
    const description = document.createElement("p");
    description.className = "script-card-description";
    description.textContent = script.description || "";
    card.appendChild(description);
    const actions = document.createElement("div");
    actions.className = "script-card-actions";
    const viewLink = document.createElement("a");
    viewLink.href = script.url;
    viewLink.target = "_blank";
    viewLink.rel = "noopener noreferrer";
    viewLink.className = "secondary";
    viewLink.textContent = "View on Greasy Fork";
    actions.appendChild(viewLink);
    const importBtn = document.createElement("button");
    importBtn.className = "primary import-greasy-fork";
    importBtn.textContent = "Import";
    actions.appendChild(importBtn);
    card.appendChild(actions);
    return card;
  }
  async function importGreasyforkScript(codeUrl) {
    if (!codeUrl) {
      showNotification2("Invalid script URL", "error");
      return;
    }
    try {
      const response = await fetch(codeUrl);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const code = await response.text();
      const metadata = parseUserScriptMetadata(code);
      if (!metadata || Object.keys(metadata).length === 0) {
        throw new Error("No valid metadata found in script");
      }
      const updateInfo = {
        source: "greasyfork",
        sourceUrl: codeUrl,
        updateUrl: metadata.updateURL || codeUrl,
        downloadUrl: metadata.downloadURL || codeUrl,
        version: metadata.version || "1.0.0",
        lastChecked: Date.now()
      };
      const scriptData = {
        name: metadata.name || "Imported Script",
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
        updateInfo,
        ...metadata.resources && { resources: metadata.resources },
        ...metadata.requires && { requires: metadata.requires },
        ...metadata.license && { license: metadata.license },
        ...metadata.icon && { icon: metadata.icon }
      };
      Object.keys(metadata.gmApis).forEach((apiFlag) => {
        scriptData[apiFlag] = metadata.gmApis[apiFlag];
      });
      try {
        const { scripts = [] } = await chrome.storage.local.get("scripts");
        scripts.push(scriptData);
        await chrome.storage.local.set({ scripts });
        showNotification2("Script imported successfully", "success");
        chrome.runtime.sendMessage({ action: "scriptsUpdated" });
        const modal = document.getElementById("greasyforkModal");
        if (modal) {
          modal.setAttribute("aria-hidden", "true");
          modal.classList.remove("show");
        }
        window.location.reload();
      } catch (error) {
        console.error("Error saving script:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error importing script:", error);
      showNotification2("Error importing script: " + error.message, "error");
    }
  }

  // src/dashboard/dashboard-logic.js
  async function loadScripts(elements, state) {
    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
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
    if (!elements.scriptsList)
      return;
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
        if (!matchesWebsite)
          return false;
      }
      if (statusValue) {
        const isEnabled = statusValue === "enabled";
        if (script.enabled !== isEnabled)
          return false;
      }
      if (runAtValue && script.runAt !== runAtValue)
        return false;
      return true;
    });
    updateScriptsList(filteredScripts, elements);
  }
  async function toggleScript2(scriptId, enabled) {
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
  function editScript2(scriptId) {
    window.location.href = `editor.html?id=${scriptId}`;
  }
  async function deleteScript2(scriptId) {
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
      const elements = {
        scriptsTable: document.getElementById("scriptsTable"),
        scriptsList: document.getElementById("scriptsList"),
        emptyState: document.getElementById("emptyState"),
        filters: {
          websiteFilter: document.getElementById("websiteFilter")
        }
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
      const defaultSettings = {
        enableAllScripts: true,
        showNotifications: true,
        confirmBeforeRunning: false,
        // follow system theme by default
        darkMode: window.matchMedia("(prefers-color-scheme: dark)").matches
      };
      let shouldSaveDefaults = false;
      Object.entries(defaultSettings).forEach(([key, defaultValue]) => {
        const element = settingsElements[key];
        if (element) {
          if (settings[key] === void 0) {
            settings[key] = defaultValue;
            shouldSaveDefaults = true;
          }
          element.checked = settings[key];
        }
      });
      if (shouldSaveDefaults) {
        await chrome.storage.local.set({ settings });
      }
      applyTheme(settings.darkMode);
    } catch (error) {
      console.error("Error loading settings:", error);
      showNotification("Error loading settings", "error");
    }
  }
  async function saveSettings(settingsElements) {
    try {
      const settings = {};
      Object.keys(settingsElements).forEach((key) => {
        const element = settingsElements[key];
        if (element) {
          settings[key] = element.checked;
        }
      });
      await chrome.storage.local.set({ settings });
      showNotification("Settings saved successfully", "success");
      chrome.runtime.sendMessage({ action: "settingsUpdated" });
      applyTheme(settings.darkMode);
    } catch (error) {
      console.error("Error saving settings:", error);
      showNotification("Failed to save settings: " + error.message, "error");
    }
  }
  async function checkForUpdates2(script) {
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
        `Update available: ${script.version} \u2192 ${newVersion}
Would you like to update now?`
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
              version: newVersion
            }
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
  async function refreshDashboard() {
    const elements = {
      scriptsTable: document.getElementById("scriptsTable"),
      scriptsList: document.getElementById("scriptsList"),
      emptyState: document.getElementById("emptyState"),
      filters: {
        websiteFilter: document.getElementById("websiteFilter"),
        scriptSearch: document.getElementById("scriptSearch"),
        statusFilter: document.getElementById("statusFilter"),
        runAtFilter: document.getElementById("runAtFilter")
      }
    };
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const state = { allScripts: scripts };
    updateWebsiteFilterOptions(scripts, elements.filters.websiteFilter);
    filterScripts(elements, state);
  }
  function applyTheme(isDark) {
    const body = document.body;
    if (isDark) {
      body.classList.remove("light-theme");
    } else {
      body.classList.add("light-theme");
    }
  }
  function exportScript(script) {
    try {
      const code = script.code || "";
      const hasMetadata = !!extractMetadataBlock(code);
      const metadata = hasMetadata ? "" : buildTampermonkeyMetadata(script);
      const content = hasMetadata ? code : `${metadata}

${code}`;
      const fileNameSafe = (script.name || "script").replace(/[^a-z0-9_-]+/gi, "_").replace(/_{2,}/g, "_").replace(/^_|_$/g, "") || "script";
      const blob = new Blob([content], {
        type: "text/javascript;charset=utf-8"
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
  window.exportScript = exportScript;
  window.toggleScript = toggleScript2;
  window.editScript = editScript2;
  window.deleteScript = deleteScript2;
  window.checkForUpdates = checkForUpdates2;
  window.refreshDashboard = refreshDashboard;

  // src/dashboard/dashboard.js
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
        runAtFilter: document.getElementById("runAtFilter")
      },
      settings: {
        enableAllScripts: document.getElementById("enableAllScripts"),
        showNotifications: document.getElementById("showNotifications"),
        darkMode: document.getElementById("darkMode")
      },
      greasyfork: {
        button: document.getElementById("greasyforkBtn"),
        modal: document.getElementById("greasyforkModal"),
        closeBtn: document.querySelector(".modal-close"),
        searchInput: document.getElementById("greasyforkSearch"),
        searchBtn: document.getElementById("greasyforkSearchBtn"),
        results: document.getElementById("greasyforkResults"),
        loading: document.getElementById("greasyforkLoading")
      }
    };
    const state = {
      allScripts: []
      // This will be populated by loadScripts
    };
    setupEventListeners(elements, state);
    loadScripts(elements, state);
    loadSettings(elements.settings);
    setupTabs(elements.tabs, elements.tabContents);
    setupAboutNav(document.querySelector("#about-tab .about-container"));
    setupGreasyfork(elements.greasyfork);
    setupFileDragAndDrop();
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "scriptsUpdated") {
        showNotification("Dashboard refreshed", "success");
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
    elements.saveSettingsBtn?.addEventListener(
      "click",
      () => saveSettings(elements.settings)
    );
    elements.resetSettingsBtn?.addEventListener("click", () => {
      showNotification("Settings reset to defaults", "success");
    });
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
        if (!files.length)
          return;
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
              name: metadata.name || file.name.replace(/\.(txt|js)$/i, "") || "Imported Script",
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
              ...metadata.resources && { resources: metadata.resources },
              ...metadata.requires && { requires: metadata.requires },
              ...metadata.license && { license: metadata.license },
              ...metadata.icon && { icon: metadata.icon }
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
        const safeName = (script.name || "script").replace(/[^a-z0-9\- _]/gi, "_").replace(/\s+/g, "_");
        chrome.downloads.download({
          url,
          filename: `CodeTweak Export/${safeName}.user.js`,
          saveAs: false
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
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }
  document.addEventListener("DOMContentLoaded", initDashboard);
})();
