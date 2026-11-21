# Privacy policy

_Last updated: November 21, 2026_

CodeTweak is a browser extension for creating and running userscripts. This policy explains what data CodeTweak handles and how it's used.

## Summary

- CodeTweak stores your scripts and settings locally in your browser.
- CodeTweak doesn't collect, sell, or share personal information.
- CodeTweak has no accounts, analytics, tracking, or advertising.

## Data CodeTweak handles

- **Your scripts:** the code and settings of scripts you write or install.
- **Your settings:** CodeTweak's preferences, such as notification and theme settings.
- **Script data:** values your scripts save with the GM storage APIs, and copies of files they declare with `@require` and `@resource`.
- **Version history:** earlier versions of each script, kept so you can restore them.
- **Error logs:** errors from your scripts, recorded only when **Enhanced Debugging** is on.
- **The current page's address:** used in your browser to decide which scripts to run and to show them in the popup. It isn't stored or sent anywhere.

All of this is kept in your browser's extension storage on your device.

## Network requests

CodeTweak doesn't send your data to CodeTweak's developers or to any CodeTweak server. It contacts other servers only in these cases:

- **Installing a script** from Greasy Fork downloads it from greasyfork.org.
- **Libraries and resources** listed by a script with `@require` and `@resource` are downloaded from the addresses the script gives.
- **Automatic updates** check each installed script's update address once a day.
- **Your scripts** may make requests with `GM_xmlhttpRequest`. These go where the script sends them, and are limited by its `@connect` list and the **Allow external resources** setting.

## Data retention and deletion

Data stays in your browser until you remove it.

- Deleting a script removes it along with its stored values, version history, and error log.
- You can clear a script's stored values from the dashboard without deleting the script.
- Uninstalling CodeTweak removes all of its data, including your scripts, settings, and stored script values.

## Permissions

| Permission                         | Why CodeTweak needs it                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `userScripts`                      | Run your scripts on the pages they target.                                                   |
| Access to all `http`/`https` sites | Run scripts on the sites you choose, and let scripts make the requests you allow.            |
| `scripting`                        | Start the element picker on a page when you ask for it.                                      |
| `storage`, `unlimitedStorage`      | Save your scripts, settings, and script data, without a small size limit.                    |
| `tabs`                             | Show which scripts match the current tab, and open the editor and dashboard.                 |
| `contextMenus`                     | Add **Select Element for Script** to the right-click menu.                                   |
| `notifications`                    | Show notifications from your scripts and from CodeTweak.                                     |
| `clipboardWrite`, `offscreen`      | Copy text to the clipboard when you or your scripts ask. `offscreen` is used in Chrome only. |
| `downloads`                        | Export your scripts and let scripts download files.                                          |
| `alarms`                           | Check for script updates once a day.                                                         |

## Third-party scripts

Userscripts are code written by you or by other people, and run with the access you give them. A script can read and change the pages it runs on and send data to servers on its `@connect` list. Review a script before installing it, and only install scripts from authors you trust. CodeTweak isn't responsible for the behaviour of third-party scripts.

## Changes to this policy

If this policy changes, the new version will be posted on this page with a new date.

## Contact

Questions about privacy can be raised as an issue on [GitHub](https://github.com/MrBlankCoding/CodeTweak/issues).
