# CodeTweak

CodeTweak is a Manifest V3 userscript manager with a built-in editor.

- **Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/codetweak/mlokcilefmfdfpifoifanfbaidpnpgeb) · [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/codetweak/)
- **Docs:** [mrblankcoding.github.io/CodeTweak](https://mrblankcoding.github.io/CodeTweak/)

## What it does

- Create, edit, enable, and disable userscripts.
- Run scripts by URL pattern and run timing.
- Support common GM APIs (`GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, etc).
- Import scripts from Greasy Fork.

## Build

```bash
npm ci
npm run build            # Chrome and Firefox
npm run build:chrome     # Chrome only
npm run build:firefox    # Firefox only
```

Output: `build/chrome` and `build/firefox`

- Chrome package: `build/codetweak-chrome.zip`
- Firefox package: `build/codetweak-firefox.zip` (Firefox 140+)

The Firefox manifest is generated from `src/manifest.chrome.json` by
`buildScripts/firefoxManifest.js`, so only the Chrome manifest needs editing.

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

## Credits

CodeTweak uses these open source projects:

- [webcrack](https://github.com/j4k0xb/webcrack) (MIT)
- [CodeMirror](https://github.com/codemirror/dev) (MIT)
