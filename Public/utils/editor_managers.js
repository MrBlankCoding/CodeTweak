class UIManager {
  constructor(elements, state, config) {
    this.elements = elements;
    this.state = state;
    this.config = config;
  }

  //side bar collapse
  initializeCollapsibleSections() {
    const { sidebar } = this.elements;
    const sections = sidebar.querySelectorAll(".collapsible");
    chrome.storage.local.get(["collapsedSections"], (result) => {
      const collapsedSections = result.collapsedSections || {};

      sections.forEach((section) => {
        const sectionId = section.dataset.section;
        const isCollapsed = collapsedSections[sectionId];

        if (isCollapsed) {
          section.classList.add("collapsed");
        }

        const header = section.querySelector(".section-header");
        if (header) {
          header.addEventListener("click", () => this.toggleSection(section));
        }
      });
    });
  }

  toggleSection(section) {
    const sectionId = section.dataset.section;
    const isCollapsing = !section.classList.contains("collapsed");
    section.classList.toggle("collapsed");

    chrome.storage.local.get(["collapsedSections"], (result) => {
      const collapsedSections = result.collapsedSections || {};
      collapsedSections[sectionId] = isCollapsing;
      chrome.storage.local.set({ collapsedSections });
    });

    setTimeout(() => this.state.codeEditor?.refresh(), 100);
  }

  updateSidebarState() {
    const { sidebar } = this.elements;
    const { isSidebarVisible } = this.state;

    if (isSidebarVisible) {
      sidebar.classList.remove("collapsed");
      sidebar.style.width = "300px";
    } else {
      sidebar.classList.add("collapsed");
      sidebar.style.width = "0";
    }

    setTimeout(() => this.state.codeEditor?.refresh(), 300);
  }

  toggleSidebar(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    this.state.isSidebarVisible = !this.state.isSidebarVisible;
    this.updateSidebarState();

    chrome.storage.local.set({
      isSidebarCollapsed: !this.state.isSidebarVisible,
    });
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

class FormValidator {
  constructor(elements) {
    this.elements = elements;
  }

  validateForm() {
    const validations = [this.validateScriptName(), this.validateTargetUrls()];

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
