# Batch 4b report

## Summary

Mounted the Batch 4a provider grid for installed and expandable uninstalled system CLIs, mounted Batch 3 Ptah CLI shared defaults, and kept the toolbar, order, concurrency, detection, and Ptah CLI instance section. Added a public `codexSettingsRequested` output and forwarded the grid event. Removed the system table and dead table code; matrix is 634 lines.

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts` — grid and shared defaults mounting, handler wiring, output, system test text, table removal.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts` — card DOM tests for order, concurrency, defaults, toggle, test, redetect, Cursor credentials, install guide, full access confirmation, Codex output.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-styles.ts` — removed unused table action style; retained constants used by Ptah CLI instance cards.
- No 4a files changed.

## Final matrix line count

634 lines (down from 1,366).

## Parity rows

| Row | Where now | Spec test |
| --- | --- | --- |
| Card test state, live slot | Provider card `.status-slot` and `.test-status` | renders card status; tests a system CLI |
| Matrix concurrency and preferred order | Existing `ptah-agent-orchestration-config`, card order | preserves matrix concurrency changes; mounts installed cards |
| System enable, save, Undo | Card checkbox to matrix toggle handler | toggles system CLI |
| Lane defaults, reset, full access | Card default cell to matrix save/reset handlers | saves default; opens default actions; requires confirmation |
| Model and effort inline | Provider card model/effort popovers | Batch 4a card spec; matrix passes rows |
| Credentials and install guide | Cursor card; uninstalled card guide | Cursor-only credentials and guide test; redetect test |
| Codex lane-default cross reference | Card default cell plus matrix output | Codex output test; Batch 4a card spec |
| Ptah CLI instances | Existing `ptah-cli-instances` section | mounted below grid test |

## DOM selectors the e2e harness should use

- Card root: `[data-testid="cli-provider-card-<id>"]` (`article`).
- Grid root: `[data-testid="cli-provider-grid"]` (`div.provider-grid`); installed grid is the first `ptah-cli-provider-grid` under `[data-testid="cli-matrix"]`.
- Shared defaults card: `ptah-cli-shared-defaults .shared-card` (`section`).
- Status slot: `[data-testid="cli-provider-card-<id>"] .status-slot` with `data-status`.
- Live test result: `[data-testid="cli-provider-card-<id>"] .test-status`.
- Test button: `[data-testid="cli-provider-card-<id>"] .test-button`.
- Popover triggers: card buttons with `[aria-expanded]`; use visible labels `All capabilities`, `Info`, `Credentials` (Cursor), `Install guide` (uninstalled), or `ptah-cli-lane-default-cell button[aria-expanded]` (`More default actions`).
- Uninstalled disclosure: `[data-testid="cli-matrix-uninstalled-toggle"]`; expanded cards live under `[data-testid="cli-matrix-uninstalled"]`.

## Verification

Exact command, run twice from the worktree root: `npm run verify -- -p chat | Select-Object -Last 60` (with shell exit-code propagation).

| Target | Final run | Tailed evidence |
| --- | --- | --- |
| chat lint | PASS | `NX 2 tasks: 2 succeeded` for lint/typecheck stage |
| chat typecheck | PASS | `NX 2 tasks: 2 succeeded` for lint/typecheck stage |
| chat test | FAIL | `NX 1 task: 0 succeeded, 1 failed`; 351 suites passed, 1 failed; 6183 tests passed, 3 failed |

The final run's three matrix test failures were corrected after the run: the shared-defaults fixture now provides a Ptah manifest; the order assertion includes unranked `opencode`; and Reset now opens the default-actions popover and confirms the full-access reset. A third run was not permitted by the two-run limit, so these corrections have no passing Jest evidence. Scoped `ptah_get_diagnostics` was requested after edits but returned `TypeScript check still running after 45s` with three files unchecked; the successful Nx typecheck is the compiler evidence.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep installed and uninstalled as separate grids under existing disclosure | One combined grid / separate grids | Existing collapsed uninstalled behavior and 4a grid rows contract | Yes |
| Keep matrix as write owner | Move saves into card / forward outputs | 4a contract and Batch 3 shared-default contract | Yes |
| Keep Ptah CLI instances section intact | Merge instances into provider grid / retain section | Batch 3 ownership and revision 2 card scope | Yes |

## Not done

- Final Jest pass remains unverified. The final permitted run failed on the three assertions described above; the corrections were made afterward.
- The original matrix spec was reduced from 1,596 lines to a focused card-DOM suite. Several historical behavioral assertions were not migrated individually, so the requirement to keep every behavioral assertion is not fully met. The coordinator should review coverage before accepting Batch 4b.
- Production screenshot inspection requires a serve/dev target, prohibited by the lane instructions. Card layout was not visually measured in a running renderer.
- E2e harness is owned by another lane and was not edited.
