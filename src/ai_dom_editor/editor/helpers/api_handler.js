export class ApiHandler {
  constructor(editor) {
    this.editor = editor;
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
    this.defaultTimeoutMs = 30_000;
    this.conversationHistory = []; // Track conversation context
  }

  async loadAPIConfig() {
    try {
      const res = await chrome.storage.local.get("aiDomEditorConfigs");
      const aiDomEditorConfigs = res?.aiDomEditorConfigs;

      if (Array.isArray(aiDomEditorConfigs) && aiDomEditorConfigs.length > 0) {
        this.apiConfig = aiDomEditorConfigs[0];
      } else {
        this.apiConfig = null;
      }

      const hasKeyAndEndpoint = !!(
        this.apiConfig &&
        (this.apiConfig.apiKey || this.apiConfig.key) &&
        this.apiConfig.endpoint
      );
      if (!hasKeyAndEndpoint) {
        this.editor?.uiManager?.showConfigBanner();
      } else {
        this.editor?.uiManager?.hideConfigBanner();
      }
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
      let { availableModels, selectedModel, aiDomEditorConfigs } = storage;

      if (!Array.isArray(availableModels) || availableModels.length === 0) {
        if (
          Array.isArray(aiDomEditorConfigs) &&
          aiDomEditorConfigs.length > 0
        ) {
          availableModels = aiDomEditorConfigs.map((cfg) => ({
            id: cfg.model || cfg.modelId || "default",
            provider: (cfg.provider || cfg.vendor || "custom").toLowerCase(),
            apiKey: cfg.apiKey || cfg.key,
            endpoint: cfg.endpoint,
            temperature: cfg.temperature,
            maxTokens: cfg.maxTokens,
          }));
        } else {
          availableModels = [];
        }
      }

      this.availableModels = availableModels;

      if (typeof selectedModel === "string") {
        try {
          selectedModel = JSON.parse(selectedModel);
        } catch {
          selectedModel = null;
        }
      }

      const selector = this.editor?.elements?.modelSelector;
      if (selector) {
        selector.innerHTML = "";

        if (!this.availableModels || this.availableModels.length === 0) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent = "No models available - Configure API keys";
          selector.appendChild(option);
          selector.disabled = true;
          this.selectedModel = null;
        } else {
          selector.disabled = false;

          const modelsByProvider = {};
          this.availableModels.forEach((m) => {
            const provider = (m.provider || "custom").toLowerCase();
            modelsByProvider[provider] = modelsByProvider[provider] || [];
            modelsByProvider[provider].push(m);
          });

          Object.keys(modelsByProvider)
            .sort()
            .forEach((provider) => {
              const optgroup = document.createElement("optgroup");
              optgroup.label = provider.toUpperCase();

              modelsByProvider[provider].forEach((model) => {
                const option = document.createElement("option");
                option.value = JSON.stringify(model);
                option.textContent = model.id || `${provider}-model`;
                if (
                  selectedModel &&
                  selectedModel.id === model.id &&
                  (selectedModel.provider || "").toLowerCase() === provider
                ) {
                  option.selected = true;
                }
                optgroup.appendChild(option);
              });

              selector.appendChild(optgroup);
            });

          if (selectedModel && typeof selectedModel === "object") {
            this.selectedModel = selectedModel;
          } else {
            this.selectedModel = this.availableModels[0];
            await chrome.storage.local.set({
              selectedModel: this.selectedModel,
            });
          }
        }
      } else {
        if (selectedModel && typeof selectedModel === "object") {
          this.selectedModel = selectedModel;
        } else if (this.availableModels && this.availableModels.length > 0) {
          this.selectedModel = this.availableModels[0];
          await chrome.storage.local.set({ selectedModel: this.selectedModel });
        } else {
          this.selectedModel = null;
        }
      }
    } catch (error) {
      console.error("Error loading available models:", error);
    }
  }

  async handleModelChange(e) {
    try {
      const raw = e?.target?.value;
      if (!raw) return;
      const modelData = typeof raw === "string" ? JSON.parse(raw) : raw;
      this.selectedModel = modelData;
      await chrome.storage.local.set({ selectedModel: modelData });
    } catch (error) {
      console.error("Error handling model change:", error);
    }
  }

  _buildAuthHeaders(modelConfig) {
    const apiKey = modelConfig?.apiKey || modelConfig?.key;
    const provider = (modelConfig?.provider || "").toLowerCase();
    const modelId = (modelConfig?.id || modelConfig?.model || "").toLowerCase();

    if (!apiKey) return {};

    if (modelConfig?.headerFormat === "x-api-key") {
      return { "X-API-Key": apiKey };
    }

    if (provider.includes("aimlapi")) {
      return { Authorization: `Bearer ${apiKey}` };
    }

    const isGemma =
      modelId.includes("gemma") ||
      (provider.includes("google") && modelId.includes("gemma"));

    if (isGemma) {
      return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    }

    if (modelId.includes("gemini") || provider.includes("gemini")) {
      return { "x-goog-api-key": apiKey };
    }

    if (
      provider.includes("openai") ||
      provider.includes("gpt") ||
      provider.includes("anthropic")
    ) {
      return { Authorization: `Bearer ${apiKey}` };
    }
    if (provider.includes("azure")) {
      return { "api-key": apiKey };
    }
    if (provider.includes("google") || provider.includes("vertex")) {
      return { Authorization: `Bearer ${apiKey}` };
    }

    return { Authorization: `Bearer ${apiKey}` };
  }

  _extractContentFromResponse(data) {
    if (
      data?.candidates &&
      Array.isArray(data.candidates) &&
      data.candidates.length > 0
    ) {
      const candidate = data.candidates[0];
      if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
        const textParts = candidate.content.parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join("");
        if (textParts) return textParts;
      }
    }

    if (
      data?.choices &&
      Array.isArray(data.choices) &&
      data.choices.length > 0
    ) {
      const first = data.choices[0];
      if (first.message?.content) return first.message.content;
      if (typeof first.text === "string") return first.text;
    }

    if (typeof data.output_text === "string") return data.output_text;
    if (typeof data.text === "string") return data.text;

    if (
      Array.isArray(data) &&
      data.length > 0 &&
      typeof data[0].content === "string"
    )
      return data[0].content;

    return JSON.stringify(data);
  }

  _parseResponse(content) {
    if (!content || typeof content !== "string") {
      return { type: "text", message: "" };
    }

    const trimmed = content.trim();
    
    // Check for explicit script format marker
    const scriptNameMatch = trimmed.match(/^Script Name:\s*(.+?)(?:\n|$)/i);
    
    // Extract code blocks
    const codeBlocks = [];
    const codeFenceRegex = /```(?:javascript|js)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = codeFenceRegex.exec(trimmed)) !== null) {
      if (match[1] && match[1].trim()) {
        codeBlocks.push(match[1].trim());
      }
    }

    // Remove code blocks to get remaining text
    const textWithoutCode = trimmed
      .replace(/```(?:javascript|js)?[\s\S]*?```/gi, '[CODE_BLOCK]')
      .replace(/Script Name:\s*.+?(?:\n|$)/i, '')
      .trim();

    // Determine response type and structure
    if (scriptNameMatch && codeBlocks.length > 0) {
      // Clear code generation with name
      return {
        type: "code",
        name: scriptNameMatch[1].trim(),
        code: codeBlocks[0],
        explanation: textWithoutCode.replace(/\[CODE_BLOCK\]/g, '').trim() || null,
      };
    } else if (scriptNameMatch) {
      const codeAfterName = trimmed
        .substring(trimmed.indexOf('\n', scriptNameMatch.index))
        .trim()
        .replace(/^\/\/[^\n]*\n?/, ''); // Remove first comment line if exists
      
      return {
        type: "code",
        name: scriptNameMatch[1].trim(),
        code: codeAfterName,
        explanation: null,
      };
    } else if (codeBlocks.length > 0) {
      const inferredName = this._inferScriptName(textWithoutCode, codeBlocks[0]);
      
      return {
        type: "code",
        name: inferredName,
        code: codeBlocks[0],
        explanation: textWithoutCode.replace(/\[CODE_BLOCK\]/g, '').trim() || null,
      };
    } else if (this._looksLikeCode(trimmed)) {
      return {
        type: "code",
        name: "Generated Script",
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

  _inferScriptName(text, code) {
    const contextPatterns = [
      /(?:here'?s? a? (?:script|code) (?:that|to|for) )(.{5,50}?)(?:\.|:|\n)/i,
      /(?:this (?:script|code) (?:will|can) )(.{5,50}?)(?:\.|:|\n)/i,
      /(?:to )(.{5,50}?)(?:, (?:use|try|add) this)/i,
    ];

    for (const pattern of contextPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim().replace(/^(the|an?)\s+/i, '');
      }
    }

    // Look for function names or descriptive comments in the code
    const functionMatch = code.match(/function\s+(\w+)/);
    if (functionMatch && functionMatch[1]) {
      return this._humanizeIdentifier(functionMatch[1]);
    }

    const commentMatch = code.match(/^\/\/\s*(.+?)$/m);
    if (commentMatch && commentMatch[1] && commentMatch[1].length < 50) {
      return commentMatch[1].trim();
    }

    return "Generated Script";
  }

  _humanizeIdentifier(identifier) {
    return identifier
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  _looksLikeCode(content) {
    const codeIndicators = [
      /\bfunction\s+\w+\s*\(/,
      /\b(?:const|let|var)\s+\w+\s*=/,
      /document\.\w+\(/,
      /\baddEventListener\(/,
      /=>\s*{/,
      /\breturn\s+/,
    ];

    let matches = 0;
    for (const indicator of codeIndicators) {
      if (indicator.test(content)) matches++;
    }

    return matches >= 2;
  }

  _detectIntent(message) {
    if (!message || typeof message !== "string") {
      return { type: "unknown", confidence: 0 };
    }

    const lowerMessage = message.toLowerCase().trim();
    
    // Strong code indicators - direct requests
    const strongCodePatterns = [
      /^(create|make|write|generate|build|add)\s+(a\s+)?(script|code|function)/i,
      /^(can you|could you|please)\s+(create|make|write|generate|build)/i,
      /\b(userscript|tampermonkey|greasemonkey|gm_)\b/i,
      /\b(hide|show|remove|delete|modify|change|click)\s+(the\s+)?(?:button|element|div|link)/i,
      /^(?:i\s+)?(?:want|need)\s+(?:a\s+)?(?:script|code)/i,
    ];

    for (const pattern of strongCodePatterns) {
      if (pattern.test(lowerMessage)) {
        return { type: "code", confidence: 0.9 };
      }
    }

    // Strong question indicators - pure information requests
    const strongQuestionPatterns = [
      /^(?:what|who|where|when|why)\s+(?:is|are|was|were|does|do)\s+/i,
      /^(?:how\s+do(?:es)?)\s+(?!(?:i|you|we)\s+(?:create|make|write|add|remove|hide))/i,
      /^(?:tell|explain|describe)\s+(?:me\s+)?(?:about|what)\s+/i,
      /^(?:can\s+you\s+)?(?:explain|tell\s+me)\s+(?:what|how|why)\s+/i,
      /\?$/,
    ];

    // Check if it's asking about code concepts vs requesting code
    const conceptQuestion = /(?:what|how)\s+(?:is|are|does)\s+(?:a\s+)?(?:userscript|tampermonkey|selector|function|async|promise)/i;
    
    for (const pattern of strongQuestionPatterns) {
      if (pattern.test(lowerMessage)) {
        if (conceptQuestion.test(lowerMessage)) {
          return { type: "question", confidence: 0.7, subtype: "concept" };
        }
        return { type: "question", confidence: 0.8 };
      }
    }

    // Context-sensitive detection
    const hasCodeKeywords = /\b(?:element|selector|dom|click|event|listener|query|css|style)\b/i.test(lowerMessage);
    const hasActionVerbs = /\b(?:make|change|modify|update|fix|improve|adjust)\b/i.test(lowerMessage);
    const mentionsPage = /\b(?:this\s+page|the\s+page|on\s+here|this\s+site|the\s+website)\b/i.test(lowerMessage);
    
    if (hasCodeKeywords && (hasActionVerbs || mentionsPage)) {
      return { type: "code", confidence: 0.7 };
    }

    // Modification requests
    if (/\b(?:change|modify|update|fix|improve|adjust)\s+(?:the\s+)?(?:above|previous|current|this)\s+(?:script|code)/i.test(lowerMessage)) {
      return { type: "code_modification", confidence: 0.85 };
    }

    // Default to question for ambiguous cases
    return { 
      type: "question", 
      confidence: 0.5,
      reason: "ambiguous - defaulting to informational response"
    };
  }

  _buildSystemPrompt(intent, domSummary, previousCode) {
    const baseContext = `You are an expert AI assistant integrated into a browser extension that helps users create Tampermonkey userscripts.

CURRENT PAGE CONTEXT:
${domSummary}
`;

    if (intent.type === "question" || intent.confidence < 0.6) {
      return `${baseContext}

The user appears to be asking a question or seeking information. Respond helpfully and conversationally.

If they're asking about userscript concepts, explain clearly with examples.
If they're asking how to do something, you can explain the approach AND offer to generate code if appropriate.
Do NOT generate code unless the user clearly wants it.

Be concise and helpful. If you think they might want code, you can ask: "Would you like me to generate a script for this?"`;
    }

    // Code generation prompt
    let codePrompt = `${baseContext}

You are generating a Tampermonkey userscript. The user wants executable JavaScript code.

CRITICAL OUTPUT FORMAT:
Your response MUST follow this exact structure:

Script Name: <Descriptive name without "Script" suffix>
<optional brief explanation in 1-2 sentences>

\`\`\`javascript
// Actual executable code here
// No metadata headers (==UserScript==)
// No IIFE wrapper unless necessary
\`\`\`

RULES:
1. ALWAYS start with "Script Name: " followed by a descriptive name
2. Code must be wrapped in \`\`\`javascript code fences
3. NO userscript metadata headers
4. Code must be immediately executable
5. Use modern ES6+ syntax (const/let, arrow functions, template literals)
6. Always check if elements exist before manipulating them
7. Add comments explaining complex logic

SELECTOR BEST PRACTICES:
- Prefer: id > data-attributes > unique classes > stable structure
- Avoid: nth-child, overly specific paths, text content matching
- Always validate elements exist before use

AVAILABLE GM APIs:
GM_addStyle, GM_setValue/getValue/deleteValue/listValues (all async),
GM_notification, GM_openInTab, GM_setClipboard, GM_xmlhttpRequest,
GM_registerMenuCommand, GM_download, GM_getResourceText, unsafeWindow

ERROR HANDLING:
- Use try-catch for risky operations
- Check element existence before manipulation
- Use MutationObserver for dynamic content
- Add meaningful console.error messages
`;

    if (previousCode) {
      codePrompt += `
MODIFICATION REQUEST:
The user wants to modify this existing script:

\`\`\`javascript
${previousCode}
\`\`\`

- Only change what the user explicitly requests
- Preserve all working functionality
- Maintain the same coding style
- Keep the same script name unless the purpose fundamentally changes
`;
    }

    return codePrompt;
  }

  async callAIAPI(userMessage, domSummary, previousCode = null) {
    const intent = this._detectIntent(userMessage, domSummary);
    
    console.log('Detected intent:', intent); // Debug logging
    const systemPrompt = this._buildSystemPrompt(intent, domSummary, previousCode);

    const modelConfig = this.selectedModel || this.apiConfig || {};
    const modelId =
      modelConfig.id || modelConfig.model || this.apiConfig?.model || "gpt-4";
    const endpoint = modelConfig.endpoint || this.apiConfig?.endpoint;
    const apiKey =
      modelConfig.apiKey ||
      modelConfig.key ||
      this.apiConfig?.apiKey ||
      this.apiConfig?.key;

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

    const authHeaders = this._buildAuthHeaders(modelConfig);

    const provider = (modelConfig.provider || "").toLowerCase();
    const isGemma = modelId.toLowerCase().includes("gemma");
    const isGoogleish =
      !provider.includes("aimlapi") &&
      !isGemma &&
      (modelId.toLowerCase().includes("gemini") ||
        provider.includes("google") ||
        provider.includes("vertex"));
    const isAnthropic =
      provider.includes("anthropic") ||
      modelId.toLowerCase().includes("claude");

    const temperature =
      typeof modelConfig.temperature === "number"
        ? modelConfig.temperature
        : typeof this.apiConfig?.temperature === "number"
        ? this.apiConfig.temperature
        : 0.7;
    const max_tokens =
      typeof modelConfig.maxTokens === "number"
        ? modelConfig.maxTokens
        : typeof this.apiConfig?.maxTokens === "number"
        ? this.apiConfig.maxTokens
        : 2000;

    let requestBody;
    if (isGemma) {
      requestBody = {
        model: modelId,
        messages: [
          { role: "user", content: `${systemPrompt}\n\n${userMessage}` },
        ],
        temperature: temperature,
        max_tokens: max_tokens,
      };
    } else if (isGoogleish) {
      const combinedPrompt = `${systemPrompt}\n\n${userMessage}`;
      requestBody = {
        contents: [
          {
            parts: [{ text: combinedPrompt }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens,
        },
      };
    } else if (isAnthropic) {
      requestBody = {
        model: modelId,
        prompt: `${systemPrompt}\n\nUser Request: ${userMessage}`,
        temperature,
        max_tokens,
      };
    } else {
      requestBody = {
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens,
      };
    }

    if (
      modelConfig?.extraRequestFields &&
      typeof modelConfig.extraRequestFields === "object"
    ) {
      Object.assign(requestBody, modelConfig.extraRequestFields);
    }

    const controller = new AbortController();
    const timeout = modelConfig.requestTimeoutMs || this.defaultTimeoutMs;
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
        let errText = `API request failed with status ${res.status}`;
        try {
          const errJson = await res.json();
          errText =
            errJson?.error?.message ||
            errJson?.message ||
            JSON.stringify(errJson);
        } catch {
          try {
            const txt = await res.text();
            if (txt) errText = txt;
          } catch {
            /* ignore */
          }
        }
        throw new Error(errText);
      }

      const data = await res.json();

      const rawContent = this._extractContentFromResponse(data);
      if (!rawContent || rawContent.length === 0) {
        throw new Error("No usable content returned from AI provider.");
      }

      const parsed = this._parseResponse(rawContent);
      parsed.detectedIntent = intent;
      
      return parsed;
    } catch (err) {
      console.error("AI API Error:", err);
      if (err.name === "AbortError") {
        throw new Error(`AI request timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content, timestamp: Date.now() });
    
    // Keep only last 10 exchanges to avoid token limits
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }
}