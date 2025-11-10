// AI DOM Editor Content Script
// Handles DOM collection and element selection

class AIDOMContent {
  constructor() {
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'collectDOMSummary') {
        const summary = this.collectDOMSummary();
        sendResponse({ success: true, summary });
        return true;
      }
      
      if (message.action === 'startSelection') {
        this.startElementSelection();
        sendResponse({ success: true });
        return true;
      }
      
      if (message.action === 'stopSelection') {
        this.stopElementSelection();
        sendResponse({ success: true });
        return true;
      }
      
      return false;
    });
  }

  collectDOMSummary() {
    try {
      const summary = {
        title: document.title,
        url: window.location.href,
        domTree: this.getDOMTree(document.body)
      };

      return JSON.stringify(summary, null, 2);
    } catch (error) {
      console.error('Error collecting DOM summary:', error);
      return JSON.stringify({ error: error.message });
    }
  }

  getDOMTree(element, depth = 0) {
    if (!element || depth > 7 || element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'NOSCRIPT') {
      return null;
    }

    const node = {
      tagName: element.tagName.toLowerCase(),
      attributes: {},
      children: []
    };

    // Get key attributes
    const attrsToInclude = ['id', 'class', 'role', 'href', 'src', 'alt', 'title', 'placeholder', 'type', 'name'];
    for (const attr of attrsToInclude) {
      if (element.hasAttribute(attr)) {
        node.attributes[attr] = element.getAttribute(attr);
      }
    }

    // Get truncated text content
    if (element.children.length === 0 && element.innerText && element.innerText.trim()) {
        node.text = element.innerText.trim().substring(0, 100);
    } else {
        // For non-leaf nodes, get only the immediate text
        let immediateText = '';
        if (element.childNodes) {
            for (const child of element.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                    immediateText += child.textContent.trim() + ' ';
                }
            }
        }
        if (immediateText.trim()) {
            node.text = immediateText.trim().substring(0, 100);
        }
    }


    // Recursively get children
    if (element.children.length > 0) {
      for (const child of element.children) {
        const childNode = this.getDOMTree(child, depth + 1);
        if (childNode) {
          node.children.push(childNode);
        }
      }
    }

    return node;
  }

  startElementSelection() {
    // Element selection is handled by elementSelector.js
    // This is just a placeholder for future functionality
  }

  stopElementSelection() {
    // Element selection is handled by elementSelector.js
    // This is just a placeholder for future functionality
  }
}

// Initialize
if (!window.__ctwkAIDOMContent) {
  window.__ctwkAIDOMContent = new AIDOMContent();
}
