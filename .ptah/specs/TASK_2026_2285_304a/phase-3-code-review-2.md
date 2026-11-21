# Phase 3 code logic re-review

**7/10 | REVISE**

Eight findings are resolved and two remain partial. The fixes close all three original blockers. Reorder settlement can still announce a position from an incomplete refresh, and install-guide Re-detect can lose focus or race another detection action. The remaining issues are local to those interactions and have bounded fixes.

## Original findings

Chat paths below are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/`. Harness paths are relative to `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/`.

| # | Disposition | Evidence and remaining work |
|---|---|---|
| 1. Incomplete order overwrite | RESOLVED | `preferred-agent-order-save.ts:16` rejects a non-ready read and the parser's `preferredAgentOrder` missing-field marker. The write boundary checks again, merges against that array, and snapshots the same array for Undo at `preferred-agent-order-save.ts:35`. `cli-orchestration-matrix.component.ts:355` shares the guard with the UI. `cli-orchestration-matrix.writes.spec.ts:562` covers the whole-order payload and inverse, including hidden slots. |
| 2. Full version tooltip (P-42) | RESOLVED | `lane-row-identity.component.ts:155` uses the full accepted probe line as the tooltip suffix and keeps the normalized second line. `lane-row-identity.component.ts:206` uses the short label for process dumps. `settings-visual.e2e.spec.ts:1428` checks the label and tooltip on the identity. |
| 3. Short native behavior notes (P-43) | RESOLVED | `lanes-table-detail.component.html:44` applies the clamp only to notes eligible for the More control at `:51`. The detail's wrap rules at `lanes-table-detail.component.css:46` keep shorter notes readable. |
| 4. Drag across a refreshed list | RESOLVED | `lane-order-drag.ts:67` captures the dragged ID and a copy of the sequence. Both drag-over and drop call the sequence check at `:131`, which clears the drag when the IDs change. |
| 5. Move settlement and announcement | PARTIAL | The explicit outcome and order in `cli-orchestration-matrix.component.ts:378` avoid the stale child-input race, and `lane-order-drag.ts:123` skips announcements on a failed save. The order passed at `cli-orchestration-matrix.component.ts:383` can still come from an incomplete refresh. The commit can verify the field on its first GET, then a second GET during refresh can omit it. `libs/frontend/core/src/lib/services/providers-commit.service.ts:191` verifies the first GET and `:380` refreshes afterward. The normalized empty preferred order then makes `cli-matrix-rows.ts:501` sort by discovery order. For example, moving C up in saved order B/A/C confirms B/C/A, but discovery order C/A/B would announce C at 1 instead of 2. **Fix** Use a verified refreshed projection or carry the commit's confirmed order through settlement. If the refreshed projection is unavailable, suppress the position announcement and keep a focus fallback on Done when neither move control is usable. Cover separate verification and refresh responses. |
| 6. Install-guide Re-detect | PARTIAL | `cli-orchestration-matrix.component.ts:550` blocks a second guide request through read-back, requires an installed row for success at `:563`, and falls back to the matrix when a found row's checkbox is disabled. The incomplete-read branch at `:585` only announces an alert. A failed orchestration GET clears detection data (`libs/frontend/core/src/lib/services/providers-settings-state.service.ts:804`), and the strip's row and popover are destroyed by `lanes-add-more-strip.component.ts:148`. Keyboard focus has no target in that branch. The test titled “keeps the guide open” sets the data to null and only checks that an installed checkbox lacks focus (`cli-orchestration-matrix.component.spec.ts:642`). Section-level Re-detect also uses a separate pending flag (`lanes-redetect-button.component.ts:57`) and can supersede the guide's reads once detection itself settles. The Cursor detail still binds its guide to save busy at `lanes-table.component.html:460` and `lanes-table-detail.component.html:212`. **Fix** Share the full detection lifecycle across the entry points and wait for a current ready orchestration read before making the installed decision. If the guide disappears on a failed read, send focus to Retry or the stable matrix region while preserving focus if the user has already moved elsewhere. |
| 7. Duplicate Delete confirmations | RESOLVED | `lanes-table.component.html:590` mounts one confirmation in the detail footer. `lanes-table.component.ts:367` clears it when the detail closes. `lanes-table.component.spec.ts:587` checks the exact footer Cancel and the return to Delete, and `:626` exercises focus after removal. See new finding N1 for focus when the user dismisses the detail itself. |
| 8. Terminal read failure rendered as loading | RESOLVED | `cli-orchestration-matrix.component.ts:430` derives loading from pending source statuses. Both terminal errors reach the table's alert and Retry at `lanes-table.component.html:91`. `cli-orchestration-matrix.component.ts:440` requires both reads to be ready and no lane read error before rendering the empty copy. |
| 9. Instance and Tiers reachability locators | RESOLVED | `settings-cli-matrix.entries.ts:65` uses the expander, rendered by `lanes-table.component.html:435`. The group and kind selectors at `:250` match `lanes-table.component.html:129` and `:178`. The detail-footer locator at `settings-cli-matrix.entries.ts:694` matches `lanes-table-detail.component.html:237` and is reused for focus return at `settings-cli-matrix.entries.ts:739`. |
| 10. Reorder with fewer than two lanes | RESOLVED | `cli-orchestration-matrix.component.ts:355` counts only numbered installed rows. `lanes-section-header.component.ts:51` leaves Done enabled even if the count drops, covered at `cli-orchestration-matrix.writes.spec.ts:676`. |

## New findings

### Blocking

None in the fix diff.

### Serious

None beyond the two partially resolved original findings.

### Minor

1. **N1. Dismissing a detail with Delete pending can move focus away from the expander the user just activated.** The new effect at `lanes-table.component.ts:367` calls `deleteFocus.cancel()` when the user collapses that detail or opens another one. `lanes-table-delete-focus.ts:34` queues unconditional focus to the captured actions trigger. For example, activating lane B's expander while lane A's confirmation is open opens B, then moves focus to A's More actions button. The explicit Cancel flow still correctly returns to Delete. **Fix** Clear the captured targets without restoring focus when detail dismissal came from another control. If dismissal removes the focused element, restore only after checking that focus was lost. Test a switch to B with keyboard focus on its expander.
2. **N2. The new live-shape assertion for duplicate version text passes with the detail closed.** `settings-visual.e2e.spec.ts:1437` expects zero Version facts without opening the detail. Its content is mounted only when expanded (`lanes-table.component.html:452`), so a reintroduced Version fact in the detail would pass this check. **Fix** Expand each detail, assert the facts container is visible, then check that it contains no Version fact.

## Five logic questions

1. **How does this fail silently?** A successful write can be followed by an incorrect spoken position when only the follow-up UI refresh drops the order field (finding 5).
2. **What user action produces unexpected behavior?** Opening a different lane's detail while Delete is pending can send keyboard focus back to the first lane (N1).
3. **What input produces a wrong answer?** A ready orchestration response with a missing or malformed order field now blocks another write, but its normalized empty list can still supply the wrong post-save position (findings 1 and 5).
4. **What happens when a dependency fails?** A terminal initial failure shows Retry and a failed guide read-back reports an alert. If that read-back removes the guide's row, it can also remove the active focus target (findings 6 and 8).
5. **What interaction is missing from the checks?** Guide and section Re-detect actions can overlap during read-back, when the shared detection RPC status has already settled (finding 6).

## Decisions

- Used the two supplied commit endpoints. The named diff contains 17 source and test files, and the later HEAD has the same `libs` and `apps` tree as `313cb3017`.
- Used the rulings in `decisions.md` entries 44–51 and scoped review findings to the original ten and the fix diff. Electron focus and harness selectors were reviewed from source within the lane's execution limits.

## Verification

- All six changed chat Jest suites passed independently, 148 tests total.
- Scoped library TypeScript checks passed for chat and the webview e2e harness.
- Scoped Ptah diagnostics found no errors in the three requested implementation and harness files and reported 382 errors in project siblings. The implementer's fix report records the check against its spec baseline.
- `git diff --check 23a3d643f 313cb3017 -- libs apps` passed.
- Angular template compilation and live Electron and e2e interactions remain unverified. The selectors, render conditions, state transitions, and focus targets were traced statically.

## Review family

Implementer: claude  
Reviewer: codex
