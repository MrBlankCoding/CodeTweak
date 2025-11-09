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
        tags: this.getTagCounts(),
        classes: this.getTopClasses(),
        ids: this.getTopIds(),
        structure: this.getStructureSummary()
      };

      return JSON.stringify(summary, null, 2);
    } catch (error) {
      console.error('Error collecting DOM summary:', error);
      return JSON.stringify({ error: error.message });
    }
  }

  getTagCounts() {
    const tags = {};
    const elements = document.querySelectorAll('*');
    
    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      tags[tag] = (tags[tag] || 0) + 1;
    });

    // Return top 20 most common tags
    return Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {});
  }

  getTopClasses() {
    const classes = {};
    const elements = document.querySelectorAll('[class]');
    
    elements.forEach(el => {
      el.className.split(/\s+/).forEach(cls => {
        if (cls.trim()) {
          classes[cls] = (classes[cls] || 0) + 1;
        }
      });
    });

    // Return top 30 most common classes
    return Object.entries(classes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([cls]) => cls);
  }

  getTopIds() {
    const ids = [];
    const elements = document.querySelectorAll('[id]');
    
    elements.forEach(el => {
      if (el.id.trim()) {
        ids.push(el.id);
      }
    });

    return ids.slice(0, 50);
  }

  getStructureSummary() {
    const structure = {
      hasHeader: !!document.querySelector('header, [role="banner"]'),
      hasNav: !!document.querySelector('nav, [role="navigation"]'),
      hasMain: !!document.querySelector('main, [role="main"]'),
      hasFooter: !!document.querySelector('footer, [role="contentinfo"]'),
      hasSidebar: !!document.querySelector('aside, [role="complementary"]'),
      hasArticle: !!document.querySelector('article'),
      hasForm: !!document.querySelector('form'),
      hasTable: !!document.querySelector('table'),
      buttonCount: document.querySelectorAll('button, [role="button"]').length,
      linkCount: document.querySelectorAll('a[href]').length,
      imageCount: document.querySelectorAll('img').length
    };

    return structure;
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