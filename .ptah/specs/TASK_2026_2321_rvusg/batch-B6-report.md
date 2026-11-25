# Batch 6 report: PR comment usage line

Tasks 6.1 and 6.2. Both are implemented. Nothing is committed yet.

## Changes

- `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts`
  - New export `renderUsageLine(usage)`.
  - It prints `Usage: unavailable` when the usage is null or `totalTokens` is null.
  - Otherwise it prints `Usage: [≥ ]N tokens (input X · output Y · cache read Z · cache write W)`. Only the known split entries are listed. Numbers use a module-level `Intl.NumberFormat('en-US')`.
  - The function never reads `costUsd` or `costPartial`.
  - `renderSummary` takes a new trailing argument, `usage: ReviewUsageTotal | null = null`.
- `libs/backend/review-core/src/lib/publication/review-publication.service.ts`
  - The `publish` options gain `usage?: ReviewUsageTotal | null`, which is passed on to `renderSummary`.
- `libs/backend/review-core/src/lib/stages/publication-stage.runner.ts`
  - New private method `runUsage(attemptId)`.
  - It returns `aggregateReviewUsage` over every run of `readStageLaneRecords(this.sqlite.db, attemptId)`, or null when there is no SQLite.
  - Its result is passed as `options.usage` to `publish`.
  - It is evaluated only when publication actually runs (`this.publication && triage`).
- `review-markdown.renderer.spec.ts`: 5 new tests.
  - Exact line with no "≥" when tokens are known and the cost is unknown (5.1).
  - "≥ " and only the known split entries when tokens are partial.
  - A known cost of 12.75 leaves no `$`, `USD` or cost digits (5.3).
  - Null, and a null total, give `unavailable` (5.2).
  - The same input gives an identical string (5.4).
- `publication-stage.runner.spec.ts`: 1 new test.
  - It uses a real in-memory DB with migrations 65 and 66, and lane documents for the triage and lens stages, one of them with an unknown input count.
  - It asserts the `options` passed to a spied `publish`: `{ diffTruncated: false, usage: { …, totalTokens: 1833, tokensPartial: true, runs: 3 } }`.

## Outbox retry

`PublicationOutboxService` stores only `request_hash` on the first `plan` (`ON CONFLICT DO NOTHING`), and it resends the overview that the caller passes in. A retry builds the body again from the same stored lane records, and the output is deterministic: aggregation runs in a fixed SQL order, and the formatter has a fixed locale. So the body stays stable as long as the lane records do not change between attempts of the same publication. No outbox change was needed.

## Checks

- `node scripts/verify.mjs --exec --task b6-jest -- npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the renderer, publication-stage runner, review-publication service and publication-outbox service specs: 4 suites and 41 tests passed.
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.spec.json` (under the lock): exit 0, no errors.
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.lib.json` (under the lock): exit 0, no errors.
- `npx eslint` on the 5 changed source and spec files: exit 0, clean.
- `npm run verify` and nx were not run, as the brief required. The coordinator runs them after B5a lands.

## Deviations

None. The plan put the usage computation inline. Instead it sits in a small private helper, `runUsage`, so that the `publish` call stays readable.
