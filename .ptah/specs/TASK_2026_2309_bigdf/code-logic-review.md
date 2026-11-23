# Code Logic Review — `TASK_2026_2309_bigdf` (issue #1457)

Review family: same (Claude), weaker evidence; reason: no CLI lanes in this session.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 4              |
| Failure modes found | 5              |

Scope read in full: the 10 diffed files plus `review-failure-retry.ts`, `request()` (adapter 140-195), `context-stage.runner.ts`, `diff-stats.ts`, `prompt-budget.ts`, the diff parsers in `review-publication.service.ts`, and repository `enqueue`/`claimNext`/`release`/`getLastReviewedHead`/`saveFailure`. Focused jest re-run: adapter spec 21 passed; review-failure + sqlite repository + orchestrator specs 54 passed. No build or nx run.

## Five logic questions

### 1. How does this fail silently?
- Every file without a `patch` sets `truncated` (adapter.ts:269), including binary files and pure renames/mode changes, which GitHub lists without a patch and which lose nothing. With D5 (`review-orchestrator.service.ts:246`) such a run now ends `partial` although it saw everything. It misreports coverage (Serious 1).
- Error-body parsing never throws (adapter.ts:94-106). A non-JSON or schema-mismatching body gives message `null` and the short message. OK.

### 2. What user action produces unexpected behaviour?
- Manual retry of a `diff-too-large` run fails identically (expected). `repository.ts:248-255` filters `trigger = 'automatic'`, so a failed manual attempt leaves head counters untouched. A new push makes a new head row, so there is no lock-out. OK.
- Pushing to a PR that contains an image or binary: the run is now Partial coverage every time and is not an incremental baseline (Serious 1).

### 3. What input produces a wrong answer?
- Filenames with spaces or ` b/`: `diff --git a/<from> b/<to>` is as ambiguous as real `git diff`, and the downstream regexes (`context-stage.runner.ts:110`, `review-context.service.ts:27`, `diff-stats.ts:22`) read it the same way. OK.
- Removed file `+++ /dev/null`: `review-publication.service.ts:25,41` accept only `+++ b/`, so no inline anchors for it. Correct. Added file `--- /dev/null` is ignored by the same parsers (they key on `+++ b/` and `@@`). `diff-stats.ts:19-28` ignores header lines outside a hunk. `prompt-budget.ts:22-23,35` cut at `\n@@ ` and `\ndiff --git `, which the format contains. The assembled format is accepted by every consumer I found (context stage, `changedExports`, diff-stats, prompt budget, publication anchoring).
- `MAX_BYTES` is compared with `section.length` (UTF-16 units, adapter.ts:271), not bytes. A non-ASCII-heavy diff can exceed the 10 MiB intent by a few times. The prompt budget bounds the prompt, so the effect is memory only (Moderate).

### 4. What happens when a dependency fails?
- 15 s per request and up to 30 sequential pages (adapter.ts:259-262): worst case about 7.5 min inside the context deadline. On expiry `check()` throws a plain Error (`context-stage.runner.ts:88`), classified `unknown` and retried with backoff into the same slow path. This is D6; Moderate.
- A failure in the middle of pagination (timeout, 5xx after retries, malformed page) discards all assembled pages and fails the attempt. Retryable. Acceptable.
- Error body read: `request()` already reads the body once and rebuilds `new Response(body, ...)` (adapter.ts:161-163), so the `response.text()` at :189 reads a fresh stream. No double consumption. Size is bounded by `MAX_BYTES` (:162) before parsing; the message is cut to 200 chars, URLs are masked, reason codes are regex-filtered. Safe. The failure message also goes through `sanitizeReviewFailureMessage`.

### 5. What is missing that the requirements never mentioned?
- No distinction between binary/rename entries and genuinely omitted patches (Serious 1).
- No count of files dropped at the byte or page cap, only a boolean.
- `getDiff` still runs for incremental reviews (`context-stage.runner.ts:96`) although the incremental patch replaces its output. A PR where no file has a usable patch fails `diff-too-large` even though the incremental diff could be reviewed. Minor.

## Failure modes

### Binary or rename-only changes flip a complete run to partial
- Trigger: any PR with a binary, image, pure rename or mode-only change (GitHub returns no `patch`).
- Symptom: run ends `partial`. `getLastReviewedHead` (`sqlite-review.repository.ts:95-97`) requires `result_status = 'succeeded'`, so the next push gets a full review rather than an incremental one, and the walkthrough says the diff is truncated.
- Evidence: adapter.ts:248, :269; orchestrator.service.ts:246; context-stage.runner.ts:124.
- Current handling: accepted as correct in D5.
- Recommendation: treat a missing patch as truncation only when `file.changes > 0`, in both the normal path (:248) and the fallback (:269).

### Context deadline during long pagination
- Trigger: about 3000 slow files. Symptom: attempt fails `unknown` and retries. Evidence: adapter.ts:259-262, context-stage.runner.ts:88. Recommendation: pass the deadline or signal into `diffFromFiles` and stop with `truncated`.

### Byte cap measured in characters
- Evidence: adapter.ts:271. Recommendation: `Buffer.byteLength(section)`.

### Non-retryable list holds one code
- `release` is safe: `MAX(failure_count, 3)` is a no-op past 3, `next_eligible_at = NULL` overrides the backoff set a few lines above, succeeded runs are untouched (only `status === 'failed'`), and other codes are unaffected. Other deterministic codes (`prompt-too-large`, `head-missing`, 404/422 `github-http`) still retry three times. Not required by the issue; Moderate.

