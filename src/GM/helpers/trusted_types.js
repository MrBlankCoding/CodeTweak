let trustedTypesPolicy = null;

export function getTrustedTypesPolicy() {
  if (trustedTypesPolicy) {
    return trustedTypesPolicy;
  }

  if (!window.trustedTypes?.createPolicy) {
    return null;
  }

  try {
    trustedTypesPolicy = window.trustedTypes.createPolicy(
      "codetweak-gm-apis",
      {
        createHTML: (input) => {
          if (typeof input !== "string") return "";
          return input
            .replace(
              /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
              ""
            )
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
            .replace(/javascript:/gi, "");
        },
        createScript: (input) => input,
        createScriptURL: (input) => input,
      }
    );
    return trustedTypesPolicy;
  } catch (error) {
    console.error("[GMBridge] Failed to create Trusted Types policy:", error);
    return null;
  }
}
