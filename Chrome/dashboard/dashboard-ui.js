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
    return;
  }

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

  // Icon cell
  row.appendChild(createIconCell(script));

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
      icon: `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 1 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>`,
      title: "Edit Script",
      handler: () => editScript(script.id),
    },
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
            <polyline points="12 5 12 19" />
            <polyline points="5 12 12 19 19 12" />
          </svg>`,
    title: "Export Script",
    handler: () => window.exportScript && window.exportScript(script),
  });

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

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setupAboutNav(aboutContainer) {
  if (!aboutContainer) return;

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

window.updateWebsiteFilterOptions = updateWebsiteFilterOptions;
window.updateScriptsList = updateScriptsList;
window.showNotification = showNotification;
window.escapeHtml = escapeHtml;

export {
  setupTabs,
  setupAboutNav,
  updateWebsiteFilterOptions,
  updateScriptsList,
  showNotification,
  escapeHtml,
};
