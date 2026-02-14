# Use the Editor

CodeTweak has two editing modes:

- Standard script editor
- AI DOM Editor sidebar

## Standard editor workflow

1. Set metadata.
2. Write script code.
3. Save.
4. Test on a matching URL.

Minimal metadata template:

```javascript
// ==UserScript==
// @name        My Script
// @match       https://app.example.com/*
// @run-at      document-end
// @grant       GM_getValue
// @grant       GM_setValue
// ==/UserScript==
```

State example:

```javascript
(async () => {
  const count = await GM_getValue("count", 0);
  await GM_setValue("count", count + 1);
  console.log("runs:", count + 1);
})();
```

## AI DOM Editor workflow

1. Open popup.
2. Click `AI DOM Editor`.
3. Click `Select Element` in sidebar.
4. Click target element on page.
5. Enter instruction.

Example instructions:

- `Hide this element`
- `Change this button text to "Checkout"`
- `Add red border to this card`

Review generated code before saving.

## Common mistakes

- `@match` too broad (`*://*/*`) or too narrow.
- Wrong `@run-at` for the DOM state you expect.
- Missing `@grant` for GM APIs.
