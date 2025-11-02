import feather from 'feather-icons';

// Global functions available from dashboard-logic.js via window object
/* global toggleScript, editScript, checkForUpdates, deleteScript */

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

  const info = document.createElement("div");
  info.className = "script-info";

  const name = document.createElement("h3");
  name.className = "script-name";
  name.textContent = script.name;

  const description = document.createElement("p");
  description.className = "script-description";
  description.textContent = script.description || "No description provided.";

  const version = document.createElement("span");
  version.className = "script-version";
  version.textContent = `v${script.version || "1.0.0"}`;

  const urls = document.createElement("div");
  urls.className = "script-urls";
  const targetUrls = script.targetUrls || [];
  if (targetUrls.length > 0) {
    urls.textContent = "Runs on: " + targetUrls.map(formatUrlPattern).join(", ");
  } else {
    urls.textContent = "Runs on: All sites";
  }


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
  info.append(name, version, description, urls);
  actions.append(editButton, deleteButton);
  item.append(toggleSwitch, info, actions);

  return item;
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
      handler: () => editScript(script.id),
    },
  ];

  // check for update button
  if (script.updateInfo?.source === "greasyfork") {
    actions.push({
      icon: `<i data-feather="refresh-cw" class="action-icon"></i>`,
      title: "Check for Updates",
      handler: () => checkForUpdates(script),
    });
  }

  actions.push({
    icon: `<i data-feather="download" class="action-icon"></i>`,
    title: "Export Script",
    handler: () => window.exportScript && window.exportScript(script),
  });

  actions.push({
    icon: `<i data-feather="trash-2" class="action-icon"></i>`,
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

function formatRunAt(runAt) {
  const formats = {
    document_start: "Page Start",
    document_end: "DOM Ready",
    document_idle: "Page Load",
  };

  return formats[runAt] || runAt;
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
