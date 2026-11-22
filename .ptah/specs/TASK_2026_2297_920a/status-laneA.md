# Lane A status

Implemented the SDK provider watchdog and RPC stream teardown for P2 batches 8, 9, 10, and 22.

## Behavior

- The 180-second provider guard runs only within a confirmed turn. Raw SDK task snapshots reconcile all open task IDs before UI filtering. Tasks survive turn boundaries, while open tools, permission holds, compaction, and bounded API retries defer failure. Task quiet and compaction dwell generate overdue notices with backoff.
- Provider hangs and a closed provider input channel carry typed causes and Ptah copy through SDK transport errors and EOF. Token-owned RPC cleanup forwards the cause through one teardown. The SDK end payload sets `zeroOutwardEvents` only when the query showed no raw SDK work, settled result, or outward event. Raw work disqualifies replay even when the transformer filters it out. Ordinary input echoes remain eligible unless they are emitted outward.
- The watchdog counts root and nested tool hooks, assistant messages, partial stream frames, tool blocks and progress, task messages and snapshots, thinking progress, and results as work. Late results count as work evidence while only the owning result closes the current watchdog turn.
- The two authorized compaction cases confirm the turn before starting the watchdog. The dwell case verifies the overdue notice and that the turn stays open.
- SDK hook lifecycle events track open root non-tool hooks by ID. Hook progress refreshes their quiet window, and overdue hooks warn with backoff. Open Monitor and ambient tasks continue to defer the guard. Their overdue log names the number and kinds of open tasks.
- Only the session registry records a provider failure after it accepts the verdict. Teardown frames leave retry evidence unchanged, and teardown results cannot settle the interrupted turn. Compaction frames and callbacks count as raw work.
- Explicit user interrupts hold the watchdog until the SDK returns or the interrupt times out. The ended-stop context cache retains the 256 newest entries, and unversioned snapshots cannot reopen a finished task before its next start.
- The broadcaster documents the tokenless adapter fallback and uses token-owned teardown for the SDK. Regression specs cover a 360-second root hook, four ambient-task warnings with backoff, and a permission hold that persists into an open turn.
- Trusted stop context reaches the next input for the same resolved SDK conversation once. Slash commands retain their own dispatch text. Rendered tool results replace the exact SDK cancellation copy only for a live root tool correlated to Ptah provider recovery.

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/compaction-hook-handler.spec.ts` (two watchdog cases authorized by the coordinator)
- `libs/backend/agent-sdk/src/index.ts`
- `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.lifecycle.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.input-channel-failure.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-stream-pump.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-stream-pump.service.ts`
- `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts`
- `libs/backend/agent-sdk/src/lib/message-transform/user-message.transformer.spec.ts`
- `libs/backend/agent-sdk/src/lib/message-transform/user-message.transformer.ts`
- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts`

## Checks

- Review follow-up Jest passed 493 tests across all 11 changed Agent SDK specs and 52 tests in the changed RPC broadcaster spec.
- `tsc --noEmit` passed for `tsconfig.lib.json` and `tsconfig.spec.json` in both Agent SDK and RPC handlers.
- ESLint on all 22 lane files reported zero errors and 13 warnings for file length, unused test bindings, and non-null assertions. The module-boundaries rule skipped its check because no cached project graph was available.
- `git diff --check` passed. No commit was created.
- Review follow-up logs are under `.ptah/tmp/lane-a-review-*`.

## Open issues

- Stop context is held in memory and keyed by resolved SDK session identity. An unresolved tab has no trusted identity for forwarding a stop explanation to a later query.
- Ptah workspace and AST tools inspected the integration points. The Ptah dependents graph stayed in its indexing state, so impact review used targeted `rg` searches.
