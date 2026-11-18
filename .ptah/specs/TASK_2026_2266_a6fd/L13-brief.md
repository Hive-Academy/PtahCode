# L13 brief — compact Lane cell defects after L12 (PR #1419)

Same worktree, branch and hard rules as `.ptah/specs/TASK_2026_2266_a6fd/L12-brief.md` (focused checks only, no Playwright/verify/nx/build/e2e, keep every id / data-testid / aria-label, ui-class-audit 0 over baseline, no commit/push/stash/revert). L11 and L12 are committed (0436f17c0, 790d6f6e7); keep their results and keep every L12 e2e fix valid (the e2e specs in `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/` must still pass: row model/effort locators reachable at the compact tier, "Needs API key" text, policy bar <= 48 px, connection cards <= 80 px).

Real Electron shots of the current head (look at them): `.ptah/specs/TASK_2026_2266_a6fd/screens/iter10/`
- `providers-system-detail-dark-1168-after.jpg`, `providers-lanes-dark-1168-after.jpg`
- `providers-instance-detail-light-784-after.jpg`, `providers-lanes-light-784-after.jpg`, `providers-lanes-dark-784-after.jpg`
- correct reference at the wide tier: `providers-lanes-dark-1824-after.jpg`

## Defects to fix
1. Compact tier (1168 and 784): in the Lane cell the lane name, the "CLI agent"/"Ptah CLI" chip and the compact model trigger ("CLI default") OVERLAP each other (the name text runs into the chip). Stack them as clean lines with no overlap: name line (icon + name), then chip, then model trigger; or name + chip on one line and the trigger below. Row height may grow a little; no element may overlap another.
2. Compact tier: lane names break inside a word ("Antigravi|ty", "OpenCo|de", "Syntheti|c Lane"). A name must never break inside a word and never show an ellipsis. "Synthetic Lane" may wrap at its space. Give the Lane column the width (for example shrink the Status column / Order column within the readable limits, the Status text "Installed" / "Needs API key" must stay fully visible and the kebab stays at one fixed x). At 784 the table is about 358 px wide (app rails).
3. Compact model trigger text is cut ("Provider defaul" in row 7 at 784). No cut text: let it wrap or use the available width.
4. Detail at 1168 (container width of the detail there is about 730 px): finding 7 wanted two rows — facts LEFT + actions (Test, All capabilities, Info, settings, Edit, Delete) RIGHT, then the capability chips as one full-width row. Today it is one stacked column. Restore that two-row arrangement at this width; keep the stacked layout only for the narrow 784 detail (about 350 px), and keep all five chips on one row at 1824.

## Checks and deliverable
Run the focused jest specs you touch (lanes-table*.spec.ts, lane-row-identity, lanes-table-detail), chat tsc, eslint, prettier, ui-class-audit. Add or adjust unit assertions for no-overlap structure where possible without weakening any. Write `.ptah/specs/TASK_2026_2266_a6fd/L13-compact-report.md`: per defect the cause and fix (file:line), changed files, check results.
