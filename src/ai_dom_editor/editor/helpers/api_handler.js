export class ApiHandler {
  constructor(editor) {
    this.editor = editor;
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
    this.defaultTimeoutMs = 30000;
  }

  async loadAPIConfig() {
    try {
      const { aiDomEditorConfigs = [] } = await chrome.storage.local.get(
        "aiDomEditorConfigs"
      );

      this.apiConfig = Array.isArray(aiDomEditorConfigs)
        ? aiDomEditorConfigs[0] || null
        : null;

      if (this._hasUsableConfig(this.apiConfig)) {
        this.editor.uiManager.hideConfigBanner();
      } else {
        this.editor.uiManager.showConfigBanner();
      }
    } catch (error) {
      console.error("Error loading AI config:", error);
      this.editor.uiManager.showConfigBanner();
    }
  }

  async loadAvailableModels() {
    try {
      const {
        availableModels = [],
        selectedModel = null,
        aiDomEditorConfigs = [],
      } = await chrome.storage.local.get([
        "availableModels",
        "selectedModel",
        "aiDomEditorConfigs",
      ]);

      this.availableModels = this._normalizeModels(availableModels, aiDomEditorConfigs);
      const parsedSelected = this._safeParseJSON(selectedModel) || selectedModel;

      this._renderModelSelector(parsedSelected);

      const activeModel = this.selectedModel || this.availableModels[0] || null;
      this.selectedModel = activeModel;

      if (activeModel) {
        await chrome.storage.local.set({ selectedModel: activeModel });
      }
    } catch (error) {
      console.error("Error loading AI models:", error);
      this.availableModels = [];
      this.selectedModel = null;
      this._renderModelSelector(null);
    }
  }

  async handleModelChange(e) {
    try {
      const value = e?.target?.value;
      if (!value) return;

      const parsed = this._safeParseJSON(value);
      if (!parsed || typeof parsed !== "object") return;

      this.selectedModel = parsed;
      await chrome.storage.local.set({ selectedModel: parsed });
    } catch (error) {
      console.error("Error changing model:", error);
    }
  }

  async callAIAPI(userMessage, domSummary, previousCode = null, history = []) {
    const message = (userMessage || "").trim();
    if (!message) {
      return { type: "text", message: "Please enter a request." };
    }

    const activeConfig = this._getActiveConfig();
    if (!this._hasUsableConfig(activeConfig)) {
      this.editor.uiManager.showConfigBanner();
      throw new Error("Please configure an AI API key, endpoint, and model.");
    }

    const providerType = this._detectProviderType(activeConfig);
    const systemPrompt = this._buildSystemPrompt(domSummary, previousCode);
    const requestBody = this._buildRequestBody({
      providerType,
      activeConfig,
      systemPrompt,
      message,
      history,
    });

    const timeoutMs = Number(activeConfig.requestTimeoutMs || this.defaultTimeoutMs);
    const responseJson = await this._executeRequest({
      endpoint: activeConfig.endpoint,
      headers: this._buildHeaders(activeConfig, providerType),
      body: requestBody,
      timeoutMs,
    });

    const rawContent = this._extractContent(responseJson, providerType);
    if (!rawContent) {
      throw new Error("AI returned an empty response.");
    }

    return this._parseAIContent(rawContent);
  }

  _normalizeModels(availableModels, configs) {
    if (Array.isArray(availableModels) && availableModels.length > 0) {
      return availableModels
        .map((model) => this._normalizeModelRecord(model))
        .filter((model) => this._hasUsableConfig(model));
    }

    if (!Array.isArray(configs)) {
      return [];
    }

    return configs
      .map((cfg) => ({
        id: cfg.model || cfg.id || "",
        model: cfg.model || cfg.id || "",
        provider: (cfg.provider || "custom").toLowerCase(),
        apiKey: cfg.apiKey || cfg.key || "",
        endpoint: cfg.endpoint || "",
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      }))
      .filter((model) => this._hasUsableConfig(model));
  }

  _normalizeModelRecord(model) {
    return {
      ...model,
      id: model.id || model.model || "",
      model: model.model || model.id || "",
      provider: (model.provider || "custom").toLowerCase(),
      apiKey: model.apiKey || model.key || "",
      endpoint: model.endpoint || "",
    };
  }

  _renderModelSelector(selectedModel) {
    const selector = this.editor.elements.modelSelector;
    if (!selector) return;

    selector.innerHTML = "";

    if (!this.availableModels.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No models available - Configure API keys";
      selector.appendChild(option);
      selector.disabled = true;
      this.selectedModel = null;
      return;
    }

    selector.disabled = false;

    const grouped = this.availableModels.reduce((acc, model) => {
      const provider = (model.provider || "custom").toLowerCase();
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {});

    const selectedSignature = this._modelSignature(selectedModel);
    let matchedModel = null;

    Object.keys(grouped)
      .sort()
      .forEach((provider) => {
        const group = document.createElement("optgroup");
        group.label = provider.toUpperCase();

        grouped[provider].forEach((model, idx) => {
          const option = document.createElement("option");
          option.value = JSON.stringify(model);
          option.textContent = model.id || model.model || `${provider}-${idx + 1}`;

          if (
            selectedSignature &&
            this._modelSignature(model) === selectedSignature
          ) {
            option.selected = true;
            matchedModel = model;
          }

          group.appendChild(option);
        });

        selector.appendChild(group);
      });

    this.selectedModel = matchedModel || this.availableModels[0];
  }

  _modelSignature(model) {
    if (!model) return "";
    const provider = (model.provider || "custom").toLowerCase();
    const id = model.id || model.model || "";
    return `${provider}:${id}`;
  }

  _getActiveConfig() {
    const selected = this._normalizeModelRecord(this.selectedModel || {});
    const fallback = this._normalizeModelRecord(this.apiConfig || {});

    return {
      ...fallback,
      ...selected,
      model: selected.model || selected.id || fallback.model || fallback.id || "",
      id: selected.id || selected.model || fallback.id || fallback.model || "",
      endpoint: selected.endpoint || fallback.endpoint || "",
      apiKey: selected.apiKey || fallback.apiKey || fallback.key || "",
      provider: (selected.provider || fallback.provider || "custom").toLowerCase(),
      temperature:
        selected.temperature ?? fallback.temperature ?? 0.4,
      maxTokens: selected.maxTokens ?? fallback.maxTokens ?? 1800,
    };
  }

  _hasUsableConfig(config) {
    return !!(config && config.apiKey && config.endpoint && (config.id || config.model));
  }

  _detectProviderType(config) {
    const provider = (config.provider || "").toLowerCase();
    const endpoint = (config.endpoint || "").toLowerCase();
    const model = (config.model || config.id || "").toLowerCase();

    if (
      provider.includes("google") ||
      provider.includes("gemini") ||
      endpoint.includes("generativelanguage.googleapis.com")
    ) {
      return "google";
    }

    if (
      provider.includes("anthropic") ||
      endpoint.includes("api.anthropic.com") ||
      model.includes("claude")
    ) {
      return "anthropic";
    }

    return "openai";
  }

  _buildSystemPrompt(domSummary, previousCode) {
    const safeDom = (domSummary || "").slice(0, 50000);

    let prompt = `You are a senior Tampermonkey engineer. Generate practical, robust JavaScript for userscripts.

OUTPUT CONTRACT (required):
1) First line: Script Name: <short descriptive title>
2) Second line: one concise sentence describing behavior
3) Then exactly one fenced javascript code block
4) The code block must include JavaScript only
5) Do not output userscript metadata headers (no ==UserScript== block)
6) Assume requested GM APIs are available; do not emit fallback branches for missing GM APIs

CODE RULES:
- Prefer GM APIs where appropriate
- Use specific selectors and guard missing elements
- Keep code concise and maintainable
- No external libraries

PAGE CONTEXT:
${safeDom}`;

    if (previousCode) {
      prompt += `\n\nCURRENT SCRIPT CONTEXT (modify only if requested):\n\n\
\`\`\`javascript
${previousCode}
\`\`\``;
    }

    return prompt;
  }

  _buildRequestBody({ providerType, activeConfig, systemPrompt, message, history }) {
    const trimmedHistory = this._formatHistory(history).slice(-6);
    const userPayload = `User request: ${message}`;

    if (providerType === "google") {
      const transcript = [
        `SYSTEM:\n${systemPrompt}`,
        ...trimmedHistory.map((item) => `${item.role.toUpperCase()}:\n${item.content}`),
        `USER:\n${userPayload}`,
      ].join("\n\n");

      return {
        contents: [{ parts: [{ text: transcript }] }],
        generationConfig: {
          temperature: Number(activeConfig.temperature ?? 0.4),
          maxOutputTokens: Number(activeConfig.maxTokens ?? 1800),
        },
      };
    }

    if (providerType === "anthropic") {
      return {
        model: activeConfig.model || activeConfig.id,
        system: systemPrompt,
        messages: [
          ...trimmedHistory,
          { role: "user", content: userPayload },
        ],
        temperature: Number(activeConfig.temperature ?? 0.4),
        max_tokens: Number(activeConfig.maxTokens ?? 1800),
      };
    }

    return {
      model: activeConfig.model || activeConfig.id,
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedHistory,
        { role: "user", content: userPayload },
      ],
      temperature: Number(activeConfig.temperature ?? 0.4),
      max_tokens: Number(activeConfig.maxTokens ?? 1800),
    };
  }

  _formatHistory(history) {
    if (!Array.isArray(history)) return [];

    return history
      .map((msg) => {
        if (!msg || !msg.role) return null;

        if (msg.role === "user") {
          return { role: "user", content: (msg.text || "").trim() };
        }

        if (msg.role === "assistant") {
          if (msg.data?.type === "code" && msg.data?.code) {
            const parts = [];
            if (msg.data.name) parts.push(`Script Name: ${msg.data.name}`);
            if (msg.data.explanation) parts.push(msg.data.explanation);
            parts.push(`\`\`\`javascript\n${msg.data.code}\n\`\`\``);
            return { role: "assistant", content: parts.join("\n\n") };
          }
          return { role: "assistant", content: (msg.text || "").trim() };
        }

        return null;
      })
      .filter((entry) => entry && entry.content);
  }

  _buildHeaders(config, providerType) {
    const headers = {
      "Content-Type": "application/json",
    };

    const apiKey = config.apiKey;
    if (!apiKey) return headers;

    if (providerType === "google") {
      headers["x-goog-api-key"] = apiKey;
      return headers;
    }

    if (providerType === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      return headers;
    }

    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  async _executeRequest({ endpoint, headers, body, timeoutMs }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(await this._extractErrorMessage(res));
      }

      return await res.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`AI request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _extractErrorMessage(res) {
    try {
      const data = await res.json();
      return data?.error?.message || data?.message || JSON.stringify(data);
    } catch {
      try {
        const text = await res.text();
        return text || `AI request failed with status ${res.status}`;
      } catch {
        return `AI request failed with status ${res.status}`;
      }
    }
  }

  _extractContent(data, providerType) {
    if (providerType === "google") {
      const parts = data?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        return parts.map((p) => p?.text || "").join("\n").trim();
      }
    }

    if (providerType === "anthropic") {
      const content = data?.content;
      if (Array.isArray(content)) {
        return content
          .map((item) => item?.text || "")
          .join("\n")
          .trim();
      }
    }

    const openAIContent = data?.choices?.[0]?.message?.content;
    if (Array.isArray(openAIContent)) {
      return openAIContent
        .map((part) => {
          if (typeof part === "string") return part;
          if (part?.type === "text") return part.text || "";
          if (part?.text?.value) return part.text.value;
          return "";
        })
        .join("\n")
        .trim();
    }

    return (
      openAIContent ||
      data?.choices?.[0]?.text ||
      data?.output_text ||
      data?.text ||
      ""
    ).trim();
  }

  _parseAIContent(content) {
    const text = (content || "").trim();
    if (!text) {
      return { type: "text", message: "" };
    }

    const codeMatch = text.match(/```(?:javascript|js|ts)?\s*([\s\S]*?)```/i);
    const scriptNameMatch = text.match(/^\s*Script Name:\s*(.+)$/im);

    if (codeMatch?.[1]) {
      const code = codeMatch[1].trim();
      const explanation = this._extractExplanation(text).trim();
      const name = this._cleanScriptName(scriptNameMatch?.[1]) || "Generated Script";

      return {
        type: "code",
        name,
        explanation: explanation || "Generated script based on your request.",
        code,
      };
    }

    if (this._looksLikeCode(text)) {
      const name = this._cleanScriptName(scriptNameMatch?.[1]) || "Generated Script";
      return {
        type: "code",
        name,
        explanation: "Generated script based on your request.",
        code: text,
      };
    }

    return { type: "text", message: text };
  }

  _extractExplanation(text) {
    return text
      .replace(/```(?:javascript|js)?[\s\S]*?```/gi, "")
      .replace(/^\s*Script Name:\s*.+$/gim, "")
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  _cleanScriptName(raw) {
    if (!raw) return "";
    return raw
      .replace(/^['"]|['"]$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  _looksLikeCode(text) {
    if (/==UserScript==|==\/UserScript==/.test(text)) return true;
    if (/\(\s*function\s*\(\)\s*\{[\s\S]*?\}\)\(\);?/.test(text)) return true;
    if (/^\s*(?:\/\/.*\n)+\s*(?:const|let|var|function|\(|document\.|GM_)/m.test(text)) return true;

    const signals = [
      /\bfunction\b/,
      /\bconst\s+\w+\s*=/,
      /\blet\s+\w+\s*=/,
      /\bvar\s+\w+\s*=/,
      /document\./,
      /window\./,
      /GM_\w+\s*\(/,
      /addEventListener\s*\(/,
      /querySelector\s*\(/,
      /getElementById\s*\(/,
      /=>\s*\{/,
      /;\s*$/m,
    ];

    const matched = signals.filter((pattern) => pattern.test(text)).length;
    return matched >= 2 || (matched >= 1 && text.split("\n").length > 8);
  }

  _safeParseJSON(value) {
    if (!value || typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
