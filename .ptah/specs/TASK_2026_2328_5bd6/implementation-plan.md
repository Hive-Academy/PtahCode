# Implementation Plan - TASK_2026_2328_5bd6

Performance-backed routing: score provider + model + effort from real outcomes, discover model
catalogs off the routing hot path, record System One proposal outcomes, and carry every
lane-reported model and effort value unchanged (native-source fidelity).

- Requirements: `task-description.md` revision 4 (FA1-FA9). Binding user decisions:
  `decisions.md` rows 6-10, 12 and 14-15. Revision 3 adds FA8 (user words: "every value should
  be populated from their original lane"). Revision 4 adds FA9 (seed format ready for public
  benchmark sources).
- Evidence: `research-report.md` and the code reads cited below. Paths are relative to the
  worktree root `/home/amun/ptah-extension/.claude-worktrees/performance-backed-routing`.
- Skills: `nx-workspace-architect` and `angular-frontend-patterns` were assigned. The host
  refused both ("disabled for model invocation in skillOverrides settings"). This plan does not
  use their rules. Nx boundaries below come from `eslint.config.mjs:279-319` and the
  `project.json` tags. Angular rules come from the existing settings components.

---

## 0. Design summary

1. **Two scoring modes.** A new setting `agentOrchestration.performanceRouting` (default
   `true`) selects the mode for each route call.
   - `off`: the route call runs today's routing path: live model listing in the 2000 ms race,
     today's matrix, today's `score()` with the system CLI promotion block, rule table effort.
     The only new result fields are the top-level `routeId` and the per-entry `effortCheck`
     (FA8.4). Both are additive. They do not change a choice.
   - `on`: routing reads a catalog snapshot, scores (model, effort) pairs from a new evidence
     index, allows promotion for system CLI lanes, and runs bounded exploration.
2. **Today's matrix stays as it is.** `deriveLocalMatrix` and the capability matrix layers do
   not change behavior. The evidence index is a separate pure derivation over the same
   summaries and the same window.
3. **Outcome rows get optional, nullable columns** (migration 0078, 14 columns). Old rows read
   as `null`, and `null` maps to defined buckets.
4. **A route identity closes the loop.** `ptah_route_decide` returns `routeId`. The
   coordinator passes `route: { routeId, phaseId }` to `ptah_agent_spawn`. The host stamps the
   routed model, routed effort and System One facts on the lane record.
5. **Native-source fidelity (FA8).** Every model, supported-effort, default-effort,
   resolved-model and resolved-effort value that a lane reports travels unchanged with
   provenance `native`. Each value that a lane does not report is an explicit `unknown`. Each
   Ptah table (effort mappers, fixed lists, profile menus) stays only as a labeled
   `ptah-fallback`. Fallback values are never shown or scored as native. A requested effort
   outside the lane's native list is never mapped. The spawn record and the route result state
   the requested value, the sent value and the reason.
6. **Seed format (FA9).** Each seed cell names its source id, license id, fetch date and
   source row. A seed profile can carry an effort. Benchmark rows reach lane catalog ids only
   through a data-only alias map; a row without an alias is dropped and counted. The shipped
   seed keeps its one value (`z-ai`/`glm-5`, implement, 80). No network call. In on mode the
   seed is a prior inside the blend, so local evidence can overrule it (4.8).
7. **Settings visibility** uses a new read-only RPC `agent:getRoutingEvidence` and two new
   Electron settings components. The capability matrix RPC does not change.

---

## 1. Component boundaries

All backend libraries below have tags `scope:extension`, `type:feature`
(`vscode-lm-tools` also has `domain:vscode`). `scope:extension` may depend on `scope:shared`
and `scope:extension` only (`eslint.config.mjs:285-287`). No new dependency edge is added
between projects. Every import goes through a project barrel. No deep import is added.

| Project | Responsibility in this task | Existing edge it uses |
| --- | --- | --- |
| `libs/shared` | Outcome record fields, process and spawn fields, native-value types, evidence RPC contract | none (leaf) |
| `libs/backend/persistence-sqlite` | Migration 0078 (14 nullable columns) | none |
| `libs/backend/lane-outcomes` | Row schema and SQLite column map. The reader returns the new fields unchanged | `shared` |
| `libs/backend/codex-runtime` | Keep server-reported model, session effort, per-model efforts and default effort | `shared` |
| `libs/backend/acp-runtime` | Expose the session's current model, current effort and advertised effort values | `shared` |
| `libs/backend/cli-agent-runtime` | Adapter catalog efforts, reported session values, effort policy with native lists, native effort registry, capture at completion | `shared`, `lane-outcomes`, `codex-runtime`, `acp-runtime` (all existing) |
| `libs/backend/lane-routing` | Catalog snapshot, evidence index and funnel, pair scoring, exploration, route records, setting reader, evidence view | `shared`, `platform-core` |
| `libs/backend/rpc-handlers` | Pass efforts through, record the Codex catalog in the registry, `agent:getRoutingEvidence` | `lane-routing`, `cli-agent-runtime` (existing) |
| `libs/backend/vscode-lm-tools` | `route` spawn argument and route fact lookup | `lane-routing` (existing, `agent-namespace.builder.ts:18`) |
| `libs/backend/platform-core`, `libs/backend/agent-sdk` | Setting key, default, routing key set, settings export list | none new |
| `libs/frontend/chat` | Toggle and evidence components on the decision matrix page | `shared` types, `@ptah-extension/core` RPC |

Rules that the work units keep:

- `lane-outcomes` and `lane-routing` do not import each other. They meet only through
  `LaneOutcomeReader` in `shared` (`lane-outcome.types.ts:166-187`).
- `cli-agent-runtime` does not import `lane-routing`. The native effort registry for spawn
  lives in `cli-agent-runtime` (2.12.4). Routing gets the same values through the
  `LaneModelListing` port.
- The renderer component has no Node or Electron import.
- `score()` stays pure (`ranking/score.ts:4`).

### 1.1 New files

| File | Purpose |
| --- | --- |
| `libs/shared/src/lib/types/lane-native-values.types.ts` | `EffortSupport`, `ValueProvenance`, `EffortDisposition`, `LaneReportedSession` |
| `libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts` | RPC contract |
| `libs/backend/persistence-sqlite/src/lib/migrations/0078_lane_outcome_choice_keys.ts` (+ `.spec.ts`) | 14 `ALTER TABLE ... ADD COLUMN` |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/native-effort.registry.ts` (+ `.spec.ts`) | Last native effort list per lane and model, for spawn |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.ts` (+ `.spec.ts`) | Effort flag read from the installed `copilot --help` |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-models.spec.ts` | Native efforts per Codex model |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts` | ACP reported session values |
| `libs/backend/lane-routing/src/lib/catalog/lane-catalog.types.ts` | Snapshot types and stored document schema |
| `libs/backend/lane-routing/src/lib/catalog/lane-catalog.store.ts` (+ `.spec.ts`) | Snapshot, persistence, single-flight refresh |
| `libs/backend/lane-routing/src/lib/matrix/seed-source.ts` | Seed source row and alias schemas, `compileSeed` |
| `libs/backend/lane-routing/src/lib/matrix/seed-aliases.ts` | Data-only alias map (one entry today) |
| `libs/backend/lane-routing/src/lib/matrix/seed-source.spec.ts` | Seed validation, alias join, drop counts |
| `libs/backend/lane-routing/src/lib/matrix/blend.ts` | Blend helpers moved out of `local-derivation.ts` without change |
| `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts` (+ `.spec.ts`) | Evidence index, score key rule, funnel |
| `libs/backend/lane-routing/src/lib/ranking/choice.types.ts` | Pair scoring types |
| `libs/backend/lane-routing/src/lib/ranking/score-choice.spec.ts` | Pair scoring, exploration, promotion tests |
| `libs/backend/lane-routing/src/lib/scope/performance-routing-setting.ts` | Setting reader |
| `libs/backend/lane-routing/src/lib/pipeline/route-choice.spec.ts` | Pipeline tests, including the off-mode golden test |
| `libs/backend/lane-routing/src/lib/route/route-record.registry.ts` (+ `.spec.ts`) | Bounded map `routeId` -> per-phase spawn facts |
| `libs/backend/lane-routing/src/lib/evidence/routing-evidence.service.ts` (+ `.spec.ts`) | View for the settings RPC |
| `libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.ts` (+ `.spec.ts`) | RPC handler |
| `libs/frontend/chat/src/lib/settings/ptah-ai/performance-routing-setting.component.ts` (+ `.spec.ts`) | On/off toggle |
| `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.ts` (+ `.spec.ts`) | Catalog, funnel and System One tables |

Changed files are listed per work unit in section 7.

---

## 2. Verified contracts

### 2.1 Native-value types (shared, new file `lane-native-values.types.ts`)

```ts
/** Where a value came from. `native`: the lane's own API or CLI reported it (FA8.1, FA8.2). */
export const VALUE_PROVENANCE = ['native', 'ptah-fallback', 'unknown'] as const;
export type ValueProvenance = (typeof VALUE_PROVENANCE)[number];

/** Efforts a lane accepts for one model. Values are the vendor's exact strings, in vendor order. */
export type EffortSupport =
  | { readonly provenance: 'native'; readonly supported: readonly string[]; readonly default: string | null }
  | { readonly provenance: 'ptah-fallback'; readonly supported: readonly string[]; readonly default: null }
  | { readonly provenance: 'unknown' };

/** Why the sent effort differs from, or equals, the requested one (FA8.4). */
export const EFFORT_DISPOSITIONS = [
  'none-requested',            // no step offered a value
  'native-match',              // requested value is in the native list; sent unchanged
  'not-in-native-list',        // requested value is not in the native list; not sent
  'lane-takes-no-effort',      // native list is empty, or the lane has no effort transport
  'fallback-allowlist',        // no native list; Ptah fallback allowlist sent the value unchanged
  'fallback-mapped',           // no native list; Ptah fallback mapper changed the value
  'fallback-refused',          // no native list; Ptah fallback rejected the value
  'cli-has-no-effort-flag',    // installed CLI reports no effort flag (FA8.6)
  'lane-refused',              // the lane refused the value at session setup (ACP hint, Claude metadata)
] as const;
export type EffortDisposition = (typeof EFFORT_DISPOSITIONS)[number];

/** Values the lane itself reported for its session. Null: not reported. Never filled by Ptah. */
export interface LaneReportedSession {
  readonly model: string | null;
  readonly effort: string | null;
  /** Native effort list of the session's model, when the session advertised one. */
  readonly efforts: EffortSupport;
}
```

`EffortSupport` replaces each bare `readonly string[]` effort list on the routing path. An
absent value on an input boundary is normalized to `{ provenance: 'unknown' }`, so each stored
snapshot entry and each row holds an explicit unknown (FA8.3).

### 2.2 Outcome record (shared `lane-outcome.types.ts`)

Today `model` is "As spawned" (`:85-86`) and the record has no effort (`:71-120`). The new
fields are optional and nullable, the same pattern as `phaseKind` (`:93-97`).

