# Install CodeTweak

CodeTweak works in Chrome (and other Chromium browsers such as Edge, Brave, and Opera) and in Firefox 140 or newer.

Installing takes two steps: add the extension, then allow it to run user scripts. Browsers block user scripts by default, so the second step is required.

## Chrome and Chromium browsers

1. Open CodeTweak on the [Chrome Web Store](https://chromewebstore.google.com/detail/codetweak/mlokcilefmfdfpifoifanfbaidpnpgeb) and click **Add to Chrome**.
2. Open `chrome://extensions` in a new tab.
3. Find **CodeTweak** and click **Details**.
4. Turn on **Allow User Scripts**.

::: tip Older versions of Chrome
If you don't see **Allow User Scripts**, your browser is older than Chrome 138. Turn on **Developer mode** in the top-right corner of `chrome://extensions` instead.
:::

Until this setting is on, the CodeTweak popup and dashboard show a red **User scripts are disabled** banner. The **How to enable** button in the banner opens `chrome://extensions` for you.

## Firefox

1. Open CodeTweak on [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/codetweak/) and click **Add to Firefox**.
2. After installing, CodeTweak opens its dashboard with a red **User scripts are disabled** banner.
3. Click **Grant permission** in the banner and accept the prompt.

Firefox asks for this permission separately from the install prompt, so you only need to do it once. If you skip it, the banner stays in the popup and dashboard until you grant it.

## Check that it works

1. Click the CodeTweak icon in your toolbar. Pin it first if it's hidden behind the puzzle-piece menu.
2. The popup opens without a red banner.
3. Continue with [Your first script](/guide/getting-started).

## Updating CodeTweak

The Chrome Web Store and Firefox Add-ons update CodeTweak automatically. Your scripts, settings, and stored values are kept across updates.

## Install manually

You can also install a release by hand, for example to try a version before it reaches the stores.

1. Download `codetweak-chrome.zip` or `codetweak-firefox.zip` from the [GitHub releases page](https://github.com/MrBlankCoding/CodeTweak/releases).
2. Unzip it.
3. Load it:
   - **Chrome:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the unzipped folder. Then turn on **Allow User Scripts** as described above.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select `manifest.json` inside the unzipped folder. Firefox removes temporary add-ons when it restarts.

Manually installed copies don't update automatically.

## Uninstalling

Remove CodeTweak from `chrome://extensions` or `about:addons`. This deletes all of your scripts and their stored data, so use **Export All** in the dashboard first if you want to keep them. See [Dashboard and settings](/guide/dashboard#export-all).
