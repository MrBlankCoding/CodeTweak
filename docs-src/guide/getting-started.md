# Getting Started

This is the shortest path from install to working script.

## 1. Install CodeTweak

Follow [Install CodeTweak](/guide/installation).

## 2. Create a script

1. Open CodeTweak popup.
2. Click `Create Script`.
3. Paste this:

```javascript
// ==UserScript==
// @name        Hello CodeTweak
// @match       https://example.com/*
// @run-at      document-end
// @grant       none
// ==/UserScript==

console.log("CodeTweak script running");
```

4. Save.

## 3. Verify it runs

1. Open `https://example.com`.
2. Open DevTools console.
3. Confirm you see `CodeTweak script running`.

## 4. If it does not run

- Check `@match` first.
- Check `@run-at` second.
- Open script error logs in the editor.

Next:

- [Use the Editor](/guide/editor)
- [Manage Scripts](/guide/dashboard)
- [GM API Reference](/reference/gm-apis)
