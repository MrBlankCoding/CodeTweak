# Use the Editor

The editor is where you write and save scripts.

## Create a script

1. Open dashboard.
2. Click `New Script`.
3. Fill script name and metadata.

## Recommended metadata

```javascript
// ==UserScript==
// @name         My Script
// @match        *://example.com/*
// @run-at       document_end
// ==/UserScript==
```

## Run timing

- `document_start`: runs early
- `document_end`: runs when DOM is ready
- `document_idle`: runs after page load

## Tips

- Keep one purpose per script.
- Use clear names.
- Keep match patterns narrow.
- Test on one site before broad patterns.
