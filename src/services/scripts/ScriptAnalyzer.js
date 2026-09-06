import { GM_API_DEFINITIONS } from '../../shared/constants/gmApiDefinitions.js';
import { buildMetadata, parseUserScriptMetadata } from './MetadataParser.js';
import { generateUrlMatchPattern, normalizeRunAt } from '../../shared/utils/urls.js';

export class ScriptAnalyzer {
  static detectGMApiUsage(code) {
    if (!code || typeof code !== 'string') {
      return {};
    }

    const detectedApis = {};

    Object.values(GM_API_DEFINITIONS).forEach((api) => {
      const apiName = api.name;

      const patterns = [
        new RegExp(`\\b${apiName}\\s*\\(`, 'g'),
        new RegExp(`\\bGM\\.${apiName.replace('GM_', '')}\\s*\\(`, 'g'), // Modern GM.* syntax
        new RegExp(`window\\.${apiName}\\s*\\(`, 'g'),
      ];

      // Special case for unsafeWindow (it's not a function)
      if (apiName === 'unsafeWindow') {
        patterns.push(/\bunsafeWindow\b(?!\s*\()/g, /window\.unsafeWindow\b/g);
      }

      // Check if any pattern matches
      const isUsed = patterns.some((pattern) => pattern.test(code));

      if (isUsed) {
        detectedApis[api.el] = true;
      }
    });

    return detectedApis;
  }

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
      /\.addEventListener\s*\(\s*['"](?:DOMContentLoaded|load)['"]/i,
    ];

    const hasDomManipulation = domManipulation.some((pattern) => pattern.test(code));

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

  static validateAndEnhanceMetadata(code, options = {}) {
    const { url = '', hostname = '', userPrompt = '' } = options;

    const existingMetadata = this.extractMetadata(code);
    const detectedApis = this.detectGMApiUsage(code);
    const suggestedRunAt = this.suggestRunAt(code);

    const enhanced = {
      ...existingMetadata,
      detectedApis,
      suggestedRunAt,
    };

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

    if (!enhanced.matches || enhanced.matches.length === 0) {
      if (url) {
        enhanced.matches = [this.generateMatchPattern(url)];
      }
    }

    const mergedApis = { ...existingMetadata.gmApis, ...detectedApis };
    enhanced.gmApis = mergedApis;

    enhanced.warnings = this.detectIssues(code, enhanced);

    return enhanced;
  }

  // Canonical parser lives in utils/metadataParser.js; thin adapter keeps the
  // legacy analyzer shape (underscore run-at, nullable scalar fields).
  static extractMetadata(code) {
    const metadata = {
      name: null,
      version: null,
      description: null,
      author: null,
      namespace: null,
      matches: [],
      gmApis: {},
      runAt: null,
    };

    if (!code || typeof code !== 'string') return metadata;

    const parsed = parseUserScriptMetadata(code);
    return {
      name: parsed.name ?? null,
      version: parsed.version ?? null,
      description: parsed.description ?? null,
      author: parsed.author ?? null,
      namespace: parsed.namespace ?? null,
      matches: parsed.matches || [],
      gmApis: parsed.gmApis || {},
      runAt: normalizeRunAt(parsed.runAt, null),
    };
  }

  static generateScriptName(hostname, userPrompt) {
    if (!hostname && !userPrompt) {
      return 'CodeTweak Script';
    }

    const siteName = hostname ? hostname.replace('www.', '').split('.')[0] : '';

    const capitalizedSite = siteName ? siteName.charAt(0).toUpperCase() + siteName.slice(1) : '';

    if (userPrompt) {
      const actionWords = [
        'hide',
        'remove',
        'change',
        'add',
        'modify',
        'enhance',
        'fix',
        'improve',
      ];
      const lowerPrompt = userPrompt.toLowerCase();

      for (const action of actionWords) {
        if (lowerPrompt.includes(action)) {
          const actionCap = action.charAt(0).toUpperCase() + action.slice(1);
          return capitalizedSite ? `${capitalizedSite} - ${actionCap}` : `${actionCap} Elements`;
        }
      }
    }

    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return capitalizedSite ? `${capitalizedSite} - ${date}` : `Script - ${date}`;
  }

  static generateMatchPattern(url) {
    return generateUrlMatchPattern(url, 'domain') || '*://*/*';
  }

  static detectIssues(code, metadata) {
    const warnings = [];

    const detectedApis = this.detectGMApiUsage(code);
    Object.keys(detectedApis).forEach((apiEl) => {
      if (!metadata.gmApis || !metadata.gmApis[apiEl]) {
        const apiDef = Object.values(GM_API_DEFINITIONS).find((api) => api.el === apiEl);
        if (apiDef) {
          warnings.push({
            type: 'missing_grant',
            message: `Code uses ${apiDef.name} but missing @grant directive`,
            suggestion: `Add @grant ${apiDef.tmName}`,
            apiEl: apiEl,
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
          message: "DOM manipulation at document-start may fail if elements don't exist yet",
          suggestion: 'Consider using @run-at document-end or add DOMContentLoaded listener',
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
          apiEl: 'gmAddStyle',
        });
      }
    }

    // Check for no match patterns
    if (!metadata.matches || metadata.matches.length === 0) {
      warnings.push({
        type: 'missing_match',
        message: 'No @match patterns defined',
        suggestion: 'Script needs @match patterns to run on specific sites',
      });
    }

    return warnings;
  }

  // Canonical builder lives in utils/metadataParser.js; thin adapter keeps the
  // legacy analyzer shape (matches list, suggested run-at fallback).
  static rebuildWithEnhancedMetadata(code, enhanced) {
    const codeWithoutMeta = code.replace(
      /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\n*/,
      ''
    );
    const header = buildMetadata({
      ...enhanced,
      targetUrls: enhanced.matches ?? enhanced.targetUrls,
      runAt: enhanced.runAt || enhanced.suggestedRunAt || 'document_end',
    });
    return `${header}\n\n${codeWithoutMeta}`;
  }

  static extractCodeFromIIFE(code) {
    if (!code) return '';
    const match = code.match(
      /\(\s*function\s*\(\)\s*\{(?:\s*'use strict';)?\s*([\s\S]*?)\s*\}\)\(\);/
    );
    return match && match[1] ? match[1].trim() : code;
  }

  static incrementVersion(version) {
    if (!version || typeof version !== 'string') return '1.0.1';

    const parts = version.split('.').map((part) => parseInt(part, 10));

    if (parts.some(isNaN)) {
      return version; // Return original if parsing fails
    }

    parts[parts.length - 1]++;

    return parts.join('.');
  }
}

export default ScriptAnalyzer;
