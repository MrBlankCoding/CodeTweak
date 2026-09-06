import { marked } from 'marked';
import feather from 'feather-icons';
import { AIDiffHelper } from '../../../shared/utils/ai_diff_helper.js';
import { escapeHtml } from '../../../shared/utils/dom.js';
import logger from '../../../shared/utils/logger.js';
import { browser } from '../../../shared/browserAdapter.js';

export class MessageRenderer {
  constructor(editor) {
    this.editor = editor;
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

  createCodePreview(code, name = 'Generated Script', explanation = null) {
    const preview = document.createElement('div');
    preview.className = 'ai-code-response';

    const header = document.createElement('div');
    header.className = 'ai-code-header';

    const title = document.createElement('div');
    title.className = 'ai-code-title';
    const titleIcon = document.createElement('i');
    titleIcon.setAttribute('data-feather', 'code');
    titleIcon.setAttribute('style', 'width: 14px; height: 14px;');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = name;
    title.appendChild(titleIcon);
    title.appendChild(titleSpan);
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
      editLink.href = `${browser.runtime.getURL('editor/editor.html')}?id=${
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
    const titleIcon = document.createElement('i');
    titleIcon.setAttribute('data-feather', 'zap');
    titleIcon.setAttribute('style', 'width: 14px; height: 14px;');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = `${patches.length} surgical edit${patches.length > 1 ? 's' : ''}`;
    title.appendChild(titleIcon);
    title.appendChild(titleSpan);
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

      const patchHeader = document.createElement('div');
      patchHeader.className = 'patch-item-header';
      patchHeader.textContent = `Edit #${idx + 1} (${patch.type})`;
      patchEl.appendChild(patchHeader);

      const patchDiff = document.createElement('div');
      patchDiff.className = 'patch-item-diff';
      for (const { cls, text } of this._patchPreviewLines(patch)) {
        const lineEl = document.createElement('div');
        if (cls) lineEl.className = cls;
        lineEl.textContent = text;
        patchDiff.appendChild(lineEl);
      }
      patchEl.appendChild(patchDiff);
      body.appendChild(patchEl);
    });

    preview.appendChild(body);
    feather.replace();
    return preview;
  }

  _patchPreviewLines(patch) {
    if (patch?.type === 'unified' && typeof patch.diff === 'string') {
      const lines = patch.diff
        .split('\n')
        .filter((l) => !l.startsWith('---') && !l.startsWith('+++'))
        .slice(0, 10);
      return lines.map((line) => ({
        cls: line.startsWith('+')
          ? 'diff-line-add'
          : line.startsWith('-')
            ? 'diff-line-remove'
            : '',
        text: line,
      }));
    }
    return [
      { cls: 'diff-line-remove', text: `-${String(patch?.search ?? '').substring(0, 80)}...` },
      { cls: 'diff-line-add', text: `+${String(patch?.replace ?? '').substring(0, 80)}...` },
    ];
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

  _escapeHtml(text) {
    return escapeHtml(text);
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
      for (const child of Array.from(node.children)) {
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(...Array.from(child.childNodes));
          walk(node);
          return;
        }

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
      }
    };

    walk(doc.body);

    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    element.replaceChildren(fragment);
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch((err) => {
      logger.error('Failed to copy:', err);
    });
  }
}
