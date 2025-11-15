/* global feather */

export class ElementSelectorMenu {
  constructor(selector) {
    this.selector = selector;
    this.state = {
      menuOpen: false,
      currentElement: null,
    };
    this.elements = {
      menu: null,
      overlay: null,
    };
    this.config = {
      Z_INDEX: 2147483646,
      VIEWPORT_MARGIN: 10,
    };
  }

  get styles() {
    return `
      .ctwk-menu { 
        position: fixed; z-index: ${this.config.Z_INDEX}; background: #0b1020; 
        border: 1px solid rgba(148,163,184,.25); color: #e5e7eb; border-radius: 10px; 
        min-width: 220px; box-shadow: 0 12px 40px rgba(0,0,0,.45); overflow: hidden; 
      }
      .ctwk-menu-header { 
        padding: 10px 12px; font: 600 12px/1 Inter, system-ui; letter-spacing: .02em; 
        color: #9ca3af; border-bottom: 1px solid rgba(148,163,184,.18); 
        display: flex; justify-content: space-between; align-items: center; gap: 8px; 
        word-break: break-all; max-width: 400px; 
      }
      .ctwk-menu-body { display: flex; flex-direction: column; padding: 6px; }
      .ctwk-menu-item { 
        display: flex; gap: 10px; align-items: center; padding: 8px 10px; 
        border-radius: 8px; cursor: pointer; transition: background .15s ease; 
      }
      .ctwk-menu-item:hover, .ctwk-menu-item:focus { 
        background: rgba(255,255,255,.06); outline: none; 
      }
      .ctwk-menu-item .i { width: 18px; text-align: center; display: inline-flex; align-items: center; justify-content: center; }
      .ctwk-menu-item .i svg { width: 16px; height: 16px; fill: currentColor; display: block; }
      .ctwk-menu-footer { 
        padding: 8px 10px; border-top: 1px solid rgba(148,163,184,.18); 
        font: 500 11px/1.2 Inter; color: #9ca3af; display: flex; gap: 8px; flex-wrap: wrap; 
      }
      .ctwk-menu-overlay { 
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        z-index: ${this.config.Z_INDEX - 1}; background: transparent; 
      }
    `;
  }

  get actionTemplates() {
    return {
      hide: (selector) =>
        `document.querySelector(${JSON.stringify(
          selector
        )})?.style.setProperty('display', 'none', 'important');`,
      remove: (selector) =>
        `document.querySelector(${JSON.stringify(selector)})?.remove();`,
      click: (selector) =>
        `document.querySelector(${JSON.stringify(selector)})?.click();`,
      observe: (
        selector
      ) => `const observer = new MutationObserver((mutations) => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (element) {
    console.log('Element changed:', element);
  }
});

const target = document.querySelector(${JSON.stringify(selector)});
if (target) {
  observer.observe(target, { attributes: true, childList: true, characterData: true });
}`,
    };
  }

  start() {
    this.selector.startSelection(
      (element, x, y) => {
        if (!element) {
          this.selector.cleanup();
          return;
        }
        this.state.currentElement = element;
        this.selector.state.isSelecting = false; // Selection is done
        this.createMenu(x, y);
      },
      () => {
        this.removeMenu();
      },
      this.styles
    );
  }

  createMenu(x, y) {
    this.removeMenu();
    this.state.menuOpen = true;
    this.createMenuOverlay();
    this.createMenuElement(x, y);
    this.positionMenu();
  }

  createMenuOverlay() {
    this.elements.overlay = document.createElement("div");
    this.elements.overlay.className = "ctwk-menu-overlay";
    this.elements.overlay.addEventListener("click", () => this.cleanup());
    document.body.appendChild(this.elements.overlay);
  }

  createMenuElement(x, y) {
    this.elements.menu = document.createElement("div");
    this.elements.menu.className = "ctwk-menu";
    this.elements.menu.style.left = `${x}px`;
    this.elements.menu.style.top = `${y}px`;

    this.elements.menu.appendChild(this.createMenuHeader());
    this.elements.menu.appendChild(this.createMenuBody());
    this.elements.menu.appendChild(this.createMenuFooter());

    document.body.appendChild(this.elements.menu);
    if (typeof feather !== "undefined" && feather.replace) {
      feather.replace();
    }
  }

