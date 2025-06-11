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
