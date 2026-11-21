# Page and browser UI

## GM_addStyle

Adds CSS to the page and returns the `<style>` element it created.

```javascript
const style = GM_addStyle(css);
const style = await GM.addStyle(css);
```

```javascript
GM_addStyle(`
  .sidebar-ads { display: none !important; }
  body { font-size: 18px; }
`);
```

It works with `@run-at document-start`, before the page's `<head>` exists, which avoids a flash of the old styles. To undo it later, call `style.remove()` or set `style.disabled = true`.

## GM_addElement

Creates an element, adds it to the page, and returns it.

```javascript
GM_addElement(tagName, attributes);
GM_addElement(parent, tagName, attributes);
```

- Without `parent`, the element is added to the page's `<head>` (or `<body>` if there is no head). Pass a parent element to put it somewhere else.
- `attributes` is an object of attribute names and values. `textContent` sets the element's text.

```javascript
GM_addElement(document.body, 'button', {
  id: 'my-button',
  class: 'my-script-button',
  textContent: 'Do the thing',
});
```

## GM_notification

Shows a desktop notification.

```javascript
GM_notification(details, ondone);
GM_notification(text, title, image, onclick);
```

`details` can contain:

| Option    | Meaning                                                       |
| --------- | ------------------------------------------------------------- |
| `text`    | The message.                                                  |
| `title`   | The heading. Defaults to "CodeTweak Notification".            |
| `timeout` | Close automatically after this many milliseconds.             |
| `silent`  | `true` to show it without a sound.                            |
| `onclick` | Function to run when the notification is clicked.             |
| `ondone`  | Function to run when the notification closes, for any reason. |

```javascript
GM_notification({
  title: 'Price drop',
  text: 'The item on your watch list is now $19.99',
  timeout: 10000,
  onclick: () => window.focus(),
});
```

The CodeTweak icon is always shown; the `image` option is ignored. Notifications are only shown while **Show notifications** is on in the [dashboard settings](/guide/dashboard#general).

## GM_openInTab

Opens a web page in a new tab.

```javascript
GM_openInTab(url, options);
GM_openInTab(url, openInBackground);
```

| Option      | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `active`    | `true` to switch to the new tab. Defaults to `true`.                   |
| `insert`    | `true` to open it right next to the current tab instead of at the end. |
| `setParent` | `true` to return to the current tab when the new tab is closed.        |

Passing `true` instead of an options object opens the tab in the background. Only `http://` and `https://` addresses can be opened.

## GM_registerMenuCommand

Adds a button under **Menu Commands** in the CodeTweak popup while your script runs on the page. Use it for actions the user triggers occasionally, such as opening settings or exporting data.

```javascript
const id = GM_registerMenuCommand(caption, onClick, options);
```

- `caption`: the button's text.
- `onClick`: the function to run when it's clicked.
- `options`: optional. Pass `{ id: 'settings' }` to choose the command's ID; registering again with the same ID replaces the command instead of adding a second one.

Returns the command's ID.

```javascript
GM_registerMenuCommand('Reset saved data', () => {
  GM_listValues().forEach((name) => GM_deleteValue(name));
  location.reload();
});
```

## GM_unregisterMenuCommand

Removes a menu command.

```javascript
GM_unregisterMenuCommand(id);
```
