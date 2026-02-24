# Resource APIs

CodeTweak allows userscripts to declare and use external static resources (like text, JSON, or images) using the `@resource` metadata tag.

---

## Implementation Details

CodeTweak uses a **Resource Manager** to fetch and cache all resources defined in your script's metadata block _before_ the script is executed.

1.  **Metadata Definition**: Resources must be declared in the header:
    ```javascript
    // @resource config https://example.com/config.json
    // @resource logo https://example.com/logo.png
    ```
2.  **Pre-loading**: CodeTweak downloads these resources when the script is enabled or modified and keeps them in memory for fast access.
3.  **Data Persistence**: If the script is stored locally, the resource content is often cached to ensure the script works even offline.

---

## GM_getResourceText

Retrieves the content of a resource as a UTF-8 string.

```javascript
GM_getResourceText(name: string): string
GM.getResourceText(name: string): Promise<string>
```

- **name**: The unique identifier for the resource as defined in the `@resource` tag.

---

## GM_getResourceURL

Retrieves a URL representing the resource's content.

```javascript
GM_getResourceURL(name: string): string
GM.getResourceURL(name: string): Promise<string>
```

### Data URLs

CodeTweak typically returns a **Base64 Data URL** (e.g., `data:image/png;base64,...`) for images and other binary resources. This allows you to use the resource directly in `<img>` or `<video>` tags:

```javascript
const logo = GM_getResourceURL('logo');
const img = document.createElement('img');
img.src = logo;
document.body.appendChild(img);
```

---

## Resource Best Practices

1.  **Unique Names**: Ensure resource names do not conflict with each other or with other `@grant` names.
2.  **Size Limits**: Large resources can increase the script's memory footprint. Avoid large video files or high-resolution images unless necessary.
3.  **MIME Types**: CodeTweak attempts to automatically detect the MIME type of a resource based on its URL or server response headers.
