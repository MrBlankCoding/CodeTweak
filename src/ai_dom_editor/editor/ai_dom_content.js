class AIDOMContent {
  constructor() {
    this.maxNodes = 180;
    this.maxTextLen = 120;
    this.maxAttrLen = 80;
    this.maxChars = 45000;
    this.skipTags = new Set([
      "script",
      "style",
      "noscript",
      "meta",
      "link",
      "svg",
      "path",
      "iframe",
    ]);

    this.setupMessageListener();
  }

  setupMessageListener() {
    if (window.__ctwkAIDOMSummaryListener) {
      return;
    }

    window.__ctwkAIDOMSummaryListener = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action !== "collectDOMSummary") {
        return false;
      }

      try {
        sendResponse({
          success: true,
          summary: this.collectDOMSummary(),
        });
      } catch (error) {
        sendResponse({
          success: false,
          summary: JSON.stringify({ error: error.message }),
        });
      }

      return true;
    });
  }

  collectDOMSummary() {
    const root = this._findRoot();
    const nodes = [];
    this._walk(root, nodes);

    const summary = {
      page: {
        title: document.title,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
      landmarks: this._collectLandmarks(),
      nodes,
    };

    const text = JSON.stringify(summary);
    if (text.length <= this.maxChars) {
      return text;
    }

    while (nodes.length > 40 && JSON.stringify(summary).length > this.maxChars) {
      nodes.pop();
    }

    return JSON.stringify(summary);
  }

  _findRoot() {
    return (
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("article") ||
      document.body
    );
  }

  _collectLandmarks() {
    const selectors = [
      "header",
      "nav",
      "main",
      "article",
      "section",
      "aside",
      "footer",
      "form",
      "button",
      "a",
      "input",
      "select",
      "textarea",
    ];

    const landmarks = [];

    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll(selector)).slice(0, 8);
      for (const el of matches) {
        const desc = this._describeElement(el);
        if (desc) landmarks.push(desc);
      }
      if (landmarks.length >= 50) break;
    }

    return landmarks;
  }

  _walk(root, output) {
    const queue = [{ el: root, depth: 0 }];

    while (queue.length && output.length < this.maxNodes) {
      const { el, depth } = queue.shift();
      if (!el || this._shouldSkip(el)) continue;

      const desc = this._describeElement(el, depth);
      if (desc) {
        output.push(desc);
      }

      if (depth >= 4) continue;

      const children = Array.from(el.children)
        .sort((a, b) => this._priority(b) - this._priority(a))
        .slice(0, 10);

      for (const child of children) {
        queue.push({ el: child, depth: depth + 1 });
      }
    }
  }

  _priority(el) {
    let score = 0;
    const tag = el.tagName.toLowerCase();

    if (["button", "a", "input", "select", "textarea", "form"].includes(tag)) {
      score += 90;
    }

    if (["h1", "h2", "h3", "p", "article", "main", "nav"].includes(tag)) {
      score += 50;
    }

    if (el.id) score += 25;
    if (el.getAttribute("aria-label")) score += 20;
    if (el.getBoundingClientRect().top < window.innerHeight) score += 15;

    return score;
  }

  _shouldSkip(el) {
    if (!el?.tagName) return true;

    const tag = el.tagName.toLowerCase();
    if (this.skipTags.has(tag)) return true;

    if (el.id === "ctwk-ai-editor-sidebar" || el.closest?.("#ctwk-ai-editor-sidebar")) {
      return true;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return true;

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return true;

    return false;
  }

  _describeElement(el, depth = 0) {
    try {
      const tag = el.tagName.toLowerCase();
      const attrs = this._extractAttributes(el);
      const text = this._extractText(el);

      const payload = {
        tag,
        depth,
      };

      if (Object.keys(attrs).length) payload.attrs = attrs;
      if (text) payload.text = text;

      return payload;
    } catch {
      return null;
    }
  }

  _extractAttributes(el) {
    const attrs = {};
    const keys = [
      "id",
      "class",
      "name",
      "type",
      "role",
      "aria-label",
      "placeholder",
      "href",
      "data-testid",
    ];

    for (const key of keys) {
      const value = el.getAttribute(key);
      if (!value) continue;

      let normalized = value.trim();
      if (!normalized) continue;

      if (key === "class") {
        normalized = normalized
          .split(/\s+/)
          .slice(0, 4)
          .join(" ");
      }

      attrs[key] = normalized.slice(0, this.maxAttrLen);
    }

    return attrs;
  }

  _extractText(el) {
    let text = "";

    if (el.children.length === 0) {
      text = (el.textContent || "").trim();
    } else {
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const segment = (node.textContent || "").trim();
        if (!segment) continue;
        text += `${segment} `;
      }
      text = text.trim();
    }

    if (!text) return "";
    return text.replace(/\s+/g, " ").slice(0, this.maxTextLen);
  }
}

if (!window.__ctwkAIDOMContent) {
  window.__ctwkAIDOMContent = new AIDOMContent();
}
