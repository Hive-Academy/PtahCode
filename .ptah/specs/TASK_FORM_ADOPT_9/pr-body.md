## Summary
- Family 2, batch 9 of 10: git-ui (6 files) and review-runs-ui (7 files) move raw DaisyUI form recipes to the form owners (ptah-field, ptahInput, ptahSelect, ptahTextarea, ptahCheckbox).
- Merged origin/main (badge PR #1134) keeping both ptahBadge and the form owners. Baseline regenerated with the audit tool (0 over baseline).
- DOM delta: the commit message in commit-composer now shows a visible floating label (was sr-only). Inputs in review-runs-ui settings drawer and repositories editor are now owner size sm. Wrapper labels in review-runs-ui are replaced by ptah-field labels. Compact git-ui controls are size xs.
- Open question: `toggle toggle-warning` (Pause all publication) stays raw, because ptahToggle has no warning variant.

## Test plan
- `npm run verify -- -p git-ui,review-runs-ui`: lint, typecheck and test passed.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: passed.
- `check-ui-classes.ts`: 0 over baseline.
- Not run: visual check in Electron (focus ring and floating label layout).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
