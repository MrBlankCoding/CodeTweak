# Install from Greasy Fork

1. Open the dashboard and click `Browse Scripts`, or go to [greasyfork.org](https://greasyfork.org/) directly.
2. Find a script and click its **Install** button.
3. CodeTweak intercepts the `.user.js` link and opens the script in the editor.
4. Review the code and metadata, then save to install and enable it.

Installed scripts update automatically from their `@updateURL` / `@downloadURL`. An update that adds grants, sites (`@match`/`@include`), or `@connect` hosts, or a script you have edited locally, is held for review instead of being applied silently.

## Review checklist before enabling

- `@match`: too broad?
- `@grant`: requesting more than needed?
- `@require`: loading external code you trust?
- Network calls: expected domains only?
