# Chrome Web Store Listing — CodeTweak

> Last Updated: 2026-11-21

## Store Listing

**Extension Name** [REQUIRED]
CodeTweak

**Short Description** [REQUIRED]
Create and manage custom JavaScript scripts for any website.

**Detailed Description** [REQUIRED]
Customize and automate your web browsing experience with CodeTweak.

CodeTweak is a clean, modern user script manager that lets you write, install, and run custom JavaScript on any website. Modify page styling, automate repetitive clicks, remove unwanted elements, or enhance websites with your own custom features.

Key features:

- Full-featured script editor with syntax highlighting, auto-completion, and error checking
- Visual element selector to pick elements on any page and generate code instantly
- Easy script management dashboard to toggle, search, organize, and export scripts
- Automatic updates for installed scripts to keep your tools up to date
- Snapshot history before saves so you can roll back unwanted changes anytime
- Built-in script deobfuscation helper to analyze compressed scripts safely
- Dark mode theme and customizable editor appearance

How to use CodeTweak:

1. Click the CodeTweak extension icon in your browser toolbar.
2. Click "New Script" to open the built-in editor, or install user scripts from popular script repositories.
3. Define matching websites using standard URL patterns.
4. Write your custom logic and click Save. CodeTweak will run your script automatically whenever you visit matching sites.

Privacy and security:
CodeTweak does not collect, track, or transmit your personal data or browsing activity. All scripts, settings, and snapshots are stored locally on your device.

Support and feedback:
Found an issue or want to request a feature? Report issues or contribute at https://github.com/MrBlankCoding/CodeTweak/issues.

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Create and run custom user scripts to customize web pages.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset                      | Dimensions   | Status   | Filename                                   |
| -------------------------- | ------------ | -------- | ------------------------------------------ |
| Store Icon [REQUIRED]      | 128×128 PNG  | ✅ Ready | `src/assets/icons/icon128.png`             |
| Small Icon                 | 16×16 PNG    | ✅ Ready | `src/assets/icons/icon16.png`              |
| Medium Icon                | 48×48 PNG    | ✅ Ready | `src/assets/icons/icon48.png`              |
| Large Icon                 | 512×512 PNG  | ✅ Ready | `src/assets/icons/icon512.png`             |
| Promo Tile                 | 1280×640 PNG | ✅ Ready | `src/assets/icons/icon1280x640.png`        |
| Screenshot 1 [REQUIRED]    | 1280×800 PNG | ✅ Ready | `screenshots/01-dashboard-scripts.png`     |
| Screenshot 2 [RECOMMENDED] | 1280×800 PNG | ✅ Ready | `screenshots/02-editor-code.png`           |
| Screenshot 3 [RECOMMENDED] | 1280×800 PNG | ✅ Ready | `screenshots/03-editor-script-details.png` |
| Screenshot 4               | 1280×800 PNG | ✅ Ready | `screenshots/04-popup-on-wikipedia.png`    |
| Screenshot 5               | 1280×800 PNG | ✅ Ready | `screenshots/05-editor-error-log.png`      |

### Screenshot Notes

- Screenshot 1: Dashboard overview displaying installed scripts, search, and status toggles.
- Screenshot 2: In-browser code editor with syntax highlighting and action toolbar.
- Screenshot 3: Script settings panel showing target URLs, execution rules, and API permissions.
- Screenshot 4: Extension toolbar popup running on a webpage showing active scripts and quick actions.
- Screenshot 5: Error inspection log showing runtime script feedback for debugging.

---

## Permissions Justification

| Permission                  | Type             | Justification                                                                                          |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `storage`                   | permissions      | Stores user scripts, editor settings, and dependency cache locally on device.                          |
| `unlimitedStorage`          | permissions      | Prevents quota errors when storing large user scripts, snapshots, and third-party libraries.           |
| `tabs`                      | permissions      | Reads the active tab URL to display matching user scripts and script count badges in the toolbar icon. |
| `scripting`                 | permissions      | Injects the visual element selector overlay on web pages when initiated from the context menu.         |
| `contextMenus`              | permissions      | Adds a "Select Element for Script" right-click menu item to assist users in selecting page elements.   |
| `notifications`             | permissions      | Enables user scripts to display desktop notifications for user alerts.                                 |
| `offscreen`                 | permissions      | Hosts an offscreen document to handle background clipboard writing without interrupting active pages.  |
| `clipboardWrite`            | permissions      | Allows user scripts to copy text to the system clipboard upon user command.                            |
| `downloads`                 | permissions      | Allows user scripts to save exported files and download resources directly.                            |
| `userScripts`               | permissions      | Registers and executes user-provided scripts in the browser user script environment.                   |
| `alarms`                    | permissions      | Runs periodic background checks to detect and apply updates to installed scripts.                      |
| `http://*/*`, `https://*/*` | host_permissions | Enables user scripts to run on any website explicitly targeted by the user's scripts.                  |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

All scripts, settings, cache, and history remain strictly on the user's local machine using local browser storage. No analytics, tracking, or user information is collected or transmitted off-device.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used or transferred for purposes unrelated to the extension's core functionality
- [x] Data is NOT used or transferred to determine creditworthiness or for lending purposes

---

## Version History

| Version | Date       | Changes                                                                                                                                               |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1.0   | 2026-11-21 | Sandbox deobfuscator evaluation under MV3 CSP, background async message handling refactor, persistent badge color state, and CWS publishing metadata. |
