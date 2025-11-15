export class ApiHandler {
  constructor(editor) {
    this.editor = editor;
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
    this.defaultTimeoutMs = 30_000;
    this.conversationHistory = [];
    this.pageContext = null; // Cache page context
    this.lastGeneratedCode = null; // Track last code for context
  }

  async loadAPIConfig() {
    try {
      const { aiDomEditorConfigs } = await chrome.storage.local.get(
        "aiDomEditorConfigs"
      );

      this.apiConfig =
        Array.isArray(aiDomEditorConfigs) && aiDomEditorConfigs.length > 0
          ? aiDomEditorConfigs[0]
          : null;

      const hasValidConfig =
        !!(this.apiConfig?.apiKey || this.apiConfig?.key) &&
        !!this.apiConfig?.endpoint;

      this.editor?.uiManager?.[
        hasValidConfig ? "hideConfigBanner" : "showConfigBanner"
      ]();
    } catch (error) {
      console.error("Error loading API config:", error);
      this.editor?.uiManager?.showConfigBanner();
    }
  }

  async loadAvailableModels() {
    try {
      const storage = await chrome.storage.local.get([
        "availableModels",
        "selectedModel",
        "aiDomEditorConfigs",
      ]);

      // Normalize available models
      this.availableModels = this._normalizeAvailableModels(storage);

      // Parse selected model if it's a string
      const selectedModel =
        typeof storage.selectedModel === "string"
          ? this._safeParseJSON(storage.selectedModel)
          : storage.selectedModel;

      // Update UI and set selected model
      await this._updateModelSelector(selectedModel);
    } catch (error) {
      console.error("Error loading available models:", error);
    }
  }

  _normalizeAvailableModels(storage) {
    if (
      Array.isArray(storage.availableModels) &&
      storage.availableModels.length > 0
    ) {
      return storage.availableModels;
    }

    if (
      Array.isArray(storage.aiDomEditorConfigs) &&
      storage.aiDomEditorConfigs.length > 0
    ) {
      return storage.aiDomEditorConfigs.map((cfg) => ({
        id: cfg.model || cfg.modelId || "default",
        provider: (cfg.provider || cfg.vendor || "custom").toLowerCase(),
        apiKey: cfg.apiKey || cfg.key,
        endpoint: cfg.endpoint,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      }));
    }

    return [];
  }

  async _updateModelSelector(selectedModel) {
    const selector = this.editor?.elements?.modelSelector;

    if (!selector) {
      // No UI selector - just set the model
      this.selectedModel = selectedModel || this.availableModels[0] || null;
      if (this.selectedModel) {
        await chrome.storage.local.set({ selectedModel: this.selectedModel });
      }
      return;
    }

    selector.innerHTML = "";

    if (this.availableModels.length === 0) {
      this._renderEmptyModelSelector(selector);
      return;
    }

    this._renderModelOptions(selector, selectedModel);

    // Set selected model
    this.selectedModel = selectedModel || this.availableModels[0];
    await chrome.storage.local.set({ selectedModel: this.selectedModel });
  }

  _renderEmptyModelSelector(selector) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No models available - Configure API keys";
    selector.appendChild(option);
    selector.disabled = true;
    this.selectedModel = null;
  }

  _renderModelOptions(selector, selectedModel) {
    selector.disabled = false;

    const modelsByProvider = this._groupModelsByProvider();

    Object.keys(modelsByProvider)
      .sort()
      .forEach((provider) => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = provider.toUpperCase();

        modelsByProvider[provider].forEach((model) => {
          const option = this._createModelOption(
            model,
            provider,
            selectedModel
          );
          optgroup.appendChild(option);
        });

        selector.appendChild(optgroup);
      });
  }

  _groupModelsByProvider() {
    return this.availableModels.reduce((groups, model) => {
      const provider = (model.provider || "custom").toLowerCase();
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
      return groups;
    }, {});
  }

  _createModelOption(model, provider, selectedModel) {
    const option = document.createElement("option");
    option.value = JSON.stringify(model);
    option.textContent = model.id || `${provider}-model`;

    if (
      selectedModel?.id === model.id &&
      (selectedModel.provider || "").toLowerCase() === provider
    ) {
      option.selected = true;
    }

    return option;
  }

  async handleModelChange(e) {
    try {
      const raw = e?.target?.value;
      if (!raw) return;

      const modelData = this._safeParseJSON(raw) || raw;
      this.selectedModel = modelData;
      await chrome.storage.local.set({ selectedModel: modelData });
    } catch (error) {
      console.error("Error handling model change:", error);
    }
  }

  _safeParseJSON(str) {
    try {
      return typeof str === "string" ? JSON.parse(str) : str;
    } catch {
      return null;
    }
  }

  async callAIAPI(userMessage, domSummary, previousCode = null, history = []) {
    this.pageContext = domSummary;

    const intent = this._detectIntent(userMessage, history);
    console.log("Detected intent:", intent);

    // Build context-aware system prompt
    const systemPrompt = this._buildSystemPrompt(
      intent,
      domSummary,
      previousCode,
      history
    );

    const { modelConfig, modelId, endpoint, apiKey } = this._getModelConfig();
    this._validateAPIConfig(endpoint, apiKey);

    const requestBody = this._buildRequestBody(
      modelConfig,
      modelId,
      systemPrompt,
      userMessage,
      history
    );

    const parsed = await this._executeAPIRequest(
      endpoint,
      requestBody,
      modelConfig,
      intent
    );

    if (parsed.type === "code") {
      this.lastGeneratedCode = {
        name: parsed.name,
        code: parsed.code,
        timestamp: Date.now(),
      };
    }

    return parsed;
  }

  _getModelConfig() {
    const modelConfig = this.selectedModel || this.apiConfig || {};
    const modelId =
      modelConfig.id || modelConfig.model || this.apiConfig?.model || "gpt-4";
    const endpoint = modelConfig.endpoint || this.apiConfig?.endpoint;
    const apiKey =
      modelConfig.apiKey ||
      modelConfig.key ||
      this.apiConfig?.apiKey ||
      this.apiConfig?.key;

    return { modelConfig, modelId, endpoint, apiKey };
  }

  _validateAPIConfig(endpoint, apiKey) {
    if (!endpoint) {
      this.editor?.uiManager?.showConfigBanner?.();
      throw new Error(
        "No endpoint configured for AI provider. Please configure an API endpoint in settings."
      );
    }
    if (!apiKey) {
      this.editor?.uiManager?.showConfigBanner?.();
      throw new Error("No API key configured for the selected model/provider.");
    }
  }

  _buildRequestBody(modelConfig, modelId, systemPrompt, userMessage, history) {
    const provider = (modelConfig.provider || "").toLowerCase();
    const temperature =
      modelConfig.temperature ?? this.apiConfig?.temperature ?? 0.7;
    const max_tokens =
      modelConfig.maxTokens ?? this.apiConfig?.maxTokens ?? 2000;

    const providerType = this._detectProviderType(modelId, provider);

    let requestBody;

    switch (providerType) {
      case "gemma":
        requestBody = {
          model: modelId,
          messages: [
            { role: "user", content: `${systemPrompt}\n\n${userMessage}` },
          ],
          temperature,
          max_tokens,
        };
        break;

      case "google":
        requestBody = {
          contents: [
            { parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] },
          ],
          generationConfig: { temperature, maxOutputTokens: max_tokens },
        };
        break;

      case "anthropic":
        requestBody = {
          model: modelId,
          prompt: `${systemPrompt}\n\nUser Request: ${userMessage}`,
          temperature,
          max_tokens,
        };
        break;

      default:
        requestBody = {
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            ...this._formatHistoryForAPI(history),
            { role: "user", content: userMessage },
          ],
          temperature,
          max_tokens,
        };
    }

    // Merge extra fields if configured
    if (modelConfig?.extraRequestFields) {
      Object.assign(requestBody, modelConfig.extraRequestFields);
    }

    return requestBody;
  }

  _detectProviderType(modelId, provider) {
    const lowerModelId = modelId.toLowerCase();

    if (lowerModelId.includes("gemma") && !provider.includes("aimlapi")) {
      return "gemma";
    }

    if (
      (lowerModelId.includes("gemini") ||
        provider.includes("google") ||
        provider.includes("vertex")) &&
      !provider.includes("aimlapi")
    ) {
      return "google";
    }

    if (provider.includes("anthropic") || lowerModelId.includes("claude")) {
      return "anthropic";
    }

    return "openai";
  }

  _formatHistoryForAPI(history) {
    return history
      .map((msg) => {
        if (msg.role === "user") {
          return { role: "user", content: msg.text };
        }

        if (msg.role === "assistant") {
          const content = this._formatAssistantMessage(msg);
          return { role: "assistant", content };
        }

        return null;
      })
      .filter(Boolean);
  }

  _formatAssistantMessage(msg) {
    if (msg.data?.type === "code") {
      let content = "";
      if (msg.data.name) content += `Script Name: ${msg.data.name}\n\n`;
      if (msg.text) content += `${msg.text}\n\n`;
      if (msg.data.code)
        content += `\`\`\`javascript\n${msg.data.code}\n\`\`\``;
      return content.trim();
    }
    return msg.text;
  }

  async _executeAPIRequest(endpoint, requestBody, modelConfig, intent) {
    const authHeaders = this._buildAuthHeaders(modelConfig);
    const timeout = modelConfig.requestTimeoutMs || this.defaultTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(await this._extractErrorMessage(res));
      }

      const data = await res.json();
      const rawContent = this._extractContentFromResponse(data);

      if (!rawContent?.length) {
        throw new Error("No usable content returned from AI provider.");
      }

      const parsed = this._parseResponse(rawContent);
      parsed.detectedIntent = intent;

      return parsed;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`AI request timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _extractErrorMessage(res) {
    try {
      const errJson = await res.json();
      return (
        errJson?.error?.message || errJson?.message || JSON.stringify(errJson)
      );
    } catch {
      try {
        const txt = await res.text();
        return txt || `API request failed with status ${res.status}`;
      } catch {
        return `API request failed with status ${res.status}`;
      }
    }
  }

  _buildAuthHeaders(modelConfig) {
    const apiKey = modelConfig?.apiKey || modelConfig?.key;
    if (!apiKey) return {};

    // Explicit header format
    if (modelConfig?.headerFormat === "x-api-key") {
      return { "X-API-Key": apiKey };
    }

    const provider = (modelConfig?.provider || "").toLowerCase();
    const modelId = (modelConfig?.id || modelConfig?.model || "").toLowerCase();

    // Provider-specific auth
    if (provider.includes("aimlapi")) {
      return { Authorization: `Bearer ${apiKey}` };
    }

    if (modelId.includes("gemini") || provider.includes("gemini")) {
      return { "x-goog-api-key": apiKey };
    }

    if (provider.includes("azure")) {
      return { "api-key": apiKey };
    }

    return { Authorization: `Bearer ${apiKey}` };
  }


  _detectIntent(message, history = []) {
    if (!message?.trim()) {
      return { type: "unknown", confidence: 0 };
    }

    const lowerMessage = message.toLowerCase().trim();

    if (this._isModificationRequest(lowerMessage, history)) {
      return { type: "code_modification", confidence: 0.9 };
    }

    if (this._matchesCodeGenerationPattern(lowerMessage)) {
      return { type: "code", confidence: 0.9 };
    }

    if (this._matchesQuestionPattern(lowerMessage)) {
      return {
        type: "question",
        confidence: 0.8,
        subtype: this._isConceptQuestion(lowerMessage) ? "concept" : "general",
      };
    }

    // Context-based detection
    const contextScore = this._analyzeContextualIntent(lowerMessage);
    if (contextScore.isCodeIntent) {
      return { type: "code", confidence: contextScore.confidence };
    }

    // Default to question for ambiguous cases
    return {
      type: "question",
      confidence: 0.5,
      reason: "ambiguous - defaulting to informational response",
    };
  }

  _isModificationRequest(lowerMessage, history) {
    const hasRecentCode = history.some(
      (msg) => msg.role === "assistant" && msg.data?.type === "code"
    );

    const modificationPatterns = [
      /\b(?:change|modify|update|fix|improve|adjust|edit)\s+(?:the\s+)?(?:above|previous|current|this|that)\s+(?:script|code)/i,
      /\b(?:can you|could you|please)\s+(?:change|modify|update|fix)\s+(?:it|that|this)/i,
      /\bmake\s+it\s+(?:also|now)\s+/i,
    ];

    return (
      hasRecentCode &&
      modificationPatterns.some((pattern) => pattern.test(lowerMessage))
    );
  }

  _matchesCodeGenerationPattern(lowerMessage) {
    const codePatterns = [
      /^(create|make|write|generate|build|add|code)\s+(a\s+)?(script|function|code)/i,
      /^(can you|could you|please|i want|i need)\s+(create|make|write|generate|build|code)/i,
      /\b(userscript|tampermonkey|greasemonkey|gm_)\b/i,
      /\b(hide|show|remove|delete|modify|change|click|add)\s+(the\s+)?(?:button|element|div|link|section|menu)/i,
      /^(?:i\s+)?(?:want|need)\s+(?:a\s+)?(?:script|code)/i,
      /\bauto(?:mate|matically)?\s+/i,
    ];

    return codePatterns.some((pattern) => pattern.test(lowerMessage));
  }

  _matchesQuestionPattern(lowerMessage) {
    const questionPatterns = [
      /^(?:what|who|where|when|why|which)\s+(?:is|are|was|were|does|do|did|can|could|would|should)\s+/i,
      /^(?:how\s+(?:do(?:es)?|can|should|would))\s+(?!(?:i|you|we)\s+(?:create|make|write|add|remove|hide|code|build))/i,
      /^(?:tell|explain|describe|define)\s+(?:me\s+)?(?:about|what|how|why)\s+/i,
      /^(?:can\s+you\s+)?(?:explain|tell\s+me|show\s+me)\s+(?:what|how|why|about)\s+/i,
      /\?$/,
    ];

    return questionPatterns.some((pattern) => pattern.test(lowerMessage));
  }

  _isConceptQuestion(lowerMessage) {
    return /(?:what|how)\s+(?:is|are|does|do)\s+(?:a\s+)?(?:userscript|tampermonkey|selector|function|async|promise|api|dom|gm_)/i.test(
      lowerMessage
    );
  }

  _analyzeContextualIntent(lowerMessage) {
    const hasCodeKeywords =
      /\b(?:element|selector|dom|click|event|listener|query|css|style|class|id|document)\b/i.test(
        lowerMessage
      );
    const hasActionVerbs =
      /\b(?:make|change|modify|update|fix|improve|adjust|automate)\b/i.test(
        lowerMessage
      );
    const mentionsPage =
      /\b(?:this\s+page|the\s+page|on\s+here|this\s+site|the\s+website|on\s+this\s+site)\b/i.test(
        lowerMessage
      );

    const indicators = [hasCodeKeywords, hasActionVerbs, mentionsPage].filter(
      Boolean
    ).length;

    return {
      isCodeIntent: indicators >= 2,
      confidence: 0.6 + indicators * 0.1,
    };
  }

  _buildSystemPrompt(intent, domSummary, previousCode, history) {
    const baseContext = this._buildBaseContext(domSummary);
    const conversationContext = this._buildConversationContext(history);

    if (intent.type === "question" || intent.confidence < 0.6) {
      return this._buildQuestionPrompt(
        baseContext,
        conversationContext,
        previousCode
      );
    }

    return this._buildCodePrompt(
      baseContext,
      conversationContext,
      previousCode,
      intent
    );
  }

  _buildBaseContext(domSummary) {
    return `You are an expert senior engineer specializing in Tampermonkey userscripts. You deeply understand the DOM, browser APIs, and the Greasemonkey API ecosystem. You write production-quality code that's maintainable, performant, and robust.

