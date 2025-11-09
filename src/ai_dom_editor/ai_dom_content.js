// AI DOM Editor Content Script
// Runs in the context of web pages to collect DOM info and apply changes

class AIDOMContent {
  constructor() {
    this.appliedChanges = [];
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'collectDOMSummary':
          this.collectDOMSummary().then(summary => {
            sendResponse({ success: true, summary });
          });
          return true; // Will respond asynchronously

        case 'applyDOMChanges':
          this.applyChanges(message.changes, message.isScript).then(result => {
            sendResponse(result);
          });
          return true;

        case 'startSelection':
          // Element selector is already handled by elementSelector.js
          // This is just for consistency
          break;

        case 'undoLastChange':
          this.undoLastChange().then(result => {
            sendResponse(result);
          });
          return true;
      }
    });
  }

  async collectDOMSummary() {
    try {
      const summary = {
        title: document.title,
        url: window.location.href,
        elements: this.summarizeElements()
      };

      return this.formatSummary(summary);
    } catch (error) {
      console.error('Error collecting DOM summary:', error);
      return 'Error collecting DOM information';
    }
  }

  summarizeElements() {
    const elements = [];
    const maxElements = 100; // Limit to avoid huge summaries
    
    // Get visible elements
    const allElements = document.querySelectorAll('body *');
    let count = 0;

    for (const el of allElements) {
      if (count >= maxElements) break;
      
      // Skip script, style, and hidden elements
      if (this.shouldSkipElement(el)) continue;

      const elementInfo = this.getElementInfo(el);
      if (elementInfo) {
        elements.push(elementInfo);
        count++;
      }
    }

    return elements;
  }

  shouldSkipElement(el) {
    const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'];
    if (skipTags.includes(el.tagName)) return true;

    // Skip invisible elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;

    // Skip CodeTweak elements
    if (el.className && el.className.toString().includes('ctwk-')) return true;

    return false;
  }

  getElementInfo(el) {
    try {
      const tag = el.tagName.toLowerCase();
      const info = { tag };

      // ID
      if (el.id) {
        info.id = el.id;
      }

      // Classes
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(Boolean).slice(0, 3);
        if (classes.length > 0) {
          info.classes = classes;
        }
      }

      // Key attributes
      const keyAttrs = ['role', 'type', 'name', 'aria-label', 'data-testid'];
      for (const attr of keyAttrs) {
        const value = el.getAttribute(attr);
        if (value) {
          info[attr] = value;
        }
      }

      // Inline styles (only if present)
      if (el.hasAttribute('style')) {
        info.style = el.getAttribute('style');
      }

      // Text content (truncated)
      if (el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE) {
        const text = el.textContent.trim();
        if (text && text.length < 50) {
          info.text = text;
        }
      }

      return info;
    } catch {
      return null;
    }
  }

  formatSummary(summary) {
    const lines = [
      `Page: ${summary.title}`,
      `URL: ${summary.url}`,
      '',
      'DOM Structure:'
    ];

    for (const el of summary.elements.slice(0, 50)) {
      let desc = `  <${el.tag}`;
      if (el.id) desc += ` id="${el.id}"`;
      if (el.classes) desc += ` class="${el.classes.join(' ')}"`;
      if (el.role) desc += ` role="${el.role}"`;
      desc += '>';
      
      if (el.text) {
        desc += ` ${el.text}`;
      }
      
      lines.push(desc);
    }

    if (summary.elements.length > 50) {
      lines.push(`  ... and ${summary.elements.length - 50} more elements`);
    }

    return lines.join('\n');
  }

  async applyChanges(changes, isScript) {
    try {
      if (isScript) {
        // Execute as JavaScript
        return await this.executeScript(changes);
      } else {
        // Apply as action array
        return await this.applyActions(changes);
      }
    } catch (error) {
      console.error('Error applying changes:', error);
      return { success: false, error: error.message };
    }
  }

  async executeScript(scriptCode) {
    try {
      // Create a safe execution context
      const safeGlobals = {
        document,
        window,
        console,
        // Add safe GM APIs if needed
        GM_addStyle: this.createGMAddStyle()
      };

      // Create function and execute
      const func = new Function(
        ...Object.keys(safeGlobals),
        scriptCode
      );

      func(...Object.values(safeGlobals));

      // Store for undo
      this.appliedChanges.push({
        type: 'script',
        code: scriptCode,
        timestamp: Date.now()
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async applyActions(actions) {
    try {
      const appliedActions = [];

      for (const action of actions) {
        const result = await this.applyAction(action);
        if (result.success) {
          appliedActions.push(action);
        }
      }

      if (appliedActions.length > 0) {
        this.appliedChanges.push({
          type: 'actions',
          actions: appliedActions,
          timestamp: Date.now()
        });
      }

      return {
        success: true,
        appliedCount: appliedActions.length,
        totalCount: actions.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async applyAction(action) {
    try {
      const elements = document.querySelectorAll(action.selector);
      
      if (elements.length === 0) {
        return { success: false, error: 'No elements found for selector' };
      }

      switch (action.type) {
        case 'style':
          elements.forEach(el => {
            el.style.cssText += action.value;
          });
          break;

        case 'text':
          elements.forEach(el => {
            el.textContent = action.value;
          });
          break;

        case 'remove':
          elements.forEach(el => el.remove());
          break;

        case 'insert':
          elements.forEach(el => {
            el.insertAdjacentHTML('beforeend', action.value);
          });
          break;

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  createGMAddStyle() {
    return (css) => {
      try {
        const style = document.createElement('style');
        style.textContent = css;
        style.setAttribute('data-ai-dom-editor', 'true');
        document.head.appendChild(style);
      } catch (error) {
        console.error('GM_addStyle error:', error);
      }
    };
  }

  async undoLastChange() {
    if (this.appliedChanges.length === 0) {
      return { success: false, error: 'No changes to undo' };
    }

    const lastChange = this.appliedChanges.pop();
    
    // For now, we'll just remove injected styles
    if (lastChange.type === 'script') {
      const injectedStyles = document.querySelectorAll('style[data-ai-dom-editor="true"]');
      injectedStyles.forEach(style => style.remove());
    }

    // Full undo would require storing original states
    // This is a simplified implementation
    return { success: true, message: 'Last change undone (page refresh recommended for full revert)' };
  }
}

// Initialize
new AIDOMContent();
