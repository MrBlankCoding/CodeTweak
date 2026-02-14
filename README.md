# CodeTweak

CodeTweak is a Manifest V3 userscript manager with a built-in editor.

## What it does

- Create, edit, enable, and disable userscripts.
- Run scripts by URL pattern and run timing.
- Support common GM APIs (`GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, etc).
- Import scripts from Greasy Fork.

## Install

### Chrome / Chromium (manual)

```bash
npm install
npm run build:chrome
```

Then:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `build/chrome`.

### Firefox (manual)

```bash
npm install
npm run build:firefox
```

Use the generated package:

- `build/codetweak-firefox.zip`

## Development

```bash
npm install
npm run lint
npm run build:chrome
npm run build:firefox
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
  document.body.setAttribute("data-codetweak", "ready");
  await GM_setValue("lastRun", Date.now());
})();
```

## License

MIT. See `LICENSE.txt`.
