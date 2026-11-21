# GM API reference

The GM APIs give scripts abilities ordinary web pages don't have: storing data, contacting other websites, showing notifications, adding buttons to the CodeTweak popup, and more. They're compatible with Greasemonkey, Tampermonkey, and Violentmonkey.

## Granting an API

A script can only use the APIs it declares with `@grant`. You can type the lines yourself or tick the APIs in the editor's **GM API Access** panel.

```javascript
// ==UserScript==
// @name   My Script
// @match  https://example.com/*
// @grant  GM_getValue
// @grant  GM_setValue
// ==/UserScript==
```

Calling an API you didn't grant fails with an error such as `GM_setValue is not a function`. Scripts that need no APIs should use `@grant none`.

## Two styles

Every API comes in two styles. Grant whichever you use; either name grants both.

**`GM_` functions** return their result straight away where they can:

```javascript
const count = GM_getValue('count', 0);
GM_setValue('count', count + 1);
```

**`GM.` functions** return a promise (except `GM.addValueChangeListener`, `GM.removeValueChangeListener`, `GM.registerMenuCommand`, and `GM.unregisterMenuCommand`, which work the same as their `GM_` versions):

```javascript
const count = await GM.getValue('count', 0);
await GM.setValue('count', count + 1);
```

## All APIs

| `GM_` style                                                     | `GM.` style                    | What it does                                        |
| --------------------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| **[Storage](/reference/gm-apis/storage)**                       |                                |                                                     |
| `GM_setValue`                                                   | `GM.setValue`                  | Save a value.                                       |
| `GM_getValue`                                                   | `GM.getValue`                  | Read a saved value.                                 |
| `GM_deleteValue`                                                | `GM.deleteValue`               | Delete a saved value.                               |
| `GM_listValues`                                                 | `GM.listValues`                | List the names of saved values.                     |
| `GM_addValueChangeListener`                                     | `GM.addValueChangeListener`    | Run code when a value changes, even in another tab. |
| `GM_removeValueChangeListener`                                  | `GM.removeValueChangeListener` | Stop listening.                                     |
| **[Page and browser UI](/reference/gm-apis/ui)**                |                                |                                                     |
| `GM_addStyle`                                                   | `GM.addStyle`                  | Add CSS to the page.                                |
| `GM_addElement`                                                 | `GM.addElement`                | Add an element to the page.                         |
| `GM_notification`                                               | `GM.notification`              | Show a desktop notification.                        |
| `GM_openInTab`                                                  | `GM.openInTab`                 | Open a new tab.                                     |
| `GM_registerMenuCommand`                                        | `GM.registerMenuCommand`       | Add a button to the CodeTweak popup.                |
| `GM_unregisterMenuCommand`                                      | `GM.unregisterMenuCommand`     | Remove a popup button.                              |
| **[Network, clipboard, downloads](/reference/gm-apis/network)** |                                |                                                     |
| `GM_xmlhttpRequest`                                             | `GM.xmlHttpRequest`            | Request data from any website.                      |
| `GM_setClipboard`                                               | `GM.setClipboard`              | Copy text to the clipboard.                         |
| `GM_download`                                                   | `GM.download`                  | Download a file.                                    |
| **[Resources](/reference/gm-apis/resources)**                   |                                |                                                     |
| `GM_getResourceText`                                            | `GM.getResourceText`           | Read a `@resource` file as text.                    |
| `GM_getResourceURL`                                             | `GM.getResourceUrl`            | Get a `@resource` file as a URL.                    |
| **[Page access and utilities](/reference/gm-apis/advanced)**    |                                |                                                     |
| `unsafeWindow`                                                  |                                | The page's own `window`.                            |
| `GM_info`                                                       | `GM.info`                      | Information about the script and CodeTweak.         |
| `GM_log`                                                        | `GM.log`                       | Write to the console.                               |

::: tip Spelling
The promise-style request function is `GM.xmlHttpRequest`, with a capital **H**, as in Greasemonkey 4. `GM.getResourceURL` and `GM.getResourceUrl` both work.
:::

## Where the APIs work

APIs that use the browser's powers (storage, requests, notifications, tabs, clipboard, downloads, and menu commands) are kept away from the web page, so the page can't misuse them. A script that grants any of them runs in a private copy of the page's JavaScript environment. It sees and changes the same page, but can't see the page's own variables directly.

Most scripts don't need to think about this. If yours needs the page's variables, see [Where scripts run](/reference/gm-apis/advanced#where-scripts-run).