  createMenuHeader() {
    const header = document.createElement("div");
    header.className = "ctwk-menu-header";
    const selector = this.selector.getUniqueSelector(this.state.currentElement);
    const displayText = selector
      ? selector.length > 50
        ? selector.slice(0, 50) + "…"
        : selector
      : "No element selected";
    header.textContent = displayText;
    return header;
  }

  createMenuBody() {
    const body = document.createElement("div");
    body.className = "ctwk-menu-body";
    const menuItems = [
      { text: "Copy Selector", action: "copy" },
      { text: "Hide Element", action: "hide" },
      { text: "Remove Element", action: "remove" },
      { text: "Click Element", action: "click" },
      { text: "Watch Changes", action: "observe" },
    ];
    menuItems.forEach(({ text, action }) => {
      const item = this.createMenuItem(text, action);
      body.appendChild(item);
    });
    return body;
  }

  createMenuItem(text, action) {
    const item = document.createElement("div");
    item.className = "ctwk-menu-item";
    item.tabIndex = 0;
    const spanI = document.createElement("span");
    spanI.className = "i";
    const i = document.createElement("i");
    i.setAttribute("data-feather", this.iconName(action));
    spanI.appendChild(i);
    const spanText = document.createElement("span");
    spanText.textContent = text;
    item.appendChild(spanI);
    item.appendChild(spanText);

    const handleAction = (e) => {
      e.stopPropagation();
      this.handleAction(action);
    };

    item.addEventListener("click", handleAction);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleAction(e);
      }
    });
    return item;
  }

  createMenuFooter() {
    const footer = document.createElement("div");
    footer.className = "ctwk-menu-footer";
    const span = document.createElement("span");
    span.textContent = "Click item to execute · Esc: cancel";
    footer.appendChild(span);
    return footer;
  }

  iconName(action) {
    switch (action) {
      case "copy":
        return "copy";
      case "hide":
        return "eye-off";
      case "remove":
        return "trash-2";
      case "click":
        return "mouse-pointer";
      case "observe":
        return "watch";
      default:
        return "circle";
    }
  }

  positionMenu() {
    setTimeout(() => {
      if (!this.elements.menu) return;
      const rect = this.elements.menu.getBoundingClientRect();
      const { left, top } = this.selector.clampToViewport(
        rect.left,
        rect.top,
        rect.width,
        rect.height
      );
      this.elements.menu.style.left = `${left}px`;
      this.elements.menu.style.top = `${top}px`;
      this.elements.menu.querySelector(".ctwk-menu-item")?.focus();
    }, 0);
  }

  removeMenu() {
    if (this.elements.overlay) {
      this.elements.overlay.remove();
      this.elements.overlay = null;
    }
    if (this.elements.menu) {
      this.elements.menu.remove();
      this.elements.menu = null;
    }
    this.state.menuOpen = false;
  }

  async handleAction(action) {
    const selector = this.selector.getUniqueSelector(this.state.currentElement);
    if (!selector) {
      this.cleanup();
      return;
    }

    if (action === "copy") {
      await this.copyToClipboard(selector);
      this.cleanup();
      return;
    }

    const template = this.actionTemplates[action]?.(selector);
    if (template) {
      try {
        if (
          typeof chrome !== "undefined" &&
          chrome.runtime &&
          typeof chrome.runtime.sendMessage === "function"
        ) {
          chrome.runtime.sendMessage({
            action: "createScript",
            data: {
              selector,
              template,
              url: window.location.href,
            },
          });
        } else {
          console.warn(
            "CodeTweak: chrome.runtime.sendMessage is not available; cannot send createScript message."
          );
        }
      } catch (error) {
        console.error("CodeTweak: Failed to send message to extension", error);
      }
    }
    this.cleanup();
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.debug("CodeTweak: Clipboard write failed", error);
      this.fallbackCopyToClipboard(text);
    }
  }

  fallbackCopyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (error) {
      console.debug("CodeTweak: Fallback copy failed", error);
    }
    document.body.removeChild(textArea);
  }

  cleanup() {
    this.removeMenu();
    this.selector.cleanup();
  }
}
