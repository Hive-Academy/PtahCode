# Fix report — Reviews run detail never loads findings

Status: done. Scoped verify passed for the changed project.

## Root cause

- The backend registers `review:listFindings`
  (`libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:302`;
  params `{ attemptId }`, result `{ findings: ReviewFinding[] }`, and an empty
  list for an unknown attempt at `:306`), but no frontend file called it.
- The run detail's `findings` input
  (`libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:72`)
  defaulted to `[]`, and the page never bound it
  (`libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:220-227`),
  so the Findings section always showed the table's empty message
  "Findings unavailable for this run.". The earlier visual review
  `TASK_2026_890_e3a7/pages-w3-report.md` had already noted the missing binding.

## Changes

| File | Change |
| --- | --- |
| `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts` | New `findings` signal (validated `ReviewFinding[]`) and `findingsState` (`'loading' \| 'ready' \| 'error'`). `loadRun` now also fires a new private `loadFindings(attemptId)`, which calls `review:listFindings` through the store's existing `request()` helper (zod params parse, result parse, 5 s timeout) and ignores a late reply for a different run via the same `selectedAttemptId()` guard `loadRun` uses. `closeRun` clears the findings. `'review:listFindings'` joined the `request` method union. |
| `libs/frontend/review-runs-ui/src/lib/components/review-findings-table.component.ts` | New exported pure `reviewFindingRows()` maps a validated payload onto `ReviewFindingRow` rows. |
| `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts` | `findings` input now takes the raw validated `ReviewFinding[]`; new `findingsState` input; `findingRows` computed maps through `reviewFindingRows()`; the Findings section shows "Loading findings…" (`role="status"`) and "Findings are unavailable." (`role="alert"`) around the unchanged table. |
| `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts` | Binds `[findings]="store.findings()"` and `[findingsState]="store.findingsState()"` on `ptah-review-run-detail` — the missing wiring that caused the bug. |

No backend, contract, or shared change.

## Tests added

- `review-runs.store.spec.ts` (5): `review:listFindings` called with the selected
  run id and the 5 s timeout; an empty list reports `'ready'`; a run change
  triggers a new load with the new id; a late response for a previously
  selected run is ignored; a findings failure sets `findingsState` `'error'`
  while the run detail stays `'ready'` and no raw error text is stored.
- `review-run-detail.component.spec.ts` (2): findings render (severity,
  `path:line`, status, confidence); loading and error states render without
  the table and without raw errors.
- `review-findings-table.component.spec.ts` (1): `reviewFindingRows()` maps the
  payload onto unique accepted rows with `reason: null`.
- `review-runs-page.component.spec.ts` (1): opening a run from the list calls
  `review:listFindings` with that attempt id and renders the finding in the
  drawer — the end-to-end regression test for this bug.

## Verify command + result

Command (from the worktree root):

```
npm run verify -- -p @ptah-extension/review-runs-ui
```

Result (summary lines):

```
[verify] starting verify lint,typecheck (@ptah-extension/review-runs-ui)
 NX   2 tasks: 2 succeeded   (Run duration: 24.0s, Cache: 0/2 hit)
[verify] starting verify test (@ptah-extension/review-runs-ui)
 NX   1 task: 1 succeeded     (Run duration: 31.4s, Cache: 0/1 hit)
[verify] lock released after 86.1s, exit code 0
```

Both phases ran for exactly the one requested project; all targets
succeeded; no check was skipped.

## Decisions

- **Mapping location:** the store holds the raw validated `ReviewFinding[]`;
  the run-detail component maps them to `ReviewFindingRow` via
  `reviewFindingRows()`, exported next to the row type. Options considered:
  map in the store (would make the store import a component file and hold
  presentation state) vs map in the detail component. Evidence: `loadRun`
  already keeps the store domain-shaped with a validated `ReviewRun`; the
  row type and its presentation decisions belong to the table component file.
  Reversible with a small move.
- **Row `status` is always `'accepted'`, `reason` is always `null`:** the RPC's
  repository query (`libs/backend/review-core/src/lib/persistence/review-query.repository.ts:110-111`)
  selects only `kind = 'accepted'` events, and the wire schema has no
  id/status/reason fields, so `id` is derived from lens, path, line, and the
  payload order to keep `@for` tracking unique. Suppressed findings remain a
  later task.
- **Pagination:** the `review:listFindings` result schema
  (`libs/backend/review-contracts/src/lib/review-rpc.schema.ts:70-75`) has no
  `nextCursor`, so nothing is ignored or broken today; pagination stays
  untouched for the later task.
- **Reload trigger:** findings load inside `loadRun`, not only `selectRun`, so
  the drawer's existing Retry reloads findings too. Findings failure never
  fails the run detail — the states are independent.
- **State markup:** the Findings section reuses the page's existing state
  pattern (`role="status"` loading text, `role="alert"` error text, muted
  text classes) instead of new components or styles.

## Clarifications Needed

- None.
