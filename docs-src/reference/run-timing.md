# Run Timing

Run timing decides when a script executes.

## `document_start`

- Earliest injection point.
- Use for early hooks and guards.
- DOM may not be ready.

## `document_end`

- Runs when DOM is ready.
- Best default for most scripts.

## `document_idle`

- Runs after full page load.
- Best for UI work and low priority tasks.

## Recommendation

Start with `document_end`. Move earlier or later only when needed.
