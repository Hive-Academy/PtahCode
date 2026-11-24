# Batches 3a, 3b, 7, 3c report — TASK_2026_2321_rvusg

Worktree: `D:\projects\PtahCode\.claude-worktrees\review-usage`. I made the batches in this order: 3a, 3b, 7, 3c. Nothing is staged or committed.

## Batch 3a: lane usage type, spawn error and aggregation

Files:
- CREATED `libs/backend/review-core/src/lib/lanes/review-lane-usage.ts`. It holds `ReviewLaneRunUsageSchema` (strict), `ReviewLaneRunUsage`, `UNKNOWN_LANE_RUN_USAGE(partial)`, `ReviewLaneSpawnResult` and `ReviewLaneSpawnError`.
  - The error copies `message` and `name` from the wrapped error and keeps it in `cause`.
  - If the thrown value is not an `Error`, the message is `'Review lane failed'` and the name is `'Error'`. That matches the runner's own fallback.
  - `static from` returns an existing `ReviewLaneSpawnError` unchanged.
- CREATED `libs/backend/review-core/src/lib/usage/review-usage-total.ts`. It holds `StoredLaneRun` and `aggregateReviewUsage`.
  - It follows the rules in plan lines 196-207.
  - A token sum that is not a safe integer, cache sums included, becomes null and sets `tokensPartial`.
  - A cost sum that is not finite becomes null and sets `costPartial`.
- CREATED `libs/backend/review-core/src/lib/usage/review-usage-total.spec.ts`, with 12 cases:
  - one case for each of 3.1 to 3.7;
  - a partial run;
  - a pending run;
  - token saturation at `MAX_SAFE_INTEGER`;
  - cost saturation;
  - 16×17 runs, which gives `runs: 272` and passes `ReviewUsageTotalSchema.parse`.
- MODIFIED `libs/backend/review-core/src/index.ts`. It adds `export * from './lib/lanes/review-lane-usage'` and `export { aggregateReviewUsage, type StoredLaneRun }`.
- The new files import only from `@ptah-extension/review-contracts`, `zod` and each other. They do not import `vscode-core`.

Checks:
- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath …/usage/review-usage-total.spec.ts`: 12/12 passed.

Deviations: none.

## Batch 3b: lane record module

Files:
- CREATED `libs/backend/review-core/src/lib/persistence/review-stage-lane-record.ts`.
  - It now holds `REVIEW_STAGE_LANE_RECORD_VERSION` (still `1`), `LANE_RECORD_PREFIX` and `ReviewStageLaneRecordSchema`. That schema is the former `laneRecordSchema`, moved unchanged.
  - The optional `usage` key has its own strict `safeParse`: `runs` holds at most `REVIEW_STAGE_USAGE_RUNS_MAX` entries, and `overflow?: true`.
  - New types: `ReviewStageLaneDocument` and `ReviewStageLaneRecord`.
  - New functions: `parseStageLaneDocument(text)`, `beginLaneRun(doc)`, `mergeLaneRun(doc, use, run)` and `readStageLaneRecords(db, attemptId)`.
  - `readStageLaneRecords` takes `Pick<SqliteDatabase,'prepare'>`.
- CREATED `libs/backend/review-core/src/lib/persistence/review-stage-lane-record.spec.ts`, with 13 cases:
  - begin then save;
  - begin then save with no run;
  - a save with a null use keeps the stored lane;
  - the latest lane wins;
  - no `usage` key is written when the document never had runs;
  - overflow on begin and on save (F9);
  - interleaved begin/save calls converge;
  - NFR (a): a copied pre-change reader still reads lane, model and fallback;
  - corrupt or absent parse input;
  - with an in-memory `better-sqlite3`: reading and summing per stage, corrupt usage keeps the lane part and counts as one unknown partial run, overflow counts as max+1 runs, and a document whose lane part is unreadable is skipped.
- MODIFIED `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts`. Only the import changed: the constant now comes from the new module and its local definition is gone.
- MODIFIED `libs/backend/review-core/src/lib/persistence/review-query.repository.ts`. Only imports changed:
  - it imports `LANE_RECORD_PREFIX` and `ReviewStageLaneRecordSchema as laneRecordSchema`;
  - the local prefix and schema are deleted, and so are the contract imports nothing used any more;
  - `stageLanes()` itself is unchanged.
- `index.ts`: no new exports, because nothing outside review-core uses these symbols.

Checks:
- jest with the new spec plus `review-query.repository.spec.ts` and `sqlite-review.repository.spec.ts`, which are unchanged: 3 suites passed.

Deviations:
- `LANE_RECORD_PREFIX` also moved into the new module, and the query repository imports it, so the prefix exists in only one place.
- `parseStageLaneDocument` is a helper the batch did not list. B5a will need it to turn stored text into a document before it calls `mergeLaneRun`.
  - If the `usage` value cannot be read, the helper keeps the lane part and stores `{ runs: [], overflow: true }`. The total stays partial, which matches what the reader does.
  - If the lane part cannot be read, the helper returns null, and the next write starts a fresh document.
- `readStageLaneRecords` adds `ORDER BY stage, ordinal` so its output order is fixed (req 3.7).
- Pending entries are written as `UNKNOWN_LANE_RUN_USAGE(true)` with `ended: false`. The aggregation counts them as unknown and partial in any case.

## Batch 7: D20 listing forward

Files:
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane-list.ts`. `ReviewLaneCandidateSchema` is now `ReviewLaneListingEntrySchema.omit({ catalog: true })`. I deleted the `.extend({ defaultModelBlocked })`, because the base schema now has that field. The export names in `index.ts` are unchanged.
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane-listing.service.ts`. Each entry now gets `...(lane.defaultModelBlocked ? { defaultModelBlocked: true } : {})`.
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane-listing.service.spec.ts`. In the first case:
  - a blocked lane now gives `defaultModelBlocked: true`;
  - an unblocked lane has no such key (8.1);
  - `list()` is called once, so the existing count of `modelBlocked` calls still holds.

