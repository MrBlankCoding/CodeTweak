import logger from '../utils/logger.js';
import feather from 'feather-icons';
import { getMessageSync } from '../utils/i18n.js';
import { AIDiffHelper } from '../utils/ai_diff_helper.js';

export class AICodeManager {
  constructor(elements, state, codeEditorManager) {
    this.elements = elements;
    this.state = state;
    this.codeEditorManager = codeEditorManager;
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
    this.chatHistory = [];
    this.isThinking = false;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    // Re-cache elements if they were missing
    if (!this.elements.aiChatHistory)
      this.elements.aiChatHistory = document.getElementById('aiChatHistory');
    if (!this.elements.aiChatInput)
      this.elements.aiChatInput = document.getElementById('aiChatInput');
    if (!this.elements.aiSendBtn) this.elements.aiSendBtn = document.getElementById('aiSendBtn');
    if (!this.elements.aiClearBtn) this.elements.aiClearBtn = document.getElementById('aiClearBtn');

    this.setupEventListeners();
    await this.loadAIConfig();
    await this.loadAvailableModels();
  }

  setupEventListeners() {
    if (this.elements.aiSendBtn) {
      this.elements.aiSendBtn.addEventListener('click', () => this.handleSendMessage());
    }

    if (this.elements.aiClearBtn) {
      this.elements.aiClearBtn.addEventListener('click', () => this.clearHistory());
    }

    if (this.elements.aiChatInput) {
      this.elements.aiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    if (this.elements.aiModelSelector) {
      this.elements.aiModelSelector.addEventListener('change', (e) => this.handleModelChange(e));
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && (changes.aiDomEditorConfigs || changes.availableModels)) {
        this.loadAIConfig();
        this.loadAvailableModels();
      }
    });
  }

  clearHistory() {
    this.chatHistory = [];
    if (this.elements.aiChatHistory) {
      this.elements.aiChatHistory.innerHTML = `
        <div class="ai-message ai-message-assistant">
          <div class="ai-message-avatar">AI</div>
          <div class="ai-message-content">
            <div class="ai-message-text">${getMessageSync('editorAiWelcome') || 'Hello! I can help you write or refactor your userscript. What would you like to do?'}</div>
          </div>
        </div>
      `;
    }
  }

  async loadAIConfig() {
    try {
      const { aiDomEditorConfigs = [] } = await chrome.storage.local.get('aiDomEditorConfigs');
      this.apiConfig = Array.isArray(aiDomEditorConfigs) ? aiDomEditorConfigs[0] || null : null;

      if (!this.elements.aiConfigWarning)
        this.elements.aiConfigWarning = document.getElementById('aiConfigWarning');
      if (!this.elements.aiChatContainer)
        this.elements.aiChatContainer = document.getElementById('aiChatContainer');

      if (this.hasUsableConfig(this.apiConfig)) {
        this.elements.aiConfigWarning?.classList.add('hidden');
        this.elements.aiChatContainer?.classList.remove('hidden');
      } else {
        this.elements.aiConfigWarning?.classList.remove('hidden');
        this.elements.aiChatContainer?.classList.add('hidden');
      }
    } catch (error) {
      logger.error('Error loading AI config:', error);
    }
  }

  async loadAvailableModels() {
    try {
      const { availableModels = [], lastAiModel = null } = await chrome.storage.local.get([
        'availableModels',
        'lastAiModel',
      ]);

      this.availableModels = availableModels;
      this.renderModelSelector(lastAiModel);
    } catch (error) {
      logger.error('Error loading AI models:', error);
    }
  }

  renderModelSelector(lastAiModel) {
    if (!this.elements.aiModelSelector)
      this.elements.aiModelSelector = document.getElementById('aiModelSelector');
    const selector = this.elements.aiModelSelector;
    if (!selector) return;

    selector.innerHTML = '';

    if (!this.availableModels.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No models available';
      selector.appendChild(option);
      return;
    }

    let foundLastUsed = false;
    this.availableModels.forEach((model) => {
      const option = document.createElement('option');
      option.value = JSON.stringify(model);
      option.textContent = model.id || model.model;

      if (lastAiModel && lastAiModel.id === model.id && lastAiModel.provider === model.provider) {
        option.selected = true;
        this.selectedModel = model;
        foundLastUsed = true;
      }
      selector.appendChild(option);
    });

    if (!foundLastUsed && this.availableModels.length > 0) {
      this.selectedModel = this.availableModels[0];
    }
  }

  async handleModelChange(e) {
    try {
      const value = e.target.value;
      if (!value) return;
      this.selectedModel = JSON.parse(value);
      await chrome.storage.local.set({ lastAiModel: this.selectedModel });
    } catch (error) {
      logger.error('Error changing model:', error);
    }
  }

  async handleSendMessage() {
    const input = this.elements.aiChatInput;
    const message = input.value.trim();
    if (!message || this.isThinking) return;

    input.value = '';
    this.addMessageToHistory('user', message);
    await this.callAI(message);
  }

  addMessageToHistory(role, text, data = null) {
    const message = { role, text, data, timestamp: Date.now() };
    this.chatHistory.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  renderMessage(message) {
    if (!this.elements.aiChatHistory)
      this.elements.aiChatHistory = document.getElementById('aiChatHistory');
    const historyContainer = this.elements.aiChatHistory;
    if (!historyContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `ai-message ai-message-${message.role}`;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'ai-message-avatar';
    avatarEl.textContent = message.role === 'user' ? 'U' : 'AI';
    messageEl.appendChild(avatarEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'ai-message-content';

    const hasData = message.data?.type === 'code' || message.data?.type === 'patch';

    if (message.role === 'assistant' && hasData) {
      if (message.data.explanation) {
        const textEl = document.createElement('div');
        textEl.className = 'ai-message-text';
        textEl.textContent = message.data.explanation;
        contentEl.appendChild(textEl);
      }

      if (message.data.type === 'code') {
        const codeResponseEl = this.createCodeResponseElement(message.data.code);
        contentEl.appendChild(codeResponseEl);
      } else {
        const diffResponseEl = this.createDiffResponseElement(message.data.patches);
        contentEl.appendChild(diffResponseEl);
      }
    } else {
      const textEl = document.createElement('div');
      textEl.className = 'ai-message-text';
      textEl.textContent = message.text;
      contentEl.appendChild(textEl);
    }

    messageEl.appendChild(contentEl);
    historyContainer.appendChild(messageEl);
    feather.replace();
  }

  createDiffResponseElement(patches) {
    const container = document.createElement('div');
    container.className = 'ai-code-response ai-patch-response';

    const header = document.createElement('div');
    header.className = 'ai-code-header';

    const title = document.createElement('div');
    title.className = 'ai-code-title';
    title.innerHTML = `<i data-feather="zap" style="width: 14px; height: 14px;"></i> <span>${patches.length} surgical edit${patches.length > 1 ? 's' : ''}</span>`;

    const actions = document.createElement('div');
    actions.className = 'ai-code-actions';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'ai-code-btn primary';
    applyBtn.innerHTML = `<i data-feather="check-circle" style="width: 12px; height: 12px;"></i> <span>${getMessageSync('editorAiApply') || 'Apply'}</span>`;

    applyBtn.onclick = () => {
      const currentCode = this.codeEditorManager.getValue();
      const results = AIDiffHelper.applyPatches(currentCode, patches);

      this.codeEditorManager.setValue(results.finalCode);
      this.state.hasUnsavedChanges = true;

      if (results.failedCount > 0) {
        this.addMessageToHistory(
          'assistant',
          `Applied ${results.successCount} patches, but ${results.failedCount} failed to match.`
        );
      } else {
        applyBtn.innerHTML = `<i data-feather="check" style="width: 12px; height: 12px;"></i> <span>Applied</span>`;
        applyBtn.disabled = true;
      }
    };

    actions.appendChild(applyBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const diffContainer = document.createElement('div');
    diffContainer.className = 'ai-diff-container';

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
            return `<div class="${cls}">${this.escapeHtml(line)}</div>`;
          })
          .join('');
        if (lines.length > 10) previewHtml += `<div style="opacity: 0.5;">...</div>`;
      } else {
        previewHtml = `<div class="diff-line-remove">-${this.escapeHtml(patch.search.substring(0, 100))}...</div>
                       <div class="diff-line-add">+${this.escapeHtml(patch.replace.substring(0, 100))}...</div>`;
      }

      patchEl.innerHTML = `
        <div class="patch-item-header">Edit #${idx + 1} (${patch.type})</div>
        <div class="patch-item-diff">${previewHtml}</div>
      `;
      diffContainer.appendChild(patchEl);
    });

    container.appendChild(header);
    container.appendChild(diffContainer);

    return container;
  }

  createCodeResponseElement(code) {
    const container = document.createElement('div');
    container.className = 'ai-code-response';

    const header = document.createElement('div');
    header.className = 'ai-code-header';

    const title = document.createElement('div');
    title.className = 'ai-code-title';
    title.innerHTML = `<i data-feather="code" style="width: 14px; height: 14px;"></i> <span>Generated Code</span>`;

    const actions = document.createElement('div');
    actions.className = 'ai-code-actions';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'ai-code-btn primary';
    applyBtn.innerHTML = `<i data-feather="plus-circle" style="width: 12px; height: 12px;"></i> <span>${getMessageSync('editorAiApply') || 'Apply'}</span>`;

    applyBtn.onclick = () => {
      this.codeEditorManager.setValue(code);
      this.state.hasUnsavedChanges = true;
      if (this.elements.scriptStatusBadge) {
        this.elements.scriptStatusBadge.textContent = 'Unsaved Changes';
      }
    };

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-code-btn secondary';
    copyBtn.innerHTML = `<i data-feather="copy" style="width: 12px; height: 12px;"></i> <span>Copy</span>`;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(code);
      const span = copyBtn.querySelector('span');
      span.textContent = 'Copied!';
      setTimeout(() => (span.textContent = 'Copy'), 2000);
    };

    actions.appendChild(copyBtn);
    actions.appendChild(applyBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const codeBlock = document.createElement('pre');
    codeBlock.className = 'ai-code-block';
    codeBlock.textContent = code;

    container.appendChild(header);
    container.appendChild(codeBlock);

    return container;
  }

  async callAI(userMessage) {
    if (this.isThinking) return;

    this.setThinking(true);
    const thinkingIndicator = this.addThinkingIndicator();

    try {
      const config = this.getActiveConfig();
      if (!this.hasUsableConfig(config)) {
        throw new Error('AI API is not configured. Please check your settings.');
      }

      const currentCode = this.codeEditorManager.getValue();
      const response = await this.executeAICall(userMessage, currentCode, config);

      thinkingIndicator?.remove();
      this.setThinking(false);

      if (response.type === 'code') {
        this.addMessageToHistory('assistant', response.explanation, {
          type: 'code',
          code: response.code,
          explanation: response.explanation,
        });
      } else if (response.type === 'patch') {
        this.addMessageToHistory('assistant', response.explanation, {
          type: 'patch',
          patches: response.patches,
          explanation: response.explanation,
        });
      } else {
        this.addMessageToHistory('assistant', response.message);
      }
    } catch (error) {
      thinkingIndicator?.remove();
      this.setThinking(false);
      this.addMessageToHistory('assistant', `Error: ${error.message}`);
      logger.error('AI Call failed:', error);
    }
  }

  addThinkingIndicator() {
    if (!this.elements.aiChatHistory)
      this.elements.aiChatHistory = document.getElementById('aiChatHistory');
    const historyContainer = this.elements.aiChatHistory;
    if (!historyContainer) return null;

    const messageEl = document.createElement('div');
    messageEl.className = 'ai-message ai-message-assistant';
    messageEl.innerHTML = `
      <div class="ai-message-avatar">AI</div>
      <div class="ai-message-content">
        <div class="ai-typing-indicator">
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
        </div>
      </div>
    `;
    historyContainer.appendChild(messageEl);
    this.scrollToBottom();
    return messageEl;
  }

  setThinking(isThinking) {
    this.isThinking = isThinking;
    if (this.elements.aiSendBtn) {
      this.elements.aiSendBtn.disabled = isThinking;
    }
  }

  scrollToBottom() {
    if (!this.elements.aiChatHistory)
      this.elements.aiChatHistory = document.getElementById('aiChatHistory');
    const historyContainer = this.elements.aiChatHistory;
    if (historyContainer) {
      historyContainer.scrollTop = historyContainer.scrollHeight;
    }
  }

  getActiveConfig() {
    const selected = this.selectedModel || {};
    const fallback = this.apiConfig || {};

    return {
      ...fallback,
      ...selected,
      model: selected.model || selected.id || fallback.model || fallback.id || '',
      endpoint: selected.endpoint || fallback.endpoint || '',
      apiKey: selected.apiKey || fallback.apiKey || '',
      provider: (selected.provider || fallback.provider || 'openai').toLowerCase(),
    };
  }

  hasUsableConfig(config) {
    return !!(config && config.apiKey && config.endpoint && (config.id || config.model));
  }

  async executeAICall(message, currentCode, config) {
    const providerType = this.detectProviderType(config);
    const systemPrompt = this.buildSystemPrompt(currentCode);
    const requestBody = this.buildRequestBody(providerType, config, systemPrompt, message);

    const headers = this.buildHeaders(config, providerType);
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || response.statusText);
    }

    const data = await response.json();
    const rawContent = this.extractContent(data, providerType);
    return this.parseAIContent(rawContent);
  }

  detectProviderType(config) {
    const provider = (config.provider || '').toLowerCase();
    const endpoint = (config.endpoint || '').toLowerCase();

    if (provider.includes('google') || endpoint.includes('generativelanguage.googleapis.com'))
      return 'google';
    if (provider.includes('anthropic') || endpoint.includes('api.anthropic.com'))
      return 'anthropic';
    return 'openai';
  }

  buildSystemPrompt(currentCode) {
    return `You are a Senior Systems Architect and Expert Userscript Developer. Your goal is to help the user evolve their code with professional-grade engineering standards.

CONTEXT:
The current userscript code is provided below. You must reason about its entire structure before suggesting changes.

\`\`\`javascript
${currentCode}
\`\`\`

CORE ENGINEERING PRINCIPLES:
1. DRY (Don't Repeat Yourself): If you are adding logic that already exists, you MUST refactor it into a shared function.
2. Minimal Impact: Prefer surgical edits (SEARCH/REPLACE or Diff) over full rewrites, but do NOT sacrifice code quality for brevity.
3. Clean Architecture: Organize code logically. Keep event listeners together, constants at the top, and helper functions modular.
4. Userscript Context: Use standard GM_* APIs (getValue, setValue, addStyle, etc.) where appropriate.

REFACTORING MANDATE:
- Before adding a new feature (like a keyboard shortcut), check if the logic it triggers already exists in a button click, init loop, or other handler.
- If it does, follow this 3-step process:
  a) Create a new named function for the shared logic.
  b) Update the existing caller to use the new function.
  c) Add the new caller (shortcut/trigger) calling that same function.

OUTPUT FORMAT:
- Provide a brief, high-level summary of your architectural reasoning.
- Use multiple SEARCH/REPLACE blocks to perform surgical refactors.
- For complex changes, use Unified Diff format.
- Do NOT include the ==UserScript== header unless explicitly requested.

${AIDiffHelper.getSystemInstructions()}

Act as a lead developer performing a code review and implementation.`;
  }

  buildRequestBody(providerType, config, systemPrompt, message) {
    const history = this.chatHistory.slice(-5).map((m) => {
      let content = m.text;
      if (m.role === 'assistant') {
        if (m.data?.type === 'code') {
          content += `\n\n\`\`\`javascript\n${m.data.code}\n\`\`\``;
        } else if (m.data?.type === 'patch') {
          m.data.patches.forEach((p) => {
            if (p.type === 'unified') content += `\n\n\`\`\`diff\n${p.diff}\n\`\`\``;
            else content += `\n\n<<<<<< SEARCH\n${p.search}\n======\n${p.replace}\n>>>>>> REPLACE`;
          });
        }
      }
      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: content,
      };
    });

    if (providerType === 'google') {
      return {
        contents: [
          {
            parts: [
              {
                text: `System: ${systemPrompt}\n\nHistory: ${JSON.stringify(history)}\n\nUser: ${message}`,
              },
            ],
          },
        ],
      };
    }

    if (providerType === 'anthropic') {
      return {
        model: config.model,
        system: systemPrompt,
        messages: [...history, { role: 'user', content: message }],
        max_tokens: 4096,
      };
    }

    return {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
    };
  }

  buildHeaders(config, providerType) {
    const headers = { 'Content-Type': 'application/json' };
    if (providerType === 'google') {
      headers['x-goog-api-key'] = config.apiKey;
    } else if (providerType === 'anthropic') {
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  extractContent(data, providerType) {
    if (providerType === 'google') return data.candidates[0].content.parts[0].text;
    if (providerType === 'anthropic') return data.content[0].text;
    return data.choices[0].message.content;
  }

  parseAIContent(content) {
    const patches = AIDiffHelper.parsePatches(content);
    if (patches.length > 0) {
      const explanation = content
        .replace(/<<<<<< SEARCH[\s\S]*?>>>>>> REPLACE/gi, '')
        .replace(/```diff[\s\S]*?```/gi, '')
        .trim();
      return {
        type: 'patch',
        patches: patches,
        explanation: explanation || 'I have prepared some surgical edits for your script:',
      };
    }

    const codeMatch = content.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    if (codeMatch) {
      const newCode = codeMatch[1].trim();
      const currentCode = this.codeEditorManager.getValue().trim();
      const explanation = content.replace(/```(?:javascript|js)?[\s\S]*?```/gi, '').trim();

      // If the AI returned a full script, diff it ourselves to show what changed
      if (newCode !== currentCode && currentCode.length > 0) {
        const diff = AIDiffHelper.createUnifiedDiff(currentCode, newCode);
        return {
          type: 'patch',
          patches: [{ type: 'unified', diff: diff }],
          explanation: explanation || 'I have refactored the script for you:',
        };
      }

      return {
        type: 'code',
        code: newCode,
        explanation: explanation || 'Here is the updated code:',
      };
    }
    return { type: 'text', message: content };
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
