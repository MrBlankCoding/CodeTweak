/**
 * CodeMirror Minimap Addon
 * Provides a miniaturized overview of the entire document with viewport navigation
 */

(function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
      mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
      define(["../../lib/codemirror"], mod);
    else // Plain browser env
      mod(CodeMirror);
  })(function(CodeMirror) {
    "use strict";
  
    class CodeMirrorMinimap {
      constructor(cm, options = {}) {
        this.cm = cm;
        this.options = {
          width: options.width || 120,
          height: options.height || null, // Auto-calculate based on editor height
          fontSize: options.fontSize || 2,
          lineHeight: options.lineHeight || 3,
          showViewport: options.showViewport !== false,
          viewportColor: options.viewportColor || 'rgba(255, 255, 255, 0.1)',
          viewportBorderColor: options.viewportBorderColor || 'rgba(255, 255, 255, 0.3)',
          backgroundColor: options.backgroundColor || 'rgba(0, 0, 0, 0.1)',
          textColor: options.textColor || 'rgba(255, 255, 255, 0.6)',
          scrollbarWidth: options.scrollbarWidth || 8,
          updateDelay: options.updateDelay || 100,
          ...options
        };
  
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.viewportIndicator = null;
        this.isMouseDown = false;
        this.updateTimeout = null;
        this.resizeObserver = null;
  
        this.init();
      }
  
      init() {
        this.createElements();
        this.setupEventListeners();
        this.scheduleUpdate();
      }
  
      createElements() {
        // Create minimap container
        this.container = document.createElement('div');
        this.container.className = 'CodeMirror-minimap';
        this.container.style.cssText = `
          position: absolute;
          top: 0;
          right: 0;
          width: ${this.options.width}px;
          height: 100%;
          background: ${this.options.backgroundColor};
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 10;
          cursor: pointer;
          user-select: none;
          overflow: hidden;
        `;
  
        // Create canvas for rendering code
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
          display: block;
          width: 100%;
          height: 100%;
        `;
        this.ctx = this.canvas.getContext('2d');
  
        // Create viewport indicator
        this.viewportIndicator = document.createElement('div');
        this.viewportIndicator.className = 'CodeMirror-minimap-viewport';
        this.viewportIndicator.style.cssText = `
          position: absolute;
          left: 0;
          right: 0;
          background: ${this.options.viewportColor};
          border: 1px solid ${this.options.viewportBorderColor};
          border-radius: 2px;
          pointer-events: none;
          transition: opacity 0.2s ease;
        `;
  
        this.container.appendChild(this.canvas);
        if (this.options.showViewport) {
          this.container.appendChild(this.viewportIndicator);
        }
  
        // Insert minimap into editor wrapper
        const wrapper = this.cm.getWrapperElement();
        wrapper.style.position = 'relative';
        wrapper.appendChild(this.container);
  
        // Adjust editor to make room for minimap
        const editorElement = wrapper.querySelector('.CodeMirror-scroll');
        if (editorElement) {
          editorElement.style.marginRight = `${this.options.width}px`;
        }
      }
  
      setupEventListeners() {
        // CodeMirror events
        this.cm.on('change', () => this.scheduleUpdate());
        this.cm.on('scroll', () => this.updateViewport());
        this.cm.on('viewportChange', () => this.scheduleUpdate());
        this.cm.on('cursorActivity', () => this.updateViewport());
  
        // Mouse events for navigation
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.container.addEventListener('mouseup', () => this.handleMouseUp());
        this.container.addEventListener('mouseleave', () => this.handleMouseUp());
  
        // Resize observer for responsive updates
        if (window.ResizeObserver) {
          this.resizeObserver = new ResizeObserver(() => {
            this.updateCanvasSize();
            this.scheduleUpdate();
          });
          this.resizeObserver.observe(this.cm.getWrapperElement());
        }
  
        // Window resize fallback
        window.addEventListener('resize', () => {
          this.updateCanvasSize();
          this.scheduleUpdate();
        });
      }
  
      updateCanvasSize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.ctx.scale(dpr, dpr);
      }
  
      scheduleUpdate() {
        if (this.updateTimeout) {
          clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => {
          this.update();
        }, this.options.updateDelay);
      }
  
      update() {
        this.updateCanvasSize();
        this.renderMinimap();
        this.updateViewport();
      }
  
      renderMinimap() {
        const ctx = this.ctx;
        const rect = this.container.getBoundingClientRect();
        const doc = this.cm.getDoc();
        const lineCount = doc.lineCount();
        
        // Clear canvas
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        // Calculate dimensions
        const availableHeight = rect.height - 20; // Leave some padding
        const lineHeight = Math.max(1, availableHeight / lineCount);
        const charWidth = this.options.fontSize * 0.6;
        
        // Set font
        ctx.font = `${this.options.fontSize}px monospace`;
        ctx.fillStyle = this.options.textColor;
        ctx.textBaseline = 'top';
  
        // Render lines
        for (let i = 0; i < lineCount; i++) {
          const line = doc.getLine(i);
          if (!line) continue;
  
          const y = 10 + (i * lineHeight);
          
          // Render line content (simplified)
          const maxChars = Math.floor((rect.width - 20) / charWidth);
          const displayText = line.length > maxChars ? line.substring(0, maxChars) : line;
          
          // Color coding for different syntax elements
          this.renderLineWithSyntaxHighlighting(ctx, displayText, 5, y, charWidth);
        }
      }
  
      renderLineWithSyntaxHighlighting(ctx, text, x, y, charWidth) {
        // Simple syntax highlighting
        const colors = {
          keyword: '#569cd6',
          string: '#ce9178',
          comment: '#6a9955',
          number: '#b5cea8',
          default: this.options.textColor
        };
  
        // Basic regex patterns for syntax highlighting
        const patterns = [
          { regex: /\/\/.*$|\/\*[\s\S]*?\*\//g, color: colors.comment },
          { regex: /"[^"]*"|'[^']*'|`[^`]*`/g, color: colors.string },
          { regex: /\b(function|var|let|const|if|else|for|while|return|class|import|export)\b/g, color: colors.keyword },
          { regex: /\b\d+\.?\d*\b/g, color: colors.number }
        ];
  
        let currentX = x;
        let processedText = text;
        let matches = [];
  
        // Collect all matches
        patterns.forEach(pattern => {
          let match;
          while ((match = pattern.regex.exec(text)) !== null) {
            matches.push({
              start: match.index,
              end: match.index + match[0].length,
              color: pattern.color,
              text: match[0]
            });
          }
        });
  
        // Sort matches by position
        matches.sort((a, b) => a.start - b.start);
  
        // Render text with highlighting
        let lastEnd = 0;
        matches.forEach(match => {
          // Render text before match
          if (match.start > lastEnd) {
            ctx.fillStyle = colors.default;
            const beforeText = text.substring(lastEnd, match.start);
            ctx.fillText(beforeText, currentX, y);
            currentX += beforeText.length * charWidth;
          }
  
          // Render highlighted match
          ctx.fillStyle = match.color;
          ctx.fillText(match.text, currentX, y);
          currentX += match.text.length * charWidth;
          lastEnd = match.end;
        });
  
        // Render remaining text
        if (lastEnd < text.length) {
          ctx.fillStyle = colors.default;
          const remainingText = text.substring(lastEnd);
          ctx.fillText(remainingText, currentX, y);
        }
      }
  
      updateViewport() {
        if (!this.options.showViewport) return;
  
        const scrollInfo = this.cm.getScrollInfo();
        const rect = this.container.getBoundingClientRect();
        const doc = this.cm.getDoc();
        const lineCount = doc.lineCount();
        
        if (lineCount === 0) return;
  
        // Calculate viewport position and size
        const totalHeight = rect.height - 20; // Account for padding
        const lineHeight = totalHeight / lineCount;
        
        const viewportTop = (scrollInfo.top / scrollInfo.height) * totalHeight + 10;
        const viewportHeight = (scrollInfo.clientHeight / scrollInfo.height) * totalHeight;
        
        // Update viewport indicator
        this.viewportIndicator.style.top = `${Math.max(0, viewportTop)}px`;
        this.viewportIndicator.style.height = `${Math.min(viewportHeight, totalHeight)}px`;
        
        // Show/hide viewport based on scroll necessity
        const needsScrollbar = scrollInfo.height > scrollInfo.clientHeight;
        this.viewportIndicator.style.opacity = needsScrollbar ? '1' : '0.3';
      }
  
      handleMouseDown(e) {
        this.isMouseDown = true;
        this.navigateToPosition(e);
        e.preventDefault();
      }
  
      handleMouseMove(e) {
        if (this.isMouseDown) {
          this.navigateToPosition(e);
        }
      }
  
      handleMouseUp() {
        this.isMouseDown = false;
      }
  
      navigateToPosition(e) {
        const rect = this.container.getBoundingClientRect();
        const relativeY = e.clientY - rect.top - 10; // Account for padding
        const totalHeight = rect.height - 20;
        const ratio = Math.max(0, Math.min(1, relativeY / totalHeight));
        
        const scrollInfo = this.cm.getScrollInfo();
        const targetScroll = ratio * (scrollInfo.height - scrollInfo.clientHeight);
        
        this.cm.scrollTo(null, targetScroll);
      }
  
      destroy() {
        if (this.updateTimeout) {
          clearTimeout(this.updateTimeout);
        }
        
        if (this.resizeObserver) {
          this.resizeObserver.disconnect();
        }
        
        // Restore editor margin
        const wrapper = this.cm.getWrapperElement();
        const editorElement = wrapper.querySelector('.CodeMirror-scroll');
        if (editorElement) {
          editorElement.style.marginRight = '';
        }
        
        // Remove minimap
        if (this.container && this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }
  
      // Public API methods
      show() {
        this.container.style.display = 'block';
      }
  
      hide() {
        this.container.style.display = 'none';
      }
  
      toggle() {
        const isVisible = this.container.style.display !== 'none';
        if (isVisible) {
          this.hide();
        } else {
          this.show();
        }
      }
  
      setWidth(width) {
        this.options.width = width;
        this.container.style.width = width + 'px';
        
        const wrapper = this.cm.getWrapperElement();
        const editorElement = wrapper.querySelector('.CodeMirror-scroll');
        if (editorElement) {
          editorElement.style.marginRight = `${width}px`;
        }
        
        this.scheduleUpdate();
      }
    }
  
    // CodeMirror integration
    CodeMirror.defineOption("minimap", false, function(cm, val, old) {
      if (old && old != CodeMirror.Init) {
        if (cm.state.minimap) {
          cm.state.minimap.destroy();
          delete cm.state.minimap;
        }
      }
      
      if (val) {
        const options = typeof val === "object" ? val : {};
        cm.state.minimap = new CodeMirrorMinimap(cm, options);
      }
    });
  
    // Export for external use
    CodeMirror.Minimap = CodeMirrorMinimap;
  });