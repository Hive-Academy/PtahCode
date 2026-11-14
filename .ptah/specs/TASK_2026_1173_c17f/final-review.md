# Final code logic review — TASK_2026_1173_c17f

**Verdict: APPROVE WITH NITS. Score: 7/10.** The native activity path now creates one card keyed by the first activity id, links child events by stable thread id, carries ordinal cycle ids through live and history projection, and uses structured lifecycle data. The earlier major buffered-terminal and interrupted-status defects are corrected. The remaining resume uncertainty and bounded replay behavior keep this below 8; the demonstrated happy path and boundary validation keep it above 6.

## Findings

1. **Minor — Resume seeding still depends on the `thread/resume` response containing all root turns.** `libs/backend/codex-runtime/src/lib/codex-context.ts:373-375` seeds only `result.thread`; `:687-692` drops a later `interacted`/`completed` for an unknown child, now with a debug log. Nothing calls `seedSubagentActivity` with the descendant-inclusive history snapshot in production. If the resume response omits earlier activity, live status for a pre-existing child cannot update and its original card id/cycle is unavailable, while reload history may show the card correctly. **Fix:** seed from the same full `thread/read` history used for projection, or pin the `thread/resume` full-turn contract with an integration test and document that dependency.

2. **Minor — The native cache is bounded by silently sacrificing an active child at capacity.** `libs/backend/codex-runtime/src/lib/codex-context.ts:694-702` evicts the oldest entry when all 256 have no `lastTerminalKey`; subsequent `interacted`/`completed` for that child is dropped at `:687-692`. The log reports overflow, but its live card can remain running. **Fix:** retain active identities until terminal, or persist/recover the minimal card and cycle metadata when evicting; test a later event for an evicted active child.

3. **Nit — Terminal replay is tested only with no subscriber.** `libs/backend/codex-runtime/src/lib/codex-context.ts:449-475` queues a native terminal for the next turn only when the subscriber set is empty; `:458-470` can discard a queued terminal on subscriber overflow. The test at `codex-context.spec.ts:410` covers the empty-subscriber case, not overflow or cancellation around delivery. **Fix:** add a focused cancellation/overflow regression, or document the 64-event replay and 1024-event subscriber bounds as visibility limits. This is a residual delivery risk, not evidence of a failure on the ordinary path.

## Earlier findings F1–F9

- **F1 fixed:** buffered child events are bound to a cycle before flush (`codex-context.ts:763-767`); unknown/stale terminal drops are logged (`:826-831`).
- **F2 fixed:** live `interrupted` maps to `paused` (`codex-chat-events.ts:233-234`), matching history (`codex-history-projector.ts:346`).
- **F3 fixed within its stated bound:** a terminal with no subscriber is queued and replayed on the next subscription (`codex-context.ts:419-421,449-455`); until that subscription the live card can still show running. Projector accepts the terminal's native metadata without a local card (`codex-chat-events.ts:216-220`).
- **F4 fixed:** control gating requires `nativeCycleId` (`native-codex-control-reason.ts:6-7`), leaving v1 cards outside that predicate.
- **F5 partially fixed:** unknown-child activity is logged (`codex-context.ts:689-692`), but resume still seeds only the resume response; finding 1 remains.
- **F6 accepted limitation:** ordinal matching still assumes one child turn per `started`/`interacted` activity (`codex-history-projector.ts:343-346`).
- **F7 fixed:** activity is admitted before `linkChild` flushes buffered child events (`codex-context.ts:627-629`).
- **F8 covered:** the v1 child-before-tool regression is in `codex-context.spec.ts:551`.
- **F9 partially fixed:** native child states are capped at 256 (`codex-context.ts:694-702`); finding 2 describes the active-child eviction edge. `seenActivityKeys` remains unbounded within one long-lived child (`:709-710`).

## Scope and verification

Read the task evidence, decisions, earlier review, implementation plan, relevant source diffs and focused specs. Traced translation, context admission, live/history projection, reducer, tree, protocol validators and controls. `subAgentActivity` is schema parsed before translation; SDK `agent_status` still requires `taskId` at the worker frame and machines UI boundaries. Native status does not invent usage, cost or duration; the UI uses signal/computed APIs and existing OnPush components. No source files were changed. Per request, no tests, builds, Nx, npm verification or diagnostics were run; passing results in batch reports were not independently rechecked. Out-of-scope host ports, API builder and approval UI were not judged.

## Decisions

The remaining resume contract is a review finding rather than an assumed protocol guarantee. The 256-state cache limit is reversible; preserving active identities is preferred to evicting them.

