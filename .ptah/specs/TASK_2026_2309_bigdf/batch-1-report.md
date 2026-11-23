## Backend implementation — `TASK_2026_2309_bigdf`, batch B1 (GitHub issue #1457)

**Tasks completed**: B1 changes 1-4 (keep the GitHub error body, fall back to the files endpoint, non-retryable `diff-too-large`, tests).

### Changes

- `libs/backend/review-github/src/lib/github-review.error.ts:3` — new error code `diff-too-large`.
- `libs/backend/review-github/src/lib/github-review.error.ts:11-13` — optional `status` (the HTTP status) and `reasons` (GitHub `errors[].code`) fields on `GitHubReviewError`. They come after `retryAt`, so existing calls are unchanged.
- `github-review.adapter.ts:43` — `filesSchema` accepts `previous_filename`.
- `github-review.adapter.ts:66-72` — `FILE_PAGES = 30` and `githubErrorSchema`, a zod schema for the `{message, errors[].code}` body.
- `github-review.adapter.ts:94-106` — `githubErrorDetail()` handles the error body:
  - It never throws on a body that is not JSON or does not match the schema.
  - It replaces URLs with `[url]`, collapses whitespace and cuts the message at 200 characters.
  - It keeps at most 5 reason codes and only codes that match `^[a-z_]{1,40}$`.
- `github-review.adapter.ts:108-116` — `fileSection()` writes one file as a `diff --git a/<old> b/<new>` section:
  - A renamed file also gets `rename from` / `rename to` lines.
  - An added file gets `--- /dev/null`; a removed file gets `+++ /dev/null`.
  - The patch always ends with a newline.
  - The format matches the regexes downstream: `context-stage.runner.ts:110` (changedPaths), `changedExports` and `diff-stats.ts`.
- `github-review.adapter.ts:188-192` — `request()` now puts the GitHub message on a non-OK response: `GitHub returned HTTP <status>: <message>`, with `status` and `reasons` attached. The 401, 403, rate-limit and 5xx retry branches run first and are unchanged.
- `github-review.adapter.ts:236-243` — `getDiff()` falls back to `diffFromFiles()` only on a 406 whose reasons include `too_large`. Any other failure is re-thrown.
- `github-review.adapter.ts:251-282` — `diffFromFiles()` reads `/files?per_page=100&page=N` and follows the `link` next pages. It stops on a page cycle and reads at most 30 pages.
  - It sets `truncated` when a file has no patch, when a next page remains after 30 pages, when page 30 is full (GitHub stops at 3000 files without a next link), or when the next section would exceed `MAX_BYTES`. In that last case it stops adding sections.
  - It throws `GitHubReviewError('diff-too-large', "Diff exceeds GitHub's 20,000-line limit")` when no file has a usable patch.
- `libs/backend/review-core/src/lib/review-failure.ts:7` — `REVIEW_FAILURE_CODES` gains `diff-too-large`; `NON_RETRYABLE_REVIEW_FAILURE_CODES` is re-exported from here.
- `libs/backend/review-core/src/lib/review-failure.ts:24` — `classifyReviewFailure` maps `code === 'diff-too-large'` to the new failure code.
- CREATED `libs/backend/review-core/src/lib/review-failure-retry.ts` — `NON_RETRYABLE_REVIEW_FAILURE_CODES = ['diff-too-large']`. It is a separate file so the repository can read the list without importing the classifier, which imports stage and worktree modules.
- `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:9` — imports the list.
- `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:248-255` — `release()` handles a non-retryable failure (this is the retry decision):
  - On `failed`, it reads the attempt's saved `failure_code`. The orchestrator saves it before `release`, in `review-orchestrator.service.ts` catch then finally.
  - For a non-retryable code on an automatic attempt, it sets the head's `failure_count = MAX(failure_count, 3)` and `next_eligible_at = NULL`.
  - Result: automatic retries stop, and the UI shows "Automatic retries stopped" instead of "Retry after …" (`review-run-detail.component.ts:33-34`). A manual retry still works, and a new head SHA starts a fresh head row.
- `libs/backend/review-contracts/src/lib/review-run.schema.ts:35` — `ReviewFailureCodeSchema` gains `diff-too-large`.

### Tests added

- `github-review.adapter.spec.ts`, in a new `describe('diff above the GitHub line limit')` block, plus one 4xx test:
  - A 406 `too_large` response is assembled across 2 pages. The test checks the exact patch text, including the added, removed and renamed headers, and the URLs of both pages.
  - A file without a patch gives `truncated: true`.
  - At the page cap the adapter reads 30 pages and returns `truncated: true`, with no page 31.
  - When no file has a usable patch, the result is `diff-too-large` with the expected message.
  - A 406 that is not `too_large` gives an `http` error with `status: 406` and `reasons: ['invalid']`. Its message has the URL removed, and no fallback request is made.
  - A 404 carries `GitHub returned HTTP 404: Not Found`.
