# Storage

Scripts can save values that last across page loads, tabs, and browser restarts. Each script has its own private storage; scripts can't read each other's values.

Values are loaded before your script starts, so `GM_getValue` returns the saved value straight away.

## GM_setValue

Saves a value under a name.

```javascript
GM_setValue(name, value);
await GM.setValue(name, value);
```

- `name`: a string of up to 256 characters.
- `value`: anything that can be stored as JSON: strings, numbers, booleans, `null`, arrays, and plain objects. Functions and `undefined` can't be stored. Dates are stored as strings.

```javascript
GM_setValue('settings', { theme: 'dark', fontSize: 16 });
```

## GM_getValue

Reads a saved value, or returns `defaultValue` if nothing is saved under that name.

```javascript
const value = GM_getValue(name, defaultValue);
const value = await GM.getValue(name, defaultValue);
```

```javascript
const settings = GM_getValue('settings', { theme: 'light', fontSize: 14 });
```

Objects and arrays are returned as copies. Changing the returned object doesn't change what's saved until you call `GM_setValue` again.

## GM_deleteValue

Deletes a saved value.

```javascript
GM_deleteValue(name);
await GM.deleteValue(name);
```

## GM_listValues

Returns the names of all saved values.

```javascript
const names = GM_listValues();
const names = await GM.listValues();
```

## GM_addValueChangeListener

Runs a function whenever a value changes, whether the change was made on this page or by the same script in another tab. Use it to keep several tabs in sync.

```javascript
const id = GM_addValueChangeListener(name, (name, oldValue, newValue, remote) => {
  // ...
});
```

- `remote` is `true` when the change came from another tab, and `false` when it came from this one.
- Returns an ID for `GM_removeValueChangeListener`.

```javascript
GM_addValueChangeListener('theme', (name, oldValue, newValue, remote) => {
  document.documentElement.dataset.theme = newValue;
  if (remote) console.log('Theme changed in another tab');
});
```

## GM_removeValueChangeListener

Stops a listener.

```javascript
GM_removeValueChangeListener(id);
```

## Limits

| Limit                       | Value                |
| --------------------------- | -------------------- |
| Name length                 | 256 characters       |
| Size of one value           | About 100 KB as JSON |
| Number of values per script | 1,000                |

Saving past a limit fails. With `GM.setValue`, the promise rejects with the reason.

## Where values are kept

Values are stored in your browser, in CodeTweak's extension storage. They're kept when you update or edit the script.

They're deleted when you delete the script or uninstall CodeTweak. To reset a script without deleting it, click the database button next to it in the [dashboard](/guide/dashboard#scripts); reload any open pages afterwards so they don't keep using the old values.

**Export All** in the dashboard doesn't include stored values.
