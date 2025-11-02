# CodeTweak

**CodeTweak** is a modern user script manager and JavaScript editor, designed as a modern alternative to Tampermonkey. It is fully open source and built with privacy in mind.

---

## Description

CodeTweak provides full support for **Manifest V3**, offering a modern code editor with linting, formatting, basic autocomplete, and syntax highlighting. It supports all safe GM APIs and URL matching. Users can install scripts directly from **Greasy Fork** and manage them via the dashboard.

We prioritize privacy: **no tracking, no analytics, no selling of user data**. All permissions are only requested for GM API support.

---

## Features

* **Code Editor** — Customizable editor with linting, formatting, autocomplete, and syntax highlighting.
* **GM API Support** — Supports all safe GM APIs.
* **Regex URLs** — Modern regex support for URL matching.
* **Greasy Fork Integration** — Install scripts directly from CodeTweak or the Greasy Fork website.
* **Privacy First** — No tracking, no analytics, only necessary permissions.

---

## Contributing

We welcome contributions from the community! Whether fixing bugs, adding features, or improving documentation, your help is appreciated.

### Development

#### Prerequisites

* Node.js 16+
* npm
* Chrome/Chromium browser

#### Build

```bash
npm install
node build.js
```

---

## TODO List

### Custom API Additions

* [ ] Implement new custom APIs

  * [ ] `GM_download`
  * [ ] `GM_confirm`
  * [ ] Additional APIs as needed

### Security & Permissions

* [ ] Add new security settings
* [ ] Allow scripts to load external resources
* [ ] Enable loading of third-party libraries and external scripts
* [ ] Ask for confirmation when a script runs on a website for the first time
* [ ] Centralize script access permission checks
* [ ] Add better trusted type managment

### Core Improvements

* [ ] Fix version checking logic
* [ ] Add script version checking
* [ ] Add script update functionality
* [ ] Improve `ExternalScriptLoader`
* [ ] Refine `getScriptDescription` function
* [ ] Deduplicate logic between `background.js`, `inject.js`, and `GM_core.js`
* [ ] Unify or reuse declarations between `GM_core` and `inject`

### Editor

* [ ] Reduce editor bundle size (~1.4 MB currently)
* [ ] Split large editor manager files into smaller modules
* [ ] Enhance extension management for CodeMirror
* [ ] Link CodeMirror minimap toggle
* [ ] Move helper functions (`exportScript`, `generateTamperMonkeyHeader`) to separate files
* [ ] Modularize script import logic
* [ ] Add option to toggle execution in main world or isolated world
* [ ] Display execution world and run-at time in editor/dashboard
* [ ] Log script errors and display in editor
* [ ] Add a cap to how long text can be in the editor

### UI

* [ ] Improve URL display formatting
* [ ] Refine CSS for menu commands and import UI
* [ ] Add iframe preview with live refresh
* [ ] Fix editor optimizations
* [ ] Add a cap to how long text can be in the dashboard



### Debugging & Notifications

* [ ] Display script errors directly on page (without console)
* [ ] Add "Debug Mode" to enable in-page error display
* [ ] Separate script notification logic into its own file

### Communication & Helpers

* [ ] Simplify or centralize communication between content scripts and background scripts
* [ ] Optional Trusted Types helpers

---

## Acknowledgments

* Built with [CodeMirror](https://codemirror.net/)
* Inspired by [Tampermonkey](https://www.tampermonkey.net/) and [Greasemonkey](https://www.greasespot.net/)
* Icons from [Feather](https://feathericons.com/)

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE.txt) file for details.
