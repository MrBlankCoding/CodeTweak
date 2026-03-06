import logger from '../../../utils/logger.js';
import feather from 'feather-icons';
import { marked } from 'marked';
import { AIDiffHelper } from '../../../utils/ai_diff_helper.js';

export class UIManager {
  constructor(editor) {
    this.editor = editor;
    this.setupCurrentScriptListener();
  }

  setupCurrentScriptListener() {
    document.addEventListener('currentScriptChanged', () => {
      this.updateAllActionButtons();
    });
  }

  updateAllActionButtons() {
    const allButtons = document.querySelectorAll('.ai-code-actions .action-btn');
    allButtons.forEach((btn) => {
      const isPatch = btn.closest('.ai-patch-response') !== null;
      if (isPatch) return; // Patches use their own logic

      btn.replaceChildren();
      const icon = this._createFeatherIcon('', 14);

      if (this.editor.currentScript) {
        icon.setAttribute('data-feather', 'refresh-cw');
        btn.title = `Update script: ${this.editor.currentScript.name}`;
        const span = document.createElement('span');
        span.textContent = 'Update';
        btn.appendChild(icon);
        btn.appendChild(span);
      } else {
        icon.setAttribute('data-feather', 'plus-circle');
        btn.title = 'Create new script';
        const span = document.createElement('span');
        span.textContent = 'Create';
        btn.appendChild(icon);
        btn.appendChild(span);
      }
      feather.replace();
    });
  }

  showConfigBanner() {
    this.editor.elements.configBanner.style.display = 'flex';
  }