```ts
/** How the requested model was chosen (cli-agent-runtime `LaneModelSource`, cli-adapter.interface.ts:142-143). */
export const OUTCOME_MODEL_SOURCES = ['request', 'setting', 'ptah-default', 'cli-default'] as const;
export type OutcomeModelSource = (typeof OUTCOME_MODEL_SOURCES)[number];
/** Which R2.3 step produced the sent effort (lane-spawn-policy.ts:310-311). */
export const OUTCOME_EFFORT_SOURCES = ['request', 'setting', 'chat', 'role-default', 'chat-fallback', 'none'] as const;
export type OutcomeEffortSource = (typeof OUTCOME_EFFORT_SOURCES)[number];
/** Same value as vscode-lm-tools MAX_EFFORT_LENGTH (agent-spawn-args.schema.ts:75). */
export const MAX_OUTCOME_EFFORT_LENGTH = 32;

export interface LaneOutcomeRecord {
  // ... every existing field unchanged ...
  readonly modelSource?: OutcomeModelSource | null;
  /** Model the lane reported it ran (2.12.3). Null: not reported, or old row. */
  readonly resolvedModel?: string | null;
  /** `native` when resolvedModel is set, `unknown` when the lane reported none. Null: old row. */
  readonly resolvedModelProvenance?: Extract<ValueProvenance, 'native' | 'unknown'> | null;
  /** First effort value offered by the R2.3 precedence (FA8.4 "requested value"). */
  readonly requestedEffort?: string | null;
  /** Effort sent to the CLI. Null: none sent, or old row. */
  readonly effort?: string | null;
  readonly effortSource?: OutcomeEffortSource | null;
  /** Provenance of the list that checked or mapped the effort. */
  readonly effortProvenance?: ValueProvenance | null;
  readonly effortDisposition?: EffortDisposition | null;
  /** Effort the lane reported for its session (2.12.3). Null: not reported, or old row. */
  readonly resolvedEffort?: string | null;
  readonly resolvedEffortProvenance?: Extract<ValueProvenance, 'native' | 'unknown'> | null;
  readonly routedModel?: string | null;
  readonly routedEffort?: string | null;
  /** `<kind>:<model>` of the System One model that proposed; null: no proposal. */
  readonly decisionModel?: string | null;
  readonly proposalConfidence?: number | null;
}

/** What routing reads. Holds no text: ids, enums and numbers only. */
export type LaneOutcomeSummary = Pick<LaneOutcomeRecord,
  | /* existing 15 keys, lane-outcome.types.ts:125-139 */
  | 'modelSource' | 'resolvedModel' | 'resolvedModelProvenance' | 'requestedEffort' | 'effort'
  | 'effortSource' | 'effortProvenance' | 'effortDisposition' | 'resolvedEffort'
  | 'resolvedEffortProvenance' | 'routedModel' | 'routedEffort' | 'decisionModel'
  | 'proposalConfidence'>;
```

- Resolved values are stored only when native. A fallback never fills `resolvedModel` or
  `resolvedEffort` (FA8.3).
- FA2.5 privacy: every value is an id, an enum or a number. A `custom` decision selection has
  `baseUrl` (`decision-model.types.ts:30-36`), so the id is `custom:<model>` only.
  `structured` gives `structured:<providerId>/<model>`.
- Truncation point: `RouteDecideService` builds the id with `decisionModelIdOf(selection)` and
  truncates it to 128 characters when it stores `RouteSpawnFacts` (2.10). The completion writer
  (3.2 step 4) truncates again before the row is built, because the row schema rejects a longer
  value and `enqueueLaneCompletionOutcome` then drops the whole row in its catch
  (`lane-completion-outcome.ts:89`). Spec cases: an over-long id in the registry and in
  `routeFacts` gives a stored id of exactly 128 characters and a written row.

### 2.3 Row schema and SQLite migration

`lane-outcomes/src/lib/lane-outcome.schema.ts:42-80` adds one entry for each field of 2.2,
each `.nullable().default(null)`. Enums use the shared constants. Strings: model ids
`.min(1).max(200)`, efforts `.min(1).max(MAX_OUTCOME_EFFORT_LENGTH)`, `decisionModel`
`.max(128)`, `proposalConfidence` `.min(0).max(1)`.

Migration `0078_lane_outcome_choice_keys.ts`, same form as `0075_phase_grade_keys.ts` (static
SQL, bare `ALTER`, no rewrite of stored rows):

```sql
ALTER TABLE lane_outcome_records ADD COLUMN model_source TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_model TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_model_provenance TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN requested_effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort_source TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort_provenance TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN effort_disposition TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN resolved_effort_provenance TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN routed_model TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN routed_effort TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN decision_model TEXT;
ALTER TABLE lane_outcome_records ADD COLUMN proposal_confidence REAL;
```

Register version 78 after version 77 in `persistence-sqlite/src/lib/migrations/index.ts`. Add
the 14 pairs to `columns` in `store/sqlite-lane-outcome.store.ts:28-56`. `INSERT`, `UPDATE`
and `decode` derive from that list (`:57-62`, `:86-101`). The key-value and in-memory stores
parse with `LaneOutcomeRowSchema` (`key-value-lane-outcome.store.ts:71`,
`in-memory-lane-outcome.store.ts:41`), so `.default(null)` keeps old JSON rows readable.

### 2.4 Persisted-data migration and buckets

| Stored value | Model key | Effort bucket |
| --- | --- | --- |
| Old row (new columns `NULL`), `model = lane-default` or `auto` | `*` (family), as `local-derivation.ts:168-173` | `*` |
| Old row, `model = M` | `M` | `*` |
| New row, `model = M` (own id) | `M` (the requested id: routing can pass only this id back) | `effort` (sent) when it is a `ModelEffort` value, else `*` |
| New row, `model = lane-default`, `resolvedModelProvenance = native`, `resolvedModel = R` | `R` for model and pair cells. The row also counts in the family cell `*` | as above |
| New row, `model = lane-default`, `resolvedModelProvenance = unknown` | `*` | as above |

- `ModelEffort` is `low | medium | high | xhigh | max` (`MODEL_EFFORTS` and `ModelEffortSchema`,
  `route-decide-result.schema.ts:191-192`). Native values outside it (Pi `off`/`minimal`, Codex values outside it) go to `*` for scoring.
  The view still shows them unchanged.
- `deriveLocalMatrix` reads only `model`, so its output does not change (FA2.4).

### 2.5 Write-to-read trace

| Step | Writer (file) | Value | Reader |
| --- | --- | --- | --- |
| 1 | Adapters `listModels` / Codex `listCatalogModels` (2.12.2) | `CliModelInfo.efforts` | `CliDetectionService.listModelsForAll` (`cli-detection.service.ts:461`) and `CliModelListService.getCodexModelsFromCliCatalog` (`cli-model-list.service.ts:123`) |
| 2 | `CliDetectionService` | `NativeEffortRegistry.record(laneKey, models)` | APM spawn (step 3) |
| 3 | APM spawn (`agent-process-manager.service.ts:1393-1450`) | `resolveLaneEffort({ ..., nativeEfforts })` -> `info.spawnEffort`; `info.modelSource`; `info.routeFacts` | completion (step 6) |
| 4 | Adapter `SdkHandle.effortDelivery` (2.12.3) | sent value and disposition after transport (Copilot flag, ACP refusal, Claude metadata) | APM overwrites `info.spawnEffort.sent` and `.disposition` |
| 5 | Adapter `SdkHandle.reportedSession()` (2.12.3) and turn telemetry (`:2115-2119`) | native model and effort | APM stamps `info.reportedSession` at each turn end and at the terminal transition |
| 6 | `lane-completion-outcome.ts:49-88` | row fields of 2.2 | recorder -> write pipeline -> store |
| 7 | `sqlite-lane-outcome.store.ts` `columns` | 14 columns | `decode` -> `LaneOutcomeRowSchema` |
| 8 | `lane-outcome-reader.service.ts:51-85` (no change) | rows as `LaneOutcomeSummary` | `CapabilityMatrixStore.readLocalMatrix` (`capability-matrix.store.ts:300-355`) |
| 9 | `matrix/choice-evidence.ts` | evidence index and funnel | `score()` (on mode) and `RoutingEvidenceService` |
| 10 | rpc `LaneModelListingAdapter.list` | `LaneModelEntry.efforts` unchanged | lane-routing catalog snapshot -> `score()` and the view |

### 2.6 Process and spawn fields (shared `agent-process.types.ts`)

```ts
/** On AgentProcessInfo (near :330-335). */
readonly modelSource?: OutcomeModelSource;
readonly spawnEffort?: {
  readonly requested: string | null;
  readonly sent: string | null;
  readonly source: OutcomeEffortSource;
  readonly provenance: ValueProvenance;
  readonly disposition: EffortDisposition;
};
/** Latest native session values (2.12.3). Absent: the handle reports none. */
reportedSession?: LaneReportedSession;
readonly routeFacts?: RouteSpawnFacts;

/** On SpawnAgentRequest (near :533-580). */
/** Route the coordinator spawns from. Caller-set. Unknown ids are ignored. */
readonly route?: { readonly routeId: string; readonly phaseId: string };
/** Resolved by the MCP entry from `route`. NOT set by callers. */
readonly routeFacts?: RouteSpawnFacts;

export interface RouteSpawnFacts {
  readonly routeId: string;
  readonly phaseId: string;
  readonly laneId: string;
  readonly model: string;
  readonly effort: string;
  readonly source: Exclude<OutcomeRoutingSource, 'not-routed'>;
  readonly decisionModel: string | null;
  readonly proposalConfidence: number | null;
}
```

- `spawnEffort` and `reportedSession` are new fields. `reasoningEffort` and `observedModel`
  (`:331-334`) keep their meaning for the lane composer and header
  (`lane-turn-settings.store.ts:81-93`, `agent-card-header.component.ts:283`). Decision D12.
- Row writer: `routingSource = info.routingSource ?? info.routeFacts?.source ?? 'not-routed'`.
- FA5.3 override: `model` differs from `routedModel`. The reader derives it.

### 2.7 Catalog snapshot (lane-routing)

Port change, `lane-model-listing.port.ts`:

```ts
export interface LaneModelEntry {
  readonly id: string;
  readonly provenance: 'reported' | 'fallback' | 'configured' | 'tier';
  readonly auto?: boolean;
  /** Absent on input means unknown; the snapshot stores `{ provenance: 'unknown' }`. */
  readonly efforts?: EffortSupport;
}
```

Snapshot types, `catalog/lane-catalog.types.ts`:

```ts
export type CatalogStatus = 'ok' | 'timeout' | 'error' | 'empty' | 'never';

export interface LaneCatalogModel extends Omit<LaneModelEntry, 'efforts'> {
  readonly efforts: EffortSupport;          // always present, explicit unknown (FA8.3)
}

export interface LaneCatalogEntry {
  readonly laneId: string;
  readonly models: readonly LaneCatalogModel[];   // last `ok` read
  readonly status: CatalogStatus;                 // latest read attempt
  readonly fetchedAt: number | null;
  readonly lastOkAt: number | null;
}

export interface LaneCatalogSnapshotReader {
  get(laneId: string): LaneCatalogEntry | undefined;   // sync, no I/O
  entries(): readonly LaneCatalogEntry[];
}

export interface LaneCatalogRefresher {
  refresh(row: CliDetectionResult, nowMs: number): Promise<LaneCatalogEntry>;   // single flight, never rejects
  refreshIfDue(row: CliDetectionResult, nowMs: number): void;                   // does not wait
}
```

- Values are copied unchanged. The store does not filter, sort or rename effort values
  (FA8.1). It drops only blank model ids (FA1.7) and a list item that is not a string.
- Storage: `IStateStorage` global, key `laneRouting.catalog.v1`, the same pattern as
  `ROTATION_STORAGE_KEY` (`routing-constants.ts:116`, `rotation.store.ts:151-153`). Validate
  on read with zod. Drop a bad document with one warning.
- The refresh calls `LaneModelListing.list(row, signal)` with
  `AbortSignal.timeout(CATALOG_REFRESH_TIMEOUT_MS)`. No timer, interval or poll. Triggers: a
  route call in on mode, or a settings view read.
- Logs hold only `laneId`, status and an error class name (FA1.8).

New constants in `routing-constants.ts`:

```ts
/** A catalog older than this is refreshed in the background. Same as the Antigravity spawn-ID cache (research matrix). */
export const CATALOG_REFRESH_AGE_MS = 10 * 60 * 1000;
/** Bound of one background catalog read. Above the largest source bound: Claude SDK 15 s, CLI probes 8 s (research matrix). */
export const CATALOG_REFRESH_TIMEOUT_MS = 20_000;
/** After a failed read, no new read for this long. Same as the Antigravity retry suppression (research matrix). */
export const CATALOG_RETRY_AFTER_MS = 60 * 1000;
export const CATALOG_STORAGE_KEY = 'laneRouting.catalog.v1';
/** One routed run in this many explores an under-sampled pair (section 4.4). */
export const EXPLORATION_PERIOD = 5;
/** Route records kept for spawn lookup. A coordinator spawns from its latest routes. */
export const ROUTE_RECORD_CAP = 200;
```

### 2.8 Evidence index and funnel (lane-routing, pure)

`matrix/choice-evidence.ts`:

