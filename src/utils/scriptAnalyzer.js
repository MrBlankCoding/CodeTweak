/**
 * Script Analyzer - Intelligent code analysis for userscripts
 * 
 * Analyzes JavaScript code to:
 * - Detect GM API usage
 * - Validate and enhance metadata
 * - Suggest missing @grant directives
 * - Fix common issues in AI-generated scripts
 */

import { GM_API_DEFINITIONS } from '../GM/gmApiDefinitions.js';

export class ScriptAnalyzer {
  /**
   * Analyzes JavaScript code to detect which GM APIs are actually used
   * @param {string} code - The JavaScript code to analyze
   * @returns {Object} - Object with detected API element IDs as keys, boolean true as values
   */
  static detectGMApiUsage(code) {
    if (!code || typeof code !== 'string') {
      return {};
    }

    const detectedApis = {};

    // Check each GM API definition
    Object.values(GM_API_DEFINITIONS).forEach(api => {
      const apiName = api.name;
      
      // Create regex patterns to detect API usage
      // Matches: GM_setValue(, GM.setValue(, window.GM_setValue(, etc.
      const patterns = [
        new RegExp(`\\b${apiName}\\s*\\(`, 'g'),
        new RegExp(`\\bGM\\.${apiName.replace('GM_', '')}\\s*\\(`, 'g'), // Modern GM.* syntax
        new RegExp(`window\\.${apiName}\\s*\\(`, 'g')
      ];

      // Special case for unsafeWindow (it's not a function)
      if (apiName === 'unsafeWindow') {
        patterns.push(
          /\bunsafeWindow\b(?!\s*\()/g, // Match unsafeWindow but not as a function call
          /window\.unsafeWindow\b/g
        );
      }

      // Check if any pattern matches
      const isUsed = patterns.some(pattern => pattern.test(code));
      
      if (isUsed) {
        detectedApis[api.el] = true;
      }
    });

    return detectedApis;
  }

  /**
   * Analyzes code to suggest appropriate run-at timing
   * @param {string} code - The JavaScript code to analyze
   * @returns {string} - Suggested run-at value (document_start, document_end, document_idle)
   */
  static suggestRunAt(code) {
    if (!code) return 'document_end';

    // If code manipulates DOM heavily, suggest document-end or later
    const domManipulation = [
      /document\.querySelector/i,
      /document\.getElementById/i,
      /document\.getElementsBy/i,
      /\.innerHTML/i,
      /\.textContent/i,
      /\.appendChild/i,
      /\.insertBefore/i,
      /\.addEventListener\s*\(\s*['"](?:DOMContentLoaded|load)['"]/i
    ];

    const hasDomManipulation = domManipulation.some(pattern => pattern.test(code));

    // If waiting for DOMContentLoaded or load events, they're being cautious
    if (/DOMContentLoaded|load.*addEventListener/i.test(code)) {
      return 'document_start'; // They're handling timing themselves
    }

    // If heavy DOM manipulation without event listeners, suggest document-end
    if (hasDomManipulation) {
      return 'document_end';
    }

    // Check for document.body or document.head manipulation
    if (/document\.(body|head)/i.test(code)) {
      return 'document_end';
    }

    // Default to document_end as it's safest
    return 'document_end';
  }

  /**
   * Validates and enhances userscript metadata
   * @param {string} code - The complete userscript code
   * @param {Object} options - Additional options for enhancement
   * @returns {Object} - Enhanced metadata object
   */
  static validateAndEnhanceMetadata(code, options = {}) {
    const {
      url = '',
      hostname = '',
      userPrompt = ''
    } = options;

    // Extract existing metadata
    const existingMetadata = this.extractMetadata(code);
    
    // Detect actual GM API usage
    const detectedApis = this.detectGMApiUsage(code);
    const suggestedRunAt = this.suggestRunAt(code);

    // Build enhanced metadata
    const enhanced = {
      ...existingMetadata,
      detectedApis,
      suggestedRunAt
    };

    // Validate and fix common issues
    if (!enhanced.name || enhanced.name === 'Untitled Script') {
      enhanced.name = this.generateScriptName(hostname, userPrompt);
    }

    if (!enhanced.version || !/^\d+\.\d+/.test(enhanced.version)) {
      enhanced.version = '1.0.0';
    }

    if (!enhanced.namespace) {
      enhanced.namespace = 'https://codetweak.local';
    }

    if (!enhanced.author || enhanced.author === 'Anonymous') {
      enhanced.author = 'CodeTweak AI';
    }

    // Validate match patterns
    if (!enhanced.matches || enhanced.matches.length === 0) {
      if (url) {
        enhanced.matches = [this.generateMatchPattern(url)];
      }
    }

    // Merge detected APIs with existing grants
    const mergedApis = { ...existingMetadata.gmApis, ...detectedApis };
    enhanced.gmApis = mergedApis;

    // Add issues/warnings
    enhanced.warnings = this.detectIssues(code, enhanced);

    return enhanced;
  }

  /**
   * Extracts metadata from userscript code
   * @param {string} code - The userscript code
   * @returns {Object} - Extracted metadata
   */
  static extractMetadata(code) {
    const metadata = {
      name: null,
      version: null,
      description: null,
      author: null,
      namespace: null,
      matches: [],
      gmApis: {},
      runAt: null
    };

    const metaMatch = code.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
    if (!metaMatch) return metadata;

    const metaBlock = metaMatch[0];
    const lines = metaBlock.split('\n');

    lines.forEach(line => {
      const match = line.match(/\/\/\s*@(\w+(?:-\w+)?)\s+(.+)/);
      if (!match) return;

      const [, key, value] = match;

      switch (key.toLowerCase()) {
        case 'name':
          metadata.name = value.trim();
          break;
        case 'version':
          metadata.version = value.trim();
          break;
        case 'description':
          metadata.description = value.trim();
          break;
        case 'author':
          metadata.author = value.trim();
          break;
        case 'namespace':
          metadata.namespace = value.trim();
          break;
        case 'match':
        case 'include':
          metadata.matches.push(value.trim());
          break;
        case 'run-at':
          metadata.runAt = value.trim().replace(/-/g, '_');
          break;
        case 'grant': {
          // Find which API this grant corresponds to
          const grantValue = value.trim();
          if (grantValue !== 'none') {
            Object.values(GM_API_DEFINITIONS).forEach(api => {
              if (api.tmName === grantValue) {
                metadata.gmApis[api.el] = true;
              }
              // Check modern GM.* syntax
              const modernName = api.tmName.replace('GM_', 'GM.');
              if (modernName === grantValue) {
                metadata.gmApis[api.el] = true;
              }
            });
          }
          break;
        }
      }
    });

    return metadata;
  }

  /**
   * Generates a smart script name based on context
   * @param {string} hostname - The website hostname
   * @param {string} userPrompt - The user's original request
   * @returns {string} - Generated script name
   */
  static generateScriptName(hostname, userPrompt) {
    if (!hostname && !userPrompt) {
      return 'CodeTweak Script';
    }

    const siteName = hostname 
      ? hostname.replace('www.', '').split('.')[0]
      : '';
    
    const capitalizedSite = siteName 
      ? siteName.charAt(0).toUpperCase() + siteName.slice(1)
      : '';

    // Try to extract action from prompt
    if (userPrompt) {
      const actionWords = ['hide', 'remove', 'change', 'add', 'modify', 'enhance', 'fix', 'improve'];
      const lowerPrompt = userPrompt.toLowerCase();
      
      for (const action of actionWords) {
        if (lowerPrompt.includes(action)) {
          const actionCap = action.charAt(0).toUpperCase() + action.slice(1);
          return capitalizedSite 
            ? `${capitalizedSite} - ${actionCap}` 
            : `${actionCap} Elements`;
        }
      }
    }

    const date = new Date().toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

    return capitalizedSite 
      ? `${capitalizedSite} - ${date}` 
      : `Script - ${date}`;
  }

  /**
   * Generates a match pattern from a URL
   * @param {string} url - The URL to generate pattern from
   * @returns {string} - Match pattern
   */
  static generateMatchPattern(url) {
    try {
      const urlObj = new URL(url);
      // Generate pattern that matches the entire site
      return `${urlObj.origin}/*`;
    } catch {
      return '*://*/*'; // Fallback to match all
    }
  }

  /**
   * Detects common issues in generated code
   * @param {string} code - The code to analyze
   * @param {Object} metadata - The metadata object
   * @returns {Array} - Array of warning objects
   */
  static detectIssues(code, metadata) {
    const warnings = [];

    // Check for GM API usage without grants
    const detectedApis = this.detectGMApiUsage(code);
    Object.keys(detectedApis).forEach(apiEl => {
      if (!metadata.gmApis || !metadata.gmApis[apiEl]) {
        const apiDef = Object.values(GM_API_DEFINITIONS).find(api => api.el === apiEl);
        if (apiDef) {
          warnings.push({
            type: 'missing_grant',
            message: `Code uses ${apiDef.name} but missing @grant directive`,
            suggestion: `Add @grant ${apiDef.tmName}`,
            apiEl: apiEl
          });
        }
      }
    });

    // Check for DOM manipulation without appropriate run-at
    if (metadata.runAt === 'document_start') {
      const hasDomManip = /document\.(querySelector|getElementById|body|head)/i.test(code);
      const hasEventListener = /addEventListener\s*\(\s*['"](?:DOMContentLoaded|load)/i.test(code);
      
      if (hasDomManip && !hasEventListener) {
        warnings.push({
          type: 'timing_issue',
          message: 'DOM manipulation at document-start may fail if elements don\'t exist yet',
          suggestion: 'Consider using @run-at document-end or add DOMContentLoaded listener'
        });
      }
    }

    // Check for style injection without GM_addStyle
    const hasStyleInjection = /\.style\.|\.cssText|GM_addStyle/i.test(code);
    if (hasStyleInjection && !detectedApis.gmAddStyle) {
      const hasGmAddStyle = /GM_addStyle/i.test(code);
      if (hasGmAddStyle) {
        warnings.push({
          type: 'missing_grant',
          message: 'Code uses GM_addStyle but missing @grant directive',
          suggestion: 'Add @grant GM_addStyle',
          apiEl: 'gmAddStyle'
        });
      }
    }

    // Check for no match patterns
    if (!metadata.matches || metadata.matches.length === 0) {
      warnings.push({
        type: 'missing_match',
        message: 'No @match patterns defined',
        suggestion: 'Script needs @match patterns to run on specific sites'
      });
    }

    return warnings;
  }

  /**
   * Rebuilds userscript with enhanced metadata
   * @param {string} code - Original code
   * @param {Object} enhanced - Enhanced metadata
   * @returns {string} - Rebuilt userscript with proper metadata
   */
  static rebuildWithEnhancedMetadata(code, enhanced) {
    // Extract code without metadata
    const codeWithoutMeta = code.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\n*/, '');

    // Build new metadata block
    const lines = ['// ==UserScript=='];
    
    const addLine = (key, value) => {
      if (value !== null && value !== undefined && value !== '') {
        lines.push(`// @${key.padEnd(12)} ${value}`);
      }
    };

    addLine('name', enhanced.name || 'Untitled Script');
    addLine('namespace', enhanced.namespace || 'https://codetweak.local');
    addLine('version', enhanced.version || '1.0.0');
    addLine('description', enhanced.description || 'Generated by CodeTweak AI');
    addLine('author', enhanced.author || 'CodeTweak AI');

    // Add match patterns
    if (enhanced.matches && enhanced.matches.length > 0) {
      enhanced.matches.forEach(match => addLine('match', match));
    }

    // Add run-at
    const runAt = enhanced.runAt || enhanced.suggestedRunAt || 'document_end';
    addLine('run-at', runAt.replace(/_/g, '-'));

    // Add grants based on detected APIs
    const grants = [];
    if (enhanced.gmApis && Object.keys(enhanced.gmApis).length > 0) {
      Object.entries(enhanced.gmApis).forEach(([apiEl, enabled]) => {
        if (enabled) {
          const apiDef = Object.values(GM_API_DEFINITIONS).find(api => api.el === apiEl);
          if (apiDef) {
            grants.push(apiDef.tmName);
          }
        }
      });
    }

    if (grants.length > 0) {
      grants.forEach(grant => addLine('grant', grant));
    } else {
      addLine('grant', 'none');
    }

    lines.push('// ==/UserScript==');
    lines.push(''); // Empty line after metadata

    return lines.join('\n') + '\n' + codeWithoutMeta;
  }
}

export default ScriptAnalyzer;
