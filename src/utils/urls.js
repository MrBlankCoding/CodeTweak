export function urlMatchesPattern(url, pattern) {
  try {
    if (!url || !pattern) return false;
    if (pattern === url) return true;

    // universal wildcard
    if (pattern === "*://*/*") return true;

    // Default if nothing provided
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
    } else if (patternHost.startsWith("*.")) {
      const domain = patternHost.slice(2);
      if (!(urlHost === domain || urlHost.endsWith("." + domain))) return false;
    } else if (patternHost.includes("*")) {
      const hostRegex = new RegExp(
        "^" + patternHost.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
      );
      if (!hostRegex.test(urlHost)) return false;
    } else {
      if (urlHost !== patternHost) return false;
    }

    if (["/", "/*"].includes(patternPath)) return true;
    if (patternPath.endsWith("/**")) {
      const base = patternPath.slice(0, -3);
      return urlPath === base || urlPath.startsWith(base);
    }

    const segments = patternPath.split("/").filter(Boolean);
    const regexParts = ["^"];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === "**") {
        regexParts.push("(?:\/.*)?");
      } else {
        const segmentRegex = segment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");
        regexParts.push("\/" + segmentRegex);
      }
    }

    regexParts.push("/?$");
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

/**
 * Returns a description of the script's features (styles/scripts)
 * @param {Object} script - The script object
 * @returns {string} Description of script features or empty string if none
 */
export function getScriptDescription(script) {
    const features = [];
    
    if (script.css?.trim()) features.push("styles");
    if (script.js?.trim()) features.push("scripts");
    
    // Return empty string if no features are present
    if (features.length === 0) return '';
    
    // Return just the feature list without URL information
    return features.join(" + ");
  }

export function formatUrlPattern(pattern) {
    if (!pattern) return "All sites";
    
    // Remove protocol
    let display = pattern.replace(/^https?:\/\//, "");
    
    // Clean up wildcards for better display
    display = display.replace(/^\*\./, ""); // Remove leading wildcard subdomain
    display = display.replace(/\/\*$/, ""); // Remove trailing wildcard path
    
    // Truncate long URLs
    if (display.length > 30) {
      display = display.substring(0, 27) + "...";
    }
    
    return display;
  }
