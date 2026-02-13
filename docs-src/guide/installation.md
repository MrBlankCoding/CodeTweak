# Install CodeTweak

## Chrome Web Store install

1. Open the Chrome Web Store listing.
2. Click `Add to Chrome`.
3. Pin the extension if you want quick access.

## Manual install (developer mode)

1. Build the extension:

```bash
npm install
npm run build:chrome
```

2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select `build/chrome`.

## Update manual install

1. Rebuild:

```bash
npm run build:chrome
```

2. In `chrome://extensions`, click `Reload` on CodeTweak.

## Verify install

- Open the popup.
- Open the dashboard.
- Create a test script.
