# L12 brief — fix the webview-e2e CI failures of PR #1419

Worktree (only work here): `D:\projects\ptah-extension\.claude-worktrees\fix-settings-providers-lanes-ae00bbe8bd36`, branch `fix/settings-providers-lanes`.
The `webview-e2e` CI job (Playwright, `libs/frontend/webview-e2e-harness`) failed on head 3546f9bb with 17 failed tests (9 distinct). It passes on main, so this branch caused them.
Failure log (errors, call logs, page text): `.ptah/specs/TASK_2026_2266_a6fd/ci-webview-e2e-3546f9bb.txt`. There are no CI artifacts.
After 3546f9bb, commit 0436f17c0 (lane L11, report `.ptah/specs/TASK_2026_2266_a6fd/L11-polish-report.md`) changed the lanes table again: the row hides an unset effort (editor kept in the expanded detail), detail popovers are allowed whenever the lane is expanded, compact rows hide the subtitle, row actions sit at a fixed position in the Status cell. Read `git diff main...HEAD -- libs/frontend/chat/src/lib/settings libs/frontend/webview-e2e-harness` to see what this branch changed.

Failing tests (file:line of the test):
- `scenarios/settings/settings-orchestration.e2e.spec.ts:246` cell pick: `#lane-detail-codex [data-popover-kind="model"]` never visible/enabled/stable.
- `settings-orchestration.e2e.spec.ts:382` More actions: `expect([2, 4]).toContain(items.count())` got 6.
- `settings-orchestration.e2e.spec.ts:516` Cursor key: card text expected "Needs API key", page shows "Key Sign in".
- `settings-providers.e2e.spec.ts:227` popover provider: option "Kimi Code" not found in `ptah-select-1-listbox` (helper at line ~20).
- `settings-visual.e2e.spec.ts:900` matrix popovers: `[data-testid="cli-provider-card-codex"] [data-popover-kind="model"]` click timeout (line 429).
- `settings-visual.e2e.spec.ts:887` order popover: 'policy bar is one row' height 80 > 48 (line 792).
- `settings-visual.e2e.spec.ts:909` and `:1345` providers fold: a row height 94 > 80 (line 274).
- `settings-visual.e2e.spec.ts:1047` Main Agent popover: "Save to" options differ (line 1158).
- Find any other failure in the log and treat it the same way.

## How to fix
For each failure decide from the code which side is wrong:
- If the product lost a behavior or a text that a user needs (for example the "Needs API key" status text, a reachable model trigger, a one-row policy bar, row height), fix the product code in `libs/frontend/chat/src/lib/settings/**` and keep the assertion.
- If the product changed on purpose in this branch (row actions moved into the Status cell, Actions column removed, ptah-select instead of native select, unset effort editor moved to the detail, compact subtitle hidden), update the spec to the new structure with an assertion of the SAME strength (same count/size/text checks, new locator or new expected value that the new design defines). Never delete, skip, loosen a numeric bound, or make an assertion optional. Explain each spec change in the report.
- The harness has fixtures/state (search `libs/frontend/webview-e2e-harness/src`); use them to work out widths, tiers and data of each scene. Shared helper for ptah-select: `libs/frontend/webview-e2e-harness/src/lib/choose-ptah-select.ts`.

## Hard rules
- Keep every `id`, `data-testid` and `aria-label`. Do not edit `libs/frontend/ui/**/field.component.ts`, ptah-setting-row, ptah-description-list, `advanced-settings-group.component.ts`, `advanced-settings.types.ts`.
- Keep the 8 polish results of L11 (see its report) unless one directly conflicts with a test; then say so.
- ui-class-audit must report 0 over baseline: `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` (never --update-baseline). Prefer component CSS and `var(--ptah-...)` tokens.
- Checks allowed (focused only): `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`, `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json` (or the harness tsconfig that includes the e2e specs), `npx eslint <changed files>`, `npx prettier --write <changed files>`, the audit above. Do NOT run Playwright, `npm run verify`, `nx`, build, serve or e2e.
- Do not commit, push, stash or revert. No user e-mail or Windows user name in any file.

## Deliverable
Write `.ptah/specs/TASK_2026_2266_a6fd/L12-e2e-report.md`: per failing test the root cause, the fix (product or spec, file:line), and why the assertion strength is unchanged; changed files; check results; any failure you could not explain.
