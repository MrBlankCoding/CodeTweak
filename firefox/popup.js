import { urlMatchesPattern } from "./utils/urlMatchPattern.js";
/* global chrome */
document.addEventListener("DOMContentLoaded", async () => {
  // Apply theme first
  await applyThemeFromSettings();

  const scriptList = document.getElementById("scriptList");
  const emptyState = document.getElementById("emptyState");
  const createScriptBtn = document.getElementById("createScript");
  const openDashboardBtn = document.getElementById("openDashboard");
  const reportIssueLink = document.getElementById("reportIssue");

  let currentTabUrl = "";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    currentTabUrl = tab?.url || "";
  } catch (err) {
    console.error("Error getting current tab:", err);
  }

  createScriptBtn.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(
        `editor.html?targetUrl=${encodeURIComponent(currentTabUrl)}`
      ),
    });
  });

  openDashboardBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  reportIssueLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: "https://github.com/MrBlankCoding/CodeTweak/issues/new",
    });
  });

  await loadScripts(currentTabUrl);
  await loadMenuCommands();

  // Listen for settings changes
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "settingsUpdated") {
      applyThemeFromSettings();
    }
    if (msg.action === "scriptsUpdated") {
      loadMenuCommands();
    }
  });

  async function loadScripts(url) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    const matchingScripts = scripts.filter((script) => {
      const targets = script.targetUrls || [script.targetUrl];
      return targets.some((pattern) => urlMatchesPattern(url, pattern));
    });


    if (matchingScripts.length === 0) {
      emptyState.style.display = "flex";
      emptyState.innerHTML = scripts.length
        ? `
        <div class="empty-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <p>No scripts match this page.<br>Create a new script or visit a different page.</p>
      `
        : `
        <div class="empty-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            <path d="M14 3v5h5M8 13h8M8 17h8"/>
          </svg>
        </div>
        <p><br>Create your first script to get started.</p>
      `;
      return;
    }

    matchingScripts.sort((a, b) => a.name.localeCompare(b.name));

    for (const script of matchingScripts) {
      const index = scripts.findIndex((s) => s.id === script.id);
      scriptList.appendChild(createScriptElement(script, index));
    }
  }

  function createScriptElement(script, index) {
    const item = document.createElement("div");
    item.className = "script-item";
    item.dataset.id = index;

    const toggleContainer = document.createElement("div");
    toggleContainer.className = "script-toggle";

    const label = document.createElement("label");
    label.className = "toggle-switch";
    label.title = script.enabled !== false ? "Disable script" : "Enable script";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = script.enabled !== false;
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      toggleScript(script.id, checkbox.checked);
    });

    const slider = document.createElement("span");
    slider.className = "slider";

    label.appendChild(checkbox);
    label.appendChild(slider);
    toggleContainer.appendChild(label);

    const info = document.createElement("div");
    info.className = "script-info";

    // Icon
    if (script.icon) {
      const iconImg = document.createElement("img");
      iconImg.src = script.icon;
      iconImg.alt = "";
      iconImg.className = "script-icon";
      iconImg.onerror = () => iconImg.remove();
      item.appendChild(iconImg);
    }

    const name = document.createElement("div");
    name.className = "script-name";
    name.textContent = script.name;

    const target = document.createElement("div");
    target.className = "script-target";

    // Instead of innerHTML, create and append spans safely:
    const runAtSpan = document.createElement("span");
    runAtSpan.className = "script-type";
    runAtSpan.textContent = formatRunAt(script.runAt);

    const descSpan = document.createElement("span");
    descSpan.className = "script-description";
    descSpan.textContent = getScriptDescription(script);

    target.appendChild(runAtSpan);
    target.appendChild(descSpan);

    info.appendChild(name);
    info.appendChild(target);
    info.addEventListener("click", () => {
      chrome.tabs.create({ url: `editor.html?id=${script.id}` });
    });

    item.appendChild(toggleContainer);
    item.appendChild(info);

    if (script.enabled === false) {
      item.classList.add("script-disabled");
    }

    return item;
  }

  async function toggleScript(scriptId, enabled) {
    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      const index = scripts.findIndex((s) => s.id === scriptId);
      if (index === -1) return;

      scripts[index].enabled = enabled;
      await chrome.storage.local.set({ scripts });
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });

      const item = document.querySelector(`[data-id="${index}"]`);
      if (item) {
        const label = item.querySelector(".toggle-switch");
        item.classList.toggle("script-disabled", !enabled);
        label.title = enabled ? "Disable script" : "Enable script";
      }
    } catch (err) {
      console.error("Error toggling script:", err);
    }
  }

  function formatRunAt(runAt) {
    const map = {
      document_start: "Start",
      document_end: "DOM",
      document_idle: "Load",
    };
    return map[runAt] || runAt || "Load";
  }

  function getScriptDescription(script) {
    const urls = script.targetUrls || [script.targetUrl];
    const features = [];
    if (script.css?.trim()) features.push("styles");
    if (script.js?.trim()) features.push("scripts");
    const siteText = urls.length > 1 ? `${urls.length} sites` : "Current site";
    return `${features.join(" + ")} • ${siteText}`;
  }

  /**
   * Retrieves darkMode from storage and toggles body class.
   */
  async function applyThemeFromSettings() {
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      const isDark = settings.darkMode !== false; // default dark mode true
      document.body.classList.toggle("light-theme", !isDark);
    } catch (err) {
      console.error("Error applying theme:", err);
    }
  }

  async function loadMenuCommands() {
    const menuContainer = document.getElementById("menuCommandList");
    const menuSection = document.getElementById("menuCommandSection");
    menuContainer.innerHTML = "";

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return;

      // Skip execution on browser pages and extension pages
      const restrictedPatterns = /^(chrome|edge|about):\/\//i;
      const isExtensionPage = tab.url?.startsWith("chrome-extension://");
      if (restrictedPatterns.test(tab.url || "") || isExtensionPage) {
        menuSection.style.display = "none";
        return;
      }

      const [{ result: commands = [] }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => window.__gmMenuCommands || [],
      });

      if (!commands.length) {
        menuSection.style.display = "none";
        return;
      }

      const unique = [];
      const seen = new Set();
      commands.forEach((c) => {
        const key = `${c.commandId}|${c.caption}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(c);
        }
      });

      menuSection.style.display = "block";

      unique.forEach((cmd) => {
        const btn = document.createElement("button");
        btn.className = "menu-command-btn primary";
        btn.textContent = cmd.caption;

        btn.addEventListener("click", () => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (id) => {
              const cmd = (window.__gmMenuCommands || []).find(
                (c) => c.commandId === id
              );
              if (cmd) {
                try {
                  cmd.onClick();
                } catch (e) {
                  console.error("Menu command error", e);
                }
              }
            },
            args: [cmd.commandId],
          });
        });

        menuContainer.appendChild(btn);
      });
    } catch (e) {
      console.error("Error loading menu commands", e);
    }
  }
});
