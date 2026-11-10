# Round 2 logic review, commit 3f4774bc3

Verdict: APPROVE. No blocking or serious defect confirmed. Read in full: review-finding-response.ts,
the listFindingThreads diff, query repository diff, workspace-file-path.ts, electron-review-environment
checkoutRoot/locate, review-rpc.handlers (listFindings, respondToFinding, repositoryRoot), store diff.

## Checks and results

1. Duplicate triage reply. In-flight calls share one promise (review-finding-response.ts:57-62). The
   `finally` delete runs in a later microtask than `set` (line 61-62), so no stale or early deletion. Calls
   after completion read the bot replies (line 79, 102-103) and post nothing. Execute rejections before the
   try (lines 69-72) propagate to every joined caller; each caller owns its promise, so no unhandled
   rejection. A joined call with another action gets the first call's triage (line 60).
2. in_reply_to_id matching (github-review.adapter.ts:238-249). GitHub sets in_reply_to_id to the root
   comment, so a flat id compare is right. Both roots and replies are filtered to the bot login, which is
   the login that posts replies. A truncated scan (10 pages) fails closed as ambiguous-thread.
3. Redaction vs title match. listFindings and listPublishedTitles apply the identical
   `redactSecrets(redact(x), secrets)` to title and path (review-query.repository.ts:126-137), so the
   exact comparison at review-finding-response.ts:73 holds. The heading is compared with publishedTitle
   from the same function as publication.
4. file:open real path (workspace-file-path.ts:66-86). Both sides go through fs.realpath, then the
   win32 lower-casing containment. A junction or symlink out of a root is refused. A root that is itself a
   junction works. A dropped root only narrows the set. Fail-closed on realpath errors.
5. `checkoutRoot` is called as `this.environment.checkoutRoot(repo)` (review-rpc.handlers.ts:124-125),
   so `this` is bound. No secret reaches a log: all log calls use fixed text or `new Error('GitHub request failed')`.

## Minor observations (no change required to merge)

- M1 electron-review-environment.ts:84-90: `checkoutRoot` does not store its result in rootsCache, so a
  disabled repository runs a git probe per workspace folder on every `review:listFindings`. Smallest fix: cache
  the located root in a separate map with the same TTL. Cost only, not correctness.
- M2 review-query.repository.ts:127-128: the reviver redacts every string value, including enum fields
  (severity, ids). A configured secret of 4+ chars equal to such a value would make `ReviewFindingSchema.parse`
  throw and fail the whole list (fails closed, loud). Very unlikely; fix would be to redact only the text fields.
- M3 review-finding-response.ts:39-45: a `reply` action whose operator text starts with a triage marker would
  later be read as a recorded triage and suppress the real accept/dismiss post. Same actor, self-inflicted;
  fix is to strip or escape a leading marker in `safeText(params.body)` for the reply action.
- M4 Two Ptah processes on one GitHub token can still race: the single-flight map is per process, and the
  protection across processes is only the read-before-post (a window of one round trip). Residual risk,
  documented nowhere; acceptable for a desktop single-user app.
- M5 github-review.adapter.ts:241: the 10-page cap counts all PR comments, not only bot comments, so a PR
  with more than 1000 review comments can never be triaged from Ptah (clear ambiguous-thread message).
