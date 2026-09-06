import { AIDiffHelper } from '../../../shared/utils/ai_diff_helper.js';

export class PromptBuilder {
  static buildSystemPrompt(domSummary, previousCode) {
    const safeDom = (domSummary || '').slice(0, 50000);

    let prompt = `You are a Senior Systems Architect and Expert Userscript Developer. Generate practical, robust JavaScript for userscripts.

OUTPUT CONTRACT (required):
1) First line: Script Name: <short descriptive title>
2) Second line: one concise sentence describing behavior
3) Then your code changes (either a full block or surgical patches)
4) No userscript metadata headers (no ==UserScript== block)
5) Assume requested GM APIs are available

CORE ENGINEERING PRINCIPLES:
1. DRY (Don't Repeat Yourself): If you are adding logic that already exists, you MUST refactor it into a shared function.
2. Architectural Reasoning: Before adding new triggers (like keyboard shortcuts), check if the logic already exists in another handler and extract it if necessary.
3. Minimal Impact: When modifying existing code, you MUST provide your changes in SEARCH/REPLACE blocks or Unified Diff format for surgical edits.

${AIDiffHelper.getSystemInstructions()}

PAGE CONTEXT (DOM SUMMARY):
${safeDom}`;

    if (previousCode) {
      prompt += `\n\nCURRENT SCRIPT CONTEXT:\n\n\
\`\`\`javascript
${previousCode}
\`\`\``;
    }

    return prompt;
  }

  static buildRequestBody({ providerType, activeConfig, systemPrompt, message, history }) {
    const trimmedHistory = this.formatHistory(history).slice(-6);
    const userPayload = `User request: ${message}`;

    if (providerType === 'google') {
      const transcript = [
        `SYSTEM:\n${systemPrompt}`,
        ...trimmedHistory.map((item) => `${item.role.toUpperCase()}:\n${item.content}`),
        `USER:\n${userPayload}`,
      ].join('\n\n');

      return {
        contents: [{ parts: [{ text: transcript }] }],
        generationConfig: {
          temperature: Number(activeConfig.temperature ?? 0.4),
          maxOutputTokens: Number(activeConfig.maxTokens ?? 1800),
        },
      };
    }

    if (providerType === 'anthropic') {
      return {
        model: activeConfig.model || activeConfig.id,
        system: systemPrompt,
        messages: [...trimmedHistory, { role: 'user', content: userPayload }],
        temperature: Number(activeConfig.temperature ?? 0.4),
        max_tokens: Number(activeConfig.maxTokens ?? 1800),
      };
    }

    return {
      model: activeConfig.model || activeConfig.id,
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory,
        { role: 'user', content: userPayload },
      ],
      temperature: Number(activeConfig.temperature ?? 0.4),
      max_tokens: Number(activeConfig.maxTokens ?? 1800),
    };
  }

  static formatHistory(history) {
    if (!Array.isArray(history)) return [];

    return history
      .map((msg) => {
        if (!msg || !msg.role) return null;

        if (msg.role === 'user') {
          return { role: 'user', content: (msg.text || '').trim() };
        }

        if (msg.role === 'assistant') {
          if (msg.data?.type === 'code' && msg.data?.code) {
            const parts = [];
            if (msg.data.name) parts.push(`Script Name: ${msg.data.name}`);
            if (msg.data.explanation) parts.push(msg.data.explanation);
            parts.push(`\`\`\`javascript\n${msg.data.code}\n\`\`\``);
            return { role: 'assistant', content: parts.join('\n\n') };
          }
          return { role: 'assistant', content: (msg.text || '').trim() };
        }

        return null;
      })
      .filter((entry) => entry && entry.content);
  }
}
