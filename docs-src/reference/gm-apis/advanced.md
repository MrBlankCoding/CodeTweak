# Advanced & Utility APIs

CodeTweak provides several advanced utilities for scripts that need deeper access to the browser's context or standard utility functions.

---

## unsafeWindow

Gives your userscript access to the main page's `window` object.

```javascript
declare const unsafeWindow: Window;
```

### Security & Use Case

CodeTweak typically executes userscripts in a **protected sandbox**. This sandbox:

1.  **Protects the Page**: Prevent scripts from accidentally interfering with the website's original functions.
2.  **Protects the Script**: Prevent the website from accessing the script's global variables or CodeTweak APIs.

`unsafeWindow` allows you to break out of this sandbox to:

- Access global variables defined by the website's scripts.
- Call functions defined on the main page.
- Access objects like `document`, `location`, or `console` directly on the main page.

---

## GM_log

Logs messages to the browser's DevTools console.

```javascript
GM_log(...args: any[]): void
```

### Why use `GM_log`?

While standard `console.log()` works in CodeTweak, `GM_log` is a dedicated utility for userscripts to ensure consistent logging across different browser environments and script injection modes.

---

## Event Listener Protection

CodeTweak provides an internal **Event Listener Protection** system for userscripts that use events like `DOMContentLoaded` or `load`.

- **Automatic Re-registration**: If the page is being dynamically updated or replaced (e.g., in Single Page Applications), CodeTweak attempts to re-register these listeners.
- **Simulation**: If your script is set to run at `document-end` but the page's `DOMContentLoaded` event has already passed, CodeTweak will manually trigger the listener to ensure your logic executes correctly.

### Script Error Reporting

Any error that occurs in your userscript (syntax errors, runtime errors, or unhandled promise rejections) is automatically captured and reported back to the **CodeTweak Editor**.

- **Error Highlighting**: Errors appear in the **Script Errors** sidebar panel within the editor.
- **Stack Traces**: Full stack traces are provided to help you identify the exact line of code where the error occurred.
