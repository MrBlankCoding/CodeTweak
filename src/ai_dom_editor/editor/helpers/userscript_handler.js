import ScriptAnalyzer from '../../../utils/scriptAnalyzer.js';

export class UserscriptHandler {
  constructor(editor) {
    this.editor = editor;
  }

  async getScriptContent(scriptName) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getScriptContent', scriptName }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response.error) {
          return reject(new Error(response.error));
        }
        resolve(response.code);
      });
    });
  }

  async getAllScripts() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getAllScripts' }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response.error) {
          return reject(new Error(response.error));
        }
        resolve(response.scripts);
      });
    });
  }

  async createUserscript(code) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      let scriptCode = typeof code === 'string' ? code : this.convertActionsToScript(code);
      const userPrompt = this.editor.eventHandler.lastUserPrompt || '';

      scriptCode = scriptCode.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\n*/g, '').trim();

      const detectedApis = ScriptAnalyzer.detectGMApiUsage(scriptCode);
      const suggestedRunAt = ScriptAnalyzer.suggestRunAt(scriptCode);
      const scriptName = ScriptAnalyzer.generateScriptName(url.hostname, userPrompt);
      
      const metadata = {
        name: scriptName,
        namespace: 'https://codetweak.local',
        version: '1.0.0',
        description: userPrompt || `Modifications for ${url.hostname}`,
        author: 'CodeTweak AI',
        matches: [`${url.origin}/*`],
        gmApis: detectedApis,
        runAt: suggestedRunAt
      };
      
      const wrappedCode = this.wrapInIIFE(scriptCode);
      const finalScript = ScriptAnalyzer.rebuildWithEnhancedMetadata(wrappedCode, metadata);

      // Send to editor
      chrome.runtime.sendMessage({
        action: 'createScriptFromAI',
        script: finalScript,
        url: tab.url
      });

      this.editor.chatManager.addMessage('assistant', '✓ Script created and opened in editor!');
    } catch (error) {
      console.error('❌ Error creating userscript:', error);
      this.editor.chatManager.addMessage('assistant', `Error creating script: ${error.message}`, { error: true });
    }
  }
  
  wrapInIIFE(code) {
    const isWrapped = /^\s*\(\s*function\s*\(/.test(code) || /^\s*\(function\s*\(/.test(code);
    
    if (isWrapped) {
      return code;
    }
    
    const lines = code.split('\n');
    const indentedLines = lines.map(line => '    ' + line);
    
    return `(function() {
    'use strict';
    
${indentedLines.join('\n')}
})();`;
  }

  convertActionsToScript(actions) {
    const lines = [];
    
    for (const action of actions) {
      switch (action.type) {
        case 'style':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => {`);
          lines.push(`        el.style.cssText += '${action.value}';`);
          lines.push(`    });`);
          break;
        case 'text':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => {`);
          lines.push(`        el.textContent = ${JSON.stringify(action.value)};`);
          lines.push(`    });`);
          break;
        case 'remove':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => el.remove());`);
          break;
        case 'insert':
          lines.push(`    document.querySelectorAll('${action.selector}').forEach(el => {`);
          lines.push(`        el.insertAdjacentHTML('beforeend', ${JSON.stringify(action.value)});`);
          lines.push(`    });`);
          break;
      }
    }
    
    return lines.join('\n');
  }
}
