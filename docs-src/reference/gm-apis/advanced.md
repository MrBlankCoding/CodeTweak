# Advanced & Utility APIs

CodeTweak provides several advanced utilities for scripts that need deeper access to the browser's context or standard utility functions.

---

## unsafeWindow

Gives your userscript access to the main page's `window` object.

```javascript
declare const unsafeWindow: Window;
```

### Execution context

Where a script runs depends on its grants and the **Execution Context** setting (or `@inject-into`):

| Setting                      | Runs in                   | GM APIs                                                        |
| ---------------------------- | ------------------------- | -------------------------------------------------------------- |
| Default, script uses GM APIs | Isolated userscript world | All granted APIs                                               |
| Default, `@grant none`       | Page (main world)         | `GM_info`, `GM_addStyle`, `GM_addElement`, `GM_log`, resources |
| Isolated World / `content`   | Isolated userscript world | All granted APIs                                               |
| Main World / `page`          | Page (main world)         | Only the DOM-only APIs above; others throw                     |

The isolated world shares the page's DOM but not its JavaScript globals, and the page cannot see or call your GM APIs. Privileged APIs (storage, `GM_xmlhttpRequest`, tabs, notifications, menu commands) are never available in the page context, because any page script could call them there.

`unsafeWindow` is the page's `window` when the script runs in the page. In the isolated world it is the isolated `window`, so page-defined globals are not reachable from it. To use both page globals and privileged APIs, inject a small page script with `GM_addElement('script', { textContent: '...' })` and exchange data through the DOM.

---

## GM_log

Logs messages to the browser's DevTools console.

```javascript
GM_log(...args: any[]): void
```

### Why use `GM_log`?

While standard `console.log()` works in CodeTweak, `GM_log` is a dedicated utility for userscripts to ensure consistent logging across different browser environments and script injection modes.

---

## Script Error Reporting

With **Enhanced debugging** enabled in the dashboard settings, errors thrown while your script starts (including a rejected promise returned from its top level) and failed `@require`/`@resource` downloads are reported to the **Script Errors** panel in the editor, with stack traces. Errors thrown later from timers or event handlers still go to the page's DevTools console.
