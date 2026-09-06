# Troubleshooting

## Script does not run

Check in this order:

1. Red "User scripts are disabled" banner in the popup or dashboard. If shown,
   enable `Allow user scripts` for CodeTweak in `chrome://extensions`.
2. `@match` pattern.
3. Script is enabled.
4. `@run-at` timing.
5. Console errors.

Quick test:

```javascript
console.log('script loaded', location.href);
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
