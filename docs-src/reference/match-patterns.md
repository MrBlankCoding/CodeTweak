# Match Patterns

Match patterns control where scripts run.

## Common patterns

- Single site: `*://example.com/*`
- Subdomains: `*://*.example.com/*`
- All HTTP(S): `*://*/*`

## Keep scope narrow

Good:

```text
*://github.com/*
```

Risky:

```text
*://*/*
```

## Tips

- Use the smallest scope that works.
- Avoid broad patterns unless required.
- Re-check patterns after importing scripts.
