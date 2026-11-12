# Test verification: form controls step 6

## Changes made
- `normalizeText` is no longer exported in `rich-select-list.ts` (`matchesQuery` stays exported).
- Baseline update: `npx nx run ui-class-audit:update-baseline` succeeded.
  Diff: 7 lines removed, 1 line added (a reformatted `btn-xs: 2` line). No count increased.
  Removed tokens: canvas `input`, `input-bordered`, `input-sm`, and `input-preview-block`.
  Token total: 1522 -> 1518.

## Results
| Target | Result |
|---|---|
| ui-class-audit test | PASS (task succeeded) |
| canvas test | FAIL: 112 passed, 0 failed tests. 18 of 29 suites cannot start ("Could not locate module marked", `node_modules/marked/lib/marked.umd.js`). 11 suites passed. |
| ptah-extension-webview test | FAIL: 681 passed, 2 failed (683 tests). 9 of 31 suites cannot start (same "marked" error). 22 suites passed. |
| ptah-extension-webview typecheck-templates | PASS (exit 0) |

## Failed tests (webview)
- `anubis scene state inks > keeps the child ring and ownership tether above 3:1 on the stage`
- `anubis-light scene state inks > keeps the child ring and ownership tether above 3:1 on the stage`
These are contrast tests of scene colors. They are not related to the form control changes.
I did not run them on `main` to confirm they fail there.

## Cannot start
27 suites (18 canvas, 9 webview) cannot start. Cause: environment module error for `marked` in this worktree.
