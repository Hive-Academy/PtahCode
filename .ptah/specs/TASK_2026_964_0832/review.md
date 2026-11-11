Verdict: **changes needed**

## Findings

- **High — workspace-switch read can overwrite the fresh trailing result** (`libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:824,836-846`, `:471-485`). On a cache miss, `switchWorkspace()` starts `loadSessionsForWorkspace()` outside `loadSessionsInFlight`. If that RPC snapshots the old list, a later child-session trigger can run a fresh `loadSessions()` read and display the child, then the older workspace-switch reply can arrive last and replace the list with its stale rows. The workspace and query-generation guards both pass. Coordinate switch reads with normal reads, or give all list reads a per-workspace/query request generation and discard replies older than the latest started read. Add a delayed workspace-switch reply regression case.

- **Medium — the new catch silently swallows unexpected rejection** (`libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:479`). `tools/degradation-audit/check-degradation.ts:587-625` explicitly flags `.catch(() => undefined)` as `promise-catch-sentinel`. `_loadSessionsImmediate()` logs ordinary RPC failures, so this should be rare, but a rejection from the tracked promise would disappear. Keep the trailing read after failure while reporting the rejection, for example with a `.catch(error => { console.error(..., error); })` handler.

- **Low — stale join comments contradict the new behavior** (`libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:336-342,439-444,494-497`). They still say late `loadSessions()` callers join the current read. Update them to describe the shared trailing read; distinguish `setListQuery()`'s direct immediate read.

- **Low — test does not assert read ordering** (`libs/frontend/chat/src/lib/services/chat-store/session-loader.service.spec.ts:4217-4235`). The test fails on the old code (one RPC and no child) and its fake-timer sequence is deterministic. But its final count of two would also accept a concurrent second read. Assert one `session:list` call while the first gate remains closed, then two after release; this checks the stated trailing-read contract.

## Additional review notes

The tracked-read logic itself has no self-sustaining loop: one late group queues one continuation, and another read is queued only by a later trigger. `listQueryGeneration` discards old-query replies when `setListQuery()` starts its direct read. The other `libs/frontend` callers use `loadSessions()` for its completion side effect and do not assert the old join count; the sole join-count spec is the one changed here. No tests or checks were run in this read-only review; the user reported `npm run verify -p @ptah-extension/chat` passed.