```ts
export const ANY_EFFORT = '*';
export type EffortBucket = ModelEffort | typeof ANY_EFFORT;

export interface ChoiceKey {
  readonly family: string;
  readonly model: string;          // own model id or FAMILY_PROFILE_MODEL
  readonly effort: EffortBucket;
  readonly taskKind: OutcomeTaskKind;
}

/** Ordered stages. Each count is a subset of the one before it. */
export interface FunnelCounts {
  readonly spawned: number;          // unique runs in the window
  readonly completed: number;        // spawned minus capacity drop-outs
  readonly delivered: number;
  readonly reviewed: number;         // finalReview set, or reviseRounds > 0
  readonly approved: number;
  // drop-outs (not stages)
  readonly capacityDropped: number;  // failureClass in CAPACITY_FAILURE_CLASSES
  readonly unverified: number;
  readonly noDeliverable: number;    // non-capacity
  readonly failed: number;           // non-capacity
  readonly rejected: number;
  readonly unresolvedRevise: number;
  readonly reviseRounds: number;     // sum (FA3.2)
}

export interface FunnelAggregates {
  readonly durationMs: { readonly total: number; readonly count: number };
  readonly inputTokens: { readonly total: number; readonly count: number };
  readonly outputTokens: { readonly total: number; readonly count: number };
  readonly costUsd: { readonly total: number; readonly count: number };
}

export interface ChoiceCell {
  readonly key: ChoiceKey;
  readonly funnel: FunnelCounts;
  readonly aggregates: FunnelAggregates;
  readonly local?: ValueMatrixCell;  // same blend and rates as deriveLocalMatrix
  /** Rows of this key whose effortDisposition was `not-in-native-list` or `lane-refused` (FA8.4 visibility). */
  readonly effortNotSent: number;
}

export interface ChoiceEvidence {
  cell(key: ChoiceKey): ChoiceCell | undefined;
  cells(): readonly ChoiceCell[];
  routedRuns(laneId: string, taskKind: OutcomeTaskKind): number;
  decisionModels(): readonly DecisionModelEvidence[];
}

export function deriveChoiceEvidence(summaries: readonly LaneOutcomeSummary[], nowMs: number): ChoiceEvidence;
```

- Window and dedupe: `OUTCOME_WINDOW_MS` and `dedupeByRun`, as `deriveLocalMatrix`
  (`local-derivation.ts:72-111`). FA3.7 holds because one function feeds both score and view.
- Levels: each row adds to (model, effort), (model, `*`), and for a `lane-default` row with a
  native resolved model also to the family cells (`*`, effort) and (`*`, `*`). The (`*`, `*`)
  cell uses the same rows as today's family cell.
- The effort bucket uses the SENT effort (`effort`), not `requestedEffort`. A row whose effort
  was not sent goes to `*`. This keeps a value the lane never received out of an effort cell.
- `local` uses the rates of `local-derivation.ts:23-45` and the prior rule `priorScore`
  (`:273-283`). Move `blendedRate`, `blendedMean`, `roundPercent`, `roundMean` and their
  safe-integer helpers to `matrix/blend.ts` without change. `local-derivation.spec.ts` must
  pass without edits.

### 2.9 Pair score and route result (lane-routing)

`ranking/choice.types.ts`:

```ts
export interface ChoiceInput {
  readonly evidence: ChoiceEvidence;
  readonly policyEffort: ModelEffort;   // rule table after a user rule (tier-effort-policy.ts:147-191)
  readonly effortFixed: boolean;        // user rule set effort, or the phase is pinned
  readonly exploreTurn: boolean;        // section 4.4
}
export type EvidenceSource = 'pair' | 'model' | 'family' | 'prior';
```

`ScoreInput` gets `readonly choice?: ChoiceInput`. Without it, `score()` runs today's body
(`score.ts:110-144`) with the `isSystemCliLane` block. `ListedModel` (`score.ts:42-46`) gets
`readonly efforts?: EffortSupport`. `CandidateScore` gets `readonly effort?: ModelEffort`.

`contracts/route-decide-result.schema.ts` additions (all optional):

```ts
// ScorePartsSchema (:103-113)
effort: ModelEffortSchema.optional(),
evidence: z.enum(['pair', 'model', 'family', 'prior']).optional(),
explore: z.literal(true).optional(),

// ChosenEntrySchema (:196-215) - FA8.4, both modes
effortCheck: z.object({
  requested: ModelEffortSchema,                          // the entry's effort
  provenance: z.enum(['native', 'ptah-fallback', 'unknown']),
  supported: z.array(z.string().max(32)).max(32).nullable(),  // native or fallback list, unchanged; null when unknown
  inList: z.boolean().nullable(),                        // null when unknown
  /** What spawn will do, from the same rules as resolveLaneEffort (2.12.4). */
  expected: z.enum(EFFORT_DISPOSITIONS),
}).strict().optional(),

// GateResultSchema (:299-314)
routeId: z.string().min(1).max(64).optional(),
```

- `effortCheck` is set for lane entries whose chosen model has an `efforts` value in the
  listing. It is absent for subagent and child-session entries.
- In on mode `ChosenEntry.effort` is `selected.effort ?? plan.policy.effort` (today
  `plan.policy.effort`, `assemble-gate.ts:649`, `:664`). In off mode it stays
  `plan.policy.effort`.
- Reason text gets one clause only when `inList === false`:
  `effort <e> not in <lane> native list; spawn sends no effort at this step`. This clause also
  appears in off mode. It is the FA8.4 statement in the route result. Decision D16.

### 2.10 Route record registry (lane-routing)

```ts
export interface RouteRecordReader {
  spawnFacts(routeId: string, phaseId: string): RouteSpawnFacts | null;
}
```

- `RouteDecideService` mints `routeId = crypto.randomUUID()` per gate call, outside
  `score()`. Tests inject the id factory.
- For each chosen entry it stores `RouteSpawnFacts`. `decisionModel` is set only when the entry
  has a `modelProposal`.
- The registry is an insertion-order `Map`, capped at `ROUTE_RECORD_CAP` routes, memory only.
- `RouteDecideService` implements `RouteRecordReader`, the same way it implements
  `RotationStateReader` (`capability-matrix-rpc.handlers.ts:96-98`).

### 2.11 Setting and RPC

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `agentOrchestration.performanceRouting` | boolean | `true` | `false` runs today's routing path (section 4.5) |

- Reader `scope/performance-routing-setting.ts`: `getConfiguration('ptah', key) !== false`. A
  read error returns `true` and warns once (same as `lane-rotation-setting.ts:8-15`).
- Registration: `platform-core/src/file-settings-keys.ts` (`FILE_BASED_SETTINGS_KEYS` near
  `:145-148`, defaults near `:394`), `platform-core/src/file-settings-manager.ts`
  `ROUTING_KEYS` (`:51-57`), `agent-sdk/src/lib/types/settings-export.types.ts` (near `:94-96`).
- The setting does not turn off FA8. Native fidelity is lane behavior, not a routing choice.

RPC `agent:getRoutingEvidence`, file `rpc-routing-evidence.types.ts`:

```ts
export type AgentGetRoutingEvidenceParams = Record<string, never>;
export interface AgentRoutingFunnel { /* fields of FunnelCounts (2.8) */ }
export interface AgentRoutingAggregate { readonly total: number; readonly count: number }

export interface AgentRoutingEvidenceKey {
  readonly taskKind: OutcomeTaskKind;
  readonly effort: string;              // ModelEffort value or '*'
  readonly funnel: AgentRoutingFunnel;
  readonly effortNotSent: number;
  readonly durationMs: AgentRoutingAggregate;
  readonly inputTokens: AgentRoutingAggregate;
  readonly outputTokens: AgentRoutingAggregate;
  readonly costUsd: AgentRoutingAggregate;
  readonly score: number | null;        // null: "no samples" (FA6.4)
  readonly sampleCount: number;
  readonly asOf: string | null;
  readonly stale: boolean;
}

export interface AgentRoutingEvidenceModel {
  readonly model: string;               // own id, or '*' for the family
  readonly inCatalog: boolean;
  readonly efforts: EffortSupport;      // unchanged from the snapshot; the page labels provenance
  readonly keys: readonly AgentRoutingEvidenceKey[];
}

export interface AgentRoutingEvidenceLane {
  readonly laneId: string;
  readonly family: string;
  readonly catalog: {
    readonly status: 'ok' | 'timeout' | 'error' | 'empty' | 'never';
    readonly fetchedAt: number | null;
    readonly lastOkAt: number | null;
    readonly modelCount: number;
  };
  readonly models: readonly AgentRoutingEvidenceModel[];
}

export interface AgentRoutingDecisionModelEvidence {
  readonly decisionModel: string;
  readonly proposals: number;
  readonly accepted: number;
  readonly meanConfidence: number | null;
  readonly funnel: AgentRoutingFunnel;
}

export interface AgentGetRoutingEvidenceResult {
  readonly windowDays: number;
  readonly performanceRouting: boolean;
  readonly lanes: readonly AgentRoutingEvidenceLane[];
  readonly decisionModels: readonly AgentRoutingDecisionModelEvidence[];
}
```

- Registration: `rpc.types.ts` (`export *` and type import next to
  `rpc-capability-matrix.types` at `:168` and `:203`; registry near `:2069-2072`; method map near
  `:3974`), `handlers/index.ts`, `register-shared-rpc-handlers.ts:147`,
  `host-profile/manifest.ts:179`.
- The handler resolves `LANE_ROUTING_TOKENS.ROUTING_EVIDENCE_SERVICE`. Absent or failed:
  `RpcUserError('Routing evidence is unavailable.', 'PERSISTENCE_UNAVAILABLE')`, as
  `capability-matrix-rpc.handlers.ts` `unavailable()`.
- The page shows `native` values as reported, `ptah-fallback` values with a "Ptah fallback"
  badge, and `unknown` as "not reported" (FA8.3). No fallback value carries a native label.

### 2.12 Native-source fidelity (FA8)

#### 2.12.1 Adapter contract (`cli-adapter.interface.ts`)

```ts
export interface CliModelInfo {
  readonly id: string;
  readonly name: string;
  readonly isFallback?: boolean;
  /** Per-model efforts the lane's own catalog reported. Absent: not reported (unknown). */
  readonly efforts?: Extract<EffortSupport, { provenance: 'native' }>;
}

export interface SdkHandle {
  // ... existing members ...
  /** Native session values. Absent: the adapter has no native source (telemetry model only). */
  reportedSession?(): LaneReportedSession;
  /** Set by an adapter whose transport changed or dropped the policy effort. */
  readonly effortDelivery?: { readonly sent: string | null; readonly disposition: EffortDisposition };
}
```

`laneEfforts?(model?)` (`:470-476`) and `stoppedLaneCatalog?()` (`:477-485`) keep their
signatures. `laneEfforts` is the labeled fallback source from now on. Its JSDoc says so.

#### 2.12.2 Per-lane native sources (FA8.1)

| Lane | Native per-model efforts | Native default effort | Today's dropout | Change |
| --- | --- | --- | --- | --- |
| claude | `ModelInfo.supportsEffort` + `supportedEffortLevels` (`sdk-model-service.ts:308-311`) | not reported -> `null` | `claude-cli.adapter.ts:167-172` maps to `{ id, name }`; `:163` returns fixed `EFFORT_LEVELS`; lane composer `claude-sdk-lane-runner.ts:612-614` also | `listModels` applies rule 2.12.4-R0: `supportsEffort: false` -> `{ native, supported: [], default: null }`; `supportsEffort: true` with non-empty `supportedEffortLevels` -> `{ native, supported: <those exact values>, default: null }`; `supportsEffort: true` with absent or empty levels -> omit `efforts` (unknown); `supportsEffort` absent -> omit `efforts` (unknown). Composer uses the current model's native list, else `EFFORT_LEVELS` as fallback |
| codex | `model/list` `supportedReasoningEfforts[].reasoningEffort` (`codex-protocol-methods.ts:47-55`) | `defaultReasoningEffort` | `codex-context.ts:1466-1474` drops `defaultReasoningEffort`; `codexLaneModels` (`codex-app-server-lane-models.ts:27-35`) drops `supportedEfforts`; `codexAdvertisedEfforts` (`:41-44`) filters with `validatedEffort` | `CodexModelInfo` gets `defaultEffort?: string`. `codexLaneModels` sets `efforts: { native, supported: supportedEfforts, default: defaultEffort ?? null }` unfiltered, only when the server sent a non-empty `supportedReasoningEfforts`. Absent or empty field -> omit `efforts` (unknown, rule R0). Note: `codex-context.ts:1472` today turns an absent field into `[]`; WU14a keeps absent as absent |
| grok, antigravity | Catalog: `grok models` / `agy models` give ids only -> unknown. Session: advertised values of the effort config option | session `currentValue` | `acpProfileEfforts` (`provider-session-lane-handle.ts:132-138`) is the profile mapping, used as the live menu | Catalog stays unknown. The session reports `efforts` through `reportedSession()`, and `CliDetectionService` records them in the registry (2.12.4). Composer prefers the session list. `acpProfileEfforts` stays as fallback |
| pi | not reported by `pi --list-models` -> unknown | not reported | `PI_LANE_EFFORTS` (`pi-cli.adapter.ts:93`) used as the lane list | Fallback label only |
| copilot | host and account lists carry ids only (`cli-model-list.service.ts:108-114`) -> unknown | not reported | `COPILOT_LANE_EFFORTS` (`copilot-sdk.adapter.ts:61`) | Fallback label only |
| cursor, opencode | no effort transport through Ptah (research matrix) | n/a | none | `ptah-fallback`, `supported: []` |
| ptah-cli providers | provider discovery gives ids only (`lane-model-listing.adapter.ts:236-250`) | n/a | none | unknown |

