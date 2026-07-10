## What

<!-- One or two sentences. Link the issue if one exists: Fixes #123 -->

## Checklist

- [ ] `npm test` passes (new backend code has tests)
- [ ] Zero new runtime dependencies, no build step
- [ ] No writes to `~/.claude` data outside the existing opt-in paths
- [ ] No emojis in UI text; monochrome GitHub-style design maintained
- [ ] Catalog-only change? Just the `catalog.json` diff is enough — CI covers the rest
