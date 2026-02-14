# Privacy and Permissions

CodeTweak runs locally and stores data in extension storage.

## Stored data

- Userscript code
- Script settings
- Extension settings

## Permission map

- `storage`: save scripts/settings
- `scripting`, `webNavigation`: run scripts at chosen timing
- `tabs`: target active tab
- `notifications`: GM/system notifications
- `downloads`: export scripts
- `clipboardWrite`: clipboard support
- `contextMenus`: selector and menu actions

## Security guidance

- Keep `@match` patterns specific.
- Keep `Allow external resources` off unless required.
- Review imported scripts before enabling.
