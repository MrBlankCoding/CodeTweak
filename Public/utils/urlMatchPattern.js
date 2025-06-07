/**
 * URL support for wildcards
 * People usally mess this stuff up so we need to be flexible
 * Supports:
 *   - Wildcards in host (e.g., *.example.com, *oogle.com)
 *   - Wildcards in path (e.g., /foo/*, /foo/**)
 *   - Wildcard schemes (*://)
 */
export function urlMatchesPattern(url, pattern) {
  try {
    // Edge cases
    if (!url || !pattern) return false;
    if (pattern === url) return true;

    // Ensure it has a host
    if (!pattern.includes("://")) {
      pattern = "*://" + pattern;
    }

    // Get the host and the path
    const [patternScheme, patternRest] = pattern.split("://");
    const [patternHost, ...pathParts] = patternRest.split("/");
    const patternPath = "/" + pathParts.join("/");

    const urlObj = new URL(url);

    // === SCHEME MATCHING ===
    const urlScheme = urlObj.protocol.slice(0, -1); // remove the ":"
    if (patternScheme !== "*" && patternScheme !== urlScheme) {
      return false;
    }

    // === HOST MATCHING ===
    const urlHost = urlObj.hostname;
    if (patternHost === "*") {
      // Match for any host
    } else if (patternHost.startsWith("*.")) {
      // Subdomain matching
      const domain = patternHost.slice(2);
      if (!(urlHost === domain || urlHost.endsWith("." + domain))) {
        return false;
      }
    } else if (patternHost.includes("*")) {
      // General Matching
      const hostRegex = new RegExp(
        "^" + patternHost.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
      );
      if (!hostRegex.test(urlHost)) {
        return false;
      }
    } else {
      // Direct match
      if (urlHost !== patternHost) {
        return false;
      }
    }

    // === PATH MATCHING ===
    const urlPath = urlObj.pathname;

    // Match root and all paths
    if (["/", "/*"].includes(patternPath)) {
      return true;
    }

    // Special case: /** means match this path and everything under it
    if (patternPath.endsWith("/**")) {
      const basePath = patternPath.slice(0, -3);
      return urlPath === basePath || urlPath.startsWith(basePath);
    }

    // Build the final regex for the path
    const segments = patternPath.split("/").filter(Boolean); // remove any empty segments
    const regexParts = ["^"];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (segment === "**") {
        // Match everything until next segment
        if (i === segments.length - 1) {
          regexParts.push("(?:\\/.*)?");
        } else {
          // Non-last segment, match until next segment
          const next = segments[i + 1]
            .replace(/\*/g, "[^/]*")
            .replace(/\./g, "\\.");
          regexParts.push(`(?:\\/.*?\\/${next})`);
          i++; // Skip next
        }
      } else {
        // Match segment with possible wildcar
        const segmentRegex = segment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");
        regexParts.push(`\\/${segmentRegex}`);
      }
    }

    regexParts.push("$");
    const pathRegex = new RegExp(regexParts.join(""));
    return pathRegex.test(urlPath);
  } catch (error) {
    console.warn("URL matching error:", error);
    return false;
  }
}
