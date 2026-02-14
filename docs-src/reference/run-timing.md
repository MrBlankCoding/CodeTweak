# Run Timing

`@run-at` decides when your script executes.

## Timing options

- `document-start`: before DOM is fully parsed
- `document-end`: after DOMContentLoaded
- `document-idle`: after load when browser is idle

## Example

```javascript
// ==UserScript==
// @run-at document-end
// ==/UserScript==

const button = document.querySelector("button.buy");
if (button) button.textContent = "Buy now";
```

## Pick the right timing

- Use `document-start` for early CSS/patching.
- Use `document-end` for most DOM edits.
- Use `document-idle` for heavy or non-critical work.

## Debug timing issues

If selectors return `null`, move later:

- `document-start` -> `document-end`
- `document-end` -> `document-idle`
