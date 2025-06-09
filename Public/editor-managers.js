/**
 * UI Manager - Handles all UI-related operations
 */
class UIManager {
  constructor(elements, state, config) {
    this.elements = elements;
    this.state = state;
    this.config = config;
  }

  initializeCollapsibleSections() {
    this.elements.sectionToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        this.closest(".collapsible").classList.toggle("collapsed");
      });
    });
  }

  updateSidebarState() {
    const { sidebar, mainContent } = this.elements;

    sidebar.classList.toggle("active", this.state.isSidebarVisible);

    if (window.innerWidth > this.config.SIDEBAR_BREAKPOINT) {
      mainContent.style.gridTemplateColumns = this.state.isSidebarVisible
        ? "280px 1fr"
        : "0 1fr";
    }

    setTimeout(() => this.state.codeEditor?.refresh(), 300);
  }

  toggleSidebar(e) {
    if (e) e.stopPropagation();
    this.state.isSidebarVisible = !this.state.isSidebarVisible;
    this.updateSidebarState();
  }

  updateScriptStatus(hasUnsavedChanges) {
    const badge = this.elements.scriptStatusBadge;

    if (hasUnsavedChanges) {
      badge.textContent = "Unsaved Changes";
      badge.style.backgroundColor = "#4B5563"; // dark gray
      badge.style.color = "#D1D5DB"; // light gray
    } else {
      badge.textContent = "Saved";
      badge.style.backgroundColor = "#065F46"; // dark green
      badge.style.color = "#A7F3D0"; // light green
    }
  }

  showStatusMessage(message, type = "success") {
    const { statusMessage } = this.elements;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = "block";
  }

  clearStatusMessage() {
    const { statusMessage } = this.elements;
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
    statusMessage.style.display = "none";
  }
}

/**
 * Storage Manager - Handles all storage operations
 */
class StorageManager {
  async getScript(id) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");
    return scripts.find((s) => s.id === id);
  }

  async saveScript(scriptData, scriptId, isEditMode) {
    const { scripts = [] } = await chrome.storage.local.get("scripts");

    if (isEditMode && scriptId) {
      const scriptIndex = scripts.findIndex((s) => s.id === scriptId);
      if (scriptIndex !== -1) {
        scriptData.id = scriptId;
        scriptData.createdAt =
          scripts[scriptIndex].createdAt || scriptData.updatedAt;
        scripts[scriptIndex] = scriptData;
      } else {
        throw new Error("Script not found");
      }
    } else {
      scriptData.id = this.generateUniqueId();
      scriptData.createdAt = scriptData.updatedAt;
      scripts.push(scriptData);
    }

    await chrome.storage.local.set({ scripts });
    return scriptData;
  }

  generateUniqueId() {
    return `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .substring(2)}`;
  }
}

/**
 * Form Validator - Handles form validation
 */
class FormValidator {
  constructor(elements) {
    this.elements = elements;
  }

  validateForm() {
    const validations = [
      this.validateScriptName(),
      this.validateTargetUrls(),
    ];

    return validations.every((validation) => validation.isValid);
  }

  validateScriptName() {
    if (!this.elements.scriptName.value.trim()) {
      this.showValidationError("Please enter a script name.");
      return { isValid: false };
    }
    return { isValid: true };
  }

  validateTargetUrls() {
    const urlList = Array.from(document.querySelectorAll(".url-item")).map(
      (item) => item.dataset.url
    );
    const currentUrl = this.elements.targetUrl.value.trim();

    if (urlList.length === 0 && !currentUrl) {
      this.showValidationError("Please add at least one target URL.");
      return { isValid: false };
    }
    return { isValid: true };
  }

  showValidationError(message) {
    const statusMessage = this.elements.statusMessage;
    statusMessage.textContent = message;
    statusMessage.className = "status-message error";
    statusMessage.style.display = "block";
  }
}
