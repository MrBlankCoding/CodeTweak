/* global feather */

export class ElementSelector {
  constructor() {
    this.state = {
      isSelecting: false,
      currentElement: null,
      injected: false,
    };

    this.elements = {
      selectorIndicator: null,
      tooltip: null,
      breadcrumbs: null,
    };

    this.config = {
      Z_INDEX: 2147483646,
      VIEWPORT_MARGIN: 10,
      TOOLTIP_PADDING: 12,
    };

    this.onSelect = null;
    this.onCancel = null;

    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
  }

  get styles() {
    return `
      .ctwk-selector-mode { 
        position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; 
        background: rgba(17, 24, 39, 0.9); color: #e5e7eb; padding: 8px 12px; 
        border-radius: 8px; font: 500 13px/1.2 Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial; 
        z-index: ${
          this.config.Z_INDEX
        }; display: flex; gap: 8px; align-items: center; 
        box-shadow: 0 8px 30px rgba(0,0,0,.3); 
      }
      .ctwk-highlight { 
        outline: 2px solid #4ea1ff !important; outline-offset: -2px; 
        background-color: rgba(78,161,255,.08) !important; cursor: crosshair !important; 
      }
      .ctwk-tooltip { 
        position: fixed; z-index: ${
          this.config.Z_INDEX
        }; background: #111827; color: #d1d5db; 
        border: 1px solid rgba(148,163,184,.2); border-radius: 6px; padding: 4px 8px; 
        font: 500 12px/1.2 JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; 
        max-width: 60vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
        pointer-events: none; word-break: break-all; 
      }
      .ctwk-breadcrumbs { 
        position: fixed; z-index: ${
          this.config.Z_INDEX
        }; left: 50%; transform: translateX(-50%); 
        bottom: 50px; background: rgba(17, 24, 39, 0.9); border: 1px solid rgba(148,163,184,.2); 
        color: #e5e7eb; border-radius: 999px; padding: 6px 10px; display: flex; gap: 6px; 
        align-items: center; box-shadow: 0 8px 30px rgba(0,0,0,.3); max-width: 80vw; 
        overflow-x: auto; overflow-y: hidden; white-space: nowrap; scrollbar-width: thin; 
      }
      .ctwk-crumb { 
        font: 600 11px/1 Inter; color: #cbd5e1; background: rgba(255,255,255,.06); 
        padding: 4px 8px; border-radius: 999px; cursor: pointer; flex: 0 0 auto; 
        word-break: break-all; border: none; 
      }
      .ctwk-crumb:hover { background: rgba(255,255,255,.12); }
    `;
  }

  initEventListeners() {
    document.addEventListener("mousemove", this.boundHandleMouseMove, true);
    document.addEventListener("click", this.boundHandleClick, true);
    document.addEventListener("keydown", this.boundHandleKeyDown, true);
  }

  removeEventListeners() {
    document.removeEventListener("mousemove", this.boundHandleMouseMove, true);
    document.removeEventListener("click", this.boundHandleClick, true);
    document.removeEventListener("keydown", this.boundHandleKeyDown, true);
  }

  injectStylesOnce(menuStyles) {
    if (this.state.injected) return;
    this.state.injected = true;
    const style = document.createElement("style");
    style.setAttribute("data-codetweak", "element-selector");
    style.textContent = this.styles;
    document.documentElement.appendChild(style);

    if (menuStyles) {
      const menuStyleElement = document.createElement("style");
      menuStyleElement.setAttribute("data-codetweak", "element-selector-menu");
      menuStyleElement.textContent = menuStyles;
      document.documentElement.appendChild(menuStyleElement);
    }
  }

  startSelection(onSelect, onCancel, menuStyles) {
    this.injectStylesOnce(menuStyles);
    this.state.isSelecting = true;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this.initEventListeners();
    this.cleanup(false);
  }

  getUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) {
      const idSel = `#${CSS.escape(el.id)}`;
      try {
        if (document.querySelectorAll(idSel).length === 1) return idSel;
      } catch {
        // Invalid selector, continue
      }
    }

    const attrPrefs = [
      "data-testid",
      "data-test",
      "data-qa",
      "aria-label",
      "role",
      "name",
      "type",
      "alt",
      "title",
    ];
    const tag = el.tagName.toLowerCase();

    for (const attr of attrPrefs) {
      const val = el.getAttribute?.(attr);
      if (val) {
        const sel = `${tag}[${attr}="${CSS.escape(val)}"]`;
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch {
          // Invalid selector, continue
        }
      }
    }

    const classes =
      el.className && typeof el.className === "string"
        ? el.className.split(/\s+/).filter(Boolean)
        : [];

    if (classes.length) {
      for (const c of classes) {
        const sel = `.${CSS.escape(c)}`;
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch {
          // Invalid selector, continue
        }
      }

      const limited = classes.slice(0, 2);
      const comboSel = `${tag}${limited
        .map((c) => `.${CSS.escape(c)}`)
        .join("")}`;
      try {
        if (document.querySelectorAll(comboSel).length === 1) return comboSel;
      } catch {
        // Invalid selector, continue
      }
    }

    return this.buildHierarchicalSelector(el);
  }

  buildHierarchicalSelector(el) {
    const parts = [];
    let node = el;

    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();

      if (node.id) {
        part = `#${CSS.escape(node.id)}`;
        parts.unshift(part);
        break;
      }

      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (ch) => ch.tagName === node.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(part);
      node = parent;

      if (node === document.body) break;
    }

    return parts.join(" > ");
  }

  highlightElement(el) {
    this.clearHighlight();
    this.state.currentElement = el;
    if (this.state.currentElement) {
      this.state.currentElement.classList.add("ctwk-highlight");
    }
  }

  clearHighlight() {
    if (this.state.currentElement) {
      this.state.currentElement.classList.remove("ctwk-highlight");
      this.state.currentElement = null;
    }
  }

  updateTooltip(x, y) {
    if (!this.elements.tooltip) {
      this.elements.tooltip = document.createElement("div");
      this.elements.tooltip.className = "ctwk-tooltip";
      document.body.appendChild(this.elements.tooltip);
    }

    const selector = this.getUniqueSelector(this.state.currentElement);
    this.elements.tooltip.textContent = selector || "";

    const { left, top } = this.clampToViewport(
      x + this.config.TOOLTIP_PADDING,
      y + this.config.TOOLTIP_PADDING,
      this.elements.tooltip.offsetWidth || 200,
      this.elements.tooltip.offsetHeight || 24,
      x,
      y
    );

    this.elements.tooltip.style.left = `${left}px`;
    this.elements.tooltip.style.top = `${top}px`;
  }

  buildBreadcrumbs(el) {
    this.removeBreadcrumbs();

    this.elements.breadcrumbs = document.createElement("div");
    this.elements.breadcrumbs.className = "ctwk-breadcrumbs";

    const chain = this.buildElementChain(el);

    chain.forEach((node) => {
      const crumb = this.createBreadcrumb(node);
      this.elements.breadcrumbs.appendChild(crumb);
    });

    document.body.appendChild(this.elements.breadcrumbs);
  }

  buildElementChain(el) {
    const chain = [];
    let node = el;

    while (node && node.nodeType === 1) {
      chain.unshift(node);
      if (node === document.body) break;
      node = node.parentElement;
    }

    return chain;
  }

  createBreadcrumb(node) {
    const tag = node.tagName.toLowerCase();
    const label = node.id
      ? `${tag}#${node.id}`
      : node.className
      ? `${tag}.${String(node.className).split(/\s+/).filter(Boolean)[0] || ""}`
      : tag;

    const crumb = document.createElement("button");
    crumb.type = "button";
    crumb.className = "ctwk-crumb";
    crumb.textContent = label;
    crumb.addEventListener("click", (e) => {
      e.stopPropagation();
      this.highlightElement(node);
    });

    return crumb;
  }

  removeBreadcrumbs() {
    if (this.elements.breadcrumbs) {
      this.elements.breadcrumbs.remove();
      this.elements.breadcrumbs = null;
    }
  }

  removeTooltip() {
    if (this.elements.tooltip) {
      this.elements.tooltip.remove();
      this.elements.tooltip = null;
    }
  }

  removeSelectorIndicator() {
    if (this.elements.selectorIndicator) {
      this.elements.selectorIndicator.remove();
      this.elements.selectorIndicator = null;
    }
  }

  clampToViewport(x, y, width, height, fallbackX = null, fallbackY = null) {
    const margin = this.config.VIEWPORT_MARGIN;
    const pad = this.config.TOOLTIP_PADDING;

    let left = x;
    let top = y;

    if (fallbackX !== null && fallbackY !== null) {
      if (left + width > window.innerWidth - margin) {
        left = fallbackX - width - pad;
      }
      if (top + height > window.innerHeight - margin) {
        top = fallbackY - height - pad;
      }
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));

    return { left, top };
  }

  isUIElement(element) {
    if (!element) return false;
    const uiElements = [
      this.elements.breadcrumbs,
      this.elements.tooltip,
    ].filter(Boolean);
    return uiElements.some((uiEl) => uiEl.contains && uiEl.contains(element));
  }

  handleMouseMove(e) {
    if (!this.state.isSelecting) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || this.isUIElement(target)) return;

    this.highlightElement(target);
    this.updateTooltip(e.clientX, e.clientY);
    this.buildBreadcrumbs(target);
  }

  handleClick(e) {
    if (!this.state.isSelecting) return;
    if (this.isUIElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    if (this.onSelect) {
      this.onSelect(this.state.currentElement, e.clientX, e.clientY);
    }
  }

  handleKeyDown(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (this.onCancel) {
        this.onCancel();
      }
      this.cleanup();
      return;
    }

    if (!this.state.isSelecting) return;

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (this.onSelect) {
        this.onSelect(this.state.currentElement);
      }
    }
  }

  cleanup(fullCleanup = true) {
    this.clearHighlight();

    if (fullCleanup) {
      this.state.isSelecting = false;
      this.onSelect = null;
      this.onCancel = null;
      this.removeEventListeners();
    }

    this.removeSelectorIndicator();
    this.removeBreadcrumbs();
    this.removeTooltip();
  }
}