#### 2.12.3 Reported session values (FA8.2)

Rule in APM: when the handle has `reportedSession`, the resolved model and resolved effort come
only from it. Otherwise the resolved model is `info.observedModel` from turn telemetry, and the
resolved effort is unknown. The reason: for some lanes the telemetry model can echo the
request (research findings 3-5), so it is not native evidence.

| Lane | `reportedSession()` model | `reportedSession()` effort | Today's dropout | Source |
| --- | --- | --- | --- | --- |
| claude, ptah-cli | not implemented: telemetry model is SDK-native (`ptah-cli-stream-loop.service.ts:514,854,943`) | unknown (no lane reports an applied effort, research finding 2) | none for model | telemetry |
| codex | `thread/start` / `thread/resume` result `model`; `thread/settings/updated` `threadSettings.model` | result `reasoningEffort` (`codex-protocol-schemas.ts:645`); settings update `reasoningEffort` when the schema carries it (`:455`, `:464`) | `codex-context.ts:363-366` keeps only the model, and `:1050` seeds `observedModel` from the outgoing `params.model` | New private fields in `CodexContext` written only from server frames. New `CodexContext.reportedSettings(): { model: string \| null; effort: string \| null }` |
| grok, antigravity | `models.currentModelId` from the session reply, else the model option `currentValue` (not `acknowledgedModel` or `options.model`, `acp-session-runtime.ts:1095-1100`) | `currentValue` of the profile's effort option (`reasoning_effort`, `grok-acp-profile.ts:210`; `thought_level`, `antigravity-acp-profile.ts`) | `sessionModel()` prefers the requested model; effort `currentValue` is not exposed | New `AcpSession.getReportedState()`. `AcpVendorProfile` (`acp-vendor-profile.ts:206`) gets `effortConfigId?: string` |
| pi | `get_state` response `data.model` | `get_state` response `data.thinkingLevel` | `pi-cli.adapter.ts:786-791` reads only `sessionId` and `sessionFile`; `lane-model-log.ts:37` excludes pi | Extend the response data schema (`pi-cli.adapter.ts:148-155`) with optional `model` and `thinkingLevel`. The field names come from the installed Pi's reply (FA8.6). A missing field stays unknown |
| opencode | the paired `modelID` + `providerID` from the stream only (`opencode-cli.adapter.ts:1166-1179`), never the request-seeded value (`:963`) | unknown | telemetry model can be the request | Track "native pair seen" in the adapter |
| copilot, cursor | not implemented: telemetry model is native (`copilot-sdk.adapter.ts:671-674,825-855`; `cursor-cli.adapter.ts:510-547`), and `/unknown`, `/multi-model` are filtered (`lane-model-log.ts:39`) | unknown | none | telemetry |

#### 2.12.4 Effort policy and native registry (FA8.4, FA8.5)

`NativeEffortRegistry` (cli-agent-runtime, owned by `CliDetectionService`, no new DI token):

```ts
export class NativeEffortRegistry {
  /** Key: cli, plus ptahCliId for a Ptah CLI row. Replaces that lane's models. */
  recordCatalog(laneKey: string, models: readonly CliModelInfo[]): void;
  /** A live session's advertised list for one model (ACP). */
  recordSession(laneKey: string, model: string, efforts: EffortSupport): void;
  /** Native list for a model; `{ provenance: 'unknown' }` when none was recorded. */
  lookup(laneKey: string, model: string | undefined): EffortSupport;
}
```

- Writers: `CliDetectionService.listModelsForAll` (`cli-detection.service.ts:461`) after each
  adapter `listModels`. `CliModelListService` (rpc-handlers) calls the new public
  `cliDetection.recordNativeCatalog('codex', models)` after `getCodexModelsFromCliCatalog`
  (`cli-model-list.service.ts:123`). APM calls `recordSession` when a `reportedSession()` read
  has native `efforts`.
- Bound: lanes times models, in memory. A model id without a model (`lane-default`) looks up
  the model the lane marks default, else unknown.

`resolveLaneEffort` (`lane-spawn-policy.ts:380-418`) gets `nativeEfforts?: EffortSupport` in
`LaneEffortInput` and returns:

```ts
export interface LaneEffortResolution {
  readonly effort: string | undefined;        // sent value (unchanged name)
  readonly step: LaneEffortStep;
  readonly ignored: readonly IgnoredLaneEffort[];  // gets `reason: EffortDisposition`
  readonly requested: string | undefined;     // first offered value
  readonly provenance: ValueProvenance;       // of the list that checked the value
  readonly disposition: EffortDisposition;    // for `requested`
}
```

The `offer` step (`:385-393`) becomes:

R0 (one rule for every lane, applied where a native list is built in 2.12.2): a list is
`native` only when the lane positively reported it. An absent field, or a "supports effort"
flag with no level list, is `unknown`, never an empty native list. An empty native list
exists only when the lane positively says it takes no effort (Claude `supportsEffort:
false`). Check of the 2.12.2 rows: claude and codex as stated there; grok, antigravity, pi,
copilot and ptah-cli have no catalog list, so `unknown`; the ACP session list is `native` only
when the effort option is advertised with at least one value, else `unknown`; cursor and
opencode are `ptah-fallback` with `supported: []` (a Ptah transport fact, not a native claim).

1. `nativeEfforts.provenance === 'native'` and `supported` is empty: send nothing,
   `lane-takes-no-effort`. Under R0 this happens only after a positive "no effort" report.
