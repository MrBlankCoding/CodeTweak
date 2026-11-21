# Troubleshooting

## "User scripts are disabled" banner

Your browser is blocking CodeTweak from running scripts.

- **Chrome:** open `chrome://extensions`, click **Details** on CodeTweak, and turn on **Allow User Scripts**. On Chrome versions older than 138, turn on **Developer mode** instead.
- **Firefox:** click **Grant permission** in the banner and accept the prompt.

Then reload the pages where you want scripts to run.

## A script doesn't run

Work through these in order:

1. **Are user scripts allowed?** See the banner section above.
2. **Is the script on?** Check its switch in the popup or dashboard.
3. **Did you reload the page?** Scripts start when a page loads, so changes and newly installed scripts need a reload.
4. **Does the address match?** Open the popup on the page. If the script isn't listed, its `@match` patterns don't cover this address. Remember that `example.com` and `www.example.com` are different. See [Choosing sites](/reference/match-patterns).
5. **Is it a page scripts can't run on?** Browser pages, other extensions, the Chrome Web Store, and Firefox Add-ons are off limits.
6. **Did it start too early?** If the script can't find elements, try a later [run timing](/reference/run-timing), or wait for the element.
7. **Is it throwing an error?** Open DevTools (<kbd>F12</kbd>) and look in the console. Turn on **Enhanced Debugging** to also see start-up errors in the editor's **Script Errors** panel.

A one-line script helps rule out problems with your own code:

```javascript
console.log('CodeTweak ran on', location.href);
```

## "Missing dependencies, script not started"

A `@require` or `@resource` file couldn't be downloaded, or its hash didn't match. The script won't start until every file is available.

- Open the address in a new tab to check it still works.
- If you added a `#sha256=` hash, make sure it matches the file.
- Save the script again to retry the download.

## "GM_setValue is not a function" (or another GM API)

- The script is missing a `@grant` line for that API. Add it, or tick the API in the editor's **GM API Access** panel, then save.
- If the error says the API isn't available in the page, the script's **Execution Context** is set to **Main World**. Switch it to **Default** or **Isolated World**. See [Where scripts run](/reference/gm-apis/advanced#where-scripts-run).

## The script can't see the page's variables

Scripts that use GM APIs run isolated from the page's JavaScript. See [Using page variables from an isolated script](/reference/gm-apis/advanced#using-page-variables-from-an-isolated-script).

## GM_xmlhttpRequest fails

| Error message                                              | Fix                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "Cross-origin requests are disabled by a security setting" | Turn on **Allow external resources** in the dashboard settings.                                                             |
| "host is not in @connect list"                             | Add the server to the script's `@connect` lines. See [Allowed servers](/reference/gm-apis/network#allowed-servers-connect). |
| "Request timed out"                                        | The server was slow. Increase `timeout`, up to 5 minutes.                                                                   |
| "Response exceeds 5MB limit"                               | Request less data at a time.                                                                                                |

## Menu commands don't appear in the popup

- Reload the page. Commands are added when the script runs.
- Make sure the script grants `GM_registerMenuCommand` and matches the page.
- Commands are only shown for the tab you're on.

## Notifications don't appear

- Turn on **Show notifications** in the dashboard settings.
- Check that your operating system allows notifications from your browser, and that Do Not Disturb or Focus mode is off.

## A script stopped updating

Updates that ask for more permissions, or that would overwrite your own edits, wait for your approval. Look for the circular-arrows button next to the script in the dashboard. See [Reviewing an update](/guide/greasyfork#reviewing-an-update).

## Still stuck?

[Open an issue on GitHub](https://github.com/MrBlankCoding/CodeTweak/issues/new) with your browser and version, the script (or a short version that shows the problem), and any errors from the console.
