// Summarises the DOM
// Very IMPORTANT be careful with tweaks
class AIDOMContent {
  constructor() {
    this.setupMessageListener();
    
    this.config = {
      maxTokens: 30000,
      charsPerToken: 4,
      maxChars: 120000, // 30k tokens * 4 chars/token Assumtions could be based on model but for now lets just do 30
      maxDepth: 4,
      maxChildren: 8,
      maxTextLength: 40,
      maxAttributeValue: 50,
      interactiveTagsPriority: ['button', 'a', 'input', 'select', 'textarea', 'form'],
      contentTags: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'span', 'div'],
      skipTags: ['script', 'style', 'noscript', 'svg', 'path', 'meta', 'link'],
      criticalAttributes: ['id', 'class', 'name', 'type', 'role', 'aria-label', 'href', 'src', 'value', 'placeholder']
    };
  }

  setupMessageListener() {
    if (window.__ctwkDOMContentListenerAdded) {
      return;
    }
    window.__ctwkDOMContentListenerAdded = true;

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
      // First pass: collect with size tracking
      const collectionResult = this.smartCollectDOM();
      
      const summary = {
        title: document.title,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        stats: collectionResult.stats,
        domTree: collectionResult.tree
      };

      const jsonSummary = JSON.stringify(summary);
      
      return jsonSummary;
    } catch (error) {
      console.error('❌ [DOM Collector] Error:', error);
      return JSON.stringify({ error: error.message });
    }
  }

  smartCollectDOM() {
    const stats = {
      totalNodes: 0,
      skippedNodes: 0,
      maxDepthReached: 0,
      charCount: 0
    };

    // Strategy: Multi-pass collection with priority scoring
    // 1. Find main content area
    // 2. Collect interactive elements (high priority)
    // 3. Collect content structure (medium priority)
    // 4. Fill remaining budget with context
    
    const mainContent = this.findMainContent();
    const tree = this.getDOMTree(mainContent || document.body, 0, stats);
    
    return { tree, stats };
  }

  findMainContent() {
    const candidates = [
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('article'),
      document.querySelector('#content'),
      document.querySelector('#main-content'),
      document.querySelector('.content'),
      document.querySelector('.main-content')
    ].filter(Boolean);

    if (candidates.length > 0) {
      return candidates.reduce((best, current) => {
        const bestText = best.innerText?.length || 0;
        const currentText = current.innerText?.length || 0;
        return currentText > bestText ? current : best;
      });
    }

    return null;
  }

  shouldSkipElement(element) {
    if (!element || !element.tagName) return true;
    
    const tagName = element.tagName.toLowerCase();
    
    if (this.config.skipTags.includes(tagName)) return true;
    
    if (element.id === 'ctwk-ai-editor-sidebar' || 
        element.closest?.('#ctwk-ai-editor-sidebar')) return true;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0') return true;
    
    const rect = element.getBoundingClientRect();
    if (rect.width < 5 && rect.height < 5) return true;
    
    const id = element.id?.toLowerCase() || '';
    const className = element.className?.toString().toLowerCase() || '';
    const skipPatterns = [
      'cookie', 'gdpr', 'consent', 'banner', 'popup', 'modal', 'overlay',
      'advertisement', 'ad-', '-ad', 'sponsor', 'tracking',
      'social-share', 'share-button', 'comment-form', 'newsletter',
      'related-posts', 'recommended', 'sidebar-widget'
    ];
    
    return skipPatterns.some(pattern => 
      id.includes(pattern) || className.includes(pattern)
    );
  }

  calculateNodePriority(element) {
    const tagName = element.tagName.toLowerCase();
    let priority = 0;
    
    if (this.config.interactiveTagsPriority.includes(tagName)) {
      priority += 100;
    }
    
    if (this.config.contentTags.includes(tagName)) {
      priority += 50;
    }
    
    if (element.id) {
      priority += 30;
    }
    
    if (element.getAttribute('aria-label')) {
      priority += 20;
    }
    
    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.top <= window.innerHeight) {
      priority += 40;
    }
    
    return priority;
  }

  getDOMTree(element, depth, stats, budget = this.config.maxChars) {
    if (stats.charCount > budget * 0.9) {
      return null;
    }

    if (depth > this.config.maxDepth || this.shouldSkipElement(element)) {
      stats.skippedNodes++;
      return null;
    }

    stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
    stats.totalNodes++;

    const tagName = element.tagName.toLowerCase();
    const priority = this.calculateNodePriority(element);
    
    const node = {
      tag: tagName,
      ...(priority > 70 && { p: Math.floor(priority) })
    };

    const attrs = this.getMinimalAttributes(element);
    if (Object.keys(attrs).length > 0) {
      node.a = attrs;
    }
    const text = this.getMinimalText(element, tagName);
    if (text) {
      node.t = text;
      stats.charCount += text.length;
    }

    const children = this.collectChildren(element, depth, stats, budget);
    if (children.length > 0) {
      node.c = children;
    }

    const nodeSize = JSON.stringify(node).length;
    stats.charCount += nodeSize;

    return node;
  }

  getMinimalAttributes(element) {
    const attrs = {};
    const priority = this.calculateNodePriority(element);
    
    const attributesToCheck = priority > 70 
      ? this.config.criticalAttributes 
      : ['id', 'class', 'role'];

    for (const attrName of attributesToCheck) {
      const value = element.getAttribute(attrName);
      if (value) {
        // Shorten class names - keep only first 2-3 meaningful classes
        if (attrName === 'class') {
          const classes = value.split(/\s+/)
            .filter(c => c.length > 0 && !c.startsWith('_') && !c.match(/^[a-f0-9]{6,}$/))
            .slice(0, 3)
            .join(' ');
          if (classes) attrs[attrName] = classes;
        } else if (attrName === 'style') {
          // Skip inline styles - too verbose
          continue;
        } else {
          // Truncate long attribute values
          const truncated = value.length > this.config.maxAttributeValue 
            ? value.substring(0, this.config.maxAttributeValue) + '...'
            : value;
          attrs[attrName] = truncated;
        }
      }
    }

    return attrs;
  }

  getMinimalText(element, tagName) {
    const isContainer = ['div', 'section', 'article', 'aside', 'nav'].includes(tagName);
    
    if (element.children.length === 0) {
      const text = element.innerText?.trim();
      if (!text) return null;
      
      const maxLen = this.config.interactiveTagsPriority.includes(tagName)
        ? 60
        : this.config.maxTextLength;
      
      return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
    } else if (!isContainer) {
      let immediateText = '';
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent.trim();
          if (text) immediateText += text + ' ';
        }
      }
      const trimmed = immediateText.trim();
      if (!trimmed) return null;
      
      return trimmed.length > this.config.maxTextLength 
        ? trimmed.substring(0, this.config.maxTextLength) + '…'
        : trimmed;
    }
    
    return null;
  }

  collectChildren(element, depth, stats, budget) {
    const children = [];
    
    if (!element.children || element.children.length === 0) {
      return children;
    }

    const scoredChildren = Array.from(element.children)
      .map(child => ({
        element: child,
        priority: this.calculateNodePriority(child)
      }))
      .sort((a, b) => b.priority - a.priority); // Highest priority first

    // Adaptive child limit based on depth and budget remaining
    const budgetRemaining = budget - stats.charCount;
    const budgetRatio = budgetRemaining / budget;
    
    let maxChildren = this.config.maxChildren;
    if (depth > 2) maxChildren = Math.max(4, Math.floor(maxChildren * budgetRatio));
    if (depth > 3) maxChildren = Math.max(2, Math.floor(maxChildren * budgetRatio * 0.5));

    let collected = 0;
    let skipped = 0;

    for (const { element: child, priority } of scoredChildren) {
      // Stop if budget is tight and this is low priority
      if (budgetRatio < 0.3 && priority < 50) {
        skipped++;
        continue;
      }

      if (collected >= maxChildren) {
        skipped++;
        continue;
      }

      const childNode = this.getDOMTree(child, depth + 1, stats, budget);
      if (childNode) {
        children.push(childNode);
        collected++;
      } else {
        skipped++;
      }

      // Emergency brake if approaching budget
      if (stats.charCount > budget * 0.95) {
        skipped += scoredChildren.length - collected - skipped;
        break;
      }
    }

    // Add ellipsis indicator if we skipped children
    if (skipped > 0) {
      children.push({
        tag: '...',
        t: `+${skipped} more`
      });
    }

    return children;
  }

  startElementSelection() {
    // Placeholder for element selection functionality
  }

  stopElementSelection() {
    // Placeholder for element selection functionality
  }
}

// Initialize
if (!window.__ctwkAIDOMContent) {
  window.__ctwkAIDOMContent = new AIDOMContent();
}