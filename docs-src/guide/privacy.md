# Privacy Policy

Last updated: February 18, 2026

CodeTweak is a browser extension for creating and running userscripts. This policy explains what data CodeTweak handles and how it is used.

## Summary

- CodeTweak processes script data locally in your browser.
- CodeTweak does not sell personal information.
- CodeTweak does not run a remote tracking or analytics service.

## Data CodeTweak handles

CodeTweak may handle the following data:

- Userscript code and metadata (for scripts you create or import)
- Script execution settings and extension settings
- Stored values written by scripts via supported GM storage APIs
- Limited page context required to decide when scripts should run (for example, current tab URL matching)

## How data is used

Data is used only to provide extension functionality, including:

- Saving and loading scripts and settings
- Matching scripts to pages and run timing
- Running script features such as notifications, clipboard support, and downloads when triggered by you or your scripts

## Data sharing

- CodeTweak itself does not sell or rent user data.
- CodeTweak itself does not transmit extension telemetry for advertising or profiling.
- Network requests can occur when you explicitly import scripts (for example, from Greasy Fork) or when a userscript you installed makes requests using supported APIs. Those requests are initiated by user action or script behavior you control.

## Data retention and deletion

- Data is stored in browser extension storage until you remove it.
- You can delete data by removing scripts/settings in CodeTweak, resetting extension data, or uninstalling the extension.

## Permissions and purpose

- `storage`: save scripts and settings
- `scripting`, `webNavigation`: determine matching pages and run scripts at the selected timing
- `tabs`: target the active tab for editor and execution flows
- `notifications`: show extension or script notifications
- `downloads`: export scripts/files when requested
- `clipboardWrite`: copy text when requested
- `contextMenus`: enable selector/editor context actions

## Third-party content and scripts

Userscripts are third-party code chosen by you. Installed scripts may process page data or make network requests according to their own logic. Review script source and metadata before enabling.

## Security guidance

- Keep `@match` patterns specific.
- Keep external resource loading disabled unless needed.
- Review imported scripts before enabling.
