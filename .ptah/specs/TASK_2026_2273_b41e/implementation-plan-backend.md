# Implementation plan — backend (`memory:graph`)

Task `TASK_2026_2273_b41e`. Author: the orchestrator, from source reads on branch
`feat/thoth-memory-graph` (base `main` at `3389d5ca8`). Contract of record: section 2.1 of
`docs/design-system/thoth/thoth-apply-plan.md` (pull request #1427).

## 1. Codebase evidence

| # | Fact | Source |
| --- | --- | --- |
| B1 | Worker query kinds are a Zod discriminated union (`memory`, `symbols`, `symbol-page`, `list`, `chunks`), each with `id`, `budgetMs`, `sentAtMs` | `memory-curator/src/lib/search-worker.protocol.ts:48-91` |
| B2 | Result schemas come from `createSearchWorkerResultSchemas(report)`; `SearchWorkerResultMap` is keyed by query kind, so a new kind needs a schema entry | `search-worker.protocol.ts:296-314` |
| B3 | The worker dispatches in `SearchWorkerRuntime.run(state, query, deadlineMs)`; `state` has `db`, `vecStatus`, `memoryStore` | `search-worker-runtime.ts:254-275`, `:159-173` |
| B4 | Client calls use `this.request(body, schema, empty, callerDeadlineMs?)`. A failed or late request resolves with `empty`. Default worker timeout 5 s | `search-worker.client.ts:128-172`, `:208` |
| B5 | `ISqliteSearchWorker` is the port; `MemoryStore` receives it as an optional dependency and falls back to in-process SQL (`listSnapshot`, `getChunksAsync`) | `search-worker.port.ts:28-34`, `memory.store.ts:155-176` |
| B6 | `memories` columns: `id, session_id, workspace_root, tier, kind, subject, content, salience, hits, pinned, created_at, updated_at, last_used_at, expires_at, quarantined_at`. Active rows have `quarantined_at IS NULL` | `persistence-sqlite/.../0002_memory.ts`, `memory.store.ts:527` |
| B7 | `memory_chunks(id, memory_id, ord, …)`; `memory_chunks_vec` is `vec0(embedding FLOAT[384])` keyed by the `rowid` of `memory_chunks` | `memory.store.ts:289-293`, `0007_fix_vec0_rowid.ts` |
| B8 | Vectors are unit length, metric L2. Cosine = dot product | handoff, verified in phase 1 review |
| B9 | `VecAvailability { available }` is injected in the store (`PERSISTENCE_TOKENS.VEC_STATUS`) and created in the worker from `loadVec` | `sqlite-reader-deps.types.ts:23-25`, `search-worker-runtime.ts:159` |
| B10 | Handler pattern: `Schema.parse(params ?? {})` in a try block, `RpcUserError('Invalid parameters for …', 'INVALID_PARAMS')`, `resolveReadScope(scope, workspaceRoot)` for the read scope | `memory-rpc.handlers.ts:437-472` |
| B11 | Registration points: `RpcMethodRegistry` (`rpc.types.ts:2562`), name map (`:4074`), `MemoryRpcHandlers.METHODS` (`memory-rpc.handlers.ts:159-176`) | grep |
| B12 | `search-deadline.ts` has `remainingMs`, `wireBudgetMs`, `localDeadlineMs` | read |

## 2. Architecture decision

1. **One pure module.** `memory-graph.ts` exports `buildMemoryGraph(db, options)`. It is
   synchronous and has no DI. The worker and the in-process fallback call the same function.
2. **No new service, no new token.** `MemoryStore.graphSnapshot(params, deadlineMs)` follows
   `listSnapshot` (B5). No change in `apps/ptah-electron/src/di` or `cli-engine/container.ts`.
   The apply plan named `memory-graph.service.ts`; a pure module replaces it (smaller surface,
   no host registration).
3. **The pairwise similarity runs only in the worker.** Without a worker (CLI host) or when the
   worker request fails, the store calls `buildMemoryGraph` in process with `semantic: false`.
   The result then has `semanticAvailable: false`. The main thread never does the O(n²) work.
4. **Internal type = wire type.** The graph types live in `@ptah-extension/shared`
   (`rpc-memory.types.ts`). `memory-curator` already imports `shared`. No mapper is necessary.

## 3. Wire types (final) — `libs/shared/src/lib/types/rpc/rpc-memory.types.ts`

Exactly the block in apply plan section 2.1 (`MemoryGraphEdgeKind`, `MemoryGraphParams`,
`MemoryGraphNodeWire`, `MemoryGraphEdgeWire`, `MemoryGraphResult`), plus exported constants:

```typescript
export const MEMORY_GRAPH_LIMITS = {
  maxNodes: { min: 1, max: 1500, default: 150 },
  k: { min: 1, max: 32, default: 8 },
  minSimilarity: { min: 0.5, max: 0.99, default: 0.75 },
  edgeCapFactor: 6,
  previewChars: 160,
} as const;
```

Registry: `'memory:graph': { params: MemoryGraphParams; result: MemoryGraphResult }` and the name
map entry. `rpc.types.ts:129` already re-exports the file. Do NOT edit
`host-source-registry.baseline.ts`: its contract spec checks only host-source-shaped names, and
`memory:graph` is not one (a baseline change needs a TASK_2026_610 exception). The apply plan row
for that file is wrong.

## 4. Components

### 4.1 `memory-graph.ts` — CREATE in `libs/backend/memory-curator/src/lib/`

```typescript
export interface ResolvedMemoryGraphParams {
  readonly workspaceRoot: string | null; // null = all workspaces
  readonly tiers: readonly MemoryTierWire[] | null; // null = all
  readonly kinds: readonly MemoryKindWire[] | null;
  readonly pinnedOnly: boolean;
  readonly sessionId: string | null;
  readonly createdFrom: number | null;
  readonly createdTo: number | null;
  readonly maxNodes: number; // already clamped
  readonly edgeKinds: readonly MemoryGraphEdgeKind[];
  readonly k: number;
  readonly minSimilarity: number;
}
export interface BuildMemoryGraphOptions {
  readonly params: ResolvedMemoryGraphParams;
  readonly semantic: boolean; // false: skip vectors (vec off, or main thread)
  readonly deadlineMs?: number; // performance.now() clock
}
export function resolveMemoryGraphParams(p: MemoryGraphParams): ResolvedMemoryGraphParams;
export function buildMemoryGraph(db: SqliteDatabase, o: BuildMemoryGraphOptions): MemoryGraphResult;
```

Rules:

- `resolveMemoryGraphParams` clamps again (defense in depth; the worker gets resolved params).
- Node query: `WHERE quarantined_at IS NULL` + filters (`workspace_root IS ?` only when not
  null; `tier IN`, `kind IN`, `pinned = 1`, `session_id = ?`, `created_at >= ?`, `<= ?`),
  `ORDER BY pinned DESC, salience DESC, last_used_at DESC, id ASC LIMIT maxNodes`. All values
  are bound parameters. A separate `COUNT(*)` gives `totalMatching`. `capped = totalMatching >
  nodes.length`. `preview` = first 160 characters of `content`.
- Subject edges: group by `subject.trim().toLowerCase()` (skip null and empty); chain by
  `createdAt`, then `id`. Session edges: the same per `sessionId`. Weight 1.
- Semantic edges (only when `semantic` and `edgeKinds` has `semantic` and at least 2 nodes):
  1. Read vectors in batches of 400 ids:
     `SELECT c.memory_id AS memoryId, v.embedding AS embedding FROM memory_chunks c JOIN
     memory_chunks_vec v ON v.rowid = c.rowid WHERE c.memory_id IN (…)`.
     `embedding` is a `Buffer` of 384 little-endian float32 values; copy it to a `Float32Array`
     (respect `byteOffset`; skip a row with a different length).
  2. Mean per memory, then normalize. Skip a memory with no vector or a zero norm.
  3. Pairwise dot product in one flat `Float32Array` matrix loop. Check the deadline one time
     per outer row. Per node keep the top `k` pairs with similarity ≥ `minSimilarity`.
  4. Clamp the weight to 0..1.
  A thrown error or a passed deadline in this block gives `semanticAvailable: false` and no
  semantic edges. The node list and the chain edges stay.
- `semanticAvailable` is true only when the semantic block ran to its end. It is also true when
  the caller did not request semantic edges but `semantic` is true (vec is available).
- Edge identity: `source < target` (string compare), dedupe by `(source, target, kind)`.
  `edgeCap = 6 × maxNodes`. Order: semantic by weight descending, then subject, then session;
  cut at `edgeCap`. Ties break by `source`, then `target` (deterministic output).

Spec `memory-graph.spec.ts` (in-memory `better-sqlite3`, follow the DB setup of an existing
spec in this lib, for example `memory.store.spec.ts`): each filter, order and cap,
`totalMatching`, chains (n − 1 edges, order), dedupe and `source < target`, edge cap order,
`semantic: false`, missing vec table → `semanticAvailable: false` without a throw, passed
deadline, and the similarity math with a fake vector table (a plain table named
`memory_chunks_vec(rowid, embedding BLOB)` is sufficient for the join when sqlite-vec is not
loaded in the spec; if the lib specs load sqlite-vec, use the real table).

### 4.2 Worker — MODIFY `search-worker.protocol.ts`, `search-worker-runtime.ts`, `search-worker.client.ts`, `search-worker.port.ts`

- Protocol: query kind `graph` `{ kind, id, params: <strict Zod object of ResolvedMemoryGraphParams>, budgetMs, sentAtMs }`.
  Result schema `graph`: a strict object for `MemoryGraphResult` (nodes and edges are plain
  `z.array`, not tolerant: a bad row is a defect, and the client then degrades).
- Runtime: `case 'graph': return buildMemoryGraph(state.db, { params: query.params, semantic: state.vecStatus.available, deadlineMs });`
- Port + client: `graphMemories(params: ResolvedMemoryGraphParams, deadlineMs?: number): Promise<MemoryGraphResult | null>`;
  `empty` is `null` (schema `.nullable()` is not necessary: pass `null` as the degraded value
  with the result type widened). Every other implementer of `ISqliteSearchWorker` (test fakes)
  gets the method.
- Specs: one case each in `search-worker-runtime.spec.ts` and `search-worker.client.spec.ts`.

### 4.3 Store — MODIFY `memory.store.ts`

```typescript
async graphSnapshot(params: MemoryGraphParams, deadlineMs?: number): Promise<MemoryGraphResult> {
  const resolved = resolveMemoryGraphParams(params);
  const fromWorker = this.searchWorker ? await this.searchWorker.graphMemories(resolved, deadlineMs) : null;
  return fromWorker ?? buildMemoryGraph(this.connection.db, { params: resolved, semantic: false });
}
```

Spec: worker result is returned; `null` from the worker and no worker both give the in-process
result with `semanticAvailable: false`.

### 4.4 RPC — MODIFY `memory-rpc.schema.ts`, `memory-rpc.handlers.ts` (+ spec)

`MemoryGraphParamsSchema` (strict object). Out-of-range numbers are **clamped**, not rejected
(`z.number().finite().transform(clamp)`); `maxNodes` and `k` are floored. Arrays: `tiers` and
`kinds` use the wire enums, max length 3 and 4; `edgeKinds` max 3. `workspaceRoot` and
`sessionId`: `z.string().min(1).nullable().optional()`. `createdFrom`/`createdTo`: finite,
non-negative; when both exist and `createdFrom > createdTo` → `INVALID_PARAMS`.

Handler `memory:graph`: parse (B10) → deadline `performance.now() + 4_000` →
`this.store.graphSnapshot(validated, deadline)` → return. Add `'memory:graph'` to `METHODS`.
Log one `info` line with node count, edge count, `capped`, `semanticAvailable` and elapsed ms
(no memory content). Scope rule: `workspaceRoot` null or absent means all workspaces, as in
`memory:diagnostics`; do not call `resolveReadScope` unless it accepts this shape unchanged.

Spec cases: invalid params, clamps, pass-through, `METHODS` contains the name.

## 5. Checks

Lane (focused only):

```
npx jest --config libs/backend/memory-curator/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/memory-rpc.handlers.spec.ts
npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
npx eslint <changed files>
```

Coordinator: `npm run verify -- --related -p shared,memory-curator,rpc-handlers`, then
`-t lint,typecheck` for the same projects plus `worker-runtime,cli-engine,ptah-electron`
(a registry or port change can break a fake in those projects).

## 6. Risks

- `shared` changes invalidate the Nx cache of 66 projects. Change the shared types one time.
- Registry guards: a spec can assert the method count or the baseline list. Run the `shared`
  related tests after the registry edit.
- 1,500 nodes: about 1.1 million pairs × 384 = 0.4 to 0.6 s in the worker. The 4 s deadline and
  the per-row check bound it. The UI default is 150 nodes.

## Lane-introduced constraints

None. Decision 2 (pure module in place of a service) is an orchestrator proposal for Gate 2.

## Revision 1 (after `implementation-plan-review.md`, 2026-11-18)

These rules replace the text above where they differ.

- R1 (defect 1). B6: `quarantined_at` comes from migration `0048_memory_quarantine.ts:19`, not
  from `0002_memory.ts`. The graph query needs the migrated schema. Specs build their database
  with the migration runner (or create the column), not from `0002` alone.
- R2 (defect 6). An absent or empty `tiers` / `kinds` / `edgeKinds` array means "all". The SQL
  builder never emits `IN ()`. `maxNodes` and `k` are floored, then clamped. Specs cover the
  empty arrays and fractional boundary values (`0.4` → 1, `1500.9` → 1500).
- R3 (defect 7). Deadline: the handler computes `deadline = performance.now() + 4_000` and
  passes it to `graphSnapshot`, which passes it to `graphMemories(resolved, deadline)` as the
  `callerDeadlineMs` of `request`. The client then resolves with `null` at the deadline (queue
  time included), and the worker receives the remaining budget (`budgetMs`). Tests: a queued or
  late `graph` request resolves `null`; the store then returns chain edges with
  `semanticAvailable: false`.
- R4 (defect 7). The fallback does not hide failures. Parameter validation runs in the handler
  before the store call. An error in the in-process `buildMemoryGraph` (node query, count) is
  not caught: the RPC fails. Only the semantic block degrades. The store logs one `warn` when
  it uses the fallback after a `null` worker result.
- R5 (review decision). Add one spec case that reads a real sqlite-vec BLOB when the lib specs
  can load sqlite-vec (see how `memory.store.spec.ts` or `scoped-vector-search` specs get it);
  otherwise keep the plain-table fake and say so in the report.
- R6. `host-source-registry.baseline.ts` stays unchanged (confirmed by the review).
- R7 (scope convention, orchestrator). `MemoryGraphParams` gets `scope?: MemoryQueryScope` and
  follows `memory:stats` (`memory-rpc.handlers.ts:245-252`, `resolveReadScope`): `'all'` = every
  workspace; `'workspace'` (default) + string = that workspace; + `null` = unscoped rows only;
  + absent = the host workspace root. The handler resolves this. Below the handler,
  `workspaceRoot` is tri-state: `undefined` = no workspace filter, `null` =
  `workspace_root IS NULL`, string = `workspace_root IS ?`. The store and the worker ignore
  `scope`. This replaces "null = all workspaces" in section 3 and 4.1.
