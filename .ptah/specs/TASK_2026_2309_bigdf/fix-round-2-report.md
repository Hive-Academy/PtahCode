# Fix round 2: TASK_2026_2309_bigdf

Scope: decisions.md D9. This round fixes all three findings from the PR #1482 review: cancellation/deadline (Major), incremental fallback (Major) and the oversized section (Minor).

## Changes

### libs/backend/review-contracts/src/lib/github-review.port.ts (the port, L63-65)
- `getPull(repo, number, signal?: AbortSignal)` and `getDiff(repo, number, sha, signal?: AbortSignal)`. Both parameters are optional and additive. The only production implementation is `GithubReviewAdapter`. The fakes are `jest.fn()` objects: `review-orchestrator.service.spec.ts:64`, `discovery-stage.runner.spec.ts:21`, `dry-run-fixture.spec.ts:71` and `github-review-publication.adapter.spec.ts:42`. They needed no change. Other `getPull` callers keep their 2-argument calls: `review-orchestrator.service.ts:296`, `github-review-publication.adapter.ts:100`, `review-rpc.handlers.ts:274/443` and `phase-2-libraries.ts:534`.

### libs/backend/review-github/src/lib/github-review.adapter.ts
- L123-135: new `aborted()`, which returns `GitHubReviewError('timeout', 'GitHub request aborted')`. This uses the existing timeout code. The classifier maps it to `unknown`, which is retryable, the same as today's request timeout. It is not `diff-too-large`. New `delay(ms, signal)` is a backoff that rejects with `aborted()` on abort and removes its listener and timer.
- L164-187 `request(path, accept, etag, signal?)`: each attempt checks `signal.aborted` first. The fetch uses `AbortSignal.any([controller.signal, signal])`, which combines the signal with the existing 15 s per-request timer. In the catch, a caller abort is reported before a timeout, as `aborted()`. L207: the 5xx retry backoff is now `delay(..., signal)`.
- L250-251 `getPull(..., signal?)`, L255-267 `getDiff(..., signal?)`: the signal goes to `getPull`, the diff request, the files request and `diffFromFiles`.
- L273-297 `diffFromFiles(base, signal?)`: every page request carries the signal, so pagination stops at the next request after an abort. Minor fix at L297: a section larger than the remaining byte budget now sets `truncated = true` and is skipped with `continue`. Before, it ended pagination. `usable` is still set only by a section that is actually added.

### libs/backend/review-core/src/lib/stages/context-stage.runner.ts
- L96-102: `getLastReviewedHead` now runs before the diff. The diff comes from `fullDiff(claim, previousHead, workSignal)`, and `baseSha = diff ? diff.baseSha : await this.pullBase(claim, workSignal)`. `baseConfig` uses that `baseSha`.
- L111-113: `fullPatch = diff?.patch ?? ''` feeds `reviewPatch` and `changedPaths`. The incremental diff is always present when `diff` is null.
- L126-127: `baseSha` is returned. Coverage is `diff-complete` (the incremental diff is complete for its scope) plus a new informational entry `diff-full-unavailable` when the full diff was missing. `diff-truncated` keeps its old meaning.
- L135-154 new private `fullDiff`: calls `getDiff` with `workSignal`. On error:
  - if `workSignal` is aborted, it throws `Error('Review context aborted', { cause })`. This is the same message as `check()`, so a deadline or cancel ends on today's context abort/deadline path.
  - if the error is `code === 'diff-too-large'` (code checked, not message) and `previousHead` exists, it returns null.
  - otherwise it rethrows, so `diff-too-large` stays non-retryable when there is no baseline.
- New private `pullBase`: `getPull(..., signal)`. It throws `Error('Pull request head changed')` when the head moved, which is retryable and gets superseded. It returns `baseSha`.

### Specs
- `github-review.adapter.spec.ts` L212 (new): page 1 has a section of about 6M `é`, which is 12 MB in UTF-8 and over the budget. Page 2 has a small patch. The result is exactly the small patch, `truncated: true`, with no throw.
- L225 (new): the signal aborts while files page 1 is returned. The call rejects with `{ code: 'timeout', message: 'GitHub request aborted' }` after exactly 3 fetches. The fetch saw the combined signal as aborted.
- L283 (new): a 503 followed by an abort during the backoff makes `getPull` reject with the abort error after 1 fetch.
- `context-stage.runner.spec.ts` L85-126 (new `full diff unavailable` block): with a prior head, the review proceeds on `incremental patch`. `baseSha` comes from `getPull`, and both `getDiff` and `getPull` received an `AbortSignal`. Coverage starts with `['diff-complete', 'diff-full-unavailable']`. With no prior head, the run rejects with `{ code: 'diff-too-large' }` and `getPull` is not called.

## Verification
- `npx jest --config libs/backend/review-github/jest.config.ts --runInBand --coverage=false --runTestsByPath .../github-review.adapter.spec.ts .../github-review-publication.adapter.spec.ts` → 2 suites, 50 passed. Log: `.ptah/tmp/bigdf-fix2-gh.log`.
- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath` context-stage.runner, review-orchestrator.service, discovery-stage.runner and dry-run-fixture specs → 4 suites, 31 passed. Log: `.ptah/tmp/bigdf-fix2-core.log`.
- `npx tsc --noEmit` with tsconfig.lib.json and tsconfig.spec.json for review-github, review-core and review-contracts → all 6 exit 0.
- `npx eslint` on the 5 changed source and spec files → exit 0 with 0 problems. One `preserve-caught-error` warning was fixed by adding `cause`.
- Not run, per the brief: `npm run verify`, nx, builds, git. Consumers outside these libs (rpc-handlers, ptah-electron) were not type-checked. They call `getPull` with 2 arguments, which the optional parameter keeps valid.

## Decisions
- An abort uses the existing `timeout` GitHubReviewError code with the message "GitHub request aborted", and does not add a new code. In the context stage, an aborted `workSignal` is turned into today's context-abort error. Easy to reverse.
- Coverage: a new entry `diff-full-unavailable` sits next to `diff-complete`, so the review is not marked `partial`. The only coverage consumers that match exact values are `review-orchestrator.service.ts:246` and `publication-stage.runner.ts:81`, and both look only for `diff-truncated`, so none needed an update. The reason: an incremental review normally reports `diff-complete`, and with a baseline the full diff was not the review input anyway. Easy to reverse.
- `getLastReviewedHead` moved before `getDiff`. It is a local repository read with no side effects.

## Out of scope
- `getDiff` still runs on incremental reviews (D8 item 2), and `prompt-too-large`/`head-missing` are still not non-retryable. Both are unchanged, as D8 records.