2. `native` and the value is in `supported`: send it unchanged, `native-match`.
3. `native` and the value is not in `supported`: do not send it and do not map it. Record
   `not-in-native-list` and continue with the next step (today's rule for an unsupported value).
4. `unknown` or no `nativeEfforts`: use today's mapper (`effortMapperFor`, `:422-497`) as the
   labeled fallback. The result is `fallback-allowlist` when the value is unchanged,
   `fallback-mapped` when it changed (for example `max` -> `xhigh`), and `fallback-refused` when
   the mapper returns undefined. Provenance is `ptah-fallback`.

APM passes `nativeEfforts: cliDetection.nativeEfforts(laneKey, resolvedModel)` and stamps
`info.spawnEffort`. Ptah CLI lanes keep their path through the registry
(`ptah-cli-registry.ts:813-818`). The namespace builder writes `spawnEffort` with provenance
`unknown` and disposition `fallback-allowlist` when a value was given, else `none-requested`.

Transport dispositions through `SdkHandle.effortDelivery`:

- Claude: `resolveEffort` (`claude-cli.adapter.ts:572-615`) already checks native metadata.
  When candidates existed and it returns `undefined`, set
  `{ sent: null, disposition: 'lane-refused' }`.
- ACP: when the runner skips or the agent refuses the effort hint (research finding 4), set
  `lane-refused`.
- Copilot: see 2.12.5.

#### 2.12.5 Version-sensitive points (FA8.6)

- Copilot effort flag. New `copilot-effort-flag.ts`: run `copilot --help` once for each
  resolved binary path and detected version (`probeCliVersionDetailed`,
  `copilot-sdk.adapter.ts:184`). Use `probeCliStdout` (`cli-stdout-probe.ts:33`) with the
  existing probe timeout pattern. Cache the result in memory by path and version. The flag is
  `--reasoning-effort` when the help lists it, else `--effort` when the help lists it, else
  none. With none, the adapter sends no effort and sets
  `effortDelivery: { sent: null, disposition: 'cli-has-no-effort-flag' }`. A failed probe gives
  none and one warning (no help text in the log). Today's fixed `--effort`
  (`copilot-sdk.adapter.ts:382-385`) goes away. The live setter allowlist (`:590-592`) stays as
  the fallback.
- Pi and ACP effort state come from the session replies (2.12.3). Ptah does not assume a
  version. When a field is absent, the value is unknown.


### 2.13 Seed format (FA9)

Today: `ValueMatrixCellSchema` (`matrix.schema.ts:28-79`) requires `sourceRef` and `note` for a
seed cell. A profile is keyed `[family, model]` (`matrix.schema.ts:113-127`). The one shipped
row is in `SEED_MATRIX_ROWS` (`seed-matrix.ts:61-69`) and maps a label to a score
(`SEED_LABEL_SCORE`, `routing-constants.ts:55-59`).

Cell fields (`matrix.types.ts` `ValueMatrixCell`, `matrix.schema.ts`), optional in the type,
REQUIRED by the schema when `source === 'seed'` (FA9.1):

```ts
/** Stable id of the benchmark source, e.g. `swe-bench-verified`. Seed only. */
readonly sourceId?: string;          // NonBlank(64), /^[a-z0-9._-]+$/
/** SPDX id of the source data license, or `NOASSERTION` when not verified. Seed only. */
readonly licenseId?: string;         // NonBlank(64)
/** When the row was read from the source (ISO date or date-time). Seed only. */
readonly fetchedAt?: string;         // AsOf
/** Row reference inside the source (benchmark model name and effort as the board names them). Seed only. */
readonly sourceRow?: string;         // NonBlank(200)
```

The `superRefine` (`:40-56`) adds one issue for each missing field of a seed cell, with the
path of that field. A `user` or `local` cell with any of the four fields is rejected (same
pattern as `sampleCount`, `:72-78`). The view (`capability-matrix.store.ts:582-610`) copies
named fields only, so the RPC view schema does not change.

Profile key (FA9.2): `MatrixProfile` gets `readonly effort?: ModelEffort`. Absent means the
effort bucket `*`, the same bucket as an old outcome row (2.4). The duplicate check uses
`[family, model, effort ?? '*']`. Today's `resolve(family, model, taskKind)` reads only
profiles without `effort`, so off mode and the view do not change. On mode reads a pair's
`user` and `seed` layers from (`m`, `e`), then (`m`, `*`) (4.1).

Source rows and aliases, `matrix/seed-source.ts`:

```ts
export const SeedSourceRowSchema = z.object({
  sourceId: SourceId,
  licenseId: NonBlank(64),
  fetchedAt: AsOf,
  sourceRow: NonBlank(200),
  benchmarkModel: NonBlank(200),
  benchmarkEffort: NonBlank(32).nullable(),   // as the board names it; null when the board has none
  taskKind: z.enum(OUTCOME_TASK_KINDS),       // exactly one kind per row (FA9.5)
  asOf: AsOf,                                 // publication date of the result
  note: NonBlank(500),
  sourceRef: NonBlank(500),
  value: z.union([
    z.object({ label: z.enum(['strong', 'good', 'weak']) }).strict(),
    z.object({ score: z.number().int().min(SCORE_MIN).max(SCORE_MAX) }).strict(),
  ]),
}).strict();

export const SeedAliasSchema = z.object({
  sourceId: SourceId,
  benchmarkModel: NonBlank(200),
  benchmarkEffort: NonBlank(32).nullable(),
  targets: z.array(z.object({
    family: NonBlank(200),
    model: NonBlank(200),
    effort: ModelEffortSchema.optional(),     // absent: bucket '*'
  }).strict()).min(1).max(16),
}).strict();

export interface SeedCompileResult {
  readonly matrix: CapabilityMatrix;
  readonly dropped: {
    readonly noAlias: number;                 // FA9.3: no exact alias match
    readonly duplicate: number;               // second row for the same [family, model, effort, taskKind]
    readonly invalid: number;                 // failed SeedSourceRowSchema
  };
}

/** Pure. Exact match on [sourceId, benchmarkModel, benchmarkEffort]. No case folding, trimming or fuzzy match. */
export function compileSeed(
  rows: readonly unknown[],
  aliases: readonly unknown[],
  nowMs: number,
): SeedCompileResult;
```

- One row fills one task kind of each target profile. Other kinds stay `unknown` (FA9.5).
- A second row for the same key keeps the first (input order) and counts `duplicate`. This is
  deterministic.
- `seed-aliases.ts` holds data only: one exported `const` array, no functions. Today it has one
  entry: `{ sourceId: 'swe-bench-verified', benchmarkModel: 'GLM-5 high', benchmarkEffort:
  null, targets: [{ family: 'z-ai', model: 'glm-5' }] }`.
- `seed-matrix.ts`: `SEED_MATRIX_ROWS` becomes `SEED_SOURCE_ROWS` (one row: the existing values
  plus `sourceId: 'swe-bench-verified'`, `licenseId: 'NOASSERTION'`, `fetchedAt: '2026-10-14'`
  (the research date in the header, `:16-17`), `sourceRow: 'GLM-5 high'`, `taskKind:
  'implement'`). `buildSeedMatrix(nowMs)` returns `compileSeed(SEED_SOURCE_ROWS,
  SEED_ALIASES, nowMs).matrix`. The signature, the score (80), `sourceRef`, `note`, `asOf` and
  `stale` do not change (FA9.6). A shipped seed with any dropped row fails a spec test.
- `NOASSERTION` is the SPDX term for "no license verified". The follow-up CI job must refuse it
  (decisions.md row 15). This task does not judge the license of the existing row.
- No network call: the seed is a code module (FA9.6).

---

## 3. Data flow

### 3.1 Catalog refresh (off the hot path)

1. A route call in on mode gets the lane rows.
2. For each row: `entry = catalog.get(laneId)`, then `catalog.refreshIfDue(row, nowMs)`.
3. `entry` with `lastOkAt !== null`: use `entry.models` at once. The per-row budget
   `MODEL_LISTING_BUDGET_MS` (`routing-constants.ts:169`) holds (FA1.2).
4. `entry` missing or never `ok`: race `catalog.refresh(row)` against the per-row budget with
   `withinBudget` (`gather.ts:501-537`). A loss gives `models unknown for <lane> (timeout)`
   (FA1.4). The refresh continues with its own bound.
5. `entry.status !== 'ok'` with older `ok` models: use them, add
   `catalog for <lane> is <age> old (<status>)` (FA1.3).
6. In the rpc adapter, concurrent `listAll()` / `listForClassification()` calls share one
   in-flight promise (pattern of `discoveryInFlight`, `lane-model-listing.adapter.ts:92-96`).
7. Efforts: the rpc adapter copies `CliModelInfo.efforts` to `LaneModelEntry.efforts`
   unchanged (2.12.2). When the model has none, it asks `CliModelListService.effortSupport(cli,
   modelId)`: the registry's native list when one exists (ACP sessions), else
   `adapter.laneEfforts?.(modelId)` wrapped as `{ provenance: 'ptah-fallback', supported,
   default: null }`, else `{ provenance: 'unknown' }`. Ptah CLI rows: unknown.

### 3.2 Outcome capture

1. Spawn: APM resolves the model as today and the effort with `nativeEfforts` (2.12.4). It
   stamps `modelSource`, `spawnEffort`, `routeFacts`.
2. Handle creation: APM applies `sdkHandle.effortDelivery` to `info.spawnEffort` when present.
3. Turns: APM keeps `observedModel` (exists, `:2115-2119`). At each turn end and at the
   terminal transition it copies `sdkHandle.reportedSession?.()` to `info.reportedSession`, and
   records native session efforts in the registry.
4. Completion: `enqueueLaneCompletionOutcome` writes:
   - `modelSource: info.modelSource ?? null`
   - `resolvedModel`: `info.reportedSession ? info.reportedSession.model : info.observedModel`,
     else `null`. `resolvedModelProvenance`: `native` when set, else `unknown`.
   - `resolvedEffort: info.reportedSession?.effort ?? null`, provenance `native` or `unknown`
   - `requestedEffort`, `effort`, `effortSource`, `effortProvenance`, `effortDisposition` from
     `info.spawnEffort`; all `null` when it is absent
   - `routedModel`, `routedEffort`, `decisionModel` (truncated to 128 characters),
     `proposalConfidence` from `info.routeFacts`
5. Reports (`ptah_outcome_report`) do not touch the new columns (FA3.6 unchanged).

### 3.3 Route call in on mode

1. `decideGate` reads `performanceRouting.isEnabled()` once per call and mints `routeId`.
2. `gatherRouteCall` gets `choice: true`. It reads catalogs (3.1) and calls
   `matrix.load({ nowMs, outcomeQueries, choice: true })`. The snapshot also carries
   `evidence: ChoiceEvidence`, from the same `summaries` array
   (`capability-matrix.store.ts:337-355`).
3. `planRoutePhases` builds `ChoiceInput` per lane candidate.
4. `score()` returns the chosen pair (4.1-4.3).
5. `assembleGateResult` writes the pair's model, effort, provenance, score, `effortCheck` and
   the reason text, and `routeId`.
6. The service stores `RouteSpawnFacts` per chosen entry.
7. The coordinator spawns with `cli`/`ptahCliId`, `model`, `effort`, `taskKind`,
   `routingSource: entry.source`, `route: { routeId, phaseId }`. Tool descriptions say this.
8. The MCP entry sets `request.routeFacts` when the facts' `laneId` equals the spawn lane.
   Otherwise it spawns without facts and logs ids only.

### 3.4 Route call in off mode

`choice: false`: today's live `listModels` (`gather.ts:439-490`), no evidence, no `choice` in
`score()`, today's `outcomeFigures`. The result adds `routeId` and `effortCheck`, and the
`not in native list` reason clause when it applies (D16). The registry stores facts in both
modes.

---

## 4. Scoring design

### 4.1 Cells for one pair

For lane `c` (family `f`), model `m`, effort `e`, task kind `k`:

1. `base = matrix.resolve(f, m, k)` gives the `user` and `seed` layers
   (`capability-matrix.store.ts:477-512`).
2. The `local` layer is the first `local` value in this order, which is also the `evidence`
   label: `pair` (`m`, `e`); `model` (`m`, `*`); `family` (only for `lane-default` or the
   configured model: (`*`, `e`), then (`*`, `*`)); `prior` (no local layer).
   The `user` and `seed` layers come from the matrix profile (`m`, `e`) when one exists, else
   (`m`, `*`) (2.13). The blend prior of each evidence cell uses the same order.
3. `scoreResolvedCell(c, cell, { priorMode: 'blended' })` (4.8). A `user` layer sets the
   learned delta to 0 (FA4.7). Off mode calls it without the option, so today's capped formula
   (`score.ts:199-236`) runs.

### 4.2 Pairs a lane can run

- Models: promotable catalog entries (`isPromotable`, `score.ts:186-189`) plus the default
  model (configured model or `lane-default`, `score.ts:167-184`). A model not in the catalog is
  not a pair (FA1.5, FA4.6).
- Efforts for `m`: when `effortFixed`, only `policyEffort`. Otherwise `policyEffort` plus each
  `ModelEffort` value in `m`'s `efforts.supported` only when `efforts.provenance === 'native'`.
  A `ptah-fallback` or `unknown` list gives only `policyEffort` (FA8.3: a fallback is never
  scored as native).
- When the native list does not contain `policyEffort`, the pair (m, `policyEffort`) still
  exists (it is today's behavior), and `effortCheck.inList` is `false`. Spawn then does not
  send it (2.12.4).
- The default pair is (default model, `policyEffort`).

### 4.3 Choice inside one lane

- The default pair wins unless another pair has `total - defaultTotal > CLOSENESS_BAND`. Then
  the highest total wins. Ties: catalog order, then `MODEL_EFFORTS` order, lower first. This is
  today's promotion rule (`score.ts:146-165`) on pairs.
- In on mode this rule also applies to system CLI lanes (approved removal, scoped to the
  `choice` branch).
- No evidence: all non-default pairs are `prior` with the default total, so none passes the
  band. Model, provenance and effort equal today's (FA4.3).
- At limit: excluded before scoring (`score.ts:216-217`), no change (FA4.5).
- Ranking total of the lane is the chosen pair's total.

### 4.4 Exploration bound

`EXPLORATION_BONUS` (5) alone cannot pass the band: an unknown cell scores 55. Rule (pure):

1. `exploreTurn` is true for lane `L` and task kind `k` only when:
   - `evidence.routedRuns(L, k) % EXPLORATION_PERIOD === EXPLORATION_PERIOD - 1`
   - the default pair has `sampleCount >= EXPLORATION_MIN_SAMPLES`
   - `k !== 'review'`
   - the phase is not pinned and no user rule matched it
   - `limitState` is `confirmed-room` or `unknown`
2. On an explore turn, after 4.3, take the first under-sampled pair:
   - models first: (`m`, `policyEffort`) with model-level samples below
     `EXPLORATION_MIN_SAMPLES`, fewest first, then catalog order
   - then efforts of the exploit model: (`m*`, `e`) with `e` one step above or below
     `policyEffort` in `MODEL_EFFORTS`, `e` in `m*`'s native list, pair samples below
     `EXPLORATION_MIN_SAMPLES`, lower first
3. The returned score keeps the exploit `total` for ranking. Its `model`, `effort`,
   `provenance`, `score` and `cell` are the explored pair's, and `parts.explore = true`.
4. Bound: at most 1 of every 5 routed runs of a lane and task kind. A pair leaves exploration
   after 3 runs. A lane with `n` unsampled models needs at most `5 * 3 * n` routed runs, while
   at least 80 % of its runs use the evidenced choice.
5. The counter moves only when a routed run completes. The bound is approximate under
   concurrent route calls: two calls that read the same counter before a run completes can both
   take an explore turn. Decision D26.

`EXPLORATION_PERIOD` is the only new scoring threshold. Other constants are reused.

### 4.5 Off mode gives today's choice

- `score()` without `choice` is today's body, with no edit to that path.
- `gatherRouteCall` with `choice: false` uses today's `listModels`.
- `CapabilityMatrixStore.load` without `choice` returns today's snapshot.
- `assembleGateResult` writes `plan.policy.effort`.
- Proof: a standalone test-only unit WU0 writes `pipeline/route-off-golden.spec.ts` and its
  fixture `pipeline/__fixtures__/route-off-golden.json` in batch 1, on unchanged code, before
  any lane-routing unit lands. It builds `RouteDecideService` with today's dependencies (no
  `performanceRouting` dependency) and listing fixtures that carry no `efforts`. It deletes the
  key `routeId` from the result before the compare (a no-op on today's code). After the change,
  an absent `performanceRouting` dependency means off (D25), so the file needs no edit.
  `ranking/score.spec.ts` stays unchanged as the pin of the score path. After the change, the off-mode result with
  `routeId` removed must still equal the fixture. (With no `efforts`, `effortCheck` is absent and the
  reason clause does not appear.) A second off-mode case with native efforts checks that only
  `effortCheck` and the 2.9 clause differ.

### 4.6 Explanation (FA4.9)

`compile-reasons.ts` adds per chosen lane entry in on mode:
`model <m> effort <e> (<evidence>, <n> samples)`, and on an explore turn
`explore <m>/<e>: <n>/3 samples, 1 of every 5 routed runs` (from the constants). The trace
gets the new `parts` fields.

### 4.8 Seed prior and LEARNED_DELTA_CAP (FA9.4)

Answer: **no.** With today's formula, local evidence cannot overrule a strong seed prior.

- Today: `total = prior + clamp(local - prior, ±LEARNED_DELTA_CAP) + ...` (`score.ts:209-215`,
  cap 15, `routing-constants.ts:24`). A `strong` seed is 80 (`SEED_LABEL_SCORE`). Its total
  stays in [65, 95] for any local evidence. A model with no seed has prior `NEUTRAL_SCORE` 50,
  so its total stays in [35, 65].
- So a strong-seeded model that fails every run still totals 65. An unseeded model that passes
  every run also totals at most 65. The bad seeded model is never below the good unseeded one.
  With more seed rows from public benchmarks, this lock gets worse.
- The local cell already holds the prior: `round(100 * (s + k * prior / 100) / (n + k))` with
  `k = BLEND_PRIOR_WEIGHT` = 10 (`local-derivation.ts:33`, `routing-constants.ts:220`). The cap
  is a second shrink on top of it.

Design choice (on mode only, all candidates: lanes, subagents, child sessions):

- `scoreResolvedCell` gets an option `priorMode: 'capped' | 'blended'`, default `capped`.
- `blended`: when a `local` layer exists and no `user` layer exists, `prior` is the local cell
  score and the learned delta is 0. The total is `local.score + exploration + preference +
  limit`. Without a local layer, the prior is `seed ?? NEUTRAL_SCORE`, as today.
- Effect: the seed weighs like 10 runs. At 3 runs the seed has 10/13 of the weight. At 10 runs
  it has half. At 40 runs it has 1/5. A strong seed with 40 failed runs scores
  `round(100 * 8 / 50)` = 16. Local evidence overrules it, and small samples stay shrunk.
- `parts.priorSource` names `seed` or `neutral` as the blend prior. `parts.learned` is 0 in
  this mode. `parts.evidence` names the cell.
- No new constant. `BLEND_PRIOR_WEIGHT` is the single knob. Off mode keeps the cap, so off mode
  stays as it is today.

### 4.7 System One figures (FA7.2)

`outcomeFiguresFrom` (`matrix/outcome-figures.ts:17-45`) gets `{ byModelEffort: boolean }`.
True adds `model` and `effort` (sent effort bucket) to each figure. `DecisionOutcomeFigures`
(`decision-payload.ts:42-47`) gets optional `model?` and `effort?`. Off mode passes `false`.

---

## 5. Failure behavior

| Case | Behavior | Rule |
| --- | --- | --- |
| Catalog fetch fails or times out, older `ok` list exists | Use it. Reason with lane, status and age. No new read for `CATALOG_RETRY_AFTER_MS` | FA1.3 |
| Catalog never read, first read loses the 2000 ms race | Today's row: `lane-default`, `models unknown for <lane> (timeout)`. The read continues | FA1.4 |
| Catalog read returns an empty list | Status `empty`. Older `ok` list stays with the age reason, else `models unknown (empty)` | `gather.ts:532-534` |
| Stale snapshot | Use it, start one background refresh | 3.1 |
| Invalid stored snapshot | Drop it, warn once | as `rotation.store.ts` |
| Model removed from a catalog | Not a pair after the next `ok` refresh. Evidence stays, view shows `inCatalog: false` | FA1.5, FA4.6 |
| New model | Zero-sample pair, runs only on an explore turn | FA1.6, 4.4 |
| Zero samples | `prior`, no promotion. View `score: null`, "no samples" | FA4.4, FA6.4 |
| Lane at limit | Excluded before scoring. No exploration on `near-limit` | FA4.5 |
| Catalog reports no efforts for a model | `efforts: { provenance: 'unknown' }`. Spawn uses the labeled fallback mapper. Row `effortProvenance: 'ptah-fallback'` | FA8.3, FA8.5 |
| Native list exists, requested effort not in it | Not sent, not mapped. Next precedence step, or none. Row `effortDisposition: 'not-in-native-list'`, `requestedEffort` kept. Route result `effortCheck.inList: false` + reason clause | FA8.4 |
| Native list is empty (`supportsEffort: false`) | No effort sent, `lane-takes-no-effort` | FA8.1 |
| Lane says it supports effort but sends no level list (Claude `supportsEffort: true` without levels, Codex field absent) | `unknown` (R0). The labeled fallback mapper applies. Never `lane-takes-no-effort` | FA8.3 |
| Native default effort not reported | `default: null`. Ptah does not fill it | FA8.3 |
| Lane takes no effort through Ptah (cursor, opencode) | `ptah-fallback`, `supported: []`, `lane-takes-no-effort`, bucket `*` | research matrix |
| Lane refuses the hint at setup (ACP, Claude metadata) | `effortDelivery` sets `lane-refused`, `sent: null` | FA8.4 |
| Installed Copilot lists no effort flag, or the help probe fails | No effort sent, `cli-has-no-effort-flag`, one warning | FA8.6 |
| Lane reports no session model or effort | `resolved*` `null`, provenance `unknown`. Telemetry model is used only for lanes without `reportedSession` | FA8.2, FA8.3 |
| Pi or ACP reply lacks the state field | That value stays unknown. No version guess | FA8.6 |
| Native value outside `ModelEffort` (Pi `off`, Codex extra levels) | Stored and shown unchanged. Not scored (bucket `*`) | 2.4 |
| Lane rejects the routed model after the record exists | Row `model = M`, failed verdict, counts against key `M` | FA5.2 |
| Lane rejects the model before a record exists (`runSdk` throws) | No row. The spawn error goes to the coordinator. WU3b checks if APM records a failed completion after admission (`agent-process-manager.service.ts:841-848`). If not, report the gap. No synthetic row | FA5.2 |
| Unknown, evicted or other-lane `routeId`; host restart | Spawn without facts, log ids only | 3.3 step 8 |
| System One times out or is unset | `decisionModel: null`. `fallbackCause` stays in the result | FA7.3 |
| Setting read throws | `true`, one warning | 2.11 |
| Seed cell without `sourceId`, `licenseId`, `fetchedAt` or `sourceRow` | Schema issue on that path. A shipped seed that fails is a spec failure, not a runtime fallback | FA9.1 |
| Benchmark row with no exact alias match | Dropped, `dropped.noAlias` + 1. No guess | FA9.3 |
| Two rows for one seed key | First kept, `dropped.duplicate` + 1 | 2.13 |
| Seed row for one task kind | Only that kind's cell is set. Other kinds stay `unknown` | FA9.5 |
| Seed profile with effort, read by off mode | Ignored. Off mode reads only profiles without effort | FA9.2, FA9.6 |

---

## 6. Tests

Lanes run only focused `jest --runTestsByPath`, `tsc` and `eslint` on changed files. The
coordinator runs `npm run verify -- --related -p <projects>` and the full gate before push. After
the renderer template change, run `npm run verify -- -t typecheck-templates -p
ptah-extension-webview`.

| Spec file | New or changed | Cases | FA |
| --- | --- | --- | --- |
| `persistence-sqlite/.../0078_lane_outcome_choice_keys.spec.ts` | new | 14 columns exist; a pre-0078 row reads `NULL` | FA2.4 |
| `lane-outcomes/.../store/sqlite-lane-outcome.store.spec.ts` | changed | Round trip of the 14 fields; old row decodes `null` | FA2, FA8.2 |
| `lane-outcomes/.../store/key-value-lane-outcome.store.spec.ts` | changed | Old JSON row parses; new row round-trips | FA2.4 |
| `cli-agent-runtime/.../lane-spawn-policy.spec.ts` | changed | Native match sent unchanged; not-in-list not mapped and next step used; empty native list; unknown list uses fallback with `fallback-mapped` for `max`->`xhigh` and `minimal`->`low`, `fallback-allowlist`, `fallback-refused`; `effortSourceOf` steps 1-6 | FA8.4, FA8.5 |
| `cli-agent-runtime/.../native-effort.registry.spec.ts` | new | Record and lookup; unknown default; session record; replace on new catalog | FA8.1, FA8.3 |
| `cli-agent-runtime/.../lane-completion-outcome.spec.ts` | changed | Every 2.2 field; `reportedSession` wins over telemetry; telemetry used without it; no value gives `unknown`; caller `routingSource` wins; over-long `routeFacts.decisionModel` truncated to 128 and the row is written | FA2, FA5.1, FA5.3, FA7.1, FA8.2, FA8.3 |
| APM spawn spec that covers `info.model` (find with `rg "model: resolvedModel"` in `*.spec.ts`) | changed | `modelSource`, `spawnEffort` with native list, `effortDelivery` applied, `reportedSession` copied at turn end | FA2.1, FA8.2, FA8.4 |
| `cli-agent-runtime/.../cli-adapters/claude-cli.adapter.spec.ts` | changed | `listModels`: `supportsEffort: false` gives native `[]`; `true` with levels gives native with those exact values; `true` with absent levels gives no `efforts`; `true` with `[]` gives no `efforts`; `supportsEffort` absent gives no `efforts`; `lane-refused` delivery | FA8.1, FA8.4 |
| `cli-agent-runtime/.../claude/claude-sdk-lane-runner.spec.ts` | changed | Composer efforts are the current model's native list; fallback `EFFORT_LEVELS` only without one | FA8.1, FA8.5 |
| `codex-runtime/.../codex-context.spec.ts` | changed | `listModels` keeps `defaultReasoningEffort`; `reportedSettings()` from thread start/resume and settings update; a turn's outgoing `params.model` does not change `reportedSettings()` | FA8.1, FA8.2 |
| `cli-agent-runtime/.../codex/codex-app-server-lane-models.spec.ts` | new | `efforts` per model unfiltered, with native default; field absent gives no `efforts` | FA8.1 |
| `cli-agent-runtime/.../codex/codex-app-server-lane.adapter.spec.ts` | changed | Handle `reportedSession()` mirrors the context | FA8.2 |
| `acp-runtime/.../acp-session-runtime.spec.ts` | changed | `getReportedState()` gives `currentModelId` or `currentValue`, never the requested model; effort `currentValue` and advertised values; absent gives null and unknown | FA8.2, FA8.6 |
| `acp-runtime/.../profiles/grok-acp-profile.spec.ts`, `antigravity-acp-profile.spec.ts` | changed | `effortConfigId` values | FA8.2 |
| `cli-agent-runtime/.../provider-session/provider-session-lane-handle.spec.ts` | new | `reportedSession()` from the session; composer prefers native list; `acpProfileEfforts` labeled fallback; refused hint gives `lane-refused` | FA8.2, FA8.4, FA8.5 |
| `cli-agent-runtime/.../cli-adapters/pi-cli.adapter.spec.ts` | changed | `get_state` with `model`/`thinkingLevel` gives native values; without them unknown | FA8.2, FA8.6 |
| `cli-agent-runtime/.../cli-adapters/copilot-effort-flag.spec.ts` | new | Help lists `--reasoning-effort`, only `--effort`, neither; probe failure; cache by path and version | FA8.6 |
| `cli-agent-runtime/.../cli-adapters/copilot-sdk.adapter.spec.ts` | changed | Spawn uses the detected flag; none gives no flag and `cli-has-no-effort-flag` | FA8.4, FA8.6 |
| `cli-agent-runtime/.../cli-adapters/opencode-cli.adapter.spec.ts` | changed | `reportedSession()` model only after a native pair; request seed not reported | FA8.2 |
| `lane-routing/.../catalog/lane-catalog.store.spec.ts` | new | Snapshot keeps `efforts` unchanged; absent becomes `unknown`; refresh rules; failure keeps old models; blank ids dropped; invalid document; no host text in logs | FA1, FA8.1, FA8.3 |
| `lane-routing/.../matrix/choice-evidence.spec.ts` | new | Key rule (2.4); sent-effort bucket; `effortNotSent`; funnel order and drop-outs; capacity failures out of rates; aggregates; zero data; window; dedupe; decision models | FA2.4, FA3, FA7.2, FA8.4 |
| `lane-routing/.../matrix/seed-source.spec.ts` | new | Seed cell missing each of the 4 fields fails with that path; user/local cell with them fails; exact alias join; no-alias, duplicate and invalid rows counted; one kind per row; effort target goes to an effort profile; `benchmarkEffort` must match exactly | FA9.1-9.3, FA9.5 |
| `lane-routing/.../matrix/seed-matrix.spec.ts` | changed | `buildSeedMatrix` gives today's one value (score 80, implement, same `sourceRef`, `note`, `asOf`, `stale`) plus the 4 fields; zero dropped rows; no other kind set | FA9.5, FA9.6 |
| `lane-routing/.../matrix/capability-matrix.store.spec.ts` | changed | Pair resolve (`m`, `e`) then (`m`, `*`); today's `resolve` ignores effort profiles; view skips effort profiles | FA9.2 |
| `lane-routing/.../matrix/local-derivation.spec.ts` | unchanged | Passes after the `blend.ts` move | regression |
| `lane-routing/.../ranking/score-choice.spec.ts` | new | Pair beats default; codex promoted in on mode only; no evidence equals today; user cell wins; model not in catalog; rule effort fixed; fallback and unknown lists give no effort pairs; explore turn rules; determinism | FA4, FA8.3 |
| `lane-routing/.../ranking/score.spec.ts` | unchanged | Off path (capped formula) | FA4.3 |
| `lane-routing/.../ranking/score-choice.spec.ts` (same file as above) | new | `blended` prior: strong seed with 40 failed runs scores 16 and loses to an unseeded model with good evidence; with no local layer the seed prior holds; `user` still wins | FA9.4 |
| `lane-routing/.../reasons/compile-reasons.spec.ts` | changed | Model/effort/evidence clause; explore clause; not-in-native-list clause | FA4.9, FA8.4 |
| `lane-routing/.../pipeline/route-off-golden.spec.ts` + `__fixtures__/route-off-golden.json` | new (WU0) | Off-mode golden on unchanged code; must pass after every later unit | FA4.3, FA9.6, D9 |
| `lane-routing/.../pipeline/route-choice.spec.ts` | new | Second off-mode case with native efforts (only `effortCheck` and the 2.9 clause differ); on-mode snapshot read; never-read lane; stale reason; pair effort; `effortCheck` for native, fallback and unknown lists; `routeId` | FA1.2-1.4, FA4, FA5, FA8.4 |
| `lane-routing/.../route/route-record.registry.spec.ts` | new | Store and lookup; cap; unknown id; decision model only with a proposal; over-long decision model id stored as 128 characters | FA7.1, FA7.3 |
| `lane-routing/.../matrix/outcome-figures.spec.ts` | changed | `byModelEffort` true and false | FA7.2 |
| `lane-routing/.../evidence/routing-evidence.service.spec.ts` | new | View; `score: null`; catalog status and age; `inCatalog: false`; efforts with provenance unchanged; decision models | FA6, FA7, FA8.3 |
| `rpc-handlers/.../services/lane-model-listing.adapter.spec.ts` | changed | `efforts` passed through unchanged; fallback wrapped as `ptah-fallback`; shared in-flight `listAll` | FA1.1, FA8.1, FA8.5 |
| `rpc-handlers/.../services/cli-model-list.service.spec.ts` | changed | `effortSupport` order native > fallback > unknown; Codex catalog recorded in the registry | FA8.1, FA8.5 |
| `rpc-handlers/.../handlers/routing-evidence-rpc.handlers.spec.ts` | new | Params refused; service absent; result shape | FA6 |
| `vscode-lm-tools/.../agent-namespace.builder.spec.ts` | changed | `route` sets `routeFacts`; unknown or other lane gives none; Ptah CLI `spawnEffort` | FA5.1, FA7.1, FA8.4 |
| `vscode-lm-tools/.../mcp-core/agent-spawn-args.schema.spec.ts` | changed | `route` accepted, bounds | FA5 |
| `chat/.../performance-routing-setting.component.spec.ts` | new | Stored value, default true, write and read-back, failure | FA6, Q3 |
| `chat/.../routing-evidence.component.spec.ts` | new | Rows per model; "no samples"; catalog failure and age; funnel; provenance badges (native, Ptah fallback, not reported); decision models | FA6, FA7, FA8.3 |
| Electron screenshot of the decision matrix page | visual review phase | Page renders in Electron | FA6.5 |

---

## 7. Team-leader handoff: work units

Each unit has disjoint write files, at most two projects and at most six write files. Each lane
brief repeats the CLAUDE.md verification rules. Do not start a check of a project while a lane
edits it.

| # | Unit | Projects | Write files | Depends on |
| --- | --- | --- | --- | --- |
| WU0 | Off-mode golden test (test only) | lane-routing | `pipeline/route-off-golden.spec.ts` (new); `pipeline/__fixtures__/route-off-golden.json` (new) | none (runs on unchanged code) |
| WU1 | Shared contracts | shared | `libs/shared/src/lib/types/lane-native-values.types.ts` (new); `.../lane-outcome.types.ts`; `.../agent-process.types.ts`; `.../rpc/rpc-routing-evidence.types.ts` (new); `.../rpc.types.ts`; the shared barrel that exports `lane-outcome.types` (add the new types file) | none |
| WU2 | Row schema and migration | lane-outcomes, persistence-sqlite | `persistence-sqlite/src/lib/migrations/0078_lane_outcome_choice_keys.ts` (new); `.../0078_lane_outcome_choice_keys.spec.ts` (new); `persistence-sqlite/src/lib/migrations/index.ts`; `lane-outcomes/src/lib/lane-outcome.schema.ts`; `lane-outcomes/src/lib/store/sqlite-lane-outcome.store.ts`; `lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts` | WU1 |
| WU2b | Key-value store guard test | lane-outcomes | `lane-outcomes/src/lib/store/key-value-lane-outcome.store.spec.ts` | WU2 |
| WU3a | Effort policy and native registry | cli-agent-runtime | `cli-agents/cli-adapters/cli-adapter.interface.ts`; `cli-agents/lane-spawn-policy.ts`; `cli-agents/lane-spawn-policy.spec.ts`; `cli-agents/native-effort.registry.ts` (new); `cli-agents/native-effort.registry.spec.ts` (new); `cli-agents/cli-detection.service.ts` (own the registry, `recordNativeCatalog`, `nativeEfforts`) | WU1 |
| WU3b | Capture at spawn and completion | cli-agent-runtime | `cli-agents/agent-process-manager.service.ts`; `cli-agents/lane-completion-outcome.ts`; `cli-agents/lane-completion-outcome.spec.ts`; the APM spawn spec (section 6) | WU2, WU3a |
| WU13 | Claude native efforts | cli-agent-runtime | `cli-agents/cli-adapters/claude-cli.adapter.ts`; `cli-agents/cli-adapters/claude-cli.adapter.spec.ts`; `claude/claude-sdk-lane-runner.ts`; `claude/claude-sdk-lane-runner.spec.ts` | WU3a |
| WU14a | Codex runtime native values | codex-runtime | `codex-runtime/src/lib/codex-context.ts`; `codex-runtime/src/lib/codex-runtime.types.ts`; `codex-runtime/src/lib/codex-context.spec.ts` | WU1 |
| WU14b | Codex lane native values | cli-agent-runtime | `cli-agents/cli-adapters/codex/codex-app-server-lane-models.ts`; `.../codex/codex-app-server-lane-models.spec.ts` (new); `.../codex/codex-app-server-lane.adapter.ts`; `.../codex/codex-app-server-lane.adapter.spec.ts` | WU3a, WU14a |
| WU15a | ACP reported state | acp-runtime | `acp-runtime/src/lib/acp-session-runtime.ts`; `acp-runtime/src/lib/acp-session-helpers.ts`; `acp-runtime/src/lib/acp-vendor-profile.ts`; `acp-runtime/src/lib/profiles/grok-acp-profile.ts`; `acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`; `acp-runtime/src/lib/acp-session-runtime.spec.ts` | WU1 |
| WU15a2 | ACP profile tests | acp-runtime | `acp-runtime/src/lib/profiles/grok-acp-profile.spec.ts`; `acp-runtime/src/lib/profiles/antigravity-acp-profile.spec.ts` | WU15a |
| WU15b | ACP lane handle | cli-agent-runtime | `cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts`; `.../provider-session/provider-session-lane-handle.spec.ts` (new) | WU3a, WU15a |
| WU16 | Pi session state | cli-agent-runtime | `cli-agents/cli-adapters/pi-cli.adapter.ts`; `cli-agents/cli-adapters/pi-cli.adapter.spec.ts` | WU3a |
| WU17 | Copilot effort flag | cli-agent-runtime | `cli-agents/cli-adapters/copilot-effort-flag.ts` (new); `.../copilot-effort-flag.spec.ts` (new); `cli-agents/cli-adapters/copilot-sdk.adapter.ts`; `cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts` | WU3a |
| WU18 | OpenCode native model | cli-agent-runtime | `cli-agents/cli-adapters/opencode-cli.adapter.ts`; `cli-agents/cli-adapters/opencode-cli.adapter.spec.ts` | WU3a |
| WU4a | Spawn argument `route` | vscode-lm-tools | `mcp-core/agent-spawn-args.schema.ts`; `mcp-core/protocol-dispatcher.ts` (copy at `:1419`); `mcp-stdio/agent-tool.dispatcher.ts` (copy at `:505`); `mcp-core/tool-description.builder.ts` (near `:965`); `mcp-core/route-tools.ts`; `mcp-core/agent-spawn-args.schema.spec.ts` | WU1 |
| WU4b | Route fact lookup at spawn | vscode-lm-tools | `namespace-builders/agent-namespace.builder.ts`; `namespace-builders/agent-namespace.builder.spec.ts`; `ptah-api-builder.service.ts` | WU4a, WU9 |
| WU5 | Catalog snapshot | lane-routing | `lane-model-listing.port.ts`; `routing-constants.ts`; `catalog/lane-catalog.types.ts` (new); `catalog/lane-catalog.store.ts` (new); `catalog/lane-catalog.store.spec.ts` (new) | WU1 |
| WU19 | Seed format | lane-routing | `matrix/matrix.types.ts`; `matrix/matrix.schema.ts`; `matrix/seed-source.ts` (new); `matrix/seed-aliases.ts` (new, data only); `matrix/seed-matrix.ts`; `matrix/seed-matrix.spec.ts` | none |
| WU19b | Seed format tests | lane-routing | `matrix/seed-source.spec.ts` (new) | WU19 |
| WU6 | Evidence index and funnel | lane-routing | `matrix/blend.ts` (new); `matrix/local-derivation.ts`; `matrix/choice-evidence.ts` (new); `matrix/choice-evidence.spec.ts` (new); `matrix/outcome-figures.ts`; `decision-model/decision-payload.ts` | WU1, WU5, WU19 |
| WU6b | Figures test | lane-routing | `matrix/outcome-figures.spec.ts` | WU6 |
| WU7 | Pair scoring | lane-routing | `ranking/score.ts`; `ranking/choice.types.ts` (new); `ranking/score-choice.spec.ts` (new); `contracts/route-decide-result.schema.ts`; `reasons/compile-reasons.ts`; `reasons/compile-reasons.spec.ts` | WU5, WU6 |
| WU8 | Pipeline integration | lane-routing | `pipeline/route-choice.spec.ts` (new; not the golden file); `matrix/capability-matrix.store.ts`; `pipeline/gather.ts`; `pipeline/phase-plan.ts`; `pipeline/assemble-gate.ts`; `scope/performance-routing-setting.ts` (new) | WU5, WU6, WU7 |
| WU8b | Matrix store pair resolve tests | lane-routing | `matrix/capability-matrix.store.spec.ts` | WU8 |
| WU9b | Evidence view service | lane-routing | `evidence/routing-evidence.service.ts` (new); `evidence/routing-evidence.service.spec.ts` (new) | WU5, WU6 |
| WU9 | Route service, registry, wiring | lane-routing | `route-decide.service.ts`; `route/route-record.registry.ts` (new); `route/route-record.registry.spec.ts` (new); `di/register.ts`; `di/tokens.ts` (`LANE_CATALOG_STORE`, `ROUTING_EVIDENCE_SERVICE`); `src/index.ts` | WU8, WU9b |
| WU10a | Listing efforts and shared flight | rpc-handlers | `services/lane-model-listing.adapter.ts`; `services/lane-model-listing.adapter.spec.ts`; `services/cli-model-list.service.ts`; `services/cli-model-list.service.spec.ts` | WU3a, WU5 |
| WU10b | Evidence RPC | rpc-handlers | `handlers/routing-evidence-rpc.handlers.ts` (new); `handlers/routing-evidence-rpc.handlers.spec.ts` (new); `handlers/index.ts`; `register-shared-rpc-handlers.ts`; `host-profile/manifest.ts`; `src/index.ts` only if it lists handler classes by name | WU1, WU9 |
| WU11 | Setting key | platform-core, agent-sdk | `platform-core/src/file-settings-keys.ts`; `platform-core/src/file-settings-manager.ts`; `agent-sdk/src/lib/types/settings-export.types.ts` | none |
| WU12 | Electron settings UI | chat | `settings/ptah-ai/performance-routing-setting.component.ts` (new); `.../performance-routing-setting.component.spec.ts` (new); `settings/ptah-ai/routing-evidence.component.ts` (new); `.../routing-evidence.component.spec.ts` (new); `settings/ptah-ai/decision-matrix-page.component.ts` (mount both after `<ptah-lane-rotation-setting />`, `:92`) | WU1, WU10b, WU11 |
| WU12b | E2E harness fixture | webview-e2e-harness | `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts` | WU1 |

Paths without a project prefix are relative to the project's `src/lib/` folder
(`cli-agents/...` is under `libs/backend/cli-agent-runtime/src/lib/`, `mcp-core/...` under
`libs/backend/vscode-lm-tools/src/lib/code-execution/`, `services/` and `handlers/` under
`libs/backend/rpc-handlers/src/lib/`, `settings/...` under `libs/frontend/chat/src/lib/`).

Suggested batches (file-disjoint inside each batch). When two units of one project share a
batch (WU5 and WU19b, WU7 and WU9b, WU9 and WU8b), run the project check only after both end:

1. WU0, WU1, WU11, then WU19 after WU0 is committed
2. WU2, WU3a, WU5, WU14a, WU15a, WU4a, WU12b, WU19b
3. WU2b, WU13, WU15a2, WU6, WU10a
4. WU3b, WU7, WU9b
5. WU14b, WU8
6. WU15b, WU9, WU8b
7. WU16, WU4b, WU10b
8. WU17
9. WU18, WU12, then the visual review in Electron

The cli-agent-runtime units WU3a, WU3b, WU13, WU14b, WU15b, WU16, WU17, WU18 touch disjoint
files, but they share one project. Run them in separate batches as above, or in one batch with
the project check only after all of them end.

Notes for the team-leader:

- WU0 is committed before any other lane-routing unit starts (WU19 is the first). No later
  unit writes `route-off-golden.spec.ts` or its fixture. A later failure of it is an off-mode
  regression, not a fixture to update.
- WU12 follows `lane-rotation-setting.component.ts`: standalone, `OnPush`, `inject()`,
  signals, `ClaudeRpcService` with a 5000 ms timeout, `settings:get`/`settings:set` through
  `SettingsSaveFeedbackService`, `@ptah-extension/ui` primitives. Electron only (the parent
  mounts under `isElectron`).
- Hosts: VS Code and the TUI get only optional fields and schema defaults. `platform-cli` and
  `cli-engine` read the same optional fields and need no edit. Full gate projects:
  `shared`, `persistence-sqlite`, `lane-outcomes`, `codex-runtime`, `acp-runtime`,
  `cli-agent-runtime`, `lane-routing`, `rpc-handlers`, `vscode-lm-tools`, `platform-core`,
  `agent-sdk`, `chat`, `webview-e2e-harness`, `ptah-extension-webview`, `ptah-electron`.

---

## 8. Known limits (out of this task)

- Claude and Ptah CLI lanes report no applied effort (research finding 2). `resolvedEffort`
  stays unknown for them.
- Catalog efforts for grok, antigravity, pi and copilot are not reported by their listing
  sources. They come from a live session (ACP) or stay fallback/unknown.
- An ACP lane that accepts an effort hint but ignores it cannot be detected. Its
  `resolvedEffort` shows the session `currentValue` when the agent reports it.
- System One alternates (`LANE_MODEL_ALTERNATES_CAP`, `pipeline/model-refine.ts`) stay
  model-only.
- FA9 follow-up task (decisions.md row 14): the CI job that fetches public benchmarks, the
  per-source license check (only licenses verified to allow redistribution, row 15), the
  published seed JSON, the in-app download and its validation with `SeedSourceRowSchema` and
  `SeedAliasSchema`, and any new benchmark data. This task ships no new seed value.
- The existing seed row keeps `licenseId: 'NOASSERTION'` until the follow-up task verifies or
  removes it.
- The capability matrix view does not show `sourceId`, `licenseId`, `fetchedAt` or
  `sourceRow`, or effort profiles.
- The orchestration skill text is not changed. Tool descriptions (WU4a) tell the coordinator to
  pass `route`.

---

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Keep `deriveLocalMatrix` and the matrix layers unchanged. Add a parallel evidence index for on mode | change the matrix key / parallel index | Off mode must keep today's choice (decisions.md row 8). Matrix key `[family, model, taskKind]` (`local-derivation.ts:148`) | yes |
| D2 | Score key model: requested own id, else native resolved model for `lane-default`, else `*` | requested only / resolved only / this rule | Routing can pass back only catalog ids. Codex telemetry can echo the request (research finding 3) | yes |
| D3 | Effort bucket: the SENT effort when it is a `ModelEffort`, else `*`. Old rows `*` | requested / sent / resolved | A value that the lane never received must not build an effort cell (FA8.4) | yes |
| D4 | Add `resolvedEffort` with provenance (revised from revision 2) | none / add | FA8.2. Codex (`codex-protocol-schemas.ts:645`), ACP `currentValue` and Pi `get_state` report it | yes |
| D5 | Catalog snapshot in lane-routing over `LaneModelListing`. On-demand refresh, no timers, `IStateStorage` | rpc-side cache / lane-routing snapshot / timer | lane-routing owns the budget (`gather.ts:501-537`). No polls rule | yes |
| D6 | `routeId` in the gate result, `route` spawn argument, in-memory registry, host-stamped facts | caller passes facts / SQLite route table / registry | The caller must not write facts. The MCP entry already imports lane-routing | yes |
| D7 | New RPC `agent:getRoutingEvidence` | extend the matrix RPC / new RPC | Different sources. Two consumers of the matrix result exist | yes |
| D8 | Deterministic exploration slot, `EXPLORATION_PERIOD = 5`, with the 4.4 exclusions | bonus only / random / periodic | Bonus cannot pass the band. `score()` stays pure. Review approval is the last funnel stage | yes (constant) |
| D9 | Setting `agentOrchestration.performanceRouting`, default `true` | opt-in / opt-out | Q3 answer | yes |
| D10 | System One figures get model and effort only in on mode | always / on only | Off mode must not change the System One request | yes |
| D11 | An explore turn keeps the exploit total for ranking | explored total / exploit total | With the explored total, exploration never runs | yes |
| D12 | New `info.spawnEffort`, `info.modelSource`, `info.reportedSession`. Do not reuse `reasoningEffort` or `observedModel` | reuse / new | The composer and header read the old fields (`lane-turn-settings.store.ts:81-93`, `agent-card-header.component.ts:283`) | yes |
| D13 | Effort pairs only from `native` lists. Fallback and unknown lists give only the policy effort | all `ModelEffort` / fallback too / native only | FA8.3: a fallback is never scored as native | yes |
| D14 | The two assigned skills were refused by the host | stop / continue | "disabled for model invocation in skillOverrides settings" | n/a |
| D15 | Resolved values come only from `reportedSession()` when an adapter implements it, else from the telemetry model | telemetry always / native source first | Codex seeds the model from `params.model` (`codex-context.ts:1050`). ACP `sessionModel()` prefers the request (`acp-session-runtime.ts:1095-1100`). OpenCode seeds from the request (`opencode-cli.adapter.ts:963`) | yes |
| D16 | `effortCheck` and the `not in native list` reason clause appear in both modes | on mode only / both | FA8 is lane fidelity, not a routing choice. FA8.4 requires the route result to state it. The choice fields stay byte-identical in off mode | yes |
| D17 | The native effort registry lives in `CliDetectionService` (cli-agent-runtime) and is filled from listing calls and sessions | read the lane-routing snapshot at spawn / registry in cli-agent-runtime | cli-agent-runtime must not import lane-routing. `CliDetectionService` already owns `listModelsForAll` (`:461`) and is exported | yes |
| D18 | A requested effort outside the native list is skipped, and precedence continues to the next step | send nothing at all / next step / nearest value | Today's rule for an unsupported value continues the precedence (research finding 1). "Nearest value" is a Ptah mapping, which FA8.4 forbids | yes |
| D19 | The Copilot effort flag comes from `copilot --help` of the installed binary, cached by path and version | fixed `--effort` / fixed `--reasoning-effort` / probe | FA8.6. Research finding 6: docs and repository disagree, installed acceptance unverified | yes |
| D21 | In on mode the seed is the blend prior only (`priorMode: 'blended'`); off mode keeps `LEARNED_DELTA_CAP` | keep cap / raise cap / blend only | 4.8: with the cap a strong seed (80) never drops below 65, so local evidence cannot overrule it. The blend (`BLEND_PRIOR_WEIGHT` 10) already shrinks small samples | yes |
| D22 | Seed provenance fields are optional in the type, required by the schema for `source: 'seed'`, forbidden for other sources | separate seed type / one cell type with refine | Same pattern as `sampleCount` (`matrix.schema.ts:57-78`). One schema serves seed, user file and view | yes |
| D23 | The existing seed row gets `licenseId: 'NOASSERTION'` and `fetchedAt: '2026-10-14'` | drop the row / invent a license / NOASSERTION | FA9.6 keeps the shipped seed working. No verified license exists in this task (decisions.md row 15) | yes |
| D24 | Alias match is exact on `[sourceId, benchmarkModel, benchmarkEffort]` | normalized / fuzzy / exact | FA9.3 "never guessed" | yes |
| D25 | An absent `performanceRouting` dependency in `RouteDecideService` means off; DI always provides the reader | absent = on / absent = off | WU0's golden test and the existing route-decide specs build the service without it, so they keep today's behavior with no edit | yes |
| D26 | Keep the counter on completed runs and state the exploration bound as approximate under concurrent route calls | count at route-record time / approximate | Counting at route time would spend explore slots on routes nobody spawns, and would put state into the choice of a pure score input. The over-run is bounded by the number of concurrent route calls | yes |
| D20 | Keep every Ptah mapper and fixed list as the labeled fallback (no deletion in this task) | delete / keep labeled | FA8.5. Lanes without native lists (copilot, pi, ptah-cli, grok and antigravity catalogs) still need them to spawn | yes |

---

## Proposed Removals

| Surface | Today | Change | Status |
| --- | --- | --- | --- |
| System CLI promotion block, `libs/backend/lane-routing/src/lib/ranking/score.ts:129-131` | A system CLI lane never gets a promoted model | Not applied in on mode (the `choice` branch uses 4.3 for every lane). Stays in off mode | Approved (decisions.md row 10, via Q3) |
| `validatedEffort` filter in `codexAdvertisedEfforts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-models.ts:41-44` | The Codex composer's lane-wide effort union drops native values that are not in Ptah's allowlist | Show the native union unchanged and label values that a lane cannot send | Proposal only (FA8.5). Not in a work unit. The catalog snapshot path is fixed in WU14b without this removal |
| Fixed `--effort` flag, `copilot-sdk.adapter.ts:382-385` | Always sends `--effort` | Replaced by the flag that the installed CLI lists (WU17) | Part of FA8.6 (required behavior, not a mapping removal). Listed here because a fixed transport goes away |

No effort mapping in `lane-spawn-policy.ts` is removed. Each stays as the labeled fallback
(D20).

---

## Revision log

| Round | Findings | Changes |
| --- | --- | --- |
| Gate 2, round 1 (`implementation-plan-review.md`, REVISE) | 1-7 fixed | 1: rule R0 in 2.12.4 (absent or level-less "supports effort" is `unknown`; empty native list only on a positive "no effort"); Claude and Codex rows; failure row; Claude spec cases. 2: new test-only WU0 (`route-off-golden.spec.ts` + fixture) in batch 1; WU8 no longer writes the golden file; D25. 3: `webview-e2e-harness` in the gate list. 4: `routedEffort` in the summary Pick. 5: bound stated as approximate; D26. 6: truncation in `RouteDecideService` and the completion writer, with spec cases. 7: `route-decide-result.schema.ts:191-192`; `MAX_OUTCOME_EFFORT_LENGTH = 32`. Verified: the constant is at `agent-spawn-args.schema.ts:75`, not `:71` as the review states |
