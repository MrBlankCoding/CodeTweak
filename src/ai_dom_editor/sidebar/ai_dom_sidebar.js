// AI DOM Editor Sidebar Injector
// This content script injects the AI Editor sidebar into web pages

class AIDOMSidebar {
  constructor() {
    this.sidebar = null;
    this.iframe = null;
    this.isOpen = false;
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'openAIEditor') {
        this.toggleSidebar();
        sendResponse({ success: true });
      }
      return true;
    });

    // Listen for messages from the iframe
    window.addEventListener('message', (event) => {
      if (event.data.action === 'closeAIEditor') {
        this.closeSidebar();
      }
    });
  }

  toggleSidebar() {
    if (this.isOpen) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  }

  openSidebar() {
    if (!this.originalBodyMarginRight) {
      this.originalBodyMarginRight = document.body.style.marginRight || '0px';
    }

    if (this.sidebar) {
      this.sidebar.style.display = 'flex';
      document.body.style.marginRight = this.sidebar.style.width;
      document.body.classList.add('ctwk-ai-editor-sidebar-open');
      this.isOpen = true;
      return;
    }

    this.createSidebar();
    document.body.style.marginRight = this.sidebar.style.width;
    document.body.classList.add('ctwk-ai-editor-sidebar-open');
    this.isOpen = true;
  }

  createSidebar() {
    // Create sidebar container
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'ctwk-ai-editor-sidebar';
    this.sidebar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 420px;
      height: 100vh;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.src = chrome.runtime.getURL('ai_dom_editor/editor/ai_dom_editor.html');
    this.iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #0b0f19;
    `;

    this.sidebar.appendChild(this.iframe);
    document.body.appendChild(this.sidebar);

    // Add resize handle
    this.addResizeHandle();
  }

  addResizeHandle() {
    const handle = document.createElement('div');
    handle.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 4px;
      height: 100%;
      cursor: ew-resize;
      background: transparent;
      z-index: 10;
    `;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this.sidebar.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const delta = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 320), window.innerWidth - 200);
      this.sidebar.style.width = `${newWidth}px`;
      document.body.style.marginRight = this.sidebar.style.width;
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
      }
    });

    this.sidebar.appendChild(handle);
  }

  closeSidebar() {
    if (this.sidebar) {
      this.sidebar.style.display = 'none';
      this.isOpen = false;
      document.body.style.marginRight = this.originalBodyMarginRight;
      document.body.classList.remove('ctwk-ai-editor-sidebar-open');
    }
  }
}

// Initialize
if (!window.__ctwkAIDOMSidebar) {
  window.__ctwkAIDOMSidebar = new AIDOMSidebar();
}
