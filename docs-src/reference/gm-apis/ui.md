# UI & Elements APIs

CodeTweak provides several APIs to manipulate the browser interface and the DOM in ways that standard web scripts cannot.

---

## GM_addStyle

Injects a CSS style block into the document's head (or root).

```javascript
GM_addStyle(css: string): HTMLStyleElement
```

### Implementation Note

CodeTweak appends the `<style>` tag to `document.head` or `document.documentElement` if `head` is not yet available (e.g., in `document-start` scripts).

---

## GM_addElement

A versatile tool for creating and appending new DOM elements to the page.

```javascript
// Signature 1: Appends tag to parent
GM_addElement(parent: Node, tag: string, attributes?: object): Node

// Signature 2: Appends tag to document.body (or document.head for styles/scripts)
GM_addElement(tag: string, attributes?: object): Node
```

### Supported Attributes

CodeTweak automatically handles several attribute types:

- **style**: If provided as a string, it is applied via `el.style.cssText`.
- **Properties**: If the key exists on the element (e.g., `textContent`, `onclick`), it is assigned directly.
- **Attributes**: Otherwise, it is set using `el.setAttribute`.

---

## GM_notification

Displays a standard desktop notification through the browser's notification system.

```javascript
GM_notification(details: object, ondone?: Function): void
GM_notification(text: string, title?: string, image?: string, ondone?: Function): void
```

### Options

- **text**: The body message of the notification.
- **title**: The header title.
- **image**: A URL for an icon image.
- **timeout**: How long to show the notification (in milliseconds).
- **onclick**: Callback when the notification is clicked.
- **ondone**: Callback when the notification is closed.

---

## GM_openInTab

Opens a new URL in a browser tab.

```javascript
GM_openInTab(url: string, options?: object | boolean): void
```

### Options

- **active**: If `true`, the new tab will be focused immediately.
- **insert**: If `true`, the tab will be opened next to the current one.
- **setParent**: If `true`, closing the new tab will return focus to the original tab.

---

## Menu Command APIs

Register custom actions that appear in the CodeTweak extension menu when your script is active.

### GM_registerMenuCommand

```javascript
GM_registerMenuCommand(caption: string, onClick: () => void, accessKey?: string): string
```

- **caption**: The text to display in the menu.
- **onClick**: The function that runs when the command is selected.
- **accessKey**: A keyboard shortcut (if supported by the browser).

### GM_unregisterMenuCommand

Removes a command using the ID returned by `GM_registerMenuCommand`.

```javascript
GM_unregisterMenuCommand(commandId: string): void
```