CURRENT PAGE CONTEXT:
${domSummary}

Your expertise includes:
- Advanced DOM manipulation and traversal
- Performance optimization and efficient selectors
- Async/await patterns and event handling
- Proper error handling and edge cases
- Modern ES6+ JavaScript best practices
- All Greasemonkey/Tampermonkey APIs and their optimal use cases`;
  }

  _buildConversationContext(history) {
    if (!history || history.length === 0) return "";

    const recentExchanges = history.slice(-4); // Last 2 exchanges
    const contextSummary = recentExchanges
      .filter((msg) => msg.role === "assistant" && msg.data?.type === "code")
      .map((msg) => `- Generated: ${msg.data.name}`)
      .join("\n");

    if (!contextSummary) return "";

    return `\n\nRECENT CONVERSATION CONTEXT:\n${contextSummary}\nUse this context to provide continuity and avoid redundant suggestions.`;
  }

  _buildQuestionPrompt(baseContext, conversationContext, previousCode) {
    let prompt = `${baseContext}${conversationContext}

The user is asking a question. Provide a clear, concise, and technically accurate answer. Think like a senior engineer explaining to a colleague - be direct, avoid fluff, and demonstrate deep understanding.`;

    if (previousCode) {
      prompt += `\n\nCONTEXT - RECENTLY GENERATED SCRIPT:
