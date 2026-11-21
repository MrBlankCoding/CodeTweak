# Network, clipboard, downloads

## GM_xmlhttpRequest

Requests data from any website, including sites other than the one the script runs on. Ordinary `fetch` from a page is usually blocked from reading other sites (CORS); `GM_xmlhttpRequest` isn't, because CodeTweak makes the request for you.

```javascript
const request = GM_xmlhttpRequest(details);
request.abort();

const response = await GM.xmlHttpRequest(details);
```

### Request options

| Option         | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `url`          | The address. Must start with `http://` or `https://`. Required.                         |
| `method`       | `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`.                |
| `headers`      | An object of request headers, such as `{ 'Content-Type': 'application/json' }`.         |
| `data`         | The request body, as a string. Use `JSON.stringify()` for JSON. Up to 1 MB.             |
| `timeout`      | Give up after this many milliseconds. Defaults to 30 seconds; the maximum is 5 minutes. |
| `responseType` | How to return the body: `text` (default), `json`, `arraybuffer`, `blob`, or `document`. |
| `context`      | Any value. It's passed back to you as `response.context`.                               |

### Callbacks

| Callback             | Called when                                                 |
| -------------------- | ----------------------------------------------------------- |
| `onload`             | The request finished (with any HTTP status).                |
| `onerror`            | The request failed, for example because of a network error. |
| `ontimeout`          | The request took longer than `timeout`.                     |
| `onabort`            | You called `abort()`.                                       |
| `onloadend`          | The request ended, whether it succeeded or not.             |
| `onreadystatechange` | The request finished. Called once, just before `onload`.    |

Progress callbacks (`onprogress`, `onloadstart`) aren't supported.

### The response

| Property          | Meaning                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `status`          | HTTP status code, such as `200` or `404`.                                                      |
| `statusText`      | HTTP status text, such as `OK`.                                                                |
| `responseText`    | The body as text (empty for `arraybuffer` and `blob`).                                         |
| `response`        | The body in the format you asked for with `responseType`. `null` if `json` couldn't be parsed. |
| `responseHeaders` | The response headers as one string, one `name: value` per line.                                |
| `finalUrl`        | The address after any redirects.                                                               |
| `context`         | The `context` you passed in.                                                                   |

Responses larger than 5 MB are rejected.

### Examples

Callback style:

```javascript
GM_xmlhttpRequest({
  url: 'https://api.example.com/items',
  responseType: 'json',
  onload: (response) => {
    if (response.status === 200) console.log(response.response);
  },
  onerror: (response) => console.error('Request failed:', response.error),
});
```

Promise style:

```javascript
const response = await GM.xmlHttpRequest({
  method: 'POST',
  url: 'https://api.example.com/items',
  headers: { 'Content-Type': 'application/json' },
  data: JSON.stringify({ name: 'New item' }),
});
console.log(response.status);
```

With `GM.xmlHttpRequest`, the promise rejects if the request fails or times out. The returned promise also has an `abort()` method.

### Allowed servers (@connect)

`@connect` lines list the servers a script may contact:

```javascript
// @connect api.example.com
// @connect self
```

- `example.com` allows that site and all its subdomains, such as `api.example.com`.
- `self` allows the site the script is running on.
- `*` allows any server.

If a script has no `@connect` lines, it may contact any server. Once it has at least one, requests to servers not on the list fail with "host is not in @connect list". Listing the servers you use is good practice: it shows users where your script sends data, and CodeTweak asks them to approve updates that add new servers.

::: info Security setting
`GM_xmlhttpRequest` only works while **Allow external resources** is on in the [dashboard settings](/guide/dashboard#security). It's on by default. When it's off, every request fails with "Cross-origin requests are disabled by a security setting".
:::

## GM_setClipboard

Copies text to the clipboard.

```javascript
GM_setClipboard(text);
await GM.setClipboard(text);
```

The text is copied as plain text, up to 100 KB. A second `type` argument is accepted for compatibility with other script managers, but ignored.

## GM_download

Downloads a file to the user's downloads folder.

```javascript
GM_download(url, name);
GM_download(details);
await GM.download(details);
```

| Option    | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| `url`     | The file's address: `http://`, `https://`, a `blob:` URL, or a `data:` URL.                     |
| `name`    | The file name to save as. It can include folders, such as `my-script/report.csv`, but not `..`. |
| `onload`  | Function to run once the download has started.                                                  |
| `onerror` | Function to run if the download couldn't start. It receives `{ error }`.                        |

```javascript
const csv = 'name,score\nAda,10\n';
const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
GM_download({ url, name: 'scores.csv' });
```
