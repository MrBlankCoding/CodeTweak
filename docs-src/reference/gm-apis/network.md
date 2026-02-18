# Network & Clipboard APIs

CodeTweak provides enhanced network capabilities, bypassing standard Cross-Origin Resource Sharing (CORS) restrictions.

---

## GM_xmlhttpRequest

A more powerful version of the standard `XMLHttpRequest` (XHR) or `fetch`.

```javascript
GM_xmlhttpRequest(details: object): void
```

### Implementation Details

CodeTweak uses a **background request handler** to execute all network calls. This means:
1.  **CORS Bypass**: Requests are made from the extension's background script, so they are not blocked by the website's CORS policy.
2.  **No Cookies or Referrer**: By default, the browser's context for the target site is not shared with these requests unless configured.

### Options
-   **method**: `GET`, `POST`, `PUT`, `DELETE`, etc.
-   **url**: The target address.
-   **headers**: A set of HTTP headers to send.
-   **data**: The request body.
-   **timeout**: In milliseconds.
-   **responseType**: `text`, `json`, `blob`, `arraybuffer`.
-   **onload**: Callback for successful completion.
-   **onerror**: Callback for failed requests.
-   **onprogress**: Callback for status updates.

### Async Support
In addition to the standard callback-based version, CodeTweak provides an asynchronous version:

```javascript
const response = await GM.xmlhttpRequest({ ... });
```

---

## GM_setClipboard

Copies a string or data to the user's clipboard.

```javascript
GM_setClipboard(data: string, type?: string): Promise<void>
```

-   **data**: The text or content to copy.
-   **type**: The MIME type of the content (e.g., `text/plain`, `text/html`).

---

## GM_download

Initiates a browser-level file download from a given URL.

```javascript
GM_download(url: string, name?: string): Promise<void>
GM_download(details: object): Promise<void>
```

-   **url**: The file to download.
-   **name**: The filename to save as.
-   **headers**: (Details only) Custom headers to send with the download request.
-   **onload**: (Details only) Callback when the download starts.
-   **onerror**: (Details only) Callback for download errors.
