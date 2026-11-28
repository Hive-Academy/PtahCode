# Task 6.1 code logic review

Review family: codex (implementer family: claude)

## Score and verdict

**4/10 — REVISE.** The adapter routes valid pushes by Setup record id, adopts unknown bindings, and updates the unseen badge on verified completion. Those paths have focused coverage. Retry and terminal lookup races can leave a detached run permanently running or mark a live attempt terminal. These are core lifecycle failures. The routing, binding and persistence design remains usable once state transitions are guarded.

All frontend service paths below are relative to `libs/frontend/setup-wizard/src/lib/services/`. Backend handler paths are relative to `libs/backend/rpc-handlers/src/lib/handlers/`.

## Defects

1. **Major — Retry and early pushes disagree about which attempt owns the record.** `setup-run.store.ts:1035`, `setup-run.store.ts:1066`, `generation-run-event-adapter.ts:134`, `setup-run.store.ts:429`.
   - **Evidence.** Retrying failed guidance A marks the record running while retaining A's backend id. The guidance backend launches B before returning its acceptance (`enhanced-prompts-rpc.handlers.ts:724`, `:737`). If B's stream and confirmed terminal lookup arrive first, the stream sees a live record for A and the lookup sees a terminal result for a different id. Both are discarded. Acceptance then writes B's id alone. If A already pushed, the record remains excluded from the shared poll, leaving B running in Setup after it completed. Agent retries have the opposite ambiguity. They reuse the checkpoint run id (`wizard-generation-checkpoint.service.ts:428`, `:450`, `:461`), so a delayed terminal snapshot from before retry passes the id check and can settle the active retry with the old failure.
   - **Suggested fix.** Track the local start attempt before sending the request. Revalidate reads against that attempt and reconcile the accepted run after acceptance. Hold early evidence until the attempt is identified or reread current state at that point. Add deferred-reply cases for guidance with a new id and agents with the same id.

2. **Major — A failed terminal lookup leaves streamed runs without background recovery.** `generation-run-event-adapter.ts:143`, `generation-run-event-adapter.ts:158`, `setup-run.store.ts:396`, `setup-run.store.ts:233`, `setup-run.store.ts:1110`.
   - **Evidence.** One ordinary stream marks the record as pushed, which excludes it from the shared poll. If the final push's lookup throws, returns null, or returns a still-running state, the record remains running. A still-running response itself goes through `reportRun` and excludes the record from polling. The catch is annotated, but its claim that the shared poll will settle the record does not hold after the first stream. With Setup closed, there is no bound view to refresh it. The unseen completion badge can stay absent until a manual refresh or workspace reactivation.
   - **Suggested fix.** Keep or restore shared-poll eligibility when terminal verification is inconclusive, scoped to the current attempt. Stop fallback on a verified terminal transition. Test stream → terminal push → timeout or running response → successful shared-poll completion with no view attached.

3. **Major — Stale running evidence can overwrite the current attempt or reopen history.** `generation-run-event-adapter.ts:134`, `generation-run-event-adapter.ts:159`, `setup-run.store.ts:429`, `setup-run.store.ts:822`.
   - **Evidence.** A completed record for B accepts any ordinary stream with a different id as a new run, including a delayed stream from the older A. That writes A back to the record, clears its unseen badge, and removes it from polling. Conversely, `reportRun` guards only incoming terminal statuses. A lookup returning a delayed running snapshot for A can overwrite B's id or reopen a record already settled for A. An in-flight shared-poll read also writes directly after checking only that the record is live. If the poll starts while the id is unset and an intervening push establishes B, a stale poll response for A can still overwrite B.
   - **Suggested fix.** Require accepted-start or current-backend evidence before advancing a known record to a different run. Apply poll and push results through the same attempt-aware transition check. Make repeated terminal observations idempotent and preserve terminal state against stale running observations. Cover A → B → delayed A and a running reply resolving after a terminal reply.

4. **Major — The blocked owner is available only to callers that subscribe before the reply settles.** `setup-run.store.ts:450`, `setup-run.store.ts:1020`, `setup-run.store.ts:1070`, `setup-run.store.spec.ts:1329`.
   - **Evidence.** The blocked response restores the attempted record and returns the owner, then `startBound` deletes the only mapping to that result. For a guidance rerun, the caller receives the attempted record synchronously. If route activation or another async step delays `whenStarted(attemptedId)` until the blocked reply has resolved, the call returns the failed attempt instead of the owner. The existing test registers its waiter immediately, before the reply runs. The backend can also report a cancelling same-binding guidance run as its own owner (`enhanced-prompts-rpc.handlers.ts:672`–`:683`). Restoring the attempted record before calling `adopt` in that case returns the same failed or interrupted record even while that binding still owns the backend run.
   - **Suggested fix.** Return a stable start handle or retain a scoped redirect to the owner after settlement. Validate the owner's workflow and workspace before returning it, and reconcile a same-id owner as an existing run. Test both sides of the settlement boundary and the same-id response.

