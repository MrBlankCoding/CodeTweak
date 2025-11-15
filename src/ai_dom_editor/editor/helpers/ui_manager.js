import feather from "feather-icons";

export class UIManager {
  constructor(editor) {
    this.editor = editor;
    this.setupCurrentScriptListener();
  }

  setupCurrentScriptListener() {
    document.addEventListener("currentScriptChanged", () => {
      this.updateAllActionButtons();
    });
  }

  updateAllActionButtons() {
    // Update all action buttons when currentScript changes
    const allButtons = document.querySelectorAll(
      ".code-preview-actions .action-btn"
    );
    allButtons.forEach((btn) => {
      if (this.editor.currentScript) {
        btn.innerHTML = `<i data-feather="refresh-cw" width="16" height="16"></i>`;
        btn.title = `Update script: ${this.editor.currentScript.name}`;
      } else {
        btn.innerHTML = `<i data-feather="plus-circle" width="16" height="16"></i>`;
        btn.title = "Create new script";
      }
      feather.replace();
    });

    // Show/hide edit links based on script state
    const editLinks = document.querySelectorAll(
      ".code-preview-actions a[href*='editor/editor.html']"
    );
    editLinks.forEach((link) => {
      // Remove all edit links first
      link.remove();
    });

    // Re-add edit link only if we have a current script
    if (this.editor.currentScript) {
      const previewActions = document.querySelectorAll(".code-preview-actions");
      previewActions.forEach((actionsDiv) => {
        // Check if this actions div doesn't already have an edit link
        if (!actionsDiv.querySelector("a[href*='editor/editor.html']")) {
          const editLink = document.createElement("a");
          editLink.className = "btn-text icon-btn";
          editLink.title = "Open in editor";
          editLink.href = `${chrome.runtime.getURL(
            "editor/editor.html"
          )}?id=${this.editor.currentScript.id}`;
          editLink.target = "_blank";
          editLink.innerHTML = `<i data-feather="edit-2" width="16" height="16"></i>`;
          // Insert before the action button
          const actionBtn = actionsDiv.querySelector(".action-btn");
          if (actionBtn) {
            actionBtn.parentNode.insertBefore(editLink, actionBtn);
          } else {
            actionsDiv.appendChild(editLink);
          }
        }
      });
      feather.replace();
    }
  }

  showConfigBanner() {
    this.editor.elements.configBanner.style.display = "flex";
  }

  hideConfigBanner() {
    this.editor.elements.configBanner.style.display = "none";
  }

  autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  createMessageElement(role, text, data) {
    const messageEl = document.createElement("div");
    messageEl.className = `message ${role}`;
    messageEl.dataset.id = `msg-${Date.now()}-${Math.random()}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "AI";
    messageEl.appendChild(avatar);

    const content = document.createElement("div");
    content.className = "message-content";

    const textEl = document.createElement("div");
    textEl.className = "message-text";

    const parts = [];
    let lastIndex = 0;
    const regex = /(^|\s)@(\w+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(
          document.createTextNode(text.substring(lastIndex, match.index))
        );
      }

      // Create styled span for the script reference
      const space = match[1];
      const scriptRef = document.createElement("span");
      scriptRef.className = "script-reference";
      scriptRef.textContent = `@${match[2]}`;

      if (space) {
        parts.push(document.createTextNode(space));
      }
      parts.push(scriptRef);

      lastIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(document.createTextNode(text.substring(lastIndex)));
    }

    // Add all parts to the text element
    parts.forEach((part) => textEl.appendChild(part));

    // If no script references were found, just set the text content
    if (parts.length === 0) {
      textEl.textContent = text;
    }

    content.appendChild(textEl);

    if (data.error) {
      const errorEl = document.createElement("div");
      errorEl.className = "error-message";
      errorEl.innerHTML = `
        <i data-feather="alert-circle" width="16" height="16"></i>
        <span>An error occurred</span>
      `;
      content.appendChild(errorEl);
      feather.replace();
    }

    if (data.code) {
      const codePreview = this.createCodePreview(
        data.code,
        data.actions,
        data.isScript,
        data.name
      );
      content.appendChild(codePreview);
    }

    messageEl.appendChild(content);
    return messageEl;
  }

  createCodePreview(code, actions, isScript, name) {
    const preview = document.createElement("div");
    preview.className = "code-preview";

    const header = document.createElement("div");
    header.className = "code-preview-header";

    const title = document.createElement("div");
    title.className = "code-preview-title";
    title.textContent = isScript ? "Generated JavaScript" : "Generated Actions";
    header.appendChild(title);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "code-preview-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-text icon-btn";
    copyBtn.title = "Copy to clipboard";
    copyBtn.innerHTML = `<i data-feather="copy" width="16" height="16"></i>`;
    copyBtn.addEventListener("click", () => {
      this.copyToClipboard(code);
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `<i data-feather="check" width="16" height="16"></i>`;
      feather.replace();
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        feather.replace();
      }, 2000);
    });
    actionsDiv.appendChild(copyBtn);

    // Only show edit link if we're updating an existing script
    if (this.editor.currentScript) {
      const editLink = document.createElement("a");
      editLink.className = "btn-text icon-btn";
      editLink.title = "Open in editor";
      editLink.href = `${chrome.runtime.getURL("editor/editor.html")}?id=${
        this.editor.currentScript.id
      }`;
      editLink.target = "_blank";
      editLink.innerHTML = `<i data-feather="edit-2" width="16" height="16"></i>`;
      actionsDiv.appendChild(editLink);
    }

    const applyIconBtn = document.createElement("button");
    applyIconBtn.className = "btn-text icon-btn action-btn";
    applyIconBtn.title = "Create or update script";

    // Update button icon and functionality based on current state
    const updateButtonState = () => {
      if (this.editor.currentScript) {
        applyIconBtn.innerHTML = `<i data-feather="refresh-cw" width="16" height="16"></i>`;
        applyIconBtn.title = `Update script: ${this.editor.currentScript.name}`;
      } else {
        applyIconBtn.innerHTML = `<i data-feather="plus-circle" width="16" height="16"></i>`;
        applyIconBtn.title = "Create new script";
      }
      feather.replace();
    };

    applyIconBtn.addEventListener("click", () => {
      if (this.editor.currentScript) {
        this.editor.userscriptHandler.updateUserscript(
          this.editor.currentScript.name,
          code
        );
      } else {
        this.editor.userscriptHandler.createUserscript(code, name);
      }
    });

    // Update button state initially
    updateButtonState();

    actionsDiv.appendChild(applyIconBtn);
    header.appendChild(actionsDiv);

    preview.appendChild(header);

    const body = document.createElement("div");
    body.className = "code-preview-body";
    const pre = document.createElement("pre");
    pre.textContent = code;
    body.appendChild(pre);
    preview.appendChild(body);

    feather.replace();
    return preview;
  }

  addLoadingMessage() {
    const messageId = `msg-${Date.now()}-loading`;

    const messageEl = document.createElement("div");
    messageEl.className = "message assistant";
    messageEl.dataset.id = messageId;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";
    messageEl.appendChild(avatar);

    const content = document.createElement("div");
    content.className = "message-content";

    const loading = document.createElement("div");
    loading.className = "loading-indicator";
    loading.innerHTML = `
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
    `;
    content.appendChild(loading);

    messageEl.appendChild(content);
    this.editor.elements.messages.appendChild(messageEl);
    this.scrollToBottom();

    return messageId;
  }

  scrollToBottom() {
    setTimeout(() => {
      this.editor.elements.chatContainer.scrollTop =
        this.editor.elements.chatContainer.scrollHeight;
    }, 100);
  }

  activateElementSelector() {
    this.editor.elements.selectorActive.style.display = "flex";
    this.editor.elements.elementSelectorBtn.classList.add("active");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "startAiSelection" });
      }
    });
  }

  deactivateElementSelector() {
    this.editor.elements.selectorActive.style.display = "none";
    this.editor.elements.elementSelectorBtn.classList.remove("active");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "stopSelection" });
      }
    });
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Failed to copy:", err);
    });
  }

  showWelcomeMessage() {
    if (this.editor.elements.welcomeMessage) {
      this.editor.elements.welcomeMessage.style.display = "block";
    }
  }

  hideWelcomeMessage() {
    if (this.editor.elements.welcomeMessage) {
      this.editor.elements.welcomeMessage.style.display = "none";
    }
  }

  async showScriptSelector(input) {
    this.hideScriptSelector();
    const scripts = await this.editor.userscriptHandler.getAllScripts();
    if (!scripts || scripts.length === 0) return;

    const selector = document.createElement("div");
    selector.className = "script-selector";

    scripts.forEach((script) => {
      const item = document.createElement("div");
      item.className = "script-item";
      item.textContent = script.name;
      item.addEventListener("click", () => {
        const atIndex = input.value.lastIndexOf("@");
        input.value = input.value.substring(0, atIndex + 1) + script.name + " ";
        this.hideScriptSelector();
        input.focus();
      });
      selector.appendChild(item);
    });

    document.body.appendChild(selector);
    const rect = input.getBoundingClientRect();
    selector.style.top = `${rect.top - selector.offsetHeight}px`;
    selector.style.left = `${rect.left}px`;
  }

  hideScriptSelector() {
    const selector = document.querySelector(".script-selector");
    if (selector) {
      selector.remove();
    }
  }
}
