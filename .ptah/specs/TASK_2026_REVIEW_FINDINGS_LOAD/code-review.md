# Code review — TASK_2026_REVIEW_FINDINGS_LOAD

Verdict: **CHANGES REQUIRED** (1 major, 2 minor)

## Findings

1. **Major — `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts:243`.** The response guard compares only `selectedAttemptId`. Two requests for the same attempt can overlap through Retry, or by closing and reopening the attempt before the first request settles. If the newer request returns first, the older response can overwrite its findings or set `findingsState` to `error`, even though the current request succeeded. The same issue occurs on an A → B → A selection sequence. Give each findings load a monotonically increasing request generation (and invalidate it in `closeRun`); commit a response only when both generation and attempt match. Add a test resolving two loads for the same attempt in reverse order, including an older rejection.

2. **Minor — `libs/frontend/review-runs-ui/src/lib/components/review-findings-table.component.ts:53`.** A valid empty `{ findings: [] }` response reaches the ready state, but the table says “Findings unavailable for this run.” This makes a successful review with zero accepted findings look like a data-loading failure. Show an empty-success message such as “No accepted findings for this run”; keep “unavailable” for the error state at `review-run-detail.component.ts:58`.

3. **Minor — `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:58`.** A transient `review:listFindings` failure displays the error state without a findings retry action. The existing Retry button at line 28 appears only when the separate run-detail request fails, so the user must close and reopen the run to retry findings. Provide a retry action for this state, wired through the page/store, and cover it with a component or page test.

## Checked and correct

- `selectRun` sets `selectedAttemptId` before `loadRun`; opening a list row, run changes, and the run-detail Retry path all reach `loadFindings`. Closing clears findings, and starting a new load clears them synchronously before Angular can show a prior run's rows. Replies for a *different* selected attempt are ignored.
- The request uses `ReviewRpcSchemas['review:listFindings']` for params and result. The shared request helper applies a 5-second timeout. The repository query selects accepted events only; mapping `status: 'accepted'` and `reason: null` matches the current wire contract. The row index makes IDs unique within one payload, and `track finding.id` has no duplicate key for that payload; IDs can change when the payload order changes, with only DOM reuse affected.
- Findings errors produce a fixed message; no raw error or secret is rendered, and the change adds no `console.*`, `any`, `as unknown as`, or `@ts-ignore`. Components retain OnPush, signals, `input()`, and public contract imports.
- The nine added tests cover the basic RPC call, ready/empty/error states, change to a different run, late reply for a different run, row mapping, loading/error rendering, and the list-to-drawer path. They would fail if the RPC call or page binding were removed. They do not cover overlapping loads for the *same* attempt, close/reopen, or findings-only retry.
- The implementer's `fix-report.md` records a successful scoped lint/typecheck/test run for `@ptah-extension/review-runs-ui`. I did not rerun it. `ptah_get_diagnostics` found no errors in the four changed source files; it also reported five BigInt target errors in unrelated shared sibling files, so that diagnostic result is not a clean project verification.

## Five logic questions

1. **Silent failure:** An older same-attempt response can replace a newer success with stale findings or an error state; the request that actually succeeded is then invisible.
2. **User action:** Retry the same run while a previous load is pending, or close and quickly reopen it.
3. **Wrong-answer input:** A successful empty findings array is displayed as “unavailable”; a valid older response for the same attempt can also replace a newer array.
4. **Dependency failure:** RPC rejection, timeout, or invalid result shape is caught and shows a safe fixed error. A late rejection from an obsolete same-attempt request can incorrectly replace a newer ready state.
5. **Unspecified case:** The requested fix did not define same-attempt request ordering or a recovery path for findings-only failure; both affect ordinary retry behavior.
