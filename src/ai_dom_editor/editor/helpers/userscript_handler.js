import ScriptAnalyzer from "../../../utils/scriptAnalyzer.js";

export class UserscriptHandler {
  constructor(editor) {
    this.editor = editor;
  }

  async getScriptContent(scriptName) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "getScriptContent", scriptName },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response.error) {
            return reject(new Error(response.error));
          }
          resolve(response.code);
        }
      );
    });
  }

  async getAllScripts() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getAllScripts" }, (response) => {
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

  async createUserscript(code, name = null, explanation = null) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const url = new URL(tab.url);

      let scriptCode = typeof code === "string" ? code : JSON.stringify(code);
      scriptCode = scriptCode
        .replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\n*/g, "")
        .trim();
      const userPrompt = this.editor.eventHandler?.lastUserPrompt || "";

      let extractedExplanation = null;
      const commentMatch = scriptCode.match(/^\s*\/\/\s*(.*)\r?\n/);
      if (commentMatch && commentMatch[1]) {
        extractedExplanation = commentMatch[1].trim();
        scriptCode = scriptCode.substring(commentMatch[0].length).trim();
      }

      const description =
        extractedExplanation ||
        explanation ||
        userPrompt ||
        `Modifications for ${url.hostname}`;

      const detectedApis = ScriptAnalyzer.detectGMApiUsage(scriptCode);
      const suggestedRunAt = ScriptAnalyzer.suggestRunAt(scriptCode);

      const scriptName =
        name ||
        ScriptAnalyzer.generateScriptName(url.hostname, userPrompt) ||
        "AI Generated Script";

      // Build metadata
      const metadata = {
        name: scriptName,
        namespace: "https://codetweak.local",
        version: "1.0.0",
        description: description,
        author: "CodeTweak AI",
        matches: [`${url.origin}/*`],
        gmApis: detectedApis,
        runAt: suggestedRunAt,
      };

      // Wrap code and add metadata
      const wrappedCode = this.wrapInIIFE(scriptCode);
      const finalScript = ScriptAnalyzer.rebuildWithEnhancedMetadata(
        wrappedCode,
        metadata
      );

      // Send to background script
      chrome.runtime.sendMessage(
        {
          action: "createScriptFromAI",
          script: finalScript,
          url: tab.url,
        },
        (response) => {
          if (response.error) {
            console.error("Error creating script:", response.error);
            this.editor.chatManager.addMessage(
              "assistant",
              `Error creating script: ${response.error}`,
              { type: "text", error: true }
            );
            return;
          }

          this.editor.chatManager.addMessage(
            "assistant",
            `✓ Script "${scriptName}" created successfully!`,
            { type: "text" }
          );

          // Set as current script for future updates
          this.editor.setCurrentScript(response.script);
        }
      );
    } catch (error) {
      console.error("Error creating userscript:", error);
      this.editor.chatManager.addMessage(
        "assistant",
        `Error creating script: ${error.message}`,
        { type: "text", error: true }
      );
    }
  }

  async updateUserscript(
    scriptName,
    newCode,
    newName = null,
    explanation = null
  ) {
    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      const scriptToUpdate = scripts.find((s) => s.name === scriptName);

      if (!scriptToUpdate) {
        throw new Error(`Script "${scriptName}" not found for update.`);
      }

      const metadata = ScriptAnalyzer.extractMetadata(scriptToUpdate.code);
      metadata.version = ScriptAnalyzer.incrementVersion(metadata.version);
      if (newName && newName !== scriptName && newName !== "Generated Script") {
        metadata.name = newName;
      }

      let cleanCode = newCode
        .replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\n*/g, "")
        .trim();

      let extractedExplanation = null;
      const commentMatch = cleanCode.match(/^\s*\/\/\s*(.*)\r?\n/);
      if (commentMatch && commentMatch[1]) {
        extractedExplanation = commentMatch[1].trim();
        cleanCode = cleanCode.substring(commentMatch[0].length).trim();
      }

      if (extractedExplanation || explanation) {
        metadata.description = extractedExplanation || explanation;
      }

      const detectedApis = ScriptAnalyzer.detectGMApiUsage(cleanCode);
      const suggestedRunAt = ScriptAnalyzer.suggestRunAt(cleanCode);

      metadata.gmApis = {
        ...metadata.gmApis,
        ...detectedApis,
      };

      metadata.runAt = suggestedRunAt;
      const wrappedCode = this.wrapInIIFE(cleanCode);
      const finalScript = ScriptAnalyzer.rebuildWithEnhancedMetadata(
        wrappedCode,
        metadata
      );

      chrome.runtime.sendMessage(
        {
          action: "updateScript",
          scriptId: scriptToUpdate.id,
          code: finalScript,
        },
        (response) => {
          if (chrome.runtime.lastError || response?.error) {
            const errorMsg =
              chrome.runtime.lastError?.message || response.error;
            console.error("Error updating script in background:", errorMsg);
            this.editor.chatManager.addMessage(
              "assistant",
              `Error updating script: ${errorMsg}`,
              { type: "text", error: true }
            );
          } else {
            const displayName = metadata.name || scriptName;
            this.editor.chatManager.addMessage(
              "assistant",
              `✓ Script "${displayName}" updated successfully!`,
              { type: "text" }
            );

            if (newName && newName !== scriptName) {
              this.editor.setCurrentScript({
                ...scriptToUpdate,
                name: newName,
                code: finalScript,
              });
            }
          }
        }
      );
    } catch (error) {
      console.error("Error updating userscript:", error);
      this.editor.chatManager.addMessage(
        "assistant",
        `Error updating script: ${error.message}`,
        { type: "text", error: true }
      );
    }
  }

  wrapInIIFE(code) {
    const isWrapped =
      /^\s*\(\s*function\s*\(/.test(code) || 
      /^\s*\(function\s*\(/.test(code) ||
      /^\s*\(\s*\(\s*\)\s*=>\s*{/.test(code); // Arrow function IIFE

    if (isWrapped) {
      return code;
    }

    const lines = code.split("\n");
    const indentedLines = lines.map((line) => "    " + line);

    return `(function() {
    'use strict';
    
${indentedLines.join("\n")}
})();`;
  }
}