import feather from "feather-icons";
import { marked } from "marked";

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
    const allButtons = document.querySelectorAll(
      ".code-preview-actions .action-btn"
    );
    allButtons.forEach((btn) => {
      btn.replaceChildren();
      const icon = this._createFeatherIcon("", 16);
      
      if (this.editor.currentScript) {
        icon.setAttribute("data-feather", "refresh-cw");
        btn.title = `Update script: ${this.editor.currentScript.name}`;
      } else {
        icon.setAttribute("data-feather", "plus-circle");
        btn.title = "Create new script";
      }
      btn.appendChild(icon);
      feather.replace();
    });

    const editLinks = document.querySelectorAll(
      ".code-preview-actions a[href*='editor/editor.html']"
    );
    editLinks.forEach((link) => {
      link.remove();
    });

    if (this.editor.currentScript) {
      const previewActions = document.querySelectorAll(".code-preview-actions");
      previewActions.forEach((actionsDiv) => {
        if (!actionsDiv.querySelector("a[href*='editor/editor.html']")) {
          const editLink = document.createElement("a");
          editLink.className = "btn-text icon-btn";
          editLink.title = "Open in editor";
          editLink.href = `${chrome.runtime.getURL("editor/editor.html")}?id=${
            this.editor.currentScript.id
          }`;
          editLink.target = "_blank";
          
          const icon = document.createElement("i");
          icon.setAttribute("data-feather", "edit-2");
          icon.setAttribute("width", "16");
          icon.setAttribute("height", "16");
          editLink.appendChild(icon);
          
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

  createMessageElement(role, text, data = {}) {
    const messageEl = document.createElement("div");
    messageEl.className = `message ${role}`;
    messageEl.dataset.id = `msg-${Date.now()}-${Math.random()}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "AI";
    messageEl.appendChild(avatar);

    const content = document.createElement("div");
    content.className = "message-content";

    if (role === "user") {
      const textEl = this._createUserTextElement(text);
      content.appendChild(textEl);
      messageEl.appendChild(content);
      return messageEl;
    }

    // Handle assistant messages based on response type
    if (data.type === "code") {
      // Code response with optional explanation
      if (data.explanation) {
        const explanationEl = document.createElement("div");
        explanationEl.className = "message-text";
        this._setSafeInnerHTML(explanationEl, marked.parse(data.explanation));
        content.appendChild(explanationEl);
      }

      const codePreview = this.createCodePreview(
        data.code,
        data.name,
        data.explanation
      );
      content.appendChild(codePreview);
    } else if (data.type === "text") {
      // Pure text response (questions, clarifications, etc.)
      const textEl = document.createElement("div");
      textEl.className = "message-text";
      
      // Check if the text looks like markdown
      if (this._hasMarkdownFormatting(data.message || text)) {
        this._setSafeInnerHTML(textEl, marked.parse(data.message || text));
      } else {
        textEl.textContent = data.message || text;
      }
      
      content.appendChild(textEl);
    } else if (data.error) {
      // Error message
      const textEl = document.createElement("div");
      textEl.className = "message-text";
      textEl.textContent = text;
      content.appendChild(textEl);

      const errorEl = document.createElement("div");
      errorEl.className = "error-message";
      
      const errorIcon = document.createElement("i");
      errorIcon.setAttribute("data-feather", "alert-circle");
      errorIcon.setAttribute("width", "16");
      errorIcon.setAttribute("height", "16");
      errorEl.appendChild(errorIcon);
      
      const errorSpan = document.createElement("span");
      errorSpan.textContent = "An error occurred";
      errorEl.appendChild(errorSpan);
      
      content.appendChild(errorEl);
      feather.replace();
    } else {
      // Fallback for unknown types
      const textEl = document.createElement("div");
      textEl.className = "message-text";
      textEl.textContent = text;
      content.appendChild(textEl);
    }

    messageEl.appendChild(content);
    feather.replace();
    return messageEl;
  }

  _createUserTextElement(text) {
    const textEl = document.createElement("div");
    textEl.className = "message-text";

    const parts = [];
    let lastIndex = 0;
    const regex = /(^|\s)@(\w+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          document.createTextNode(text.substring(lastIndex, match.index))
        );
      }

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

    if (lastIndex < text.length) {
      parts.push(document.createTextNode(text.substring(lastIndex)));
    }

    if (parts.length === 0) {
      textEl.textContent = text;
    } else {
      parts.forEach((part) => textEl.appendChild(part));
    }

    return textEl;
  }

  _hasMarkdownFormatting(text) {
    if (!text || typeof text !== "string") return false;
    
    const markdownIndicators = [
      /^#{1,6}\s+/m,           // Headers
      /\*\*[^*]+\*\*/,         // Bold
      /\*[^*]+\*/,             // Italic
      /_[^_]+_/,               // Italic with underscores
      /^[-*+]\s+/m,            // Unordered lists
      /^\d+\.\s+/m,            // Ordered lists
      /\[.+?\]\(.+?\)/,        // Links
      /^>\s+/m,                // Blockquotes
      /`[^`]+`/,               // Inline code
      /^\|.+\|$/m,             // Tables
    ];

    return markdownIndicators.some(pattern => pattern.test(text));
  }

  createCodePreview(code, name = "Generated Script", explanation = null) {
    const preview = document.createElement("div");
    preview.className = "code-preview";

    const header = document.createElement("div");
    header.className = "code-preview-header";

    const title = document.createElement("div");
    title.className = "code-preview-title";
    
    const codeIcon = document.createElement("i");
    codeIcon.setAttribute("data-feather", "code");
    codeIcon.setAttribute("width", "16");
    codeIcon.setAttribute("height", "16");
    title.appendChild(codeIcon);
    
    const titleSpan = document.createElement("span");
    titleSpan.textContent = name;
    title.appendChild(titleSpan);
    
    header.appendChild(title);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "code-preview-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-text icon-btn";
    copyBtn.title = "Copy to clipboard";
    
    const copyIcon = document.createElement("i");
    copyIcon.setAttribute("data-feather", "copy");
    copyIcon.setAttribute("width", "16");
    copyIcon.setAttribute("height", "16");
    copyBtn.appendChild(copyIcon);

    copyBtn.addEventListener("click", () => {
      this.copyToClipboard(code);
      copyBtn.replaceChildren(this._createFeatherIcon("check", 16));
      feather.replace();
      setTimeout(() => {
        copyBtn.replaceChildren(this._createFeatherIcon("copy", 16));
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
      
      const editIcon = document.createElement("i");
      editIcon.setAttribute("data-feather", "edit-2");
      editIcon.setAttribute("width", "16");
      editIcon.setAttribute("height", "16");
      editLink.appendChild(editIcon);
      
      actionsDiv.appendChild(editLink);
    }

    const applyIconBtn = document.createElement("button");
    applyIconBtn.className = "btn-text icon-btn action-btn";
    applyIconBtn.title = "Create or update script";

    // Update button icon and functionality based on current state
    const updateButtonState = () => {
      applyIconBtn.replaceChildren();
      const icon = this._createFeatherIcon("", 16);
      
      if (this.editor.currentScript) {
        icon.setAttribute("data-feather", "refresh-cw");
        applyIconBtn.title = `Update script: ${this.editor.currentScript.name}`;
      } else {
        icon.setAttribute("data-feather", "plus-circle");
        applyIconBtn.title = "Create new script";
      }
      applyIconBtn.appendChild(icon);
      feather.replace();
    };

    applyIconBtn.addEventListener("click", () => {
      if (this.editor.currentScript) {
        this.editor.userscriptHandler.updateUserscript(
          this.editor.currentScript.name,
          code,
          name,
          explanation
        );
      } else {
        this.editor.userscriptHandler.createUserscript(code, name, explanation);
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
    
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.className = "loading-dot";
      loading.appendChild(dot);
    }
    
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

  /**
   * Safely sets innerHTML by parsing it and only allowing a subset of safe elements/attributes.
   * This helps satisfy Firefox's security requirements.
   */
  _setSafeInnerHTML(element, html) {
    if (typeof html !== "string" || !html) {
      element.replaceChildren();
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const allowedTags = new Set([
      "A",
      "BLOCKQUOTE",
      "BR",
      "CODE",
      "EM",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HR",
      "LI",
      "OL",
      "P",
      "PRE",
      "STRONG",
      "TABLE",
      "TBODY",
      "TD",
      "TH",
      "THEAD",
      "TR",
      "UL",
    ]);

    const walk = (node) => {
      const children = Array.from(node.children);
      children.forEach((child) => {
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes));
          return;
        }

        // Remove all attributes except explicit link allowlist.
        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (child.tagName === "A" && (name === "href" || name === "title")) {
            return;
          }
          child.removeAttribute(attr.name);
        });

        if (child.tagName === "A") {
          const href = child.getAttribute("href");
          if (!href || !/^(https?:|mailto:)/i.test(href)) {
            child.removeAttribute("href");
          } else {
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }
        }

        walk(child);
      });
    };

    walk(doc.body);

    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    element.replaceChildren(fragment);
  }

  _createFeatherIcon(name, size = 16) {
    const icon = document.createElement("i");
    if (name) {
      icon.setAttribute("data-feather", name);
    }
    icon.setAttribute("width", String(size));
    icon.setAttribute("height", String(size));
    return icon;
  }
}
