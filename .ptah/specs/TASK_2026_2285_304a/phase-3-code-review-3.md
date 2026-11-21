# Phase 3 final code logic review

**8/10 | REVISE**

N1 and N2 are resolved. Findings 5 and 6 are partially resolved. The fixes cover a missing saved order and a failed guide read-back, but the position announcement and the installed decision can still use incomplete read data. This is the final review round under decision 52. The two residuals should be recorded in the PR body.

## Prior findings

Chat paths are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/`. Core paths are relative to `libs/frontend/core/src/lib/services/`. Harness paths are relative to `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/`.

| Finding | Disposition | Evidence and remaining work |
|---|---|---|
| 5. Reorder settlement | PARTIAL | `cli-orchestration-matrix.component.ts:386` now suppresses the announcement when the post-save refresh omits the order and focuses Done when Reorder is unavailable. `cli-orchestration-matrix.writes.spec.ts:725` covers that branch. The check at `preferred-agent-order-save.ts:16` verifies the order field alone, but the spoken rank at `cli-orchestration-matrix.component.ts:392` also depends on the system and instance membership from `cli-matrix-rows.ts:491`. A successful `ptahCli:list` response with one invalid row drops that row and marks the list partial (`providers-orchestration-schema.ts:56`). For example, after moving C above B in A/B/C/D, a partial refresh that drops A can announce C at 1 of 3. The complete list has C at 2 of 4. A valid order field also leaves the Done fallback gated by the global lane count, so it can miss the case where the moved row disappears and two other lanes survive (`cli-orchestration-matrix.component.ts:397`, `lanes-table.component.ts:426`). **Fix** Require ready membership reads with no `detectedClis` or `cliAgents` missing marker before announcing rank. Base focus fallback on whether a move control could receive focus, and preserve any focus the user already moved. |
| 6. Install-guide Re-detect | PARTIAL | `providers-settings-state.service.ts:838` now tracks pending detection through read-back. The matrix and section button both consult that state (`cli-orchestration-matrix.component.ts:254`, `lanes-redetect-button.component.ts:58`), and the Cursor guide gets it at `lanes-table-detail.component.html:212`. A failed read can restore lost focus to Retry or the matrix without moving a live focus target (`cli-orchestration-matrix.component.ts:618`). The positive installation branch still checks the row before checking readiness (`cli-orchestration-matrix.component.ts:583`). A guide read can publish an installed row while the model read is still pending. If the instance read failed, the user can start Retry during that interval, and `readSection` retains the installed row while setting the orchestration read to loading (`providers-settings-sections.ts:91`, `cli-orchestration-matrix.component.ts:323`). The guide can then close and focus the cached installed row before the newer read confirms it. Shared Re-detect pending state does not govern Retry. **Fix** Require current ready orchestration evidence for the target before taking the installed branch. Treat an in-flight or superseded read as unconfirmed, and cover it with a test where the guide finishes before a later Retry. |
| N1. Detail dismissal steals focus | RESOLVED | The detail-dismissal effect calls `dismiss()` at `lanes-table.component.ts:375`. The queued fallback in `lanes-table-delete-focus.ts:44` runs only when focus is lost. `lanes-table.component.spec.ts:626` verifies that another row’s expander keeps focus when it dismisses the pending confirmation. |
| N2. Version absence check against an unmounted detail | RESOLVED | `settings-visual.e2e.spec.ts:1439` expands each lane and requires its facts container to be visible before checking for zero Version terms. `settings-matrix-detail.ts:7` targets the system row and its expander, and `lanes-table-detail.component.html:8` renders the facts test ID. |

## New Blocking or Serious findings

None identified in the round 2 diff. The residual issues above are continuations of findings 5 and 6.

## Five logic questions

1. **Where can failure look like success?** A valid order field can allow a position announcement from a lane list with a dropped row (finding 5).
2. **Which user action can behave unexpectedly?** Retrying lane reads during a guide run can let the guide close and hand off focus based on the retained row while the newer read is in progress (finding 6).
3. **Which input can produce a wrong answer?** A partial `ptahCli:list` response with an invalid earlier-ranked instance can change both the ordinal and the total in the live region (finding 5).
4. **What happens on dependency failure?** A failed guide read restores focus when it removes the guide. A refresh that omits the order suppresses the position announcement and restores focus to Done (findings 5 and 6).
5. **Which interaction is still missing from the checks?** The added tests exercise the saved-order field and detection-pending signal separately. They do not exercise a valid order with partial membership or a guide read overtaken by an independent Retry (findings 5 and 6).

## Decisions

Reviewed the named endpoints. The diff contains 16 files under `libs` and `apps`, and HEAD has the same tree under those paths as `d95ea6634`. Applied decisions 44–52 and limited new findings to Blocking and Serious regressions attributable to this diff.

## Verification

- All five changed Chat Jest suites passed, 113 tests. Both scoped Core settings suites passed, 133 tests.
- Library TypeScript checks passed for Core, Chat, and the webview e2e harness. Scoped Ptah diagnostics timed out on two attempts, so the library checks used direct `tsc --noEmit`.
- `git diff --check 313cb3017 d95ea6634 -- libs apps` passed.
- Electron behavior and harness selectors were reviewed statically within the lane's execution limits. Angular template compilation, visual captures, and e2e execution remain unverified in this lane.

## Review family

Implementer: claude  
Reviewer: codex