\`\`\`javascript
${previousCode}
\`\`\`

The user is likely asking about this script. Reference it naturally in your answer. Do NOT offer to regenerate it unless they explicitly ask for changes.`;
    }

    prompt += `\n\nGuidelines:
- If explaining concepts, use practical examples from web development
- If they need code, offer to generate it: "Would you like me to create a script for this?"
- Be conversational but professional
- Show your expertise through precise technical language`;

    return prompt;
  }

  _buildCodePrompt(baseContext, conversationContext, previousCode) {
    let prompt = `${baseContext}${conversationContext}

TASK: Generate a production-ready Tampermonkey userscript.

CRITICAL OUTPUT FORMAT - FOLLOW EXACTLY:

Script Name: [Descriptive name without "Script" suffix]
[Optional 1-2 sentence explanation of what it does]

\`\`\`javascript
// Clean, well-commented code here
\`\`\`

CODE QUALITY STANDARDS:
1. Use modern ES6+ syntax (const/let, arrow functions, template literals, destructuring)
2. Always validate element existence before manipulation
3. Prefer specific selectors: id > data-* > unique classes > structural
4. Handle dynamic content with MutationObserver when needed
5. Add try-catch for operations that might fail
6. Use meaningful variable names
7. Comment only complex logic - code should be self-documenting
8. Prefer GM APIs over standard alternatives when available

AVAILABLE GREASEMONKEY APIs:
Storage: GM_setValue, GM_getValue, GM_deleteValue, GM_listValues, GM_addValueChangeListener, GM_removeValueChangeListener
UI: GM_addStyle, GM_addElement, GM_registerMenuCommand, GM_unregisterMenuCommand
Utilities: GM_openInTab, GM_notification, GM_setClipboard, GM_download, GM_log
Network: GM_xmlhttpRequest
Resources: GM_getResourceText, GM_getResourceURL
Global: unsafeWindow (use sparingly)

SELECTOR STRATEGY:
✅ PREFER: document.getElementById(), document.querySelector('[data-testid="..."]')
✅ GOOD: document.querySelector('.unique-class'), document.querySelector('nav > .menu')
❌ AVOID: nth-child selectors, text content matching, overly specific paths

ERROR HANDLING PATTERNS:
\`\`\`javascript
// For element queries
const element = document.querySelector('.target');
if (!element) {
  console.error('Target element not found');
  return;
}

// For risky operations
try {
  // operation
} catch (error) {
  console.error('Operation failed:', error);
}
\`\`\`

DO NOT include:
- Userscript metadata headers (==UserScript==)
- Unnecessary IIFE wrappers
- jQuery or external libraries
- Placeholder comments
`;

    if (previousCode) {
      prompt += `\n\nMODIFICATION REQUEST:
You're modifying this existing script:

\`\`\`javascript
${previousCode}
\`\`\`

Instructions:
- ONLY change what the user explicitly requested
- Preserve all working functionality
- Maintain consistent code style
- Keep the same script name unless the purpose fundamentally changes
- Explain what you changed and why`;
    }

    return prompt;
  }

  _extractContentFromResponse(data) {
    // Google/Gemini format
    if (data?.candidates?.[0]?.content?.parts) {
      const parts = data.candidates[0].content.parts;
      return parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join("");
    }

    // OpenAI format
    if (data?.choices?.[0]) {
      const choice = data.choices[0];
      return choice.message?.content || choice.text || "";
    }

    // Alternative formats
    if (data.output_text) return data.output_text;
    if (data.text) return data.text;
    if (Array.isArray(data) && data[0]?.content) return data[0].content;

    return JSON.stringify(data);
  }

  _parseResponse(content) {
    if (!content?.trim()) {
      return { type: "text", message: "" };
    }

    const trimmed = content.trim();

    // Extract script name if present
    const scriptNameMatch = trimmed.match(
      /^\s*(?:\/\/)?\s*Script Name:\s*(.+?)(?:\n|$)/im
    );

    // Extract all code blocks
    const codeBlocks = this._extractCodeBlocks(trimmed);

    // Get explanation text (everything except code blocks and script name)
    const explanation = this._extractExplanation(trimmed, scriptNameMatch);

    // Determine response type
    if (scriptNameMatch && codeBlocks.length > 0) {
      return {
        type: "code",
        name: scriptNameMatch[1].trim(),
        code: codeBlocks[0],
        explanation: explanation || null,
      };
    }

    if (scriptNameMatch) {
      // Script name without code block - extract code after name
      const codeAfterName = trimmed
        .substring(trimmed.indexOf("\n", scriptNameMatch.index))
        .trim()
        .replace(/^\/\/[^\n]*\n?/, "");

      return {
        type: "code",
        name: scriptNameMatch[1].trim(),
        code: codeAfterName,
        explanation: null,
      };
    }

    if (codeBlocks.length > 0) {
      return {
        type: "code",
        name: this._inferScriptName(explanation, codeBlocks[0]),
        code: codeBlocks[0],
        explanation: explanation || null,
      };
    }

    if (this._looksLikeCode(trimmed)) {
      return {
        type: "code",
        name: this._inferScriptName("", trimmed),
        code: trimmed,
        explanation: null,
      };
    }

    // Pure text response
    return {
      type: "text",
      message: trimmed,
    };
  }

  _extractCodeBlocks(text) {
    const codeBlocks = [];
    const codeFenceRegex = /```(?:javascript|js)?\s*([\s\S]*?)```/gi;
    let match;

    while ((match = codeFenceRegex.exec(text)) !== null) {
      if (match[1]?.trim()) {
        codeBlocks.push(match[1].trim());
      }
    }

    return codeBlocks;
  }

  _extractExplanation(text) {
    let explanation = text
      .replace(/```(?:javascript|js)?[\s\S]*?```/gi, "")
      .replace(/^\s*(?:\/\/)?\s*Script Name:\s*.+?(?:\n|$)/im, "")
      .trim();

    return explanation || null;
  }

  _inferScriptName(explanation, code) {
    // Try to infer from explanation text
    const contextPatterns = [
      /(?:here'?s? a? (?:script|code) (?:that|to|for) )(.{5,60}?)(?:\.|:|\n)/i,
      /(?:this (?:script|code) (?:will|can|does) )(.{5,60}?)(?:\.|:|\n)/i,
      /(?:to )(.{5,60}?)(?:, (?:use|try|add) this)/i,
    ];

    for (const pattern of contextPatterns) {
      const match = explanation.match(pattern);
      if (match?.[1]) {
        return this._cleanScriptName(match[1]);
      }
    }

    // Try to extract from code
    const functionMatch = code.match(/function\s+(\w+)/);
    if (functionMatch?.[1]) {
      return this._humanizeIdentifier(functionMatch[1]);
    }

    const commentMatch = code.match(/^\/\/\s*(.+?)$/m);
    if (commentMatch?.[1] && commentMatch[1].length < 60) {
      return commentMatch[1].trim();
    }

    return "Generated Script";
  }

  _cleanScriptName(name) {
    return name.trim().replace(/^(the|an?)\s+/i, "");
  }

  _humanizeIdentifier(identifier) {
    return identifier
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  _looksLikeCode(content) {
    const codeIndicators = [
      /\bfunction\s+\w+\s*\(/,
      /\b(?:const|let|var)\s+\w+\s*=/,
      /document\.\w+\(/,
      /\baddEventListener\(/,
      /=>\s*{/,
      /\breturn\s+/,
      /\bGM_\w+\(/,
    ];

    const matches = codeIndicators.filter((pattern) =>
      pattern.test(content)
    ).length;
    return matches >= 2;
  }

  addToHistory(role, text, data = null) {
    this.conversationHistory.push({
      role,
      text,
      data,
      timestamp: Date.now(),
    });

    // Keep last 20 messages (10 exchanges) to manage token limits
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
    this.lastGeneratedCode = null;
    this.pageContext = null;
  }

  getHistory() {
    return this.conversationHistory;
  }

  getLastCode() {
    return this.lastGeneratedCode;
  }
}
