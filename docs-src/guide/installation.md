# Install CodeTweak

## Chrome / Chromium

```bash
npm install
npm run build:chrome
```

Then:

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select `build/chrome`.

## Update after code changes

```bash
npm run build:chrome
```

Then reload the extension from the browser extension page.

## Quick install check

- Popup opens.
- Dashboard opens.
- You can create and save a script.
