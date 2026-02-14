# Troubleshooting

## Script does not run

Check in this order:

1. `@match` pattern.
2. Script is enabled.
3. `@run-at` timing.
4. Console errors.

Quick test:

```javascript
console.log("script loaded", location.href);
```

## GM API is undefined

Cause: missing `@grant`.

Fix:

```javascript
// ==UserScript==
// @grant GM_getValue
// @grant GM_setValue
// ==/UserScript==
```

## Cross-origin request fails

Cause: external requests disabled in extension settings.

Fix:

- Enable the external resources/request setting in dashboard.
- Retry request.

## Firefox CSP/eval warnings

Firefox MV3 is stricter than Chromium.
CodeTweak Firefox build avoids runtime `eval/new Function` in extension code paths.
If you still see warnings, rebuild and reload the latest package.
