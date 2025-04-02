//Manage popup
// Dont touch this (Popup is fine, UI is fine, I dont anticipate any changes)

document.addEventListener("DOMContentLoaded", async function () {
  // Initialize dark mode first
  initDarkMode();

  const scriptList = document.getElementById("scriptList");
  const emptyState = document.getElementById("emptyState");
  const createScriptBtn = document.getElementById("createScript");
  // Remove createScriptCta constant since element no longer exists
  const openDashboardBtn = document.getElementById("openDashboard");
  const reportIssueLink = document.getElementById("reportIssue");

  let currentTab = null;
  let currentTabUrl = "";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0] || null;
    currentTabUrl = currentTab?.url || "";
  } catch (error) {
    console.error("Error getting current tab:", error);
  }

  loadScripts(currentTabUrl);

  createScriptBtn.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(
        `editor.html?targetUrl=${encodeURIComponent(currentTabUrl)}`
      ),
    });
  });

  // Remove createScriptCta event listener since button no longer exists

  openDashboardBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  reportIssueLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: "https://github.com/MrBlankCoding/Scripty/issues/new",
    });
  });

  document.addEventListener("click", (e) => {
    const dropdowns = document.querySelectorAll(".dropdown-menu.show");
    dropdowns.forEach((dropdown) => {
      if (
        !dropdown.contains(e.target) &&
        !e.target.classList.contains("action-menu-btn")
      ) {
        dropdown.classList.remove("show");
      }
    });
  });

  async function loadScripts(url) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");

    const matchingScripts = url
      ? scripts.filter((script) => urlMatchesPattern(url, script))
      : [];

    if (matchingScripts.length === 0) {
      emptyState.style.display = "flex";

      if (scripts.length > 0) {
        emptyState.innerHTML = `
          <div class="empty-icon">🔍</div>
          <p>No scripts match this page.</p>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="empty-icon">📜</div>
          <p>No scripts yet. Create your first script to enhance websites.</p>
        `;
      }
      return;
    }

    emptyState.style.display = "none";
    scriptList.innerHTML = "";
    matchingScripts.sort((a, b) => a.name.localeCompare(b.name));

    matchingScripts.forEach((script) => {
      const originalIndex = scripts.findIndex((s) => s.id === script.id);
      const scriptElement = createScriptElement(script, originalIndex);
      scriptList.appendChild(scriptElement);
    });
  }

  function createScriptElement(script, index) {
    const scriptItem = document.createElement("div");
    scriptItem.className = "script-item";
    scriptItem.dataset.id = index;

    const scriptInfo = document.createElement("div");
    scriptInfo.className = "script-info";

    const scriptName = document.createElement("div");
    scriptName.className = "script-name";
    scriptName.textContent = script.name;

    const scriptTarget = document.createElement("div");
    scriptTarget.className = "script-target";

    // Handle multiple URLs
    const urls = script.targetUrls || [script.targetUrl];
    const displayUrl =
      urls.length > 1 ? `${urls[0]} +${urls.length - 1} more` : urls[0];

    scriptTarget.title = urls.join("\n");
    scriptTarget.innerHTML = `
      <span class="script-type">${formatRunAt(script.runAt)}</span>
      <span>${displayUrl}</span>
    `;

    scriptInfo.appendChild(scriptName);
    scriptInfo.appendChild(scriptTarget);

    const scriptActions = document.createElement("div");
    scriptActions.className = "script-actions";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle-switch tooltip";
    toggleLabel.setAttribute(
      "data-tooltip",
      script.enabled ? "Disable script" : "Enable script"
    );

    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = script.enabled;
    toggleInput.addEventListener("change", () =>
      toggleScript(index, toggleInput.checked)
    );

    const slider = document.createElement("span");
    slider.className = "slider";

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(slider);

    const actionMenuBtn = document.createElement("button");
    actionMenuBtn.className = "icon-button action-menu-btn";
    actionMenuBtn.innerHTML = "⋮";
    actionMenuBtn.title = "Script Actions";

    const dropdownMenu = document.createElement("div");
    dropdownMenu.className = "dropdown-menu";
    dropdownMenu.innerHTML = `
      <div class="dropdown-item" data-action="edit">
        <span>✏️</span> Edit Script
      </div>
      <div class="dropdown-divider"></div>
      <div class="dropdown-item danger" data-action="delete">
        <span>🗑️</span> Delete
      </div>
    `;

    actionMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isActive = dropdownMenu.classList.contains("show");

      document.querySelectorAll(".dropdown-menu.show").forEach((menu) => {
        menu.classList.remove("show");
      });

      if (isActive) {
        dropdownMenu.classList.remove("show");
      } else {
        dropdownMenu.classList.add("show");
      }
    });

    const actionMenu = document.createElement("div");
    actionMenu.className = "action-menu";
    actionMenu.appendChild(actionMenuBtn);
    actionMenu.appendChild(dropdownMenu);

    dropdownMenu.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const action = item.dataset.action;
        dropdownMenu.classList.remove("show");

        switch (action) {
          case "edit":
            editScript(index);
            break;
          case "delete":
            deleteScript(index);
            break;
        }
      });
    });

    scriptActions.appendChild(toggleLabel);
    scriptActions.appendChild(actionMenu);

    scriptItem.appendChild(scriptInfo);
    scriptItem.appendChild(scriptActions);

    return scriptItem;
  }

  async function toggleScript(index, enabled) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");

    if (index >= 0 && index < scripts.length) {
      scripts[index].enabled = enabled;
      await chrome.storage.local.set({ scripts });

      showToast(enabled ? "Script enabled" : "Script disabled");

      chrome.runtime.sendMessage({ action: "scriptsUpdated" });
    }
  }

  function editScript(index) {
    chrome.tabs.create({
      url: `editor.html?id=${index}`,
    });
  }

  async function deleteScript(index) {
    if (!confirm("Are you sure you want to delete this script?")) {
      return;
    }

    const { scripts = [] } = await chrome.storage.local.get("scripts");

    if (index >= 0 && index < scripts.length) {
      const deletedName = scripts[index].name;
      scripts.splice(index, 1);
      await chrome.storage.local.set({ scripts });

      showToast(`"${deletedName}" deleted`);

      loadScripts(currentTabUrl);

      chrome.runtime.sendMessage({ action: "scriptsUpdated" });
    }
  }

  function formatRunAt(runAt) {
    const formats = {
      document_start: "Start",
      document_end: "DOM",
      document_idle: "Load",
      element_ready: "Element",
    };

    return formats[runAt] || runAt;
  }

  function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

  function urlMatchesPattern(url, script) {
    if (!url || !script) return false;

    // Support both legacy single URL and new multiple URLs format
    const targetUrls = script.targetUrls || [script.targetUrl];
    return targetUrls.some((pattern) => {
      try {
        const urlObj = new URL(url);

        if (pattern === url) {
          return true;
        }

        if (pattern.startsWith("*.")) {
          const domain = pattern.substring(2);
          return (
            urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)
          );
        }

        if (!pattern.includes("*") && !pattern.includes("/")) {
          return urlObj.hostname === pattern;
        }

        if (!pattern.includes("://")) {
          pattern = "*://" + pattern + "/*";
        }

        if (pattern.includes("*")) {
          const regexPattern = pattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*")
            .replace(/\//g, "\\/");
          const regex = new RegExp("^" + regexPattern + "$");
          return regex.test(url);
        }

        return url.includes(pattern);
      } catch (error) {
        console.error("Error parsing URL:", error);
        return url.includes(pattern);
      }
    });
  }
});
