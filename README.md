# CodeTweak

**CodeTweak** is a modern user script manager and JS editor designed as a modern alternative to Tampermonkey.

---

## Description
CodeTweak is fully open source and provides support for manifest v3. The code editor offers features like linting, formatting, basic autocomplete, and syntax highlighting. CodeTweak supports all the safe GM APIs, and url matching. Users can also install scripts directly from Greasy Fork and manage them on the dashboard. The extension is also privacy focused and we do not track, collect or sell user data. All permissions are implemented for GM API support.

---

## Features

- **Code Editor** — Edit scripts in a custimisable editor with built in linting, formatting, autocomplete and syntax highlighting. 
- **GM API support** — Supports all safe GM API's
- **Regrex URLS** — Supports modern regexing for URL's
- **Greasy Fork** — Install greasyfork scripts from inside CodeTweak or from the website itself.
- **Privacy** — No tracking, no analytics, no unnecessary permissions.
---


## Contributing
Anyone is welcome


## TODO List

### Custom API Additions

* [ ] Implement new custom APIs

  * [ ] `GM_download`
  * [ ] `GM_confirm`
  * [ ] (Add others as needed)

---

### Security & Permissions

* [ ] Add new security settings

  * [ ] Allow scripts to load external resources
  * [ ] Enable loading of third-party libraries and external scripts
  * [ ] Ask for confirmation when a script runs on a website for the first time
* [ ] Create a centralized file for checking script access permissions on pages

---

### Core Improvements

* [ ] Fix version checking logic
* [ ] Clean and improve `ExternalScriptLoader`
* [ ] Improve `getScriptDescription` function
* [ ] Deduplicate logic between `background.js`, `inject.js`, and `GM_core.js`
* [ ] Unify or reuse declarations between `GM_core` and `inject`

---

### Editor & UI

* [ ] Reduce editor bundle size (currently ~1.4 MB)
* [ ] Split large editor manager files into smaller modules
* [ ] Create a more sophisticated extension management system for CodeMirror
* [ ] Link CodeMirror minimap toggle
* [ ] Move `exportScript` function to a helper file
* [ ] Move `generateTamperMonkeyHeader` to a helper file
* [ ] Move script import management logic to its own file
* [ ] Add setting to toggle whether scripts run in main world or isolated world
* [ ] Display execution world (main/isolated) in the editor
* [ ] Display run-at time on dashboard
* [ ] Improve URL display formatting
* [ ] Clean up and refine CSS for menu commands and import UI

---

### Debugging & Notifications

* [ ] Add feature to show script errors directly on the page (no console needed)
* [ ] Add "Debug Mode" setting to enable the above feature
* [ ] Separate "Show Script Notification" into its own file

---

### Communication & Helpers

* [ ] Simplify or remove redundant communication between content scripts and background scripts (consider centralizing in helper file)
* [ ] Provide optional Trusted Types helpers

---