import feather from 'feather-icons';
import { getScriptDescription } from '../utils/urls.js';

// Global functions available from dashboard-logic.js via window object
/* global toggleScript, editScript, deleteScript */

function setupTabs(navItems, tabContents) {
  if (!navItems) return;

  navItems.forEach((tab) => {
    tab.addEventListener("click", () => {
      navItems.forEach((t) => {
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

    while (websiteFilter.firstChild) {
      websiteFilter.removeChild(websiteFilter.firstChild);
    }

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Websites";
    websiteFilter.appendChild(allOption);

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

function updateScriptsList(scripts, elements) {
  if (!elements.scriptsList) return;

  elements.scriptsList.innerHTML = "";

  // empty state
  if (scripts.length === 0) {
    if (elements.scriptsTable) elements.scriptsTable.style.display = "none";
    if (elements.emptyState) elements.emptyState.style.display = "block";
    updateScriptCount(0);
    return;
  }

  if (elements.scriptsTable) elements.scriptsTable.style.display = "table";
  if (elements.emptyState) elements.emptyState.style.display = "none";

  const fragment = document.createDocumentFragment();
  scripts.forEach((script) => {
    fragment.appendChild(createScriptListItem(script));
  });

  elements.scriptsList.appendChild(fragment);
  feather.replace();
  updateScriptCount(scripts.length);
}

function updateScriptCount(count) {
  const scriptCountElement = document.getElementById("scriptCount");
  if (scriptCountElement) {
    scriptCountElement.textContent = count;
  }
}

function createScriptListItem(script) {
  const item = document.createElement("div");
  item.className = "script-list-item";
  item.dataset.scriptId = script.id;

  // Toggle switch column
  const toggleSwitch = document.createElement("label");
  toggleSwitch.className = "toggle-switch";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = script.enabled;
  toggleInput.addEventListener("change", () =>
    toggleScript(script.id, toggleInput.checked)
  );

  const toggleSlider = document.createElement("span");
  toggleSlider.className = "toggle-slider";

  toggleSwitch.append(toggleInput, toggleSlider);

  // Name & Description column
  const nameCol = document.createElement("div");
  nameCol.className = "script-name-col";

  const name = document.createElement("h3");
  name.className = "script-name";
  name.textContent = script.name;

  const description = document.createElement("p");
  description.className = "script-description";
  description.textContent = script.description || "No description provided.";

  nameCol.append(name, description);

  // Version column
  const versionCol = document.createElement("div");
  versionCol.className = "script-version-col";
  versionCol.textContent = script.version || "1.0.0";

  // Sites column
  const sitesCol = document.createElement("div");
  sitesCol.className = "script-sites-col";
  const targetUrls = script.targetUrls || [];
  if (targetUrls.length > 0) {
  if (targetUrls.length === 1) {
  sitesCol.textContent = formatUrlPattern(targetUrls[0]);
  } else {
  sitesCol.textContent = formatUrlPattern(targetUrls[0]);
    const span = document.createElement('span');
      span.className = 'site-count';
      span.textContent = `+${targetUrls.length - 1}`;
      sitesCol.appendChild(span);
    }
    sitesCol.title = targetUrls.map(formatUrlPattern).join("\n");
  } else {
    sitesCol.textContent = "All sites";
  }

  // Features column
  const featuresCol = document.createElement("div");
  featuresCol.className = "script-features-col";
  featuresCol.textContent = getScriptDescription(script);

  // Run At column
  const runAtCol = document.createElement("div");
  runAtCol.className = "script-runat-col";
  const runAtFormats = {
    document_start: "Page Start",
    document_end: "DOM Ready",
    document_idle: "Page Load",
  };
  runAtCol.textContent = runAtFormats[script.runAt] || script.runAt || "Page Load";

  // Actions column
  const actions = document.createElement("div");
  actions.className = "script-actions";

  const editButton = document.createElement("button");
  editButton.className = "btn-action btn-edit";
  editButton.innerHTML = `<i data-feather="edit-2"></i>`;
  editButton.title = "Edit Script";
  editButton.addEventListener("click", () => editScript(script.id));

  const deleteButton = document.createElement("button");
  deleteButton.className = "btn-action btn-delete";
  deleteButton.innerHTML = `<i data-feather="trash-2"></i>`;
  deleteButton.title = "Delete Script";
  deleteButton.addEventListener("click", () => deleteScript(script.id));

  actions.append(editButton, deleteButton);

  item.append(toggleSwitch, nameCol, versionCol, sitesCol, featuresCol, runAtCol, actions);

  return item;
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
  const icon = document.createElement("i");
  icon.setAttribute("data-feather", type === "success" ? "check-circle" : type === "error" ? "x-circle" : type === "warning" ? "alert-triangle" : "info");

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

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}



function formatUrlPattern(pattern) {
    if (!pattern) return "All sites";
    
    // Remove protocol
    let display = pattern.replace(/^https?:\/\//, "");
    
    // Clean up wildcards for better display
    display = display.replace(/^\*\./, ""); // Remove leading wildcard subdomain
    display = display.replace(/\/\*$/, ""); // Remove trailing wildcard path
    
    // Truncate long URLs
    if (display.length > 20) {
      display = display.substring(0, 17) + "...";
    }
    
    return display;
  }

window.updateWebsiteFilterOptions = updateWebsiteFilterOptions;
window.updateScriptsList = updateScriptsList;
window.showNotification = showNotification;
window.escapeHtml = escapeHtml;

export {
  setupTabs,
  updateWebsiteFilterOptions,
  updateScriptsList,
  showNotification,
  escapeHtml,
};
