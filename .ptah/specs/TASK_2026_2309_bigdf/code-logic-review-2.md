# Code Logic Review 2 — TASK_2026_2309_bigdf (fix round 2)

Review family: same (Claude), weaker evidence; the PR's own cross-family review (PtahCode bot, codex) raised the findings.

| Metric | Value |
| --- | --- |
| Score | 8/10 |
| Assessment | APPROVED (no blocking or serious issues) |
| Blocking / Serious / Moderate | 0 / 0 / 2 |

Scope: uncommitted diff over 909d629e5 (port, adapter, context stage, two specs, decisions.md D9). Focused jest re-run: adapter spec 27 passed, context-stage spec 6 passed.

## Finding 1: abort threading — CLOSED
- Port `getPull`/`getDiff` take an optional `signal` (github-review.port.ts:63-65). The signal goes through getDiff -> getPull, the diff request, the files page-1 request, diffFromFiles and every page request (adapter:255-297), and into `request()`.
- `request()` checks `signal.aborted` at each attempt (adapter:168), combines with `AbortSignal.any([timer, signal])` (:171), and reports a caller abort before the 15 s timeout in the catch (:187). A caller abort is `GitHubReviewError('timeout')`, so it can never be `diff-too-large` (that code is thrown only at adapter:303).
- Backoff `delay()` (adapter:123-135) removes its listener on timer fire and clears the timer on abort. No leak. The 15 s timer is cleared in `finally` (:190). `AbortSignal.any` composites are weakly held by the parent signal, so the long-lived workSignal does not accumulate them.
- Context stage `fullDiff` maps any error with `signal.aborted` to `Error('Review context aborted')` (runner:142), the existing path. In the orchestrator an outer-signal abort gives `partial` (:267); a deadline abort classifies `unknown` and is retryable, as before.
- Gap (Minor): `pullBase` is not wrapped, so an abort during that getPull surfaces as `GitHubReviewError('timeout','GitHub request aborted')` instead of `Review context aborted`. Classification is the same (`unknown`, retryable; orchestrator's `signal?.aborted` check covers the outer-cancel case), so there is no behavioural difference.

## Finding 2: incremental fallback — CLOSED
- The local diff is used only when `error.code === 'diff-too-large'` AND `previousHead` is set (runner:143-145). Otherwise it rethrows, so the failure stays non-retryable with no baseline (spec covers both).
- Head moved: `pullBase` throws a plain Error (retryable, `unknown`) (runner:152). baseSha comes from `getPull` (:153). `baseConfig` uses it.
- `getLastReviewedHead` moved before the diff: it is a read-only SELECT (sqlite-review.repository.ts:92-99), no side effects. If it throws the stage fails earlier but the same way.
- Coverage: `diff-full-unavailable` is a new informational entry. Exact-match consumers are only `review-orchestrator.service.ts:246` and `publication-stage.runner.ts:81` (both `diff-truncated`), so they are unaffected. The persistence schema allows any string up to 256 chars (review-query.repository.ts:28). The UI lists notes generically (review-run-detail.component.ts:45). The prompt/scope consumers join the strings. Unknown entry is safe.
- `diff?.truncated` is not consulted on the incremental path (as before: `!incrementalDiff && ...`).
- Callers of the changed port methods: `getPull` in review-orchestrator.service.ts:296, github-review-publication.adapter.ts:100, review-rpc.handlers.ts:274/443 and phase-2-libraries.ts:534 call with 2 args (the param is optional, so they stay valid). `getDiff` has one caller, the context stage. Test fakes are `jest.fn()`.

## Finding 3: oversized section — CLOSED
- `continue` instead of `page = null; break` (adapter:297) skips a section over the remaining budget, sets `truncated`, and later smaller patches are kept. `usable` is set only by an added section, so an all-skipped result still throws `diff-too-large` (:303). Spec added.

## Moderate issues
1. Force-pushed or unreachable `previousHead` on a too-large PR: `diffSince` throws a generic `Incremental diff unavailable` (review-context.service.ts:26), which classifies `unknown` and is retryable. Before this round the same PR failed non-retryable `diff-too-large` with a clear message, so it can now retry-loop with an uninformative error. Suggest catching a diffSince failure when `diff` is null and rethrowing the original `diff-too-large`. Narrow case (needs a prior succeeded head that is gone from the clone).
2. In the fallback the review's "full diff" scope is the incremental patch only; `diff-full-unavailable` is recorded, but the run is not marked `partial`. This is the stated, reversible decision (D9). It is acceptable because the baseline was already reviewed, though the walkthrough cannot show that the full PR was not seen.

## Five logic questions (brief)
1. Silent failure: the `diff-full-unavailable` run reports success; it is flagged in coverage only (Moderate 2).
2. User action: pushing a new commit during the fallback gives the head-moved retryable error and supersession. OK.
3. Wrong-answer data: none new.
4. Dependency failure: GitHub 5xx plus abort ends promptly; getPull failure in pullBase propagates as before.
5. Missing: no spec for the abort during `pullBase`, nor for the diffSince failure in fallback.

Verdict: APPROVE, confidence HIGH on findings 1 and 3, MEDIUM-HIGH on 2. Top risk: Moderate 1.

## Re-review 1 — correction for Moderate #1 (prior head gone)

Diff read: context-stage.runner.ts (fullDiff returns `{ diff, tooLarge? }`; `.catch` on `diffSince`) and the new spec "keeps the diff-too-large failure when the prior head is gone".

- Moderate #1 is CLOSED. `tooLarge` is set only on the path where the full diff was null (diff-too-large and previousHead exists), so a `diffSince` failure when the full diff exists still rethrows its own error (runner:109-113). When the full diff was unavailable and the local diff fails, the original diff-too-large error is thrown, so the non-retryable classification (review-failure.ts:25) and its clear message come back.
- Abort keeps the original path: `!workSignal.aborted` guards the swap, so an aborted `diffSince` rethrows its own `Review context aborted` error.
- The `previousHead === headSha` branch never calls `diffSince`, so it is unaffected.
- Minor, new: any non-abort `diffSince` failure becomes the permanent diff-too-large in this case, including a transient `ReviewGitTimeoutError`. A git timeout on a too-large PR therefore stops retries instead of retrying. This is rare and conservative (the same failure existed before D9 for every too-large PR), so I do not block on it. Narrowing the swap to a missing-baseline failure would be more precise.
- The `.catch` returns `never`, so `incrementalDiff` keeps its type. No regression found in the remaining flow.

Verdict: APPROVED (score stays 8/10; Moderate issues now 1 of the original 2, the second being the D9-accepted coverage note).

## Re-review 2 — git timeout stays retryable

Diff read: context-stage.runner.ts:112 now swaps to the diff-too-large error only when `tooLarge !== undefined && !workSignal.aborted && !(error instanceof ReviewGitTimeoutError)`. A `ReviewGitTimeoutError` from `diffSince` is rethrown as is; review-failure.ts classifies it `git-timeout`, which is not in the non-retryable list, so it is retried. The new spec rejects with `ReviewGitTimeoutError` and the import comes from the module the runner already depends on, so there is no new coupling. My earlier Minor is CLOSED. Verdict: APPROVED, 8/10, no new findings.
