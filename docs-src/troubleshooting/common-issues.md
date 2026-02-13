# Common Issues

## Script does not run

Check:

1. Script is enabled.
2. URL matches `@match` rules.
3. Run timing is correct.
4. No runtime error in page console.

## GM API returns error

Check:

- API is enabled in script settings.
- Script metadata/grants are correct.
- External resource settings allow what script needs.

## Imported script fails

- Review metadata block.
- Confirm required URLs are reachable.
- Try `document_end` first.

## Dashboard looks wrong

- Reload extension in `chrome://extensions`.
- Hard refresh dashboard tab.
- Rebuild if running unpacked.
