# Thoth redesign: apply plan (TASK_2026_2271_7a3e)

This plan turns the design in [thoth-design-spec.md](thoth-design-spec.md) into two pull
requests. Phase 2 is Memory and the `memory:graph` RPC. Phase 3 is Skills.

## Rules for every PR

- Work in a task worktree from `main`. Follow `CLAUDE.md` for checks, commits and the PR.
- Visual review in Electron only. Compare with the screens in `prototype/screens/` at 784,
  1168 and 1440 in both themes. Put the table (view, width, theme, prototype screen, Electron
  after) in the PR body.
- Every `id`, `data-testid` and `aria-label` that exists today stays (see the parity tables in
  the spec, section 12). The PR states the parity check result in one line.
- Every dropdown is `ptah-select`. Every text field is `ptah-field` with a floating label, except
  compact toolbar search fields and setting-row controls.
- After a template change run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.

## Phase 2: Memory + `memory:graph`

### 2.1 RPC contract

Add to `libs/shared/src/lib/types/rpc/rpc-memory.types.ts` and register `'memory:graph'` in the
RPC method registry (`libs/shared/src/lib/types/rpc.types.ts`):

```typescript
export type MemoryGraphEdgeKind = 'semantic' | 'subject' | 'session';

export interface MemoryGraphParams {
  readonly workspaceRoot?: string | null; // null = all workspaces
  readonly tiers?: readonly MemoryTierWire[]; // default: all
  readonly kinds?: readonly MemoryKindWire[]; // default: all
  readonly pinnedOnly?: boolean; // default false
  readonly sessionId?: string | null;
  readonly createdFrom?: number; // epoch ms
  readonly createdTo?: number; // epoch ms
  readonly maxNodes?: number; // default 150, clamped 1..1500
  readonly edgeKinds?: readonly MemoryGraphEdgeKind[]; // default: all three
  readonly k?: number; // semantic neighbors per node, default 8, clamped 1..32
  readonly minSimilarity?: number; // default 0.75, clamped 0.5..0.99
}

export interface MemoryGraphNodeWire {
  readonly id: string;
  readonly subject: string | null;
  readonly preview: string; // first 160 chars of content
  readonly tier: MemoryTierWire;
  readonly kind: MemoryKindWire;
  readonly salience: number;
  readonly hits: number;
  readonly pinned: boolean;
  readonly sessionId: string | null;
  readonly workspaceRoot: string | null;
  readonly createdAt: number;
  readonly lastUsedAt: number;
}

export interface MemoryGraphEdgeWire {
  readonly source: string; // memory id, source < target (undirected, no duplicates)
  readonly target: string;
  readonly kind: MemoryGraphEdgeKind;
  readonly weight: number; // semantic: cosine similarity 0..1; subject and session: 1
}

export interface MemoryGraphResult {
  readonly nodes: readonly MemoryGraphNodeWire[];
  readonly edges: readonly MemoryGraphEdgeWire[];
  readonly totalMatching: number; // nodes before the cap
  readonly capped: boolean;
  readonly semanticAvailable: boolean; // false when sqlite-vec is off (vecStatus.available)
  readonly edgeCap: number; // max edges returned (default 6 x maxNodes)
}
```

Rules:

- Node selection: apply the filters in SQL, order by `pinned DESC, salience DESC, lastUsedAt
DESC`, take `maxNodes`.
- Semantic edges: compute them exactly over the selected nodes, in the search worker.
  1. Read the chunk vectors of the selected memories from `memory_chunks_vec`.
  2. Take the mean vector per memory and normalize it to unit length.
  3. Compute the pairwise dot product (n is at most 1,500, so at most about 1.1 million pairs).
  4. Per node, keep the top `k` pairs with a similarity of at least `minSimilarity`.
- Do not use `scopedVectorCandidates` for the edges. It takes the global top
  `MAX_SCOPED_VECTOR_CANDIDATES` (2048) neighbors and filters them afterwards, and it clamps
  the limit to 100. On a large database it drops neighbors of the selected nodes without a
  sign (see the recall note in `scoped-vector-search.ts`).
- Distance metric: `memory_chunks_vec` is `vec0(embedding FLOAT[384])` with no
  `distance_metric` option (`migrations/0007_fix_vec0_rowid.ts`), so sqlite-vec uses L2. The
  embedder writes unit vectors (`normalize: true` in `embedder-worker.ts`). The dot product of
  two unit vectors is the cosine similarity. If a step uses a vec distance `d`, the cosine
  similarity is `1 - d * d / 2`, not `1 - d`.
- Subject edges: group nodes by normalized subject (lowercase, trimmed). For a group of n
  nodes, link them as a chain ordered by `createdAt` (n - 1 edges), not as a clique.
- Session edges: the same chain rule per `sessionId`.
- When vec is off, return `semanticAvailable: false` and no semantic edges. Do not fail.
- Keep the top `edgeCap` edges by weight (semantic first). Dedupe by `(source, target, kind)`.
- Run the similarity work in the search worker, not on the main thread. Add a deadline as
  `search-deadline.ts` does for search. If the deadline passes, return the subject and session
  edges with `semanticAvailable: false`.

