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

    // === SCHEME MATCHING (Support for wildcards like http*, https?) ===
    const schemeRegex = new RegExp(
      "^" + patternScheme.replace(/\*/g, ".*") + "$"
    );
    if (!schemeRegex.test(urlScheme)) return false;

    // === HOST MATCHING ===
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

    // === PATH MATCHING ===
    if (["/", "/*"].includes(patternPath)) return true;
    if (patternPath.endsWith("/**")) {
      const base = patternPath.slice(0, -3);
      return urlPath === base || urlPath.startsWith(base);
    }

    // Convert wildcard path to regex
    const segments = patternPath.split("/").filter(Boolean);
    const regexParts = ["^"];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === "**") {
        regexParts.push("(?:\\/.*)?");
      } else {
        const segmentRegex = segment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");
        regexParts.push("\\/" + segmentRegex);
      }
    }

    regexParts.push("/?$"); // Optional trailing slash
    const pathRegex = new RegExp(regexParts.join(""));
    return pathRegex.test(urlPath);
  } catch (e) {
    console.warn("URL matching error:", e);
    return false;
  }
}

/**
 * Generate a URL match pattern based on a base URL and desired scope.
 * @param {string} baseUrl - The base URL provided by the user (e.g. https://example.com).
 * @param {"exact"|"domain"|"subdomain"} scope - The scope of the pattern:
 *   exact      – only the exact page.
 *   domain     – any path on the same host.
 *   subdomain  – any sub-domain and any path.
 * @returns {string|null} A match pattern string suitable for storage or null if invalid.
 */
export function generateUrlMatchPattern(baseUrl, scope = "domain") {
  try {
    if (!baseUrl) return null;
    // Ensure we have a scheme
    if (!/^https?:\/\//i.test(baseUrl)) {
      baseUrl = "https://" + baseUrl.replace(/^\/*/, "");
    }
    const { protocol, hostname } = new URL(baseUrl);

    // Normalise protocol (strip trailing :) and add wildcard support
    const scheme = protocol.replace(":", "");

    let hostPart = hostname;
    switch (scope) {
      case "exact":
        return `${scheme}://${hostPart}`; // Caller should append path manually if needed
      case "domain":
        return `${scheme}://${hostPart}/*`;
      case "subdomain": {
        // Derive eTLD+1 naive approach (last two labels) for simplicity
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
