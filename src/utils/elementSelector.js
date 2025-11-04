/* global feather */

class ElementSelector {
  constructor() {
    this.state = {
      isSelecting: false,
      currentElement: null,
      menuOpen: false,
      injected: false
    };
    
    this.elements = {
      menu: null,
      selectorIndicator: null,
      tooltip: null,
      breadcrumbs: null,
      overlay: null
    };
    
    this.config = {
      Z_INDEX: 2147483646,
      VIEWPORT_MARGIN: 10,
      TOOLTIP_PADDING: 12
    };
    
    this.initEventListeners();
  }

  get styles() {
    return `
      .ctwk-selector-mode { 
        position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; 
        background: rgba(17, 24, 39, 0.9); color: #e5e7eb; padding: 8px 12px; 
        border-radius: 8px; font: 500 13px/1.2 Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial; 
        z-index: ${this.config.Z_INDEX}; display: flex; gap: 8px; align-items: center; 
        box-shadow: 0 8px 30px rgba(0,0,0,.3); 
      }
      .ctwk-highlight { 
        outline: 2px solid #4ea1ff !important; outline-offset: -2px; 
        background-color: rgba(78,161,255,.08) !important; cursor: crosshair !important; 
      }
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
      .ctwk-tooltip { 
        position: fixed; z-index: ${this.config.Z_INDEX}; background: #111827; color: #d1d5db; 
        border: 1px solid rgba(148,163,184,.2); border-radius: 6px; padding: 4px 8px; 
        font: 500 12px/1.2 JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; 
        max-width: 60vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
        pointer-events: none; word-break: break-all; 
      }
      .ctwk-breadcrumbs { 
        position: fixed; z-index: ${this.config.Z_INDEX}; left: 50%; transform: translateX(-50%); 
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
      .ctwk-menu-overlay { 
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        z-index: ${this.config.Z_INDEX - 1}; background: transparent; 
      }
    `;
  }

  get actionTemplates() {
    return {
      hide: (selector) =>
        `document.querySelector(${JSON.stringify(selector)})?.style.setProperty('display', 'none', 'important');`,
      remove: (selector) => 
        `document.querySelector(${JSON.stringify(selector)})?.remove();`,
      click: (selector) => 
        `document.querySelector(${JSON.stringify(selector)})?.click();`,
      observe: (selector) => `const observer = new MutationObserver((mutations) => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (element) {
    console.log('Element changed:', element);
  }
});

const target = document.querySelector(${JSON.stringify(selector)});
if (target) {
  observer.observe(target, { attributes: true, childList: true, characterData: true });
}`
    };
  }

