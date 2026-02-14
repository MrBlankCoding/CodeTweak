# Strict Sites

Some sites use strict CSP or dynamic page bootstrapping.

## What to change first

1. Keep `@match` exact.
2. Start with `@run-at document-end`.
3. Move to `document-idle` if elements load late.
4. Remove unnecessary `@require` dependencies.

## Diagnostic pattern

```javascript
const el = document.querySelector("#target");
console.log("target found:", Boolean(el), location.href);
```

## If behavior is inconsistent

- Turn on `Enhanced debugging`.
- Check editor script error logs.
- Disable other scripts that touch the same page.
