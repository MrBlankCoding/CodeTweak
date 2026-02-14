import feather from 'feather-icons';
import { urlMatchesPattern, formatRunAt, getScriptDescription, isValidWebpage } from "../utils/urls.js";
import { applyTranslations, getMessageSync } from "../utils/i18n.js";

document.addEventListener("DOMContentLoaded", async () => {
  feather.replace();

  const scriptList = document.getElementById("scriptList");
  const emptyState = document.getElementById("emptyState");
  const createScriptBtn = document.getElementById("createScript");
  const openDashboardBtn = document.getElementById("openDashboard");
  const aiEditorBtn = document.getElementById("aiEditorBtn");
  const reportIssueLink = document.getElementById("reportIssue");

  let currentTabUrl = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab?.url || "";
  } catch (err) {
    console.error("Error getting current tab:", err);
  }

  createScriptBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("editor/editor.html") });
  });

  openDashboardBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });

  aiEditorBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if user is on a valid webpage
      if (!isValidWebpage(tab.url)) {
        alert("Please navigate to a webpage first to use the AI DOM Editor.");
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, { action: 'openAIEditor' }, (response) => {
        if (chrome.runtime.lastError || !response || response.success !== true) {
          // Fallback: open standalone window
          chrome.windows.create({
            url: chrome.runtime.getURL("ai_dom_editor/sidebar/ai_sidebar_window.html"),
            type: "popup",
            width: 440,
            height: 800,
            top: 80,
            left: screen.availWidth - 460
          });
        }
      });
      window.close();
    } catch {
      // Fallback: open standalone window
      chrome.windows.create({
        url: chrome.runtime.getURL("ai_dom_editor/ai_sidebar_window.html"),
        type: "popup",
        width: 440,
        height: 800,
        top: 80,
        left: screen.availWidth - 460
      });
      window.close();
    }
  });

  reportIssueLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "https://github.com/MrBlankCoding/CodeTweak/issues/new" });
  });

  await applyTheme();
  await applyTranslations();
  await loadScripts(currentTabUrl);
  await loadMenuCommands();

  chrome.runtime.onMessage.addListener((msg) => {
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

    emptyState.style.display = "none";

    if (matchingScripts.length === 0) {
      emptyState.style.display = "flex";
      emptyState.replaceChildren();
      
      if (scripts.length === 0) {
        const iconDiv = document.createElement("div");
        iconDiv.className = "empty-icon";
        const icon = document.createElement("i");
        icon.setAttribute("data-feather", "file-text");
        iconDiv.appendChild(icon);
        
        const p = document.createElement("p");
        p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(getMessageSync('popupCreateFirst')));
        
        emptyState.appendChild(iconDiv);
        emptyState.appendChild(p);
      } else {
        const p = document.createElement("p");
        p.appendChild(document.createTextNode(getMessageSync('popupNoScriptsForPage')));
        p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(getMessageSync('popupCreateOrVisit')));
        emptyState.appendChild(p);
      }
      return;
    }

    matchingScripts.sort((a, b) => a.name.localeCompare(b.name));

    matchingScripts.forEach((script) => {
      const index = scripts.findIndex((s) => s.id === script.id);
      scriptList.appendChild(createScriptElement(script, index));
    });
    
    feather.replace();
  }

  function createScriptElement(script, index) {
    const item = document.createElement("div");
    item.className = "script-item";
    item.dataset.id = index;

    if (script.enabled === false) {
      item.classList.add("script-disabled");
    }

    // Icon
    if (script.icon) {
      const iconImg = document.createElement("img");
      iconImg.src = script.icon;
      iconImg.alt = "";
      iconImg.className = "script-icon";
      iconImg.onerror = () => iconImg.remove();
      item.appendChild(iconImg);
    }

    // Toggle switch
    const toggleContainer = document.createElement("div");
    toggleContainer.className = "script-toggle";

    const label = document.createElement("label");
    label.className = "toggle-switch";
    label.title = script.enabled !== false ? getMessageSync('popupDisableScript') : getMessageSync('popupEnableScript');

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = script.enabled !== false;
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      toggleScript(script.id, checkbox.checked);
    });

    const slider = document.createElement("span");
    slider.className = "toggle-slider";

    label.appendChild(checkbox);
    label.appendChild(slider);
    toggleContainer.appendChild(label);
    item.appendChild(toggleContainer);

    // Script info
    const info = document.createElement("div");
    info.className = "script-info";
    info.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${script.id}`) });
    });

    const name = document.createElement("div");
    name.className = "script-name";
    name.textContent = script.name;

    const target = document.createElement("div");
    target.className = "script-target";

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
    item.appendChild(info);

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
        label.title = enabled ? getMessageSync('popupDisableScript') : getMessageSync('popupEnableScript');
      }
    } catch (err) {
      console.error("Error toggling script:", err);
    }
  }



  async function loadMenuCommands() {
    const menuContainer = document.getElementById("menuCommandList");
    const menuSection = document.getElementById("menuCommandSection");
    menuContainer.replaceChildren();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

      // Remove duplicates
      const uniqueCommands = [];
      const seen = new Set();
      
      commands.forEach((cmd) => {
        const key = `${cmd.commandId}|${cmd.caption}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCommands.push(cmd);
        }
      });

      menuSection.style.display = "block";

      uniqueCommands.forEach((cmd) => {
        const btn = document.createElement("button");
        btn.className = "menu-command-btn primary";
        btn.textContent = cmd.caption;

        btn.addEventListener("click", () => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (commandId) => {
              const command = (window.__gmMenuCommands || []).find((c) => c.commandId === commandId);
              if (command) {
                try {
                  command.onClick();
                } catch (error) {
                  console.error("CodeTweak: Menu command failed. Please ensure the menu command API is enabled in the editor settings.", error);
                }
              }
            },
            args: [cmd.commandId],
          });
        });

        menuContainer.appendChild(btn);
      });

      feather.replace();
    } catch (error) {
      console.error("Error loading menu commands:", error);
    }
  }
});
