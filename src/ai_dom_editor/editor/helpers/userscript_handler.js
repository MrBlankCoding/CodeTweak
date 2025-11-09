// src/ai_dom_editor/editor/helpers/userscript_handler.js

export class UserscriptHandler {
  constructor(editor) {
    this.editor = editor;
  }

  async createUserscript(code) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      
      const scriptCode = typeof code === 'string' ? code : this.convertActionsToScript(code);
      
      const siteName = url.hostname.replace('www.', '').split('.')[0];
      const capitalizedSite = siteName.charAt(0).toUpperCase() + siteName.slice(1);
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      
      const description = this.editor.eventHandler.lastUserPrompt || `Modifications for ${url.hostname}`;
      
      const userscript = `// ==UserScript==
// @name         ${capitalizedSite} - ${date}
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  ${description}
// @author       AI Assistant
// @match        ${url.origin}/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    
${scriptCode.split('\n').map(line => '    ' + line).join('\n')}
})();`;

      chrome.runtime.sendMessage({
        action: 'createScriptFromAI',
        script: userscript,
        url: tab.url
      });

      this.editor.chatManager.addMessage('assistant', '✓ Script created and opened in editor!');
    } catch (error) {
      this.editor.chatManager.addMessage('assistant', `Error creating script: ${error.message}`, { error: true });
    }
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