5. **Minor — The binding parser accepts malformed events that can create phantom runs.** `generation-run-event-adapter.ts:50`, `generation-run-event-adapter.ts:89`, `generation-run-event-adapter.ts:123`, `setup-run.store.ts:150`, `setup-run.store.ts:437`.
   - **Evidence.** A stream containing only a valid binding, an invalid lifecycle, or a stream type inconsistent with the workflow is handled as ordinary progress. It can adopt a record, increment the running count and exclude the record from polling. The terminal path also trusts the RPC's typed response at runtime. An unknown lifecycle with a valid binding and source maps to an undefined status, yet `reportRun` still removes the record from polling before applying it. The spec covers invalid bindings and uses a guidance binding in a generation-stream fixture at `generation-run-event-adapter.spec.ts:238`.
   - **Suggested fix.** Validate the type-specific event envelope before adoption and validate run identity, source and known lifecycle before updating the record or poll state. Keep any intended legacy optional fields explicit.

6. **Minor — The adapter spec omits the transcript acceptance check.** `generation-run-event-adapter.spec.ts:173`, `generation-run-event-adapter.spec.ts:187`, `generation-run-event-adapter.spec.ts:206`, `implementation-plan.md:310`.
   - **Evidence.** The spec stubs `SetupWizardStateService`, invokes the adapter directly and asserts record updates plus zero calls to both tab factories. The renderer registers both real handlers independently (`apps/ptah-extension-webview/src/app/app.config.ts:277`, `:445`). The requested check that one routed push updates record X and appends once to the appropriate buffer is missing.
   - **Suggested fix.** Exercise both handler registrations, or use an existing router integration harness, with one generation and one enhance event. Assert the target record, a single append to the expected buffer and zero tab creation.

## Five logic questions

1. **How does this fail silently?** A terminal lookup failure can leave the successful run showing as running indefinitely with no unseen badge (defect 2).
2. **What user action produces unexpected behaviour?** Retrying can discard the actual completion or let the previous attempt's failure settle the retry. Opening a rerun after a fast blocked reply can open the failed placeholder (defects 1 and 4).
3. **What input produces a wrong answer?** A delayed stream for A after completion of B reopens the record as A. A malformed stream with a valid binding creates a running row (defects 3 and 5).
4. **What happens when a dependency fails, times out, or returns an unexpected shape?** Start RPC failures use fixed error copy and carry a `degradation-audit:` comment. Terminal lookup exceptions carry the same annotation, but streamed records lack the advertised fallback. Unknown lookup lifecycles can also suppress polling (defects 2 and 5). The reviewed catches that deliberately swallow RPC exceptions carry the required annotation.
5. **What is missing from the requirements?** An ordering contract across pushes, state reads and start results. Agent checkpoint ids survive retry, so a run id alone cannot identify the current attempt. The contract also needs an explicit lifetime for blocked-owner resolution (defects 1, 3 and 4).

## Requirements fulfilment

| Task 6.1 requirement | Status | Evidence |
| --- | --- | --- |
| Route generation, enhance, completion and error pushes by Setup id without chat-tab creation | Complete for valid pushes | `generation-run-event-adapter.ts:76`–`:120`, `generation-run-event-adapter.spec.ts:187` |
| Adopt unknown binding ids | Complete for valid pushes | `generation-run-event-adapter.ts:102`, `generation-run-event-adapter.spec.ts:238`, `:429` |
| Update the stream buffer through the existing wizard handler | Implementation wired, acceptance check missing | `apps/ptah-extension-webview/src/app/app.config.ts:277`, `:445`, defect 6 |
| Unseen completion with no live view | Partial | Verified success is covered at `generation-run-event-adapter.spec.ts:331`. Defects 1–3 interrupt settlement or clear the badge. |
| Resolve the blocked owner's record | Partial | In-flight distinct-owner path covered at `setup-run.store.spec.ts:1329`. Defect 4 remains. |
| Preserve state when pushes and lookups race | Partial | Same-run late stream and older terminal response cases have coverage. Defects 1–3 cover the missing orderings. |

## Verification

- Reviewed the two requested diffs against HEAD `7c8fbe0f73`, both focused specs, the Batch 6 contract, plan component 2 and relevant reconcile rules, task context, and applicable root instructions. Used `rg --files` for task-folder and instruction discovery after `ptah_search_files` returned no hits. No matching skill was assigned or listed through a skill-loading mechanism.
- The requested focused Jest command passed both suites and all 107 tests. Log at `.ptah/tmp/code-logic-review-batch6-1-jest.log`. The failure sequences above were traced from source and backend ordering.
- Scoped `git diff --check` passed. Two scoped `ptah_get_diagnostics` requests timed out after 45 seconds and reported four unchecked files. Independent type diagnostics remain unverified.

## Decisions

- **Use the renderer's existing message registration as the transcript seam.** Options were direct adapter forwarding and independent handler delivery. The assignment and the two `MESSAGE_HANDLERS` registrations support independent delivery. The test can verify that delivery without changing production routing. Reversible through the message registration and adapter.
- **Keep the review scoped to Task 6.1.** Options were to grade all Batch 6 acceptance items together or apply the ownership in the task brief and `batches.md:81`–`:84`. The brief and batch assign the workflow-store rebinding and mismatch-specific failure copy to Task 6.2. Their concurrent changes are excluded from this score. A later batch review can cover their integration.
