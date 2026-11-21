# Choosing sites

`@match` lines decide which pages a script runs on. A script needs at least one, and you can add as many as you like.

```javascript
// ==UserScript==
// @match https://github.com/*
// @match https://gist.github.com/*
// ==/UserScript==
```

You can also set these in the editor under **Execution Settings → Target URLs**.

## Pattern format

A pattern has three parts: `scheme://host/path`.

| Part   | Write           | Matches                                                       |
| ------ | --------------- | ------------------------------------------------------------- |
| Scheme | `https`         | Secure pages only.                                            |
|        | `http`          | Insecure pages only.                                          |
|        | `*`             | Both `http` and `https`.                                      |
| Host   | `example.com`   | That site only. `www.example.com` is a different host.        |
|        | `*.example.com` | `example.com` and every subdomain, such as `www.example.com`. |
|        | `*`             | Every site.                                                   |
| Path   | `/*`            | Every page on the site.                                       |
|        | `/watch*`       | Pages whose path starts with `/watch`.                        |
|        | `/docs/*/edit`  | Paths like `/docs/123/edit` and `/docs/a/b/edit`.             |

In the path, `*` matches any characters, including `/`.

## Common patterns

| Goal                          | Pattern                      |
| ----------------------------- | ---------------------------- |
| One site                      | `https://example.com/*`      |
| A site and all its subdomains | `https://*.example.com/*`    |
| One section of a site         | `https://example.com/blog/*` |
| One exact page                | `https://example.com/about`  |
| Every website (use with care) | `*://*/*`                    |

## Shortcuts CodeTweak accepts

To make older scripts work, CodeTweak fixes up a few common forms:

- A pattern with no path, such as `https://example.com`, becomes `https://example.com/*`.
- A pattern with no scheme, such as `example.com/*`, becomes `*://example.com/*`.
- Tampermonkey-style schemes such as `http*://` become `*://`.

Patterns that still aren't valid are ignored. If a script runs nowhere, check its patterns first.

## Regular expressions with @include

`@include` works like `@match`, but also accepts a regular expression between slashes. It's matched against the full address, ignoring case:

```javascript
// @include /^https:\/\/(www\.)?example\.(com|org)\/item\/\d+/
```

Prefer `@match` when you can. It's faster and easier to read.

## Excluding pages

`@exclude` skips pages even if they match. It accepts:

- wildcards, where `*` matches anything and `?` matches one character: `@exclude https://example.com/admin/*`
- a regular expression between slashes: `@exclude /\/settings(\/|$)/`

## Pages scripts can't run on

Browsers don't allow extensions to run scripts on:

- browser pages such as `chrome://` and `about:` pages;
- other extensions' pages;
- the Chrome Web Store and Firefox Add-ons websites.

## Keep it narrow

Every page a script runs on is a page it can read and change. Use the narrowest pattern that does the job: `https://github.com/*` rather than `*://*/*`.
