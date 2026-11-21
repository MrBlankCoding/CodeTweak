# Userscript basics

A userscript is ordinary JavaScript with a **metadata block** at the top. The metadata block tells CodeTweak what the script is called, where it runs, when it runs, and what extra features it needs.

CodeTweak follows the same format as Tampermonkey, Violentmonkey, and Greasemonkey, so most scripts written for those work without changes.

## A complete example

```javascript
// ==UserScript==
// @name         Dark Reader for Example
// @namespace    https://example.com/my-scripts
// @version      1.2.0
// @description  Gives example.com a dark theme and remembers your choice
// @author       You
// @match        https://example.com/*
// @match        https://*.example.org/*
// @exclude      https://example.com/admin/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

const style = GM_addStyle('html { filter: invert(1) hue-rotate(180deg); }');
style.disabled = !GM_getValue('dark', true);

GM_registerMenuCommand('Toggle dark mode', () => {
  style.disabled = !style.disabled;
  GM_setValue('dark', !style.disabled);
});
```

The metadata block must start with `// ==UserScript==` and end with `// ==/UserScript==`. Each line inside is `// @key value`.

## Metadata keys

### Describing the script

| Key            | Meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `@name`        | The name shown in the popup and dashboard.                                        |
| `@namespace`   | Usually your website or profile URL. Helps tell apart scripts with the same name. |
| `@version`     | Version number such as `1.2.0`. Used to detect updates.                           |
| `@description` | A short summary shown in the dashboard.                                           |
| `@author`      | Your name.                                                                        |
| `@icon`        | An image URL (or `data:image/...` URL) shown next to the script.                  |
| `@license`     | The script's license, such as `MIT`.                                              |

### Where it runs

| Key              | Meaning                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `@match`         | A page the script runs on. Repeat it for more pages. See [Choosing sites](/reference/match-patterns). |
| `@include`       | Like `@match`, but also accepts a regular expression written as `/.../`.                              |
| `@exclude`       | A page to skip even if it matches. Accepts wildcards (`*` and `?`) or a `/regular expression/`.       |
| `@exclude-match` | Same as `@exclude`.                                                                                   |
| `@noframes`      | No value. Run only in the top-level page, not inside iframes.                                         |

### When and how it runs

| Key            | Meaning                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@run-at`      | `document-start`, `document-end`, or `document-idle` (the default). See [Run timing](/reference/run-timing).        |
| `@inject-into` | `auto` (the default), `content`, or `page`. See [Where scripts run](/reference/gm-apis/advanced#where-scripts-run). |

### What it needs

| Key         | Meaning                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@grant`    | A GM API the script uses, such as `GM_setValue` or `GM.setValue`. Repeat it for each API. Use `@grant none` if it uses none. See the [API reference](/reference/gm-apis). |
| `@connect`  | A server `GM_xmlhttpRequest` may contact. See [Network](/reference/gm-apis/network#allowed-servers-connect).                                                              |
| `@require`  | A JavaScript library to load first, such as jQuery. Must be `https://`. Loaded in the order listed.                                                                       |
| `@resource` | A named file to download, written `@resource name https://...`. Read it with the [resource APIs](/reference/gm-apis/resources).                                           |

### Updates

| Key            | Meaning                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `@updateURL`   | Where CodeTweak checks for a newer version. Usually a `.meta.js` or `.user.js` file.         |
| `@downloadURL` | Where the new version is downloaded from. Also used for checking if there's no `@updateURL`. |

See [Automatic updates](/guide/greasyfork#automatic-updates).

## Verifying libraries

To make sure a `@require` or `@resource` file hasn't been changed, add its hash to the end of the URL:

```javascript
// @require https://cdn.example.com/lib.min.js#sha256=2f8a...c91e
```

`sha256`, `sha384`, and `sha512` hashes are supported, in hex or base64. If the downloaded file doesn't match, the script doesn't start and the failure is shown in [Script Errors](/guide/editor#script-errors).

## How your code runs

- Your code runs inside its own function, so variables you declare don't leak into the page or clash with other scripts. You don't need to wrap it in an IIFE, though it does no harm.
- The GM APIs you grant are available as ordinary functions inside your script.
- Libraries from `@require` run in the same scope as your script, so they can use your GM APIs and you can use their globals.
- Top-level `await` isn't supported, but you can use an `async` function:

```javascript
(async () => {
  const theme = await GM.getValue('theme', 'light');
  document.documentElement.dataset.theme = theme;
})();
```

## Tips

- **Keep `@match` narrow.** Run only on the pages that need the script.
- **Grant only what you use.** Fewer grants means less a mistake or a bad update can do.
- **Expect elements to be missing.** Pages change. Check that `document.querySelector(...)` found something before using it.
- **Use the console.** `console.log()` output appears in the page's DevTools console (<kbd>F12</kbd>).
