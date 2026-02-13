# Strict Sites

Some pages have strict policies and complex script loading.

## What to try

1. Use `injectInto: default` so CodeTweak can fall back between worlds.
2. Keep `@require` dependencies minimal.
3. Use `document_end` before moving to `document_start`.
4. Test features one by one.

## Common causes

- Script assumes globals that are not ready.
- External dependency fails to load.
- Site blocks or changes expected DOM timing.

## Debug checklist

- Enable `Enhanced Debugging` in settings.
- Check script error logs in editor.
- Confirm target URL and run timing.
