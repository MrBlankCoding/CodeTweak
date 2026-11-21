# Sites that block scripts

Some sites, especially banks, email, and large web apps, protect themselves in ways that can get in the way of userscripts.

## Content Security Policy

Many sites send a **Content Security Policy** (CSP) that stops unknown code from running on their pages.

- **Your script itself** isn't affected. The browser runs userscripts on the page regardless of the site's policy.
- **Code you add to the page** can be blocked: a `<script>` element added with `GM_addElement`, or inline `onclick="..."` attributes. If that happens, the console shows a message mentioning "Content Security Policy".

What to do:

- Use `addEventListener` instead of inline event attributes.
- Avoid adding `<script>` elements. If you need the page's variables, try running the whole script in the page with **Execution Context → Main World** (or `@inject-into page`). You lose the isolated-only GM APIs, but nothing needs to be added to the page.
- Load libraries with `@require` instead of adding `<script src="...">`, so CodeTweak loads them along with your script.

## Pages that change without reloading

Sites like YouTube, GitHub, and Gmail load new content without reloading the page. Your script runs once, when the page first loads, so content that appears later isn't there yet.

Watch for the content instead of expecting it straight away. See [When elements aren't there yet](/reference/run-timing#when-elements-aren-t-there-yet) and [Single-page sites](/reference/run-timing#single-page-sites).

## Content inside frames

Some content is shown in an `<iframe>`, a separate page embedded in the main one. Scripts run in matching frames too, so make sure your `@match` covers the frame's own address, not just the main page's. If the script must not run in frames, add `@noframes`.

## Elements that change names

Sites often generate class names such as `css-1x9a2b` that change each time they update. Prefer stable hooks:

- `id` attributes, `data-*` attributes, or `aria-label`;
- the element's position relative to something stable;
- its text content.

## Checking what's happening

```javascript
const target = document.querySelector('#target');
console.log('Found target:', Boolean(target), location.href);
```

Then:

- turn on **Enhanced Debugging** and check the editor's **Script Errors** panel;
- look for errors in the DevTools console (<kbd>F12</kbd>);
- turn off other scripts that change the same page, in case they conflict.