  hideConfigBanner() {
    this.editor.elements.configBanner.style.display = 'none';
  }

  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  createMessageElement(role, text, data = {}) {
    const messageEl = document.createElement('div');
    messageEl.className = `ai-message ai-message-${role}`;
    messageEl.dataset.id = `msg-${Date.now()}-${Math.random()}`;

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    messageEl.appendChild(avatar);

    const content = document.createElement('div');
    content.className = 'ai-message-content';

    if (role === 'user') {
      const textEl = this._createUserTextElement(text);
      content.appendChild(textEl);
      messageEl.appendChild(content);
      return messageEl;
    }

    // Handle assistant messages
    if (data.type === 'code' || data.type === 'patch') {
      if (data.explanation) {
        const explanationEl = document.createElement('div');
        explanationEl.className = 'ai-message-text';
        this._setSafeInnerHTML(explanationEl, marked.parse(data.explanation));
        content.appendChild(explanationEl);
      }

      if (data.type === 'code') {
        content.appendChild(this.createCodePreview(data.code, data.name, data.explanation));
      } else {
        content.appendChild(this.createPatchPreview(data.patches, data.name, data.explanation));
      }
    } else if (data.type === 'text') {
      const textEl = document.createElement('div');
      textEl.className = 'ai-message-text';
      const msgText = data.message || text;
      if (this._hasMarkdownFormatting(msgText)) {
        this._setSafeInnerHTML(textEl, marked.parse(msgText));
      } else {
        textEl.textContent = msgText;
      }
      content.appendChild(textEl);
    } else if (data.error) {
      const textEl = document.createElement('div');
      textEl.className = 'ai-message-text';
      textEl.style.borderColor = 'var(--error)';
      textEl.innerHTML = `<div style="display: flex; gap: 8px; color: var(--error); font-size: 0.85rem; font-weight: 600; align-items: center; margin-bottom: 4px;">
        <i data-feather="alert-circle" style="width: 14px; height: 14px;"></i> Error
      </div>
      <div style="color: var(--error);">${this._escapeHtml(text)}</div>`;
      content.appendChild(textEl);
    } else {
      const textEl = document.createElement('div');
      textEl.className = 'ai-message-text';
      textEl.textContent = text;
      content.appendChild(textEl);
    }

    messageEl.appendChild(content);
    feather.replace();
    return messageEl;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _createUserTextElement(text) {
    const textEl = document.createElement('div');
    textEl.className = 'ai-message-text';

    const parts = [];
    let lastIndex = 0;
    const regex = /(^|\s)@(\w+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      const space = match[1];
      const scriptRef = document.createElement('span');
      scriptRef.className = 'script-reference';
      scriptRef.textContent = `@${match[2]}`;

      if (space) {
        parts.push(document.createTextNode(space));
      }
      parts.push(scriptRef);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(document.createTextNode(text.substring(lastIndex)));
    }

    if (parts.length === 0) {
      textEl.textContent = text;
    } else {
      parts.forEach((part) => textEl.appendChild(part));
    }

    return textEl;
  }

  _hasMarkdownFormatting(text) {
    if (!text || typeof text !== 'string') return false;

    const markdownIndicators = [
      /^#{1,6}\s+/m, // Headers
      /\*\*[^*]+\*\*/, // Bold
      /\*[^*]+\*/, // Italic
      /_[^_]+_/, // Italic with underscores
      /^[-*+]\s+/m, // Unordered lists
      /^\d+\.\s+/m, // Ordered lists
      /\[.+?\]\(.+?\)/, // Links
      /^>\s+/m, // Blockquotes
      /`[^`]+`/, // Inline code
      /^\|.+\|$/m, // Tables
    ];

    return markdownIndicators.some((pattern) => pattern.test(text));
  }

  createCodePreview(code, name = 'Generated Script', explanation = null) {
    const preview = document.createElement('div');
    preview.className = 'ai-code-response';

    const header = document.createElement('div');
    header.className = 'ai-code-header';

    const title = document.createElement('div');
    title.className = 'ai-code-title';
    title.innerHTML = `<i data-feather="code" style="width: 14px; height: 14px;"></i> <span>${name}</span>`;
    header.appendChild(title);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ai-code-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-code-btn secondary';
    copyBtn.title = 'Copy to clipboard';
    copyBtn.innerHTML = `<i data-feather="copy" style="width: 12px; height: 12px;"></i> <span>Copy</span>`;

    copyBtn.addEventListener('click', () => {
      this.copyToClipboard(code);
      const span = copyBtn.querySelector('span');
      span.textContent = 'Copied!';
      setTimeout(() => {
        span.textContent = 'Copy';
      }, 2000);
    });
    actionsDiv.appendChild(copyBtn);

    if (this.editor.currentScript) {
      const editLink = document.createElement('a');
      editLink.className = 'ai-code-btn secondary';
      editLink.title = 'Open in editor';
      editLink.href = `${chrome.runtime.getURL('editor/editor.html')}?id=${
        this.editor.currentScript.id
      }`;
      editLink.target = '_blank';
      editLink.style.textDecoration = 'none';
      editLink.innerHTML = `<i data-feather="edit-2" style="width: 12px; height: 12px;"></i>`;
      actionsDiv.appendChild(editLink);
    }

    const applyIconBtn = document.createElement('button');
    applyIconBtn.className = 'ai-code-btn primary action-btn';

    const updateButtonState = () => {
      if (this.editor.currentScript) {
        applyIconBtn.innerHTML = `<i data-feather="refresh-cw" style="width: 12px; height: 12px;"></i> <span>Update</span>`;
        applyIconBtn.title = `Update script: ${this.editor.currentScript.name}`;
      } else {
        applyIconBtn.innerHTML = `<i data-feather="plus-circle" style="width: 12px; height: 12px;"></i> <span>Create</span>`;
        applyIconBtn.title = 'Create new script';
      }
      feather.replace();
    };

    applyIconBtn.addEventListener('click', () => {
      if (this.editor.currentScript) {
        this.editor.userscriptHandler.updateUserscript(
          this.editor.currentScript.name,
          code,
          name,
          explanation
        );
      } else {
        this.editor.userscriptHandler.createUserscript(code, name, explanation);
      }
    });

    updateButtonState();
    actionsDiv.appendChild(applyIconBtn);
    header.appendChild(actionsDiv);
    preview.appendChild(header);

    const body = document.createElement('div');
    body.className = 'ai-code-block';
    body.textContent = code;
    preview.appendChild(body);

    feather.replace();
    return preview;
  }

  createPatchPreview(patches, name = 'Script Update', explanation = null) {
    const preview = document.createElement('div');
    preview.className = 'ai-code-response ai-patch-response';

    const header = document.createElement('div');
    header.className = 'ai-code-header';

    const title = document.createElement('div');
    title.className = 'ai-code-title';
    title.innerHTML = `<i data-feather="zap" style="width: 14px; height: 14px;"></i> <span>${patches.length} surgical edit${patches.length > 1 ? 's' : ''}</span>`;
    header.appendChild(title);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ai-code-actions';

    const applyIconBtn = document.createElement('button');
    applyIconBtn.className = 'ai-code-btn primary action-btn';
    applyIconBtn.innerHTML = `<i data-feather="check-circle" style="width: 12px; height: 12px;"></i> <span>Apply</span>`;

    applyIconBtn.addEventListener('click', async () => {
      if (!this.editor.currentScript) {
        this.editor.chatManager.addMessage(
          'assistant',
          'No script is currently active to apply patches to.',
          { type: 'text', error: true }
        );
        return;
      }

      const currentCode = this.editor.currentScript.code;
      const results = AIDiffHelper.applyPatches(currentCode, patches);

      if (results.successCount > 0) {
        await this.editor.userscriptHandler.updateUserscript(
          this.editor.currentScript.name,
          results.finalCode,
          name,
          explanation
        );

        if (results.failedCount > 0) {
          this.editor.chatManager.addMessage(
            'assistant',
            `Applied ${results.successCount} edits, but ${results.failedCount} failed to match.`,
            { type: 'text', error: true }
          );
        } else {
          applyIconBtn.disabled = true;
          applyIconBtn.innerHTML = `<i data-feather="check" style="width: 12px; height: 12px;"></i> <span>Applied</span>`;
          feather.replace();
        }
      } else {
        this.editor.chatManager.addMessage(
          'assistant',
          'Failed to apply surgical edits. The script may have changed or the edits are incompatible.',
          { type: 'text', error: true }
        );
      }
    });

    actionsDiv.appendChild(applyIconBtn);
    header.appendChild(actionsDiv);
    preview.appendChild(header);

    const body = document.createElement('div');
    body.className = 'ai-diff-container';

    patches.forEach((patch, idx) => {
      const patchEl = document.createElement('div');
      patchEl.className = 'ai-patch-preview';

      let previewHtml = '';
      if (patch.type === 'unified') {
        const lines = patch.diff
          .split('\n')
          .filter((l) => !l.startsWith('---') && !l.startsWith('+++'));
        previewHtml = lines
          .slice(0, 10)
          .map((line) => {
            const cls = line.startsWith('+')
              ? 'diff-line-add'
              : line.startsWith('-')
                ? 'diff-line-remove'
                : '';
            return `<div class="${cls}">${this._escapeHtml(line)}</div>`;
          })
          .join('');
        if (lines.length > 10) previewHtml += `<div style="opacity: 0.5;">...</div>`;
      } else {
        previewHtml = `<div class="diff-line-remove">-${this._escapeHtml(patch.search.substring(0, 80))}...</div>
                       <div class="diff-line-add">+${this._escapeHtml(patch.replace.substring(0, 80))}...</div>`;
      }

      patchEl.innerHTML = `
        <div class="patch-item-header">Edit #${idx + 1} (${patch.type})</div>
        <div class="patch-item-diff">${previewHtml}</div>
      `;
      body.appendChild(patchEl);
    });

    preview.appendChild(body);
    feather.replace();
    return preview;
  }

  addLoadingMessage() {
    const messageId = `msg-${Date.now()}-loading`;

    const messageEl = document.createElement('div');
    messageEl.className = 'ai-message ai-message-assistant';
    messageEl.dataset.id = messageId;

    const avatar = document.createElement('div');
    avatar.className = 'ai-message-avatar';
    avatar.textContent = 'AI';
    messageEl.appendChild(avatar);

    const content = document.createElement('div');
    content.className = 'ai-message-content';

    const loading = document.createElement('div');
    loading.className = 'ai-typing-indicator';

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'ai-typing-dot';
      loading.appendChild(dot);
    }

    content.appendChild(loading);

    messageEl.appendChild(content);
    this.editor.elements.messages.appendChild(messageEl);
    this.scrollToBottom();

    return messageId;
  }

  scrollToBottom() {
    setTimeout(() => {
      this.editor.elements.chatContainer.scrollTop =
        this.editor.elements.chatContainer.scrollHeight;
    }, 100);
  }

  activateElementSelector() {
    this.editor.elements.selectorActive.style.display = 'flex';
    this.editor.elements.elementSelectorBtn.classList.add('active');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'startAiSelection' });
      }
    });
  }

  deactivateElementSelector() {
    this.editor.elements.selectorActive.style.display = 'none';
    this.editor.elements.elementSelectorBtn.classList.remove('active');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSelection' });
      }
    });
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch((err) => {
      logger.error('Failed to copy:', err);
    });
  }

  showWelcomeMessage() {
    if (this.editor.elements.welcomeMessage) {
      this.editor.elements.welcomeMessage.style.display = 'block';
    }
  }

  hideWelcomeMessage() {
    if (this.editor.elements.welcomeMessage) {
      this.editor.elements.welcomeMessage.style.display = 'none';
    }
  }

  async showScriptSelector(input) {
    this.hideScriptSelector();
    const scripts = await this.editor.userscriptHandler.getAllScripts();
    if (!scripts || scripts.length === 0) return;

    const selector = document.createElement('div');
    selector.className = 'script-selector';

    scripts.forEach((script) => {
      const item = document.createElement('div');
      item.className = 'script-item';
      item.textContent = script.name;
      item.addEventListener('click', () => {
        const atIndex = input.value.lastIndexOf('@');
        input.value = input.value.substring(0, atIndex + 1) + script.name + ' ';
        this.hideScriptSelector();
        input.focus();
      });
      selector.appendChild(item);
    });

    document.body.appendChild(selector);
    const rect = input.getBoundingClientRect();
    selector.style.top = `${rect.top - selector.offsetHeight}px`;
    selector.style.left = `${rect.left}px`;
  }

  hideScriptSelector() {
    const selector = document.querySelector('.script-selector');
    if (selector) {
      selector.remove();
    }
  }

  _setSafeInnerHTML(element, html) {
    if (typeof html !== 'string' || !html) {
      element.replaceChildren();
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const allowedTags = new Set([
      'A',
      'BLOCKQUOTE',
      'BR',
      'CODE',
      'EM',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'HR',
      'LI',
      'OL',
      'P',
      'PRE',
      'STRONG',
      'TABLE',
      'TBODY',
      'TD',
      'TH',
      'THEAD',
      'TR',
      'UL',
    ]);

    const walk = (node) => {
      const children = Array.from(node.children);
      children.forEach((child) => {
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes));
          return;
        }

        // Remove all attributes except explicit link allowlist.
        Array.from(child.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (child.tagName === 'A' && (name === 'href' || name === 'title')) {
            return;
          }
          child.removeAttribute(attr.name);
        });

        if (child.tagName === 'A') {
          const href = child.getAttribute('href');
          if (!href || !/^(https?:|mailto:)/i.test(href)) {
            child.removeAttribute('href');
          } else {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        }

        walk(child);
      });
    };

    walk(doc.body);

    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    element.replaceChildren(fragment);
  }

  _createFeatherIcon(name, size = 16) {
    const icon = document.createElement('i');
    if (name) {
      icon.setAttribute('data-feather', name);
    }
    icon.setAttribute('width', String(size));
    icon.setAttribute('height', String(size));
    return icon;
  }
}
