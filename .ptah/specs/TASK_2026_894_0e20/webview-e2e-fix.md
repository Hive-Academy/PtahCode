# Webview e2e provider-card fix

## Files changed

- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-orchestration.e2e.spec.ts`: updated four scenes to the provider-card DOM. No fixture, page-object, or production component change was needed.
- This report. Existing untracked task-folder files were left intact.

## Old → new selector mapping

| Scene | Old | New | Behavior retained |
| --- | --- | --- | --- |
| Codex model pick | `cli-matrix-model-codex` | `cli-provider-card-codex [data-popover-kind="model"]` | Model picker focus/listbox, one `agent:setConfig`, Saved toast, Undo restores model, and focus returns to trigger. |
| Codex on/off | `cli-matrix-toggle-codex` | `cli-provider-card-codex` checkbox named `Codex enabled` | `disabledClis` write and Undo; disabled model/effort buttons; `ptahCli:update` instance toggle. |
| Codex on/off | `cli-matrix-row-codex` dimming and absent model trigger | Disabled model/effort buttons in `cli-provider-card-codex` | Values remain visible while editing is unavailable. |
| Cursor key save/remove | `cli-matrix-uninstalled` descendant `cli-matrix-credentials-cursor`; `tbody:not(...)` installed trigger | Uninstalled descendant `cli-provider-card-cursor [data-popover-kind="credentials"]`; same card trigger after move to installed grid | Save, status, removal confirmation, collapsed group, focus and Escape. |
| Cursor failed save | `cli-matrix-credentials-cursor` | `cli-provider-card-cursor [data-popover-kind="credentials"]` | Empty Save styling, failure message, key focus/value, Escape and trigger focus. |
| Cursor key removal | Absent `cli-matrix-credentials-cursor` | Absent `cli-provider-card-cursor` | Card leaves DOM after popover closes in collapsed group. |

The matrix container, Uninstalled disclosure, Cursor credential popover, and Ptah CLI instance IDs remain valid. The provider-card hooks come from `cli-provider-card.component.ts`; the disclosure/container come from `cli-orchestration-matrix.component.ts`. `cli-lane-default-cell.component.ts` has no test ID used by these scenes.

## Verification

Command: `npm run verify -- -t lint,typecheck -p @ptah-extension/webview-e2e-harness`

Output tail:

```text
NX   2 tasks: 2 succeeded
Run duration:      8.2s
Cache:             0/2 hit (0%)
Critical path:     8.1s (1 task)
lock released after 15.9s, exit code 0
```

`git diff --check` passed. `ptah_get_diagnostics` found no errors in the edited spec; its standalone compiler context reported eight errors in unrelated sibling files. The required project verification succeeded. E2E was not run locally, as requested.

## Marketplace verdict

Leave `marketplace-visual.e2e.spec.ts` unchanged. `git fetch origin main` succeeded; `git diff main...HEAD --name-only` showed no marketplace source or marketplace harness file changes, and `git log c30174fca..origin/main -- libs/frontend/webview-e2e-harness libs/frontend/marketplace*` had no entries. The CI log shows `catalog-card` nth(2) mark missing only for the VS Code variant (including retry); the Electron variant of the same six-view test passed on this branch. Main's workflow also passes per the task report. This points to a host/timing failure rather than the settings-card selector change; it does not establish a definitive root cause.

The task prompt mentioned Electron e2e selector changes in `git diff main...HEAD -- apps/ptah-electron-e2e`; that diff was empty in this worktree. Card hooks were verified against production templates.

## Decisions

- **Use existing card hooks and accessible checkbox name.** Options: add production test IDs or use existing markup. The card has `cli-provider-card-*`, `data-popover-kind`, and checkbox `aria-label`. Reversible.
- **Assert editing is disabled when Codex is off.** Options: require the old absent button/dimmed row, or assert disabled controls. The card always renders its model button with `[disabled]="!row().interactive"`, and `cli-matrix-rows.ts` sets `interactive` false for disabled system CLIs. Reversible.
- **Leave marketplace untouched.** Options: modify its wait or keep scope to settings. No marketplace path changed in the branch, and the same test passed in Electron. Reversible.

## Proposed Removals

- Old DOM assertions that an off row has no model trigger and has `data-dimmed="true"` cannot apply to the card: model and effort controls remain rendered and disabled, with no `data-dimmed` attribute. The test now checks the retained behavior that editing is unavailable. No RPC, Undo, focus, or Escape assertion was removed.


## Round 2

### Files

- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-visual.e2e.spec.ts`: updated shared ready checks, provider popover interactions, grid/card measurements, and live version/model checks.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-reachability.table.ts`: changed the Codex detection badge reachability check to the card.
- Round 1 changes in `settings-orchestration.e2e.spec.ts` remain intact. Ptah CLI instance selectors in that file and `settings-cli-matrix.entries.ts` remain unchanged.

### Selector and assertion mapping

| Old system CLI/table hook | New card/grid hook | Assertion retained |
| --- | --- | --- |
| `cli-matrix-toggle-codex` (shared ready helper, tab capture, live shape) | `cli-provider-card-codex input[aria-label="Codex enabled"]` | Providers content is ready before captures and later checks. |
| `tr[data-testid^="cli-matrix-row-"]`, `tbody tr`, `thead` | `cli-provider-grid [data-testid^="cli-provider-card-"]`, Codex card `header` | Card height and fold measurements, installed count, zero sideways overflow, collapsed Uninstalled group and reference set. |
| `cli-matrix-model-codex`, `cli-matrix-effort-codex` | Codex card `[data-popover-kind="model"]` / `[data-popover-kind="effort"]` | Model search/listbox focus, effort selection, on-screen popovers and Escape. |
| `cli-matrix-permission-info-codex/copilot`, `cli-permission-popover` | Corresponding card `[data-popover-kind="permission"]`, `cli-provider-popover-content` | Permission content, Copilot auto-approve, sizing, stacking and Escape. |
| `cli-matrix-credentials-cursor` | Uninstalled Cursor card `[data-popover-kind="credentials"]` | Key focus, sizing, stacking and Escape. |
| `cli-matrix-row-${cli} cli-matrix-version` | `cli-provider-card-${cli} cli-matrix-version` | Version labels/titles and alignment with card header name. |
| `cli-matrix-model-antigravity` and child span | Antigravity card `[data-popover-kind="model"]` button | Model ID, title and at-most-two-line constraint. |
| `cli-matrix-row-codex` | `cli-provider-card-codex` | Detection version and Ready badge text. |
| `table-sm` class on matrix | `display: grid` on `.provider-grid` | Layout mode matches redesigned provider cards. |

The full harness search for `cli-matrix-(row|toggle|model|effort|credentials|permission)-` and `tr[data-testid` now finds Ptah CLI instance selectors and shared popover IDs; no stale system CLI use remains. The visual spec uses `capture()` to write screenshots and has no `toHaveScreenshot` baseline assertion. No PNG baseline was changed. Existing capture images may need visual review when CI runs; no baseline regeneration is required for these tests.

### Verification tail

Command: `npm run verify -- -t lint,typecheck -p @ptah-extension/webview-e2e-harness`

```text
NX   2 tasks: 2 succeeded
Run duration:      7.5s
Cache:             0/2 hit (0%)
Critical path:     7.4s (1 task)
lock released after 14.9s, exit code 0
```

`git diff --check` passed. `ptah_get_diagnostics` initially found no new errors in edited lines, while its standalone compiler context reported unrelated errors including a pre-existing issue at `settings-visual.e2e.spec.ts:240`. The final diagnostics request timed out after 45 seconds; the project lint/typecheck command passed after the final edit. E2E was not run under the task's verification rule.

### Decisions

- **Keep the installed reference count.** The first `cli-provider-grid` under `cli-matrix` contains the installed system cards, while the Uninstalled grid is conditionally absent when collapsed. This preserves the five-system/one-instance/two-uninstalled assertion. Reversible.
- **Measure the card layout.** The old table headers, rows and `table-sm` class are gone; the card header, card heights and computed grid display supply equivalent layout evidence. Reversible.

### Proposed Removals

No additional behavioral assertion was removed. Table-specific structure checks were replaced with card/grid checks.


