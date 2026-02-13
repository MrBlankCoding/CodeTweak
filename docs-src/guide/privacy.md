# Privacy and Permissions

CodeTweak runs locally in your browser.

## Data storage

- Scripts and settings are stored in extension local storage.
- CodeTweak does not require account login.

## Why permissions are used

- `storage`: save scripts and settings
- `scripting`, `webNavigation`: inject scripts at the right time
- `tabs`: target active tabs
- `notifications`: optional script notifications
- `downloads`: script export/download
- `offscreen`, `clipboardWrite`: clipboard support
- `contextMenus`: element selector actions

## Security controls

- Disable `allow external resources` unless needed.
- Use `confirm first run` for new scripts.
- Keep scripts scoped with specific `@match` rules.
