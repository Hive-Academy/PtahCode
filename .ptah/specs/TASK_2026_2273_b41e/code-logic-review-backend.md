# Code Logic Review (backend) - TASK_2026_2273_b41e

Score: 8/10. Verdict: APPROVE WITH FIXES (0 blocking, 0 serious, 3 moderate, 3 minor).

Scope read: `memory-graph.ts` (whole), the `memory:graph` diff in `memory-rpc.handlers.ts` and
`memory-rpc.schema.ts`, `MemoryStore.graphSnapshot`, the `graph` cases in `search-worker-runtime.ts`,
`search-worker.client.ts` and `search-worker.protocol.ts`, and `rpc-memory.types.ts`.
Not read: the body of `SearchWorkerClient.request` (timer and degrade path), the `memory_chunks` /
`memory_chunks_vec` migration, and the specs. No tests were run.

## Checks that passed

- Cap ordering is correct. `memory-graph.ts:263-289` keeps chain edges first. Chain edges are at most
  2(n-1), below `edgeCap` = 6n, so `edgeCap - keptChains.length` is never negative. Semantic edges are
  sliced after the sort by weight.
- Limits are enforced twice: clamped in the schema (`memory-rpc.schema.ts`) and in
  `resolveMemoryGraphParams` (`memory-graph.ts:84`). The worker protocol rejects out-of-range values
  (`search-worker.protocol.ts:36-52`: maxNodes 1..1500, k 1..32, minSimilarity 0.5..0.99, strict).
- SQL is parameterized (`memory-graph.ts:~150-190`). Column names are constants. The `IN` lists are
  guarded by a length check, so no empty `IN ()`. The vector read batches 400 ids.
- Scope: `resolveReadScope` (`memory-rpc.handlers.ts:252`) returns `undefined` for `all`, which means no
  filter. `null` maps to `workspace_root IS NULL`. The `undefined` / `null` distinction survives the
  worker boundary (`.nullable().optional()`).
- Sqlite-vec unavailable: `semantic: state.vecStatus.available`, so `semanticAvailable` is false and the
  worker logs a warning. In the main-thread fallback, `semantic: false` gives the same result.
- Worker messages: the inbound query is Zod-strict. The result is parsed against `graphResultSchema`
  with strict node and edge schemas.

## Findings

| # | Severity | File:line | Problem | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Moderate | `memory.store.ts:176-189`, `search-worker.client.ts:159-177` | A worker timeout or degrade returns `null`. The store then runs `buildMemoryGraph` synchronously on the main thread, after the 4 s budget is already spent. The cost is a COUNT plus a SELECT of up to 1500 rows, plus chain building, with no deadline. The worker keeps running the abandoned request and blocks its single thread. | `graphSnapshot` falls back on any `null`. `null` is also the degraded value for a timeout (`this.schemas.graph, null, deadlineMs`). | Return a degraded empty result when the worker timed out. Reserve the main-thread fallback for "no worker configured". Or give the fallback `maxNodes` of at most 300. |
| 2 | Moderate | `memory-graph.ts:216-221, 160-185` | The deadline is checked only per outer row of the pairwise loop. `selectNodes` and `readNodeVectors` (all chunks of up to 1500 memories, no cap on chunks per memory) run with no budget check. A deadline that passes during the vector read is detected only after the read finishes. | The only `performance.now()` check is inside `semanticEdges`. | Check the deadline between vector batches (400 ids) and throw `SemanticDeadlineError`. Optionally cap chunks read per memory. |
| 3 | Moderate | `memory-graph.ts:276-285` | When the deadline passes, every semantic edge computed so far is discarded. The result reports `semanticAvailable: false`, which the UI cannot tell apart from "sqlite-vec off". The user gets no hint that it was a timeout and a retry with a smaller `maxNodes` may work. | `semanticAvailable = false` for every exception. | Add a `semanticReason` (`'vec-off' \| 'timeout' \| 'error'`) to `MemoryGraphResult`. Or keep the partial edges. |
| 4 | Minor | `memory-graph.ts:289` | Under the cap, the semantic slice is global by weight. A weakly connected node can lose all its neighbours while hub nodes keep theirs. The cap only binds when semantic edges exceed 6n minus chain edges, so this is rare. | `semantic.slice(0, edgeCap - keptChains.length)` on edges sorted by `compareEdges` (weight first). | Rank per node by top-k first (already done), then trim lowest weights. Acceptable as is. |
| 5 | Minor | `memory-graph.ts:~210-215` | With `scope: 'all'`, subject chains join memories across workspaces on a case-insensitive subject match. This can link unrelated projects. | The chain key is `subject.trim().toLowerCase()` with no workspace in the key. | Include `workspaceRoot` in the chain key, or document it. |
| 6 | Minor | `memory-graph.ts:~170-182` | `COUNT(*)` and `SELECT` are two statements with no shared transaction. A write between them can make `capped` / `totalMatching` stale by a few rows. | Two `prepare` calls. | Ignore, or wrap in a read transaction. |

## Five logic questions

1. Silent failure: a semantic error or timeout is swallowed into `semanticAvailable: false` with a warning log (finding 3). That is the intended contract, but the reason is lost. Worker degrade silently switches to the main-thread fallback (finding 1).
2. Unexpected user action: dragging `maxNodes` to 1500 with `k` 32 on a large store gives the worst-case O(n²·384) path. It is bounded by the deadline only in the pairwise loop (finding 2).
3. Wrong answer from input: unknown keys are rejected by `.strict()`. `createdFrom > createdTo` is rejected by the `refine`. Out-of-range sizes are clamped. A numeric string is rejected, which is correct. Nothing found that yields a wrong answer.
4. Dependency failure: a missing vec table, a vec read error and a worker crash all produce a result with nodes and chain edges. Not verified: the worker client timer and its cleanup (`request` was not read).
5. Missing: no per-call cancellation of an abandoned worker request, and no test evidence was reviewed for the cap ordering with a dense semantic layer.

## Verdict

APPROVE WITH FIXES. Fix findings 1 and 2 before merge. Finding 3 is recommended. Confidence: MEDIUM, because the client `request` timer and the specs were not read.
