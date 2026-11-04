import logger from '../shared/utils/logger.js';
import { formatUrlPattern, formatRunAt } from '../shared/utils/urls.js';
import { createIcon } from '../shared/utils/icons.js';

// Global functions available from dashboard-logic.js via window object
/* global toggleScript, editScript, deleteScript, reviewUpdate */

function setupTabs(navItems, tabContents) {
  if (!navItems) return;

  navItems.forEach((tab) => {
    tab.addEventListener('click', () => {
      navItems.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const tabId = `${tab.getAttribute('data-tab')}-tab`;
      document.getElementById(tabId)?.classList.add('active');
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

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Websites';
    websiteFilter.appendChild(allOption);

    Array.from(websites)
      .sort()
      .forEach((website) => {
        const option = document.createElement('option');
        option.value = website;
        option.textContent = website;
        websiteFilter.appendChild(option);
      });
  } catch (error) {
    logger.error('Error updating website filter options:', error);
  }
}

function updateScriptsList(scripts, elements) {
  if (!elements.scriptsList) return;

  elements.scriptsList.innerHTML = '';

  // empty state
  if (scripts.length === 0) {
    if (elements.emptyState) elements.emptyState.style.display = 'block';
    updateScriptCount(0);
    return;
  }

  if (elements.emptyState) elements.emptyState.style.display = 'none';

  const fragment = document.createDocumentFragment();
  scripts.forEach((script) => {
    fragment.appendChild(createScriptListItem(script));
  });

  elements.scriptsList.appendChild(fragment);
  updateScriptCount(scripts.length);
}

function updateScriptCount(count) {
  const scriptCountElement = document.getElementById('scriptCount');
  if (scriptCountElement) {
    scriptCountElement.textContent = count;
  }
}

function createScriptListItem(script) {
  const item = document.createElement('div');
  item.className = 'script-list-item';
  item.dataset.scriptId = script.id;

  // Toggle switch column
  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = script.enabled;
  toggleInput.addEventListener('change', () => toggleScript(script.id, toggleInput.checked));

  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';

  toggleSwitch.append(toggleInput, toggleSlider);

  // Name & Description column
  const nameCol = document.createElement('div');
  nameCol.className = 'script-name-col';

  if (script.icon && /^(https?:|data:image\/)/i.test(script.icon)) {
    const icon = document.createElement('img');
    icon.src = script.icon;
    icon.className = 'script-icon';
    nameCol.appendChild(icon);
  }

  const nameAndDesc = document.createElement('div');
  const name = document.createElement('h3');
  name.className = 'script-name';
  name.textContent = script.name;

  const description = document.createElement('p');
  description.className = 'script-description';
  description.textContent = script.description || 'No description provided.';

  nameAndDesc.append(name, description);
  nameCol.append(nameAndDesc);

  // Version column
  const versionCol = document.createElement('div');
  versionCol.className = 'script-version-col';
  versionCol.textContent = script.version || '1.0.0';

  if (script.updateInfo?.pendingVersion) {
    const pending = document.createElement('span');
    pending.className = 'update-pending-badge';
    pending.textContent = `→ v${script.updateInfo.pendingVersion}`;
    pending.title = 'An update is waiting for your review.';
    versionCol.appendChild(pending);
  }

  // Sites column
  const sitesCol = document.createElement('div');
  sitesCol.className = 'script-sites-col';
  const targetUrls = script.targetUrls || [];
  if (targetUrls.length > 0) {
    if (targetUrls.length === 1) {
      sitesCol.textContent = formatUrlPattern(targetUrls[0]);
    } else {
      sitesCol.textContent = formatUrlPattern(targetUrls[0]);
      const span = document.createElement('span');
      span.className = 'site-count';
      span.textContent = `+${targetUrls.length - 1}`;
      const formattedUrls = targetUrls.map(formatUrlPattern);
      span.title = formattedUrls.join('\n');
      span.setAttribute('aria-label', `Additional sites: ${formattedUrls.join(', ')}`);
      sitesCol.appendChild(span);
    }
  } else {
    sitesCol.textContent = 'All sites';
  }

  // Run At column
  const runAtCol = document.createElement('div');
  runAtCol.className = 'script-runat-col';
  runAtCol.textContent = formatRunAt(script.runAt);

  // Actions column
  const actions = document.createElement('div');
  actions.className = 'script-actions';

  const editButton = document.createElement('button');
  editButton.className = 'btn-action btn-edit';
  const editIcon = createIcon('edit-2');
  editButton.appendChild(editIcon);
  editButton.title = 'Edit Script';
  editButton.addEventListener('click', () => editScript(script.id));
  actions.appendChild(editButton);

  if (script.updateInfo?.pendingVersion) {
    const reviewButton = document.createElement('button');
    reviewButton.className = 'btn-action btn-review';
    const reviewIcon = createIcon('refresh-cw');
    reviewButton.appendChild(reviewIcon);
    reviewButton.title = 'Review pending update';
    reviewButton.addEventListener('click', () => reviewUpdate(script.id));
    actions.appendChild(reviewButton);
  }

  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn-action btn-delete';
  const deleteIcon = createIcon('trash-2');
  deleteButton.appendChild(deleteIcon);
  deleteButton.title = 'Delete Script';
  deleteButton.addEventListener('click', () => deleteScript(script.id));
  actions.appendChild(deleteButton);

  item.append(toggleSwitch, nameCol, versionCol, sitesCol, runAtCol, actions);

  return item;
}

const REASON_LABELS = {
  modified: 'Locally modified since install.',
  permissions: 'The update adds new permissions.',
};

function openUpdateReviewModal(script) {
  // Reuse the shared modal classes; the Greasy Fork modal is static markup,
  // this one is built per review so it always reflects the latest metadata.
  const existing = document.getElementById('updateReviewModal');
  if (existing) existing.remove();

  const info = script.updateInfo || {};
  const changes = info.pendingChanges || {};

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'updateReviewModal';
  modal.setAttribute('aria-hidden', 'false');
  modal.role = 'dialog';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', () => modal.remove());

  const container = document.createElement('div');
  container.className = 'modal-container';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h2');
  title.textContent = `Update review: ${script.name || 'Untitled Script'}`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => modal.remove());
  header.append(title, closeBtn);

  const content = document.createElement('div');
  content.className = 'modal-content update-review-content';

  const reason = document.createElement('p');
  reason.className = 'update-review-reason';
  reason.textContent =
    REASON_LABELS[info.pendingReason] || 'The update needs confirmation before it can be applied.';
  content.appendChild(reason);

  const rows = [
    ['Version', `${script.version || '1.0.0'} → ${info.pendingVersion}`],
    ['Added grants', changes.grants?.length ? changes.grants.join(', ') : 'none'],
    ['Added URL matches', changes.matches?.length ? changes.matches.join(', ') : 'none'],
    ['Expanded @connect', changes.connect?.length ? changes.connect.join(', ') : 'none'],
  ];
  const list = document.createElement('dl');
  list.className = 'update-review-list';
  rows.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  });
  content.appendChild(list);

  const note = document.createElement('p');
  note.className = 'update-review-note';
  note.textContent =
    'Approved updates are stored as a snapshot in version history before they overwrite your script.';
  content.appendChild(note);

  const formActions = document.createElement('div');
  formActions.className = 'update-review-actions';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn-primary';
  applyBtn.textContent = 'Apply update';
  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    try {
      await decideScriptUpdate(script.id, true);
      modal.remove();
    } finally {
      applyBtn.disabled = false;
    }
  });
  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'btn-secondary';
  rejectBtn.textContent = 'Discard update';
  rejectBtn.addEventListener('click', async () => {
    rejectBtn.disabled = true;
    try {
      await decideScriptUpdate(script.id, false);
      modal.remove();
    } finally {
      rejectBtn.disabled = false;
    }
  });
  formActions.append(applyBtn, rejectBtn);
  content.appendChild(formActions);

  container.append(header, content);
  modal.append(overlay, container);
  document.body.appendChild(modal);
}

function showNotification(message, type = 'info') {
  let notificationContainer = document.querySelector('.notification-container');
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  const iconName =
    type === 'success'
      ? 'check-circle'
      : type === 'error'
        ? 'x-circle'
        : type === 'warning'
          ? 'alert-triangle'
          : 'info';
  const icon = createIcon(iconName);

  const content = document.createElement('div');
  content.className = 'notification-content';
  content.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'notification-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    notification.classList.add('notification-hide');
    setTimeout(() => notification.remove(), 300);
  });

  notification.append(icon, content, closeBtn);
  notificationContainer.appendChild(notification);

  // remove
  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add('notification-hide');
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

window.updateWebsiteFilterOptions = updateWebsiteFilterOptions;
window.updateScriptsList = updateScriptsList;
window.showNotification = showNotification;

export {
  setupTabs,
  updateWebsiteFilterOptions,
  updateScriptsList,
  showNotification,
  openUpdateReviewModal,
};
