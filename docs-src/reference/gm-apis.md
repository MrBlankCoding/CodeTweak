# GM API Reference

This page lists common APIs used in CodeTweak scripts.

## Value storage

```javascript
await GM_setValue("theme", "dark");
const theme = await GM_getValue("theme", "light");
const keys = await GM_listValues();
await GM_deleteValue("theme");
```

## HTTP requests

Requires the extension setting that allows external requests.

```javascript
GM_xmlhttpRequest({
  method: "GET",
  url: "https://api.example.com/data",
  onload: (res) => {
    console.log(res.status, res.responseText);
  },
  onerror: (err) => {
    console.error(err);
  }
});
```

## Notification

```javascript
GM_notification({
  title: "CodeTweak",
  text: "Script finished"
});
```

## Clipboard

```javascript
await GM_setClipboard("Copied from CodeTweak");
```

## Style injection

```javascript
GM_addStyle(`
  .promo-banner { display: none !important; }
`);
```

## Metadata grants

Declare grants explicitly when you use GM APIs.

```javascript
// ==UserScript==
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_xmlhttpRequest
// @grant GM_notification
// ==/UserScript==
```
