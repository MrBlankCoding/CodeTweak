//Manage popup
// Dont touch this (Popup is fine, UI is fine, I dont anticipate any changes)

document.addEventListener("DOMContentLoaded", async () => {
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
      url: "https://github.com/MrBlankCoding/CodeTweak/issues/new",
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

    const scriptActions = createScriptActions(script);

    scriptItem.appendChild(scriptInfo);
    scriptItem.appendChild(scriptActions);

    return scriptItem;
  }

  function createScriptActions(script) {
    const actions = document.createElement("div");
    actions.className = "script-actions";

    const menuBtn = document.createElement("button");
    menuBtn.className = "script-menu";
    menuBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
        <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
        <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
      </svg>
    `;

    const menu = document.createElement("div");
    menu.className = "menu-dropdown";
    menu.innerHTML = `
      <div class="menu-item" data-action="edit">
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Script
      </div>
      <div class="menu-item delete" data-action="delete">
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Delete Script
      </div>
    `;

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("show");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !menuBtn.contains(e.target)) {
        menu.classList.remove("show");
      }
    });

    menu.addEventListener("click", (e) => {
      const action = e.target.closest(".menu-item")?.dataset.action;
      if (!action) return;

      menu.classList.remove("show");

      if (action === "edit") {
        chrome.tabs.create({
          url: `editor.html?id=${script.id}`,
        });
      } else if (action === "delete") {
        deleteScript(script.id);
      }
    });

    actions.append(menuBtn, menu);
    return actions;
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

  async function deleteScript(scriptId) {
    if (!confirm("Are you sure you want to delete this script?")) return;

    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      const updatedScripts = scripts.filter((s) => s.id !== scriptId);
      await chrome.storage.local.set({ scripts: updatedScripts });

      // Reload scripts to update UI properly
      loadScripts(currentTabUrl);

      chrome.runtime.sendMessage({ action: "scriptsUpdated" });
      showToast("Script deleted successfully");
    } catch (error) {
      console.error("Error deleting script:", error);
      showToast("Error deleting script");
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
