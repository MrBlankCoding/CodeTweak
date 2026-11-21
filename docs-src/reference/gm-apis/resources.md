# Resources

Resources are files your script needs, such as a stylesheet, a JSON file, or an image. Declare each one in the metadata block with a name and an address:

```javascript
// ==UserScript==
// @resource  theme   https://cdn.example.com/theme.css
// @resource  words   https://cdn.example.com/words.json
// @resource  logo    https://cdn.example.com/logo.png
// @grant     GM_getResourceText
// @grant     GM_getResourceURL
// ==/UserScript==
```

You can also add them in the editor's **Script Resources** panel.

CodeTweak downloads resources when you save or install the script, and keeps a copy. They're ready the moment your script starts, without slowing down the page, and work even if the server is down later.

If a resource can't be downloaded, the script doesn't start, and the problem is listed in the editor's [Script Errors](/guide/editor#script-errors) panel. Add a hash to the address to check the file hasn't been changed; see [Verifying libraries](/guide/writing-userscripts#verifying-libraries).

## GM_getResourceText

Returns a resource's contents as text, or `null` if there's no resource with that name.

```javascript
const text = GM_getResourceText(name);
const text = await GM.getResourceText(name);
```

```javascript
GM_addStyle(GM_getResourceText('theme'));

const words = JSON.parse(GM_getResourceText('words'));
```

## GM_getResourceURL

Returns a resource as a `data:` URL, or `null` if there's no resource with that name. Use it wherever a URL is expected, such as an image's `src`.

```javascript
const url = GM_getResourceURL(name);
const url = await GM.getResourceUrl(name);
```

```javascript
const img = document.createElement('img');
img.src = GM_getResourceURL('logo');
document.body.append(img);
```

## Tips

- Give each resource a unique name made of letters, numbers, `-`, or `_`.
- Keep resources small. Every resource is copied into each page the script runs on.