### Other 4xx now `github-http`
- `status` is carried by `GitHubReviewError` (error.ts:11-13); `review-failure.ts:34` maps 4xx/5xx to `github-http` where they were `unknown`. 401/403/429 are thrown earlier with their own codes and no status, so they classify as before. `github-http` is consumed only in review-failure.ts and the contracts enum (extended at review-run.schema.ts:35, so persisted rows parse). Nothing treats `unknown` specially. Constructor additions are trailing, so existing callers are unchanged. No regression found.

## Blocking issues
None.

## Serious issues

### Missing-patch heuristic marks ordinary PRs partial
- File: libs/backend/review-github/src/lib/github-review.adapter.ts:248, :269; effect at libs/backend/review-core/src/lib/review-orchestrator.service.ts:246
- Scenario: a PR with an image or a pure rename (common).
- Impact: before D5, `truncated` only fed a publication caption. Now it changes run status, shows "Partial coverage" on fully reviewed PRs, and removes the head as an incremental baseline, so every push is reviewed in full.
- Fix: gate on `file.changes > 0` in both places; add specs for a binary and a pure-rename file giving `truncated: false`.

## Moderate and minor issues
- adapter.ts:259-262 sequential 30 pages vs context deadline (D6).
- adapter.ts:271 chars vs bytes.
- `sqlite-review.repository.ts:248-255` adds one query per failed release; if `saveFailure` failed (swallowed at `review-orchestrator.service.ts:272-277`) the head falls back to normal backoff. Acceptable.
- `review-failure-retry.ts:1` imports a type from `review-failure.ts`, which re-exports it back: a type-only cycle, harmless at runtime.
- Orchestrator spec covers `diff-truncated` vs `diff-complete`; no test for an incremental run with a truncated full diff (stays `diff-complete` via the `!incrementalDiff` guard, correct).

## Data flow

1. `getDiff`, `getPull`, head check (adapter.ts:233-236): OK.
2. v3.diff request, 406 body read once and parsed (:161-163, :189); a non-`too_large` 406 is rethrown: OK.
3. `diffFromFiles`, cycle guard and 30-page cap (:259-262): OK. Full page 30 flags truncated even at exactly 3000 files (conservative).
4. `fileSection` headers (:108-116): OK for added, removed, renamed and modified files.
5. Byte cap stops adding sections and sets `truncated` (:271): OK except chars vs bytes.
6. No usable patch gives `diff-too-large`, then `classifyReviewFailure`, `saveFailure`, `release`, head `failure_count` 3: OK.
7. Coverage, orchestrator partial, publication `diffTruncated`: OK; the baseline exclusion is the Serious item.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Fallback when diff exceeds 20k lines | COMPLETE | none |
| Show the GitHub reason in the run | COMPLETE | none |
| No futile automatic retry | COMPLETE | deadline case still retries |
| Partial coverage when files are omitted | PARTIAL | over-triggers for binary and rename |

Implicit requirements not addressed: deadline-aware pagination.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Rename with edits | YES | rename from/to plus hunk | none |
| Added or removed file | YES | /dev/null headers | none |
| Binary file | PARTIAL | header only | marks truncated |
| More than 30 pages or 3000 files | YES | cap plus truncated | none |
| Link cycle | YES | seen set | none |
| Non-JSON error body | YES | null message | none |
| Manual retry after diff-too-large | YES | automatic-only update | fails again, expected |
| Succeeded run on same head | YES | update only on `failed` | none |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH (no cross-family check; focused tests re-run and pass)
- Top risk: the missing-patch-means-truncated rule now downgrades ordinary PRs with binaries or renames to partial and drops their incremental baseline.
- What a robust implementation would add: `changes > 0` gating, byte-accurate cap, deadline-aware pagination, a review of the non-retryable list.

## Re-review 1 (fix round 1, D7/D8)

Scope: `github-review.adapter.ts` L108-111, L253, L274, L276-279 and the spec changes, read against `fix-round-1-report.md`. No jest re-run in this round; the report's 24 passed is taken as stated.

- Serious (missing patch marks ordinary PRs partial): CLOSED. `omitsPatch` (L108-111) is true only when `patch === undefined && changes > 0`. It is used on both paths (L253 normal, L274 fallback). Binary files and pure renames (GitHub reports `changes: 0`) no longer set `truncated`, so those runs stay `succeeded` and remain incremental baselines (`sqlite-review.repository.ts:95-97`). A text file whose patch GitHub omits for size reports `changes > 0` and still flags truncation. `fileSection` still emits the header and rename lines for patchless files, so paths stay in `changedPaths`.
- Moderate (byte cap in characters): CLOSED. L276-279 compares and accumulates `Buffer.byteLength(section, 'utf8')`. The new spec (two 3M-character `é` sections, one fits by bytes) fails under the old check.
- Spec: the old fallback test that asserted `truncated: true` for a `changes: 0` binary (the bug) was changed to a `changes: 40000` file; new normal-path and fallback tests cover binary plus pure rename. Assertions match the code.
- Regression check: `usable` is still set only by a file with a patch, so an all-binary/rename fallback still fails `diff-too-large` (correct, nothing reviewable). A fallback diff with only complete text files plus binaries now reports `truncated: false`, which is the intent. No new issues found.
- Remaining Moderates (pagination time vs deadline, non-retryable list width, `getDiff` on incremental reviews) are recorded in D8 as a later task and do not block.

Final verdict: APPROVE. Score 8/10. Confidence: MEDIUM-HIGH (same-family review, no jest re-run this round).
