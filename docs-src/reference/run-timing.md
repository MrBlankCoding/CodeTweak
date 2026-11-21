# Run timing

`@run-at` decides when a script runs while a page loads. In the editor it's under **Execution Settings → Run Timing**.

| `@run-at`                   | Editor label       | Runs                                                                                            |
| --------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `document-start`            | **Document Start** | As early as possible, before the page's own HTML has loaded. `document.body` may not exist yet. |
| `document-end`              | **DOM Loaded**     | When the HTML has been parsed, before images and other files finish loading.                    |
| `document-idle` _(default)_ | **Page Loaded**    | After the page has loaded and the browser is idle.                                              |

`document-body` is also accepted and treated as `document-end`.

## Which one to use

- **`document-end`** suits most scripts that change the page, because the page's elements exist.
- **`document-start`** is for things that must happen before the page shows, such as adding CSS with `GM_addStyle` to avoid a flash of the old design, or replacing page functions before the page uses them.
- **`document-idle`** is for work that can wait, so it doesn't slow down the page.

## When elements aren't there yet

Many sites add content with JavaScript after the page has loaded, so even `document-idle` can be too early. Wait for the element instead:

```javascript
function waitFor(selector) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

waitFor('.comments').then((comments) => {
  comments.style.display = 'none';
});
```

## Single-page sites

Sites like YouTube and GitHub change pages without fully reloading. Your script runs once when the first page loads, not each time you click to a new page. To react to those changes, watch the page with a `MutationObserver` as above, or listen for the site's navigation events.
