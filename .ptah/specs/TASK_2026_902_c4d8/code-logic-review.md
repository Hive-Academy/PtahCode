# Code Logic Review — TASK_2026_902_c4d8

Verdict: REVISE (2 Serious, 4 Moderate, 2 Minor). Read-only review; no Jest, build or verify run.

## Defects

1. **Serious** — `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:476-480`. The thread narrowing can post to a guessed thread, which requirement 1 forbids.
   - `titled.length === 0` falls back to all path+line matches (`candidates = matches`). If exactly one of those is unresolved, `unresolved.length === 1` selects it and the reply is posted.
   - The title matched no thread, so the thread cannot be shown to belong to this finding. The pick rests on a path+line coincidence plus "unresolved". A different finding on the same line, or a human comment thread, would receive the Accept/Dismiss marker reply.
   - The single-match case (`candidates.length === 1`) also posts without any title confirmation.
   - Fix: when `titled.length === 0` and `matches.length > 1`, return `ambiguous-thread` (or `no-thread`). Run the unresolved filter only on `titled`. Decide explicitly whether a lone path+line match with no title hit is acceptable. Safer: require a title hit, and return `no-thread` otherwise.
   - The spec does not cover this path: add a test where the title matches none, one thread is unresolved, and `replyToFinding` must not be called.

2. **Serious** — `review-rpc.handlers.ts:466-474`. The page loop is capped at 5 and silently ignores a remaining `nextPage`.
   - On a PR with more than 5 pages of reviews, threads on later pages are never seen.
   - Result: a false `no-thread`, or worse a "single match" on page 1 when a second one exists on page 6 and the post goes to the wrong thread.
   - Fix: if `page !== null` after the loop, return `ambiguous-thread` (or a new `lookup-incomplete` code). Never treat a truncated scan as complete. Add a spec.

3. **Moderate** — `review-rpc.handlers.ts:490-493`. The catch covers the thread listing, `response.parse`, and the post.
   - Every failure becomes `github-error`, including the internal `throw new Error('Reply body missing…')` and a result-schema failure. The log message says "reply failed" even when the failure was on the listing call.
   - `logger.info` is used for a failure. Use `logger.warn`/`logger.error`, with a distinct message per stage. The Error passed in carries no cause, so there is no diagnostic value.
   - There is no `// degradation-audit:` marker. The handler logs and returns, so the tool likely does not flag it. The existing `catch (_error)` at line 413 is the same pattern. `tools/degradation-audit` is not run here; confirm with the orchestrator's audit run.
   - Fix: split the lookup try from the post try, use `logger.warn`, and drop the dead `if (body === undefined) throw`. Make the body non-optional by construction.

4. **Moderate** — `review-findings.store.ts:35-37, 59`, `review-finding-card.component.ts` (Accept/Dismiss buttons disabled only on `pending`).
   - After a successful Accept or Dismiss, the buttons stay active. A second click posts another permanent GitHub reply, and Accept then Dismiss posts contradictory markers with no UI guard.
   - Fix: in `respond`, return early when `state` is already `accepted` or `dismissed` for that action, and disable the buttons (or show a "Reopen" path) once `state !== 'open'`.

5. **Moderate** — `review-finding-card.component.ts`, `submitReply` / `submitDismiss`.
   - The form is closed and the reply text cleared (`reply.set('')`) before the RPC result is known. On `github-error` or `ambiguous-thread` the user's typed reply is lost and must be retyped.
   - Fix: clear and close only on success, for example by reacting to `triage().replied`. Alternatively keep the draft in the store.

6. **Moderate** — `review-findings.store.ts:70`. `file:open` is sent with a repo-relative path and no workspace root.
   - The backend resolves it against the Electron workspace folders (`file-open-rpc.handlers.ts`, `resolveWorkspaceFilePath`).
   - When the open workspace is not the reviewed repo, the file is not found (`success: false`, so the generic "Could not open the file." is shown). Or a same-named file in another repo opens, which is misleading.
   - Fix: surface "file not in the open workspace" copy. Longer term, pass `repo` and `attemptId` and let the host verify the workspace matches.

7. **Minor** — `review-findings.store.ts:46-48`. A late reply for another attempt returns before any state update. The GitHub post has already happened and the user gets no signal. Acceptable given the triage reset, but note it in the UI copy or log it.

8. **Minor** — `review-rpc.schema.ts`. The result `error` and `threadId` are optional and not coupled to `ok`, and `ok:true` may carry `code`. Tighten with a discriminated union.

## Requirements check

1. Thread match: not met until defects 1 and 2 are fixed. Error codes exist, and there are specs for match, no-match and ambiguous. There is no spec for the title-miss fallback or for truncation.
2. Triage state is honestly labelled session-local (`review-findings-panel.component.ts:17`). Markers are applied in the handler (`review-rpc.handlers.ts:484-486`). OK.
3. Boundary safety: OK on the points checked.
   - Zod params (body ≤ 4000, action enum, strict) are present. The store parses params and the result.
   - No raw error text is rendered, and the body is not logged.
   - Finding text is rendered as `{{ }}` with no `[innerHTML]`.
   - The store ignores a second respond for the same key while pending, and the buttons are disabled while pending.
   - Triage is reset on attempt change.
   - The gap is the duplicate post after success (defect 4).
4. "Copy fix prompt" fallback accepted. The clipboard failure path is handled. `navigator.clipboard` is used directly, which is acceptable in the renderer.

## Other checks

- Accessibility is adequate: labelled textareas, `role="alert"` and `role="status"`, and an `aria-label` on the evidence buttons. Minor point: the card's `aria-label` on `<article>` duplicates the heading.
- No `any`, `@ts-ignore` or `console.*` seen in the reviewed files. The frontend `catch {}` blocks set a user-visible error, so they are not silent swallows.
- Spec compile risk under jest-preset-angular: the B2 report says the spec tsconfig fails on BigInt at ES2016 and was only checked with `--target es2022`. The orchestrator's Jest run is the real check.