### 2.2 Files (backend)

| File                                                                                                                   | Change                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `libs/shared/src/lib/types/rpc/rpc-memory.types.ts`                                                                    | Types above                                                                                               |
| `libs/shared/src/lib/types/rpc.types.ts`                                                                               | Register `memory:graph` in the method registry and in the method-name map (the `'memory:list': true` map) |
| `libs/shared/src/lib/types/rpc/host-source-registry.baseline.ts`                                                       | Add `memory:graph`                                                                                        |
| `libs/backend/memory-curator/src/lib/memory-graph.service.ts` (new)                                                    | Node query, subject and session chains, edge cap                                                          |
| `libs/backend/memory-curator/src/lib/memory-graph.service.spec.ts` (new)                                               | Filters, cap, chains, vec off, dedupe                                                                     |
| `libs/backend/memory-curator/src/lib/search-worker.protocol.ts`, `search-worker-runtime.ts`, `search-worker.client.ts` | New `graph` request and response kinds, the worker handler and the client call                            |
| `libs/backend/memory-curator/src/lib/di/*` and index                                                                   | Register and export the service                                                                           |
| `libs/backend/rpc-handlers/src/lib/handlers/memory-rpc.schema.ts`                                                      | Zod schema with the clamps                                                                                |
| `libs/backend/rpc-handlers/src/lib/handlers/memory-rpc.handlers.ts` (+ spec)                                           | `memory:graph` handler, and the entry in `MemoryRpcHandlers.METHODS`                                      |
| `apps/ptah-electron/src/di/*`, `libs/backend/cli-engine/src/lib/container.ts`                                          | Registration in both hosts if the service is not created by the lib registration                          |

### 2.3 Files (frontend)

| File                                                                                                                                                                    | Change                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                                                                                                          | Add `sigma`, `graphology`, `graphology-layout-forceatlas2` (exact versions after a license and size check) |
| `libs/frontend/memory-curator-ui/src/lib/services/memory-rpc.service.ts`                                                                                                | `graph(params)`                                                                                            |
| `libs/frontend/memory-curator-ui/src/lib/services/memory-graph-state.service.ts` (new)                                                                                  | Filters, selection, view, cap; filters shared with the List view                                           |
| `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph.component.ts` (new)                                                                              | Lazy sigma host, keyboard model, live region                                                               |
| `.../graph/graph-toolbar.component.ts`, `graph-filter-rail.component.ts`, `time-brush.component.ts`, `memory-inspector.component.ts`, `graph-legend.component.ts` (new) | Spec section 7                                                                                             |
| `.../components/memory-curator-tab.component.ts`                                                                                                                        | New header, band, view bar, views. Keep all test ids                                                       |
| `.../components/memory-entry-list.component.ts`                                                                                                                         | Becomes the List view (`ptah-table`, multi-select)                                                         |
| `.../components/memory-stats-strip.component.ts`                                                                                                                        | `ptah-instrument-band`                                                                                     |
| `.../components/corpus-*.component.ts`                                                                                                                                  | Boards view restyle, no behavior change                                                                    |
| `.../components/diagnostics/*`                                                                                                                                          | Health view sections, no behavior change                                                                   |
| `apps/ptah-extension-webview` `verify-eager-bundle` expectations                                                                                                        | Sigma must stay out of the eager bundle                                                                    |

### 2.4 Checks

1. `npm run verify -- --related -p memory-curator,rpc-handlers,shared,memory-curator-ui`
2. `npm run verify -- -t lint,typecheck -p memory-curator,rpc-handlers,shared,memory-curator-ui`
3. `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
4. Full gate before the push: `npm run verify -- -p memory-curator,rpc-handlers,shared,memory-curator-ui,thoth-shell`
5. Electron screenshots for the visual gate.

## Phase 3: Skills

| File                                                                                                                    | Change                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `libs/frontend/skill-synthesis-ui/src/lib/components/skill-synthesis-tab.component.ts`                                  | Header with toggles, band, view bar, Maintenance tab                        |
| `.../clones/skill-clones-view.component.ts`                                                                             | Split: toolbar + `library-table.component.ts` (new). Keep the state service |
| `.../clones/clone-card.component.ts`                                                                                    | Retired; its content moves to table cells. Keep its test ids on the row     |
| `.../clones/clone-detail-drawer.component.ts`                                                                           | `ptah-native-drawer`, sections per spec section 5                           |
| `.../clones/agent-model-editor.component.ts`                                                                            | Drawer "Model per provider" table; `ptah-select`                            |
| `.../clones/quarantined-agents-panel.component.ts`, `phase-scorecards.component.ts`, `skill-specs-control.component.ts` | Maintenance sections                                                        |
| `.../clones/clone-bulk-toolbar.component.ts`, `bulk-rebase-confirm.component.ts`                                        | Toolbar button + `ptah-native-modal`                                        |

No RPC change. Checks: `--related`, then `-t lint,typecheck`, `typecheck-templates`, and the full
gate for `skill-synthesis-ui,thoth-shell`.

## Order

Phase 2 first (one PR). Phase 3 can start in a second worktree after the phase 2 shared
components are merged, because the library table reuses the table and band patterns.
