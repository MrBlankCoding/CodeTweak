export function urlMatchesPattern(url, pattern) {
  try {
    // Handle edge cases
    if (pattern === url) return true;
    if (!url || !pattern) return false;

    // Normalize pattern if missing scheme
    if (!pattern.includes("://")) {
      pattern = "*://" + pattern;
    }

    // Extract scheme, host, and path from pattern
    const protocolSeparatorIndex = pattern.indexOf("://");
    const patternScheme = pattern.substring(0, protocolSeparatorIndex);
    const remainingPattern = pattern.substring(protocolSeparatorIndex + 3);

    // Split remaining pattern into host and path parts
    const firstSlashIndex = remainingPattern.indexOf("/");
    let patternHost, patternPath;

    if (firstSlashIndex === -1) {
      patternHost = remainingPattern;
      patternPath = "/";
    } else {
      patternHost = remainingPattern.substring(0, firstSlashIndex);
      patternPath = remainingPattern.substring(firstSlashIndex);
    }

    // Create URL object for the input URL
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    // Handle scheme matching
    if (
      patternScheme !== "*" &&
      patternScheme !== urlObj.protocol.slice(0, -1)
    ) {
      return false;
    }

    // Handle host matching with wildcards
    if (patternHost.startsWith("*.")) {
      // *.domain.com pattern - match domain or any subdomain
      const domain = patternHost.slice(2);
      if (
        !(urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain))
      ) {
        return false;
      }
    } else if (patternHost.includes("*")) {
      // Handle other wildcards in hostname
      const hostRegex = new RegExp(
        "^" + patternHost.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
      );
      if (!hostRegex.test(urlObj.hostname)) {
        return false;
      }
    } else if (patternHost !== "*" && patternHost !== urlObj.hostname) {
      // Direct hostname match
      return false;
    }

    // If pattern path is empty or just "/" or "/*", match any path
    if (patternPath === "/" || patternPath === "/*") {
      return true;
    }

    // Handle special case for /** at the end
    if (patternPath.endsWith("/**")) {
      const basePath = patternPath.slice(0, -3);
      return urlPath === basePath || urlPath.startsWith(basePath);
    }

    // Handle path matching with both * and ** wildcards
    const pathSegments = patternPath
      .split("/")
      .filter((segment) => segment !== "");
    const urlSegments = urlPath.split("/").filter((segment) => segment !== "");

    // Simple case: if pattern is just /* match any single-level path
    if (pathSegments.length === 1 && pathSegments[0] === "*") {
      return true;
    }

    let pathRegexParts = ["^"];
    let i = 0;

    for (i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i];

      // Handle ** wildcard (matches across multiple path segments)
      if (segment === "**") {
        // If this is the last segment, match anything that follows
        if (i === pathSegments.length - 1) {
          pathRegexParts.push(".*");
          break;
        }

        // Otherwise, match anything until we find the next segment
        const nextSegment = pathSegments[i + 1];
        const nextSegmentRegex = nextSegment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");

        pathRegexParts.push(`(?:.*?\\/)?${nextSegmentRegex}`);
        i++; // Skip the next segment as we've already included it
      } else {
        // Handle regular segment with potential * wildcards
        const segmentRegex = segment
          .replace(/\*/g, "[^/]*")
          .replace(/\./g, "\\.");
        if (i === 0) {
          pathRegexParts.push(`\\/?${segmentRegex}`); // Make the first slash optional
        } else {
          pathRegexParts.push(`\\/${segmentRegex}`);
        }
      }
    }

    pathRegexParts.push("$");
    const pathRegex = new RegExp(pathRegexParts.join(""));

    return pathRegex.test(urlPath);
  } catch (error) {
    console.warn("URL matching error:", error);
    return false;
  }
}
