export function urlMatchesPattern(url, pattern) {
  try {
    if (!url || !pattern) return false;
    if (pattern === url) return true;
    if (pattern === "*://*/*") return true;
    if (!pattern.includes("://")) {
      pattern = "*://" + pattern;
    }

    const [patternScheme, patternRest] = pattern.split("://");
    const [patternHost, ...pathParts] = patternRest.split("/");
    const patternPath = "/" + pathParts.join("/");

    const urlObj = new URL(url);
    const urlScheme = urlObj.protocol.slice(0, -1); // "http:" -> "http"
    const urlHost = urlObj.hostname;
    const urlPath = urlObj.pathname;

    const schemeRegex = new RegExp(
      "^" + patternScheme.replace(/\*/g, ".*") + "$"
    );
    if (!schemeRegex.test(urlScheme)) return false;

    if (patternHost === "*") {
      // Any host
    } else if (patternHost.startsWith("*.") || patternHost.startsWith(".")) {
      const domain = patternHost.startsWith("*.") ? patternHost.slice(2) : patternHost.slice(1);
      if (!(urlHost === domain || urlHost.endsWith("." + domain))) return false;
    } else if (patternHost.includes("*")) {
      const hostRegex = new RegExp(
        "^" + patternHost.replace(/\./g, "\\.").replace(/\*/g, "[^.]+") + "$"
      );
      if (!hostRegex.test(urlHost)) return false;
    } else {
      if (urlHost !== patternHost && !urlHost.endsWith("." + patternHost)) return false;
    }

    if (["/", "/*"].includes(patternPath)) return true;
    if (patternPath.endsWith("/**")) {
      const base = patternPath.slice(0, -3);
      return urlPath === base || urlPath.startsWith(base);
    }

    const segments = patternPath.split("/").filter(Boolean);
    if (segments.length === 0) return true;
    
    const regexParts = ["^"];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === "**") {
        regexParts.push("(?:\\/.*)?" );
      } else if (segment === "*") {
        regexParts.push("(?:\\/[^/]+)+");
      } else {
        const segmentRegex = segment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");
        regexParts.push("\\/" + segmentRegex);
      }
    }

    const lastSegment = segments[segments.length - 1];
    if (lastSegment === "*" || lastSegment.includes("*")) {
      regexParts.push("(?:\\/.*)?$");
    } else {
      regexParts.push("/?$");
    }
    
    const pathRegex = new RegExp(regexParts.join(""));
    return pathRegex.test(urlPath);
  } catch (e) {
    console.warn("URL matching error:", e);
    return false;
  }
}

export function generateUrlMatchPattern(baseUrl, scope = "domain") {
  try {
    if (!baseUrl) return null;
    // Ensure we have a scheme
    if (!/^https?:\/\//i.test(baseUrl)) {
      baseUrl = "https://" + baseUrl.replace(/^\/*/, "");
    }
    const { protocol, hostname } = new URL(baseUrl);

    const scheme = protocol.replace(":", "");

    let hostPart = hostname;
    switch (scope) {
      case "exact":
        return `${scheme}://${hostPart}`;
      case "domain":
        return `${scheme}://${hostPart}/*`;
      case "subdomain": {
        const parts = hostPart.split(".");
        if (parts.length > 2) {
          hostPart = parts.slice(-2).join(".");
        }
        return `${scheme}://*.${hostPart}/*`;
      }
      default:
        return `${scheme}://${hostPart}/*`;
    }
  } catch (e) {
    console.warn("Failed to generate match pattern:", e);
    return null;
  }
}

export function formatRunAt(runAt) {
    const map = {
      document_start: "Start",
      document_end: "DOM",
      document_idle: "Load",
    };
    return map[runAt] || runAt || "Load";
  }

export function getScriptDescription(script) {
    const features = [];
    if (script.css?.trim()) {
      features.push("CSS");
    }
    
    if (script.js?.trim()) {
      features.push("JS");
    }
    
    let gmApiCount = 0;
    const gmApiKeys = [
      'gmSetValue', 'gmGetValue', 'gmDeleteValue', 'gmListValues',
      'gmAddValueChangeListener', 'gmRemoveValueChangeListener',
      'gmOpenInTab', 'gmNotification', 'gmAddStyle', 'gmAddElement',
      'gmRegisterMenuCommand', 'gmUnregisterMenuCommand',
      'gmGetResourceText', 'gmGetResourceURL', 'gmXmlhttpRequest',
      'gmSetClipboard', 'unsafeWindow'
    ];
    
    gmApiKeys.forEach(key => {
      if (script[key]) gmApiCount++;
    });
    
    if (gmApiCount > 0) {
      features.push(`${gmApiCount} GM API${gmApiCount > 1 ? 's' : ''}`);
    }

    if (script.resources && script.resources.length > 0) {
      features.push(`${script.resources.length} Resource${script.resources.length > 1 ? 's' : ''}`);
    }
    
    if (script.requiredScripts && script.requiredScripts.length > 0) {
      features.push(`${script.requiredScripts.length} Lib${script.requiredScripts.length > 1 ? 's' : ''}`);
    }
    
    if (features.length === 0) return 'Basic';
    return features.join(" • ");
  }

export function formatUrlPattern(pattern) {
    if (!pattern) return "All sites";
    let display = pattern.replace(/^https?:\/\//, "");
    display = display.replace(/^\*\./, "");
    display = display.replace(/\/\*$/, "");
    if (display.length > 30) {
      display = display.substring(0, 27) + "...";
    }
    
    return display;
  }

export function isValidWebpage(url) {
    if (!url) return false;
    
    const restrictedPatterns = /^(chrome|edge|about|file):\/\//i;
    const isExtensionPage = url.startsWith("chrome-extension://");
    const isNewTab = url === "about:blank" || url === "chrome://newtab/";
    
    return !restrictedPatterns.test(url) && !isExtensionPage && !isNewTab;
  }
