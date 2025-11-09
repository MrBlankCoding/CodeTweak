// src/ai_dom_editor/editor/helpers/api_handler.js

export class ApiHandler {
  constructor(editor) {
    this.editor = editor;
    this.apiConfig = null;
    this.availableModels = [];
    this.selectedModel = null;
  }

  async loadAPIConfig() {
    try {
      const { aiDomEditorConfigs } = await chrome.storage.local.get('aiDomEditorConfigs');
      
      if (aiDomEditorConfigs && aiDomEditorConfigs.length > 0) {
        this.apiConfig = aiDomEditorConfigs[0];
      } else {
        this.apiConfig = null;
      }
      
      if (!this.apiConfig || !this.apiConfig.apiKey || !this.apiConfig.endpoint) {
        this.editor.uiManager.showConfigBanner();
      } else {
        this.editor.uiManager.hideConfigBanner();
      }
    } catch (error) {
      console.error('Error loading API config:', error);
      this.editor.uiManager.showConfigBanner();
    }
  }
  
  async loadAvailableModels() {
    try {
      const { availableModels, selectedModel, aiDomEditorConfigs } = 
        await chrome.storage.local.get(['availableModels', 'selectedModel', 'aiDomEditorConfigs']);
      
      this.availableModels = availableModels || [];
      
      if (this.availableModels.length === 0 && aiDomEditorConfigs && aiDomEditorConfigs.length > 0) {
        this.availableModels = aiDomEditorConfigs.map(config => ({
          id: config.model || 'default',
          provider: config.provider || 'custom',
          apiKey: config.apiKey,
          endpoint: config.endpoint
        }));
      }
      
      if (this.editor.elements.modelSelector) {
        this.editor.elements.modelSelector.innerHTML = '';
        
        if (this.availableModels.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No models available - Configure API keys';
          this.editor.elements.modelSelector.appendChild(option);
          this.editor.elements.modelSelector.disabled = true;
        } else {
          this.editor.elements.modelSelector.disabled = false;
          
          const modelsByProvider = {};
          this.availableModels.forEach(model => {
            if (!modelsByProvider[model.provider]) {
              modelsByProvider[model.provider] = [];
            }
            modelsByProvider[model.provider].push(model);
          });
          
          Object.keys(modelsByProvider).sort().forEach(provider => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = provider.toUpperCase();
            
            modelsByProvider[provider].forEach(model => {
              const option = document.createElement('option');
              option.value = JSON.stringify(model);
              option.textContent = model.id;
              if (selectedModel && selectedModel.id === model.id && selectedModel.provider === model.provider) {
                option.selected = true;
              }
              optgroup.appendChild(option);
            });
            
            this.editor.elements.modelSelector.appendChild(optgroup);
          });
          
          if (selectedModel) {
            this.selectedModel = selectedModel;
          } else if (this.availableModels.length > 0) {
            this.selectedModel = this.availableModels[0];
            await chrome.storage.local.set({ selectedModel: this.selectedModel });
          }
        }
      }
    } catch (error) {
      console.error('Error loading available models:', error);
    }
  }

  async handleModelChange(e) {
    try {
      const modelData = JSON.parse(e.target.value);
      this.selectedModel = modelData;
      await chrome.storage.local.set({ selectedModel: modelData });
    } catch (error) {
      console.error('Error handling model change:', error);
    }
  }

  async callAIAPI(userMessage, domSummary) {
    const systemPrompt = `You are a JavaScript code generator for Tampermonkey userscripts.

The user will describe changes to a webpage. Generate ACTUAL EXECUTABLE JAVASCRIPT CODE, not JSON.

Your response should be PURE JAVASCRIPT CODE that will run in a userscript.

IMPORTANT RULES:
1. Write actual JavaScript code, NOT JSON arrays
2. Use document.querySelectorAll() and DOM manipulation
3. DO NOT include // ==UserScript== metadata headers
4. DO NOT make external network calls
5. You can use GM_addStyle for CSS changes
6. Make code robust with null checks

EXAMPLES:

To change text:
document.querySelectorAll('h1.title').forEach(el => {
    el.textContent = 'New Title';
});

To change styles:
document.querySelectorAll('.button').forEach(el => {
    el.style.background = 'red';
    el.style.color = 'white';
});

To remove elements:
document.querySelectorAll('.ads').forEach(el => el.remove());

To add CSS:
GM_addStyle(\`
    .my-class {
        color: blue;
        background: pink;
    }
\`);

To insert HTML:
document.querySelectorAll('.container').forEach(el => {
    el.insertAdjacentHTML('beforeend', '<div>New content</div>');
});

For complex changes, write complete logic with loops, conditionals, etc.

DOM Summary:
${domSummary}

Generate ONLY the JavaScript code, no explanations or JSON.`;

    const modelConfig = this.selectedModel || this.apiConfig;
    const modelId = this.selectedModel?.id || this.apiConfig?.model || 'gpt-4';
    const endpoint = modelConfig.endpoint;
    const apiKey = modelConfig.apiKey;
    
    const isGoogleModel = modelId.includes('gemini') || modelId.includes('gemma');
    
    const requestBody = {
      model: modelId,
      messages: isGoogleModel ? [
        { role: 'user', content: `${systemPrompt}\n\nUser Request: ${userMessage}` }
      ] : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: this.apiConfig?.temperature || 0.7,
      max_tokens: this.apiConfig?.maxTokens || 2000
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || errorData.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    const codeMatch = content.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      return {
        type: 'script',
        code: codeMatch[1].trim()
      };
    }
    
    return {
      type: 'script',
      code: content.trim()
    };
  }
}