  initEventListeners() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'startSelection') {
        this.startSelection();
      }
    });

    document.addEventListener('mousemove', this.handleMouseMove.bind(this), true);
    document.addEventListener('click', this.handleClick.bind(this), true);
    document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
  }

  injectStylesOnce() {
    if (this.state.injected) return;
    
    this.state.injected = true;
    const style = document.createElement('style');
    style.setAttribute('data-codetweak', 'element-selector');
    style.textContent = this.styles;
    document.documentElement.appendChild(style);
  }

  startSelection() {
    this.injectStylesOnce();
    this.state.isSelecting = true;
    this.state.menuOpen = false;
    this.cleanup(false); 
  }

  getUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) {
      const idSel = `#${CSS.escape(el.id)}`;
      try { 
        if (document.querySelectorAll(idSel).length === 1) return idSel; 
      } catch { 
        // Invalid selector, continue
      }
    }

    const attrPrefs = ['data-testid', 'data-test', 'data-qa', 'aria-label', 'role', 'name', 'type', 'alt', 'title'];
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

    const classes = (el.className && typeof el.className === 'string')
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
      const comboSel = `${tag}${limited.map(c => `.${CSS.escape(c)}`).join('')}`;
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
        const siblings = Array.from(parent.children).filter(ch => ch.tagName === node.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      
      parts.unshift(part);
      node = parent;
      
      if (node === document.body) break;
    }
    
    return parts.join(' > ');
  }

  // Element highlighting
  highlightElement(el) {
    this.clearHighlight();
    this.state.currentElement = el;
    if (this.state.currentElement) {
      this.state.currentElement.classList.add('ctwk-highlight');
    }
  }

  clearHighlight() {
    if (this.state.currentElement) {
      this.state.currentElement.classList.remove('ctwk-highlight');
      this.state.currentElement = null;
    }
  }

  // UI Elements
  updateTooltip(x, y) {
    if (!this.elements.tooltip) {
      this.elements.tooltip = document.createElement('div');
      this.elements.tooltip.className = 'ctwk-tooltip';
      document.body.appendChild(this.elements.tooltip);
    }
    
    const selector = this.getUniqueSelector(this.state.currentElement);
    this.elements.tooltip.textContent = selector || '';
    
    // Position tooltip with viewport clamping
    const { left, top } = this.clampToViewport(
      x + this.config.TOOLTIP_PADDING, 
      y + this.config.TOOLTIP_PADDING,
      this.elements.tooltip.offsetWidth || 200,
      this.elements.tooltip.offsetHeight || 24,
      x, y
    );
    
    this.elements.tooltip.style.left = `${left}px`;
    this.elements.tooltip.style.top = `${top}px`;
  }

  buildBreadcrumbs(el) {
    this.removeBreadcrumbs();
    
    this.elements.breadcrumbs = document.createElement('div');
    this.elements.breadcrumbs.className = 'ctwk-breadcrumbs';

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
      : (node.className 
          ? `${tag}.${String(node.className).split(/\s+/).filter(Boolean)[0] || ''}` 
          : tag);
    
    const crumb = document.createElement('button');
    crumb.type = 'button';
    crumb.className = 'ctwk-crumb';
    crumb.textContent = label;
    crumb.addEventListener('click', (e) => {
      e.stopPropagation();
      this.highlightElement(node);
    });
    
    return crumb;
  }

  // Menu management
  createMenu(x, y) {
    this.removeMenu();
    
    this.state.menuOpen = true;
    this.state.isSelecting = false;

    this.createMenuOverlay();
    this.createMenuElement(x, y);
    this.positionMenu();
  }

  createMenuOverlay() {
    this.elements.overlay = document.createElement('div');
    this.elements.overlay.className = 'ctwk-menu-overlay';
    this.elements.overlay.addEventListener('click', () => this.cleanup());
    document.body.appendChild(this.elements.overlay);
  }

  createMenuElement(x, y) {
    this.elements.menu = document.createElement('div');
    this.elements.menu.className = 'ctwk-menu';
    
    // Initial positioning
    this.elements.menu.style.left = `${x}px`;
    this.elements.menu.style.top = `${y}px`;

    this.elements.menu.appendChild(this.createMenuHeader());
    this.elements.menu.appendChild(this.createMenuBody());
    this.elements.menu.appendChild(this.createMenuFooter());
    
    document.body.appendChild(this.elements.menu);
    feather.replace();
  }

  createMenuHeader() {
    const header = document.createElement('div');
    header.className = 'ctwk-menu-header';
    
    const selector = this.getUniqueSelector(this.state.currentElement);
    const displayText = selector 
      ? (selector.length > 50 ? selector.slice(0, 50) + '…' : selector)
      : 'No element selected';
    
    header.textContent = displayText;
    return header;
  }

  createMenuBody() {
    const body = document.createElement('div');
    body.className = 'ctwk-menu-body';

    const menuItems = [
      { icon: '📋', text: 'Copy Selector', action: 'copy' },
      { icon: '🚫', text: 'Hide Element', action: 'hide' },
      { icon: '❌', text: 'Remove Element', action: 'remove' },
      { icon: '👆', text: 'Click Element', action: 'click' },
      { icon: '👀', text: 'Watch Changes', action: 'observe' },
    ];

    menuItems.forEach(({ icon, text, action }) => {
      const item = this.createMenuItem(icon, text, action);
      body.appendChild(item);
    });

    return body;
  }

  createMenuItem(icon, text, action) {
  const item = document.createElement('div');
  item.className = 'ctwk-menu-item';
  item.tabIndex = 0;
  const spanI = document.createElement('span');
  spanI.className = 'i';
  const i = document.createElement('i');
  i.setAttribute('data-feather', this.iconName(action));
  spanI.appendChild(i);
    const spanText = document.createElement('span');
    spanText.textContent = text;
    item.appendChild(spanI);
    item.appendChild(spanText);
    
    const handleAction = (e) => {
      e.stopPropagation();
      this.handleAction(action);
    };
    
    item.addEventListener('click', handleAction);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleAction(e);
      }
    });
    
    return item;
  }

  createMenuFooter() {
    const footer = document.createElement('div');
    footer.className = 'ctwk-menu-footer';
    const span = document.createElement('span');
    span.textContent = 'Click item to execute · Esc: cancel';
    footer.appendChild(span);
    return footer;
  }

  // Feather icon names for actions
  iconName(action) {
  switch (action) {
  case 'copy':
  return 'copy';
  case 'hide':
  return 'eye-off';
  case 'remove':
  return 'trash-2';
  case 'click':
  return 'mouse-pointer';
  case 'observe':
  return 'watch';
  default:
  return 'circle';
  }
  }

  positionMenu() {
    setTimeout(() => {
      if (!this.elements.menu) return;
      
      const rect = this.elements.menu.getBoundingClientRect();
      const { left, top } = this.clampToViewport(
        rect.left, rect.top, rect.width, rect.height
      );
      
      this.elements.menu.style.left = `${left}px`;
      this.elements.menu.style.top = `${top}px`;
      
      // Focus first menu item
      const firstItem = this.elements.menu.querySelector('.ctwk-menu-item');
      firstItem?.focus();
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

  // Utility functions
  clampToViewport(x, y, width, height, fallbackX = null, fallbackY = null) {
    const margin = this.config.VIEWPORT_MARGIN;
    const pad = this.config.TOOLTIP_PADDING;
    
    let left = x;
    let top = y;
    
    // Handle tooltip positioning with fallback
    if (fallbackX !== null && fallbackY !== null) {
      // Adjust if going off right edge
      if (left + width > window.innerWidth - margin) {
        left = fallbackX - width - pad;
      }
      
      // Adjust if going off bottom edge
      if (top + height > window.innerHeight - margin) {
        top = fallbackY - height - pad;
      }
    }
    
    // Final clamp to viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    
    return { left, top };
  }

  isUIElement(element) {
    if (!element) return false;
    
    const uiElements = [
      this.elements.menu,
      this.elements.breadcrumbs,
      this.elements.tooltip,
      this.elements.overlay
    ].filter(Boolean);
    
    return uiElements.some(uiEl => uiEl.contains && uiEl.contains(element));
  }

  // Event handlers
  handleMouseMove(e) {
    if (!this.state.isSelecting || this.state.menuOpen) return;
    
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || this.isUIElement(target)) return;
    
    this.highlightElement(target);
    this.updateTooltip(e.clientX, e.clientY);
    this.buildBreadcrumbs(target);
  }

  handleClick(e) {
    if (!this.state.isSelecting || this.state.menuOpen) return;
    if (this.isUIElement(e.target)) return;
    
    e.preventDefault();
    e.stopPropagation();
    this.createMenu(e.clientX, e.clientY);
  }

  handleKeyDown(e) {
    // ESC key works in both modes
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      this.cleanup();
      return;
    }
    
    // Other keys only work in selection mode
    if (!this.state.isSelecting || this.state.menuOpen) return;
    
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = this.state.currentElement?.getBoundingClientRect?.();
      const x = rect ? rect.left + Math.min(24, rect.width / 2) : 20;
      const y = rect ? rect.top + 16 : 20;
      this.createMenu(Math.max(10, x), Math.max(10, y));
    }
  }

  // Action handling
  async handleAction(action) {
    const selector = this.getUniqueSelector(this.state.currentElement);
    if (!selector) {
      this.cleanup();
      return;
    }

    if (action === 'copy') {
      await this.copyToClipboard(selector);
      this.cleanup();
      return;
    }

    const template = this.actionTemplates[action]?.(selector);
    if (template) {
      try {
        chrome.runtime.sendMessage({
          action: 'createScript',
          data: { 
            selector, 
            template, 
            url: window.location.href 
          },
        });
      } catch (error) {
        console.error('CodeTweak: Failed to send message to extension', error);
      }
    }
    
    this.cleanup();
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.debug('CodeTweak: Clipboard write failed', error);
      this.fallbackCopyToClipboard(text);
    }
  }

  fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
    } catch (error) {
      console.debug('CodeTweak: Fallback copy failed', error);
    }
    
    document.body.removeChild(textArea);
  }

  // Cleanup
  cleanup(fullCleanup = true) {
    this.clearHighlight();
    
    if (fullCleanup) {
      this.state.isSelecting = false;
    }
    
    this.state.menuOpen = false;
    
    // Remove all UI elements
    this.removeMenu();
    this.removeSelectorIndicator();
    this.removeBreadcrumbs();
    this.removeTooltip();
  }
}

// Initialize the selector
export const elementSelector = new ElementSelector();