# CodeTweak

CodeTweak is a Manifest V3 userscript manager with a built-in editor.

## What it does

- Create, edit, enable, and disable userscripts.
- Run scripts by URL pattern and run timing.
- Support common GM APIs (`GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, etc).
- Import scripts from Greasy Fork.

## Build (Chrome)

```bash
npm ci
npm run build:chrome
```

Output: `build/chrome`

- Chrome package: `build/codetweak-chrome.zip`

## Development

```bash
npm install
npm run lint
npm run build:chrome
```

Docs:

```bash
npm run docs:dev
npm run docs:build
```

## Project structure

- `src/` extension source
- `buildScripts/` browser build scripts
- `docs-src/` VitePress documentation source

## Example userscript

```javascript
// ==UserScript==
// @name        Demo: mark page ready
// @match       https://example.com/*
// @run-at      document-end
// @grant       GM_setValue
// ==/UserScript==

(async () => {
  document.body.setAttribute('data-codetweak', 'ready');
  await GM_setValue('lastRun', Date.now());
})();
```

## License

MIT. See `LICENSE.txt`.

## Privacy Policy

- Docs page: `https://mrblankcoding.github.io/CodeTweak/guide/privacy`
- Source page: `docs-src/guide/privacy.md`