Checks:
- jest with `review-lane-listing.service.spec.ts`, `review-lane-selection.spec.ts` and `review-lane-selection.service.spec.ts`. The two selection specs are unchanged (8.5). All passed.

Deviations: none.

## Batch 3c: repository workspace folder rule

Files:
- CREATED `libs/backend/review-core/src/lib/context/repository-workspace-folder.ts`. It holds `findRepositoryWorkspaceFolder({ environment, repo, folders, realpath })` and its input type `RepositoryWorkspaceFolderInput`.
  - The body is the old `repositoryRoot` body, copied verbatim, with its degradation-audit comment.
  - `realpath` is passed in. `relative` comes from `node:path`.
- CREATED `libs/backend/review-core/src/lib/context/repository-workspace-folder.spec.ts`, with 5 cases:
  - the checkoutRoot path returns the original folder string;
  - the fallback to `resolve`;
  - a checkout error gives null;
  - a folder whose realpath rejects is skipped;
  - two folders with one match, and no match gives null.
- MODIFIED `libs/backend/review-core/src/index.ts`. It exports `findRepositoryWorkspaceFolder` and `type RepositoryWorkspaceFolderInput`.
- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts`.
  - `repositoryRoot` now calls `findRepositoryWorkspaceFolder({ environment: this.environment, repo, folders: this.workspace.getWorkspaceFolders(), realpath })`.
  - The old body is deleted, and so is the unused `relative` import.

Checks:
- jest `repository-workspace-folder.spec.ts`: passed.
- jest `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.spec.ts`, unchanged: 77/77 passed.

Deviations: none.

## Combined final checks (after all four batches)

- jest, review-core: 8 suites, 80/80 passed. The suites were:
  - `review-usage-total`
  - `review-stage-lane-record`
  - `review-query.repository`
  - `sqlite-review.repository`
  - `review-lane-listing.service`
  - `review-lane-selection`
  - `review-lane-selection.service`
  - `repository-workspace-folder`
- jest, rpc-handlers: `review-rpc.handlers.spec.ts` 77/77 passed.
- `npx tsc --noEmit --project` produced no errors for:
  - `libs/backend/review-core/tsconfig.lib.json`
  - `libs/backend/review-core/tsconfig.spec.json`
  - `libs/backend/rpc-handlers/tsconfig.lib.json`
- `npx eslint` on all 14 changed files: 0 errors and 2 warnings. Both warnings are `'_error' is defined but never used`:
  - one in the moved body, at `repository-workspace-folder.ts:22`, kept verbatim as the batch required;
  - one already in `review-rpc.handlers.ts:472`, which I did not touch.
- Not run, because this brief allows only focused checks: `npm run verify`, nx, build. The coordinator still needs to run the review-core and rpc-handlers inner loop and the gate.

## Out-of-scope observations

- None.
