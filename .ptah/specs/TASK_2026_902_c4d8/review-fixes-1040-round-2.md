# PR #1040 review round 2 — corrections

Pull request: https://github.com/Hive-Academy/PtahCode/pull/1040
Code commit: `3f4774bc3` (`fix(rpc-handlers,review-github,review-core): harden finding actions`).
All five findings are real defects. All five are corrected in that commit.

## Verification

- `npm run verify -- -p review-github,review-contracts,review-core,rpc-handlers,review-runs-ui,ptah-electron`:
  first run failed 3 tasks (a broken string literal in a spec, a missing DI registration in the smoke spec,
  a fixture without `replies`). After the repairs:
  - `npm run verify -- -p rpc-handlers,ptah-electron`: lint and typecheck 4 of 4 passed, `ptah-electron:test` passed.
  - `npm run verify -- -t test -p rpc-handlers`: passed.
  - `review-github`, `review-contracts`, `review-core`, `review-runs-ui`: lint, typecheck and test passed in the first run.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no baseline raised.
- Not run: build, e2e, visual review (not requested).

## Finding 1 — duplicate triage reply after a timeout (Major, comment 4523610445)

- Verdict: confirmed.
- Correction: `ReviewFindingResponder` (`libs/backend/rpc-handlers/src/lib/handlers/review-finding-response.ts`)
  examines the replies of the bot on the thread before it posts. A thread with a triage marker reply gets no
  second reply. The result is `ok: true` with `triage`. Calls in progress for the same finding share one post.
  The store shows "The result is unknown" after a timeout and follows `result.triage`.
- Tests: `review-rpc.handlers.spec.ts` (no second triage reply ×3, text reply still posts, two calls at the
  same time give one post), `review-findings.store.spec.ts` (lost response then retry, unknown result of a
  text reply), `github-review.adapter.spec.ts` (replies attached to threads).
- Commit: `3f4774bc3`.
- Limit: a text reply has no marker, so a second send after a timeout can post it again. The UI tells the
  operator to examine the thread first.

## Finding 2 — fix prompt without the configured-secrets redaction (Major, comment 4523610454)

- Verdict: confirmed.
- Correction: `review:listFindings` passes `environment.redactionSecrets()` to `query.listFindings`.
  The repository applies `redactSecrets(redact(value), secrets)`. No secret is logged.
- Tests: `review-query.repository.spec.ts` (configured secret is redacted, identity equal to
  `listPublishedTitles`), `review-rpc.handlers.spec.ts` (secrets go to the query).
- Commit: `3f4774bc3`.

## Finding 3 — evidence open follows symbolic links (Minor, comment 4523610468)

- Verdict: confirmed. Supersedes decision 20 for `file:open`.
- Correction: `resolveWorkspaceFilePath` has the option `realPathContainment`. `file:open` sets it always.
- Tests: `workspace-file-path.spec.ts` (link out of the root refused, root that is a link accepted, real path
  not available refused, lexical default not changed), `file-open-rpc.handlers.spec.ts` (link refused, no launch).
- Commit: `3f4774bc3`.

## Finding 4 — comments read again for each review page (Minor, comment 4523610462)

- Verdict: confirmed.
- Correction: `GithubReviewAdapter.listFindingThreads` reads the comment pages one time (at most 10 pages)
  and does not read the reviews. A truncated scan gives `complete: false`, and the handler returns `ambiguous-thread`.
- Tests: `github-review.adapter.spec.ts` (one read for each page, page limit), `review-rpc.handlers.spec.ts`
  (`listFindingThreads` called one time).
- Commit: `3f4774bc3`.

## Finding 5 — evidence of old runs after the repository is disabled (Minor, comment 4523610476)

- Verdict: confirmed.
- Correction: `ReviewStageEnvironment.checkoutRoot` (optional). `ElectronReviewEnvironment.checkoutRoot` locates
  the checkout without the `enabled` check. `repositoryRoot` uses it.
- Tests: `electron-review-environment.spec.ts` (disabled repository: `resolve` rejects, `checkoutRoot` resolves),
  `review-rpc.handlers.spec.ts` (`resolve` not called).
- Commit: `3f4774bc3`.

## Environment note

The worktree had no `node_modules`. A junction to the `node_modules` of the main checkout was added. It is not committed.

## After the first push

- Merges of `origin/main`: `8aaff46fb` (PR #1043, PR #1044) and `3079e046e` (PR #1039, PR #1041). The run detail keeps
  the Inbox layout and the interactive findings panel. No `findingRows` line remains.
- Review of head `8aaff46fb` (`code-review-8aaff46fb.md`): one Major finding, a text reply with a triage marker
  recorded a triage. Correction: `safeText` escapes the triage marker. Tests: `publication-text.spec.ts`,
  `review-rpc.handlers.spec.ts`. `npm run verify -- -p review-core,rpc-handlers` passed.
- `git-watcher.stress.spec.ts` failed one time in the full Electron run and passed alone (timing, not related).
