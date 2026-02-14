# Match Patterns

`@match` controls where a script runs.

## Common patterns

- One site: `*://example.com/*`
- Subdomains: `*://*.example.com/*`
- Any HTTP(S): `*://*/*`

## Example metadata

```javascript
// ==UserScript==
// @match https://github.com/*
// @match https://gist.github.com/*
// ==/UserScript==
```

## Good vs bad scope

Good:

```text
*://github.com/*
```

Risky:

```text
*://*/*
```

## Rule

Use the narrowest pattern that still works.
