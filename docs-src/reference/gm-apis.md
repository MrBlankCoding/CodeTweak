# GM API Reference

CodeTweak provides a suite of GreaseMonkey (GM) compatible APIs to help you build powerful userscripts. These APIs allow you to perform tasks that standard browser scripts cannot, such as cross-origin networking, persistent data storage, and browser-level notifications.

---

## API Categories

Browse the available APIs by category:

- [**Storage & Data**](/reference/gm-apis/storage): Save and load data across sessions, and listen for changes.
- [**UI & Elements**](/reference/gm-apis/ui): Modify the browser's interface and the page's DOM.
- [**Network & Clipboard**](/reference/gm-apis/network): Make cross-origin requests and interact with the system clipboard.
- [**Resources**](/reference/gm-apis/resources): Access external assets defined in your metadata.
- [**Advanced & Utility**](/reference/gm-apis/advanced): Advanced features like `unsafeWindow` and error reporting.

---

## The `GM` and `GM_` Namespaces

CodeTweak supports both the traditional **synchronous** Greasemonkey 3 style and the **asynchronous** Greasemonkey 4 style:

### Synchronous (GM3 Style)

Most functions are prefixed with `GM_` and return values immediately.

```javascript
const value = GM_getValue('key', 'default');
GM_setValue('key', 'new value');
```

### Asynchronous (GM4 Style)

All functions are available under the `GM` object and return a `Promise`.

```javascript
const value = await GM.getValue('key', 'default');
await GM.setValue('key', 'new value');
```

---

## Requesting Permissions

To use any of these APIs, you must explicitly declare them in your script's **metadata block** using the `@grant` tag:

```javascript
// ==UserScript==
// @name        My Script
// @match       https://example.com/*
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_xmlhttpRequest
// ==/UserScript==
```

If your script doesn't need any special APIs, use `@grant none`.
