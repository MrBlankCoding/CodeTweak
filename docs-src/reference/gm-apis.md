# GM APIs

CodeTweak supports safe GM APIs used by most userscripts.

## Storage

- `GM_setValue(name, value)`
- `GM_getValue(name, defaultValue)`
- `GM_deleteValue(name)`
- `GM_listValues()`
- `GM_addValueChangeListener(name, callback)`
- `GM_removeValueChangeListener(listenerId)`

## Network and IO

- `GM_xmlhttpRequest(details)`
- `GM_download(urlOrDetails, name)`
- `GM_setClipboard(data, type)`

## UI

- `GM_notification(details)`
- `GM_openInTab(url, options)`
- `GM_addStyle(css)`
- `GM_addElement(...)`
- `GM_registerMenuCommand(caption, onClick, accessKey)`
- `GM_unregisterMenuCommand(commandId)`

## Resources

- `GM_getResourceText(name)`
- `GM_getResourceURL(name)`

## Other

- `GM_log(...args)`
- `unsafeWindow`
- `GM_info`

## Notes

- Some APIs depend on metadata and grants used by the script.
- Cross-origin requests depend on your dashboard security setting.