- `review-failure.spec.ts`:
  - `diff-too-large` maps to `diff-too-large`.
  - A `GitHubReviewError` with `status: 406` maps to `github-http`.
  - The non-retryable list is checked.
- `sqlite-review.repository.spec.ts`: after a `diff-too-large` failure, the head has `failure_count` 3 and `next_eligible_at` null, automatic re-discovery is `skipped`, and a manual retry is claimable.

### Verification (run from the worktree root)

- `npx jest --config libs/backend/review-github/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/review-github/src/lib/github-review.adapter.spec.ts` — 1 suite, **21 passed**, 0 failed.
- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/review-core/src/lib/review-failure.spec.ts libs/backend/review-core/src/lib/persistence/sqlite-review.repository.spec.ts` — 2 suites, **31 passed**, 0 failed.
- `npx tsc --noEmit --project libs/backend/{review-github,review-core,review-contracts}/tsconfig.lib.json` and `.../{review-github,review-core}/tsconfig.spec.json` — no errors.
- `npx eslint` on the 9 changed files — exit 0. The only output is the warning "No cached ProjectGraph is available", so `@nx/enforce-module-boundaries` was skipped outside nx. The coordinator's `npm run verify -t lint` covers it.
- I did not run the full project test targets or `npm run verify`; the brief does not allow them.

### Decisions

- **`GitHubReviewError` gains `status`.** A 4xx or 5xx `http` error now classifies as `github-http` instead of `unknown`. That change is the point: it fixes the "(unknown)" text.
  - Options were adding the field or matching on the message text.
  - Evidence: `classifyReviewFailure` already reads a numeric `status` (`review-failure.ts:17,31`).
  - Reversible.
- **Non-retryable failures use the existing backoff columns.** The repository sets `failure_count` to 3 at release; there is no new column or migration.
  - Options were a new column, a change to the orchestrator, or the repository.
  - Evidence: the cutoff `failure_count >= 3` is already used by `enqueue`, `claimNext` and `headRetry.automaticRetriesStopped`.
  - Reversible.
- **No UI change.** The renderer shows the raw code, `({{ failure.code }})` in `review-run-detail.component.ts:31`. There is no label map to extend, so the code shows as "(diff-too-large)".
- **A file without a patch still gets a header.** This keeps its path in `changedPaths` and marks the diff truncated, as the old `getDiff` did for a missing `patch`.

### Left open (outside my write set, for the orchestrator)

1. **A truncated diff does not mark the run Partial coverage today.** `context-stage.runner.ts:124` records `diff-truncated` in `coverage`. But `review-orchestrator.service.ts:246` sets `status = 'partial'` only for `prompt:truncated:` entries. So a fallback diff with `truncated: true` gives a `complete` run, unless the prompt budget also truncates it, which is likely for a diff over 20k lines.
   - Recommendation: a one-line change at `review-orchestrator.service.ts:246`, so that an entry equal to `'diff-truncated'` also sets partial. Add an orchestrator spec for it.
   - Note: this also changes the existing case where a normal diff omits a patch.
2. The other GitHub adapters (`github-review-publication.adapter.ts`, `github-review-status.adapter.ts`) still drop the error body on non-OK responses. The brief did not include them.
3. The fallback reads up to 30 file pages one after another. Each page has a 15 s timeout, which counts against the context-stage deadline.

### Addendum: open item 1 approved (decisions.md D5)

- `libs/backend/review-core/src/lib/review-orchestrator.service.ts:246` — a `diff-truncated` coverage entry now sets `status = 'partial'`, the same as a `prompt:truncated:` entry. A run whose fallback diff has `truncated: true` now ends as Partial coverage. This also applies to a normal diff whose files endpoint omits a patch.
- `libs/backend/review-core/src/lib/review-orchestrator.service.spec.ts:214-221` — new `it.each` cases. Triage returns `completed`, so only the coverage entry decides the status:
  - `['diff-truncated']` releases as `partial`.
  - `['diff-complete']` releases as `succeeded`.
  - Publication runs in both cases.

Verification:
- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/review-core/src/lib/review-orchestrator.service.spec.ts` — 1 suite, **23 passed**, 0 failed.
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.spec.json` — no errors.
- `npx eslint` on both changed files — exit 0.
