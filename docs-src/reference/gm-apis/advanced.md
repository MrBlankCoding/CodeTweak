# Page access and utilities

## Where scripts run

A script runs in one of two places. Both see and change the same page; they differ in whether the script shares JavaScript variables with the page.

- **Isolated:** the script has its own private set of JavaScript variables. It can use every GM API, and the page can't see or interfere with the script. It can't see variables the page created, such as `window.jQuery` or a site's app state.
- **Page:** the script runs alongside the page's own JavaScript, sharing its variables. Only GM APIs that don't need extra browser powers work here, because the page could otherwise call them too.

CodeTweak picks one for you. You can override it with **Execution Context** in the editor, or with `@inject-into` in the metadata block.

| Execution Context  | `@inject-into` | Where it runs                                                           |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| **Default**        | `auto`         | Isolated if the script grants an API that needs it, otherwise the page. |
| **Isolated World** | `content`      | Isolated.                                                               |
| **Main World**     | `page`         | The page.                                                               |

These APIs work in both places: `GM_addStyle`, `GM_addElement`, `GM_getResourceText`, `GM_getResourceURL`, `GM_log`, and `GM_info`. All other APIs only work in the isolated world. Calling one from the page throws an error telling you to change the Execution Context.

So a script with `@grant none` runs in the page and can use the page's variables, while a script that grants `GM_setValue` runs isolated.

### Using page variables from an isolated script

To use both the page's variables and isolated-only APIs, add a small script to the page and pass data through the page itself:

```javascript
// Runs in the page, where it can read the site's own variables.
GM_addElement('script', {
  textContent: `
    document.documentElement.dataset.userName = window.app?.user?.name ?? '';
  `,
});

// Back in the isolated script:
GM_setValue('lastUser', document.documentElement.dataset.userName);
```

Some sites block added scripts. See [Sites that block scripts](/troubleshooting/strict-sites).

## unsafeWindow

The page's `window` object.

When the script runs in the page, `unsafeWindow` is the page's real `window`, so `unsafeWindow.someGlobal` reads the site's variables. When it runs isolated, `unsafeWindow` is the isolated `window`, and the page's variables aren't reachable through it. Use the technique above instead.

## GM_info

Information about the script and CodeTweak. Available to every script, with no `@grant` needed.

```javascript
console.log(`${GM_info.script.name} v${GM_info.script.version}`);
```

| Property             | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `script.name`        | The script's `@name`.                                                         |
| `script.version`     | The script's `@version`.                                                      |
| `script.description` | The script's `@description`.                                                  |
| `script.author`      | The script's `@author`.                                                       |
| `script.namespace`   | The script's `@namespace`.                                                    |
| `script.matches`     | The script's `@match` patterns.                                               |
| `script.requires`    | The script's `@require` URLs.                                                 |
| `script.resources`   | The script's resources, each with a `name` and `url`.                         |
| `script['run-at']`   | The script's run timing, such as `document-end`.                              |
| `scriptMetaStr`      | The full metadata block, as text.                                             |
| `scriptHandler`      | Always `"CodeTweak"`.                                                         |
| `version`            | CodeTweak's version.                                                          |
| `injectInto`         | `"content"` when the script runs isolated, `"page"` when it runs in the page. |

Use `scriptHandler` to detect CodeTweak if your script supports several script managers.

## GM_log

Writes to the page's DevTools console, prefixed with `[GM_log]`. Works the same as `console.log`.

```javascript
GM_log('Loaded', location.href);
```

## Debugging

- `console.log` output and uncaught errors appear in the page's DevTools console. Press <kbd>F12</kbd> to open it.
- Turn on **Enhanced Debugging** in the dashboard settings to collect start-up errors in the editor's [Script Errors](/guide/editor#script-errors) panel.
