# Phase 1 implementation plan

## Summary

Implement D6 decisions 1–11 from `rca.md`. Both MCP transports validate and start one budget. The route service gathers bounded facts, ranks implementers before reviewers, optionally calls the decision model, assembles validated results, and returns whole JSON. Preserve dispatch fields and hard eligibility. The new trace exposes the additive score and why a candidate was chosen, ranked or excluded.

Paths prefixed **L** are relative to `libs/backend/lane-routing/src/lib/`, **M** to `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/`, and **N** to the adjacent `namespace-builders/`. Line numbers refer to the pre-change tree.

## Components

### 1. Scoring and spread

- In L `matrix/capability-matrix.store.ts:204–224,468–495`, extend `load().resolve` with separate user, seed and local value cells for the same resolved profile and task kind. Preserve profile fallback, staleness, effective-cell provenance and `readMergedView()`. Keep the existing local blend and distinct run count (`matrix/local-derivation.ts:273–334,376–417`). Missing local means zero runs and delta zero. A user value supplies the prior and zeros both learned delta and exploration.
- In L `ranking/score.ts:53–137,173–208`, compute parts once per candidate/model. `learned = clamp(localScore - prior, -15, 15) + exploration`, with exploration 5 below three local runs. `total = prior + learned + preference + limit`. Report exploration as a breakdown of learned. Keep the matrix value in legacy roster `score` and its cell for the 0–100 contract. Use the additive total for spread, model options, alternate promotion and trace. Apply the same calculation when resolving an exact pin or live alternate (`pipeline/phase-plan.ts:229–282,343–409`).
- In L `ranking/spread.ts:69–120,152–299`, sort descending by total, then ascending preference rank, limit class, executor kind and ordinal ID. Drop the limit-class pool and detected `preferredRank` tie-break. Rotate using the existing successor and key only within five points of the maximum. Non-lane limit state is unknown. Hard constraints reject at-limit before scoring, including pins. Compute preference impact by rerunning selection with zero preference and no preference tie-break from the **same** incoming rotation snapshot. Advance the cursor once.

### 2. Preferences

L `ranking/candidate.types.ts:19–49,65–135` copies `CliDetectionResult.ptahCliName` (`libs/shared/src/lib/types/agent-process.types.ts:555–579`), populated from registry `a.name` at N `agent-namespace.builder.ts:948`. Use native CLI ID and role/kind labels as display defaults. Match trimmed entries against the full phase inventory in priority order: exact ID, folded display name, folded family, folded CLI. A single match gets the entry’s one-based rank. An ambiguous winning tier yields all matched IDs and grants no boost. First occurrence wins for duplicate aliases to the same candidate. Record unknown, ambiguous, duplicate and matched-but-ineligible entries, and whether a match came from rules or the call. Honor hard eligibility separately. Resolve repeated call diagnostics once per distinct entry and match set where possible.

### 3. Trace and explanations

L `pipeline/phase-plan.ts:67–90,117–203,229–282` retains the full inventory and ranked scores even when only a pinned candidate can be picked. L `pipeline/model-refine.ts:154–187,257–349` retains the option-cap fit at full width and the final accepted fit, keyed by phase and executor ID. In L `pipeline/assemble-gate.ts:54–109,110–177,206–245,248–385`, join inventory, constraints, ranking and actual resolution in request-phase order. Attached `roster[i].candidates` marks chosen first, then hard/user exclusions, then ranked alternatives. An option dropped from the applicable model pool gets `pruned` with first applicable cause `below-band`, `option-cap`, or `payload-fit`; dropping an alternate model alone never prunes its lane. No model dispatch still yields a trace. A question skipped by the request question cap has a row fallback and retains ranked alternatives. The legacy excluded list continues to include hard exclusions and the model-offer pruned entries that it emitted before. A missing pin target stays a synthetic legacy exclusion.

In L `reasons/compile-reasons.ts:113–163,280–387,435–end`, produce one sentence per row with selected total and parts, highest-total eligible alternative and its total and parts, signed gap, actual deciding factor (pin, rotation, tie-break or model refinement), preference diagnostics or why the boost lost, policy condition, matched rule, and limit state/age. An unavailable row names the blocking constraint. Preserve confidence and model proposal fields. Keep aggregate reasons for input failures and deduplicate recurring diagnostics.

M `route-tool-handlers.ts:90–93,118–129` owns compaction using the exact current character and token check. Try full JSON, then keep chosen and strongest alternative plus per-phase omitted counts, then remove candidate details from the largest rows in fair round-robin order, then remove all optional trace entries and shorten explanatory text. Keep `traceOmitted` when a phase is partial. Compute against serialized bytes as seen by the existing tokenizer and JS character count at each tier. Bound fit attempts, batch omissions, and test dense 100-phase results even when the trace budget is zero. Keep the existing oversize error if the legacy structural payload alone is too big (see Decisions).

### 4. Deadline and local warmup

M `handleRouteToolCall` creates an absolute monotonic deadline at entry and selects 4,000 or 8,000 ms after validation. N `RouteNamespace.decide` forwards it alongside the optional session key. L `RouteDecideService.decide` (:133–176) creates an equivalent deadline for direct callers. Reserve 250 ms for synchronous resolution, assembly, Zod and MCP formatting. Use the same absolute cutoff throughout and cap gather to 2,000 ms within it. Open the decision caller concurrently with gate gather. Race **each** rows, limits, roles, listing, matrix, phase-definition, and candidate-tool await plus caller opening, pre-flight fixed request, and both gate passes. Start roles and phase definitions immediately; row-dependent work starts as rows arrive. A late result cannot mutate the snapshot. Abort supported ports and observe losing promises. Read rotation synchronously from existing state. Leave rotation writes and live 404 rechecks as observed background work (:198,312,421,434–456), and skip expired writes. Serialize queued rotation saves in invocation order.

Before pre-flight dispatch and each gate pass, require the full configured request timeout inside the remaining I/O budget. Use `deadline` when skipped for budget or when the outer race wins, `timeout` for an earlier provider timeout. Record dispatch at the transport invocation boundary so a sent request still counts if its answers time out. Unknown token/cost figures stay null. Budget fallback takes precedence over the alternates-only suppression at L `phase-resolve.ts:38–53`. Unavailable rows keep legacy null fallbackCause and report the deadline in their reason. Pre-flight returns existing null answers with `source: 'skill-table'`. Gate resolves remaining rows by ranking, or unavailable when no observed eligible candidate exists. Missing rows → empty inventory, missing limit → unknown, missing roles → built-ins, missing matrix → neutral, missing listing → lane-default, missing tool evidence → capability unknown. Timed-out definition reads use the existing legacy requirements and carry a missing reason.

L `decision-model/decision-caller.ts:33–117` adds route-only opening/dispatch options. In `system-one.client.ts:150–177,253–278`, separate residency/warmup from routing inference. Require positive bounded residency and transport support for warm-only admission, even with an explicit timeout. The current daemon transport lacks atomic admission, so route-only local inference stays blocked with `model-cold` and an explicit reason, pending the decision below. Schedule a single bounded, loopback-only warmup per endpoint/model with cooldown, empty prompt, existing keep-alive and no task data. Never pass the 60 s load allowance into route dispatch. Preserve existing defaults for other callers.

### 5. Limit evidence and model-list status

N `buildRouteCandidateSource` (:89–114) adds optional `limitEvidence`, sharing lookup mapping with legacy `limits`; gather calls one port only. Copy `entry.state.state`, `entry.lookup`, `entry.snapshot?.status` and `readAt` from `cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:114–122` and `libs/shared/src/lib/types/plan-limit.types.ts:246–263`. Do not expose owners, windows or raw errors. L `gather.ts:42–114,133–149,163–274` retains one listing outcome per lane and formats `models unknown for <lane> (timeout|error|empty|unregistered)`. Classify deadline abort as timeout regardless of which callback settles first. Keep configured model when known, otherwise existing lane-default. Use wall-clock time separately from the monotonic deadline for observation age, rendering unknown for missing timestamps. Use the stable lane ID as the map key, including Ptah CLI IDs.

### 6. Args schema

M `route-tools.ts:34–40,54–78,92–128` leaves a property's existing description intact if its required-owner list is empty. L `contracts/route-decide-args.schema.ts:56–61` rejects semicolon, CR and LF on the raw input before trimming, then preserves the 200-character limit and documents the constraint with `.describe`. L `compile-reasons.ts:188–202,284–289` consumes validated attribution. The source string supplies no routing instruction. Treat an empty trimmed source as absent. Put the authoring constraint in the generated schema description and use the same Zod parse in the MCP and direct service paths. Update effective-tool-list fingerprints.

### 7. Settings and rule application

Follow L `scope/lane-rotation-setting.ts:5–15` and `di/register.ts:205–239`. DI injects a workspace-backed reader into `RouteDecideDependencies`; read once each gate using `getConfiguration<unknown>('ptah', 'agentOrchestration.routingRules')`. Electron declaration is the file-routing allowlist plus defaults in `libs/backend/platform-core/src/file-settings-keys.ts:135–146,376–389`, read by `platform-electron/src/implementations/electron-workspace-provider.ts:94–106`. Default to `[]` and preserve whole raw values, including invalid object-shaped values, through the file flattener (`file-settings-manager.ts:802–824`) so the router can diagnose them. Add to `ROUTING_KEYS` for host generation invalidation and agent-sdk `KNOWN_CONFIG_KEYS` for export/import. Shared `rpc-agents.types.ts:304,358–390` is the orchestration types reference. Add standalone settings type there and leave the legacy dedicated config RPC unchanged; generic settings RPC already reads and writes file-based keys. No VS Code contribution manifest exists in this tree. Use the shared configuration port and document the downstream contribution.

L new `scope/routing-rules-setting.ts` validates raw values per entry with strict Zod objects, canonical enums, a list cap of 64, unique IDs matching `[A-Za-z0-9_-]{1,64}`, selector lists of up to 32 trimmed strings (1–200 characters), at least one `set` field, and valid min/max order. Report a malformed top-level value or settings read failure once. Keep valid siblings in order and emit bounded, sanitized entry-index diagnostics. An undefined setting means no rules. L `phase-plan.ts:130–186` matches the first valid rule by AND across specified phase fields (empty match is catch-all), clamps policy tier, then overrides effort. A rule `prefer` list replaces the call list when supplied. Exclude selectors use the same resolver and report missing/ambiguous selectors. L `hard-constraints.ts:228–328` applies exclusions after hard classification, before eligibility fallback. Accepted pins bypass user exclusions and candidate preference; valid pin model/tier beats the clamp. Rules still supply fields the pin leaves unset. Tier/effort remain subject to host model support; use the clamped tier to resolve tier-based subagents and keep model refinement within the rule's bounds.

### 8. Policy condition

L `tier-effort-policy.ts:5–35` returns the condition from the actual R1–R5 branch, including omitted weight. Preserve thresholds. L `assemble-gate.ts:288–295` renders e.g. “R3 shape=logic weight≥8000, sonnet/xhigh after rule ui-review capped opus at sonnet” when applicable, using the actual effective tier and effort.

### 9. Skills and docs

Update `.claude/skills/orchestration/references/lane-assignment.md:20–46` and its `plugins/ptah-core` counterpart for preference selectors, boost, trace compaction and the reason format. Update `.claude/skills/agent-lanes/SKILL.md:55–60` and its shipped counterpart for result consumption. The orchestration entrypoint and phase-mode reference already describe still-valid fields. Document rules and a validated matrix example (version, family, model, cells, user source, date and 0–100 score) in `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md`. Explain `~/.ptah/routing/capability-matrix.json`, user overrides and the generated `capability-matrix.view.json`.

## Contracts

Illustrative signatures. Use existing stage, task, phase, model and matrix unions. Arrays and maps are read-only internally; derive DTOs from Zod.

```ts
const LEARNED_DELTA_CAP = 15, EXPLORATION_BONUS = 5, EXPLORATION_MIN_SAMPLES = 3;
const PREFERENCE_BOOST = [12, 8, 4, 2] as const; // index min(rank - 1, 3)
const LIMIT_ADJUST = { 'confirmed-room': 0, unknown: -5, 'near-limit': -10 } as const;
const ROUTE_DEADLINE_MS = { 'gate-0.1': 8000, 'pre-flight': 4000 } as const;
const ROUTE_RETURN_RESERVE_MS = 250;
type ScoreParts = { prior: number; learned: number; preference: number; limit: number;
  exploration?: number; priorSource?: 'user' | 'seed' | 'neutral'; sampleCount?: number };
type ScoreLayers = { user?: ValueMatrixCell; seed?: ValueMatrixCell; local?: ValueMatrixCell };
type PreferenceMatch = { entry: string; rank: number; ids: readonly string[];
  via?: 'id' | 'displayName' | 'family' | 'cli' };
type LimitEvidence = { state: LaneLimitState;
  lookup?: 'ok' | 'no-owner' | 'timeout' | 'failed'; status: ProviderAccountUsageStatus | null; readAt: number | null };
type ModelListStatus = 'ok' | 'timeout' | 'error' | 'empty' | 'unregistered';
type PrunedCause = 'below-band' | 'option-cap' | 'payload-fit';
type UserRuleExclusion = `user-rule:${string}`;
type CandidateTrace = { candidate: string; displayName: string; total: number | null;
  parts?: ScoreParts; disposition: 'chosen' | 'ranked' | 'excluded';
  rule?: ExistingExclusionRule | UserRuleExclusion; cause?: PrunedCause;
  limitEvidence?: LimitEvidence; modelListStatus?: ModelListStatus };
type RouteCallContext = { readonly sessionKey?: string; readonly deadlineAtMs?: number };
type RouteDeadline = { readonly deadlineAtMs: number; remainingMs(): number };
type BudgetResult<T> = { kind: 'ok'; value: T } | { kind: 'deadline' }
  | { kind: 'error'; error: unknown };
type RoutingRule = { id: string;
  match: { kind?: PhaseKind; shape?: PhaseShape; taskType?: TaskType; role?: string };
  set: { minTier?: ModelTier; maxTier?: ModelTier; effort?: ModelEffort;
    prefer?: readonly string[]; exclude?: readonly string[] } };
```

Add optional `ScoreCell.layers?: ScoreLayers` and `ScoreInput.preferenceRank?: number`, plus `CandidateScore.parts: ScoreParts`, `CandidateScore.total: number` and `LaneModelFacts.status: ModelListStatus`. Add optional `LaneCandidate.displayName?: string` and `limitEvidence?: LimitEvidence` for legacy fixtures. Export the new public port types and deadline constants from the lane-routing barrel. Keep legacy score-cell inputs usable by deriving layers from `cell.source` when missing. Add `RouteCandidateSource.limitEvidence?(rows): Promise<ReadonlyMap<string, LimitEvidence> | null>`, optional `RouteDecideDependencies.routingRules: { read(): { rules: readonly RoutingRule[]; reasons: readonly string[] } }`, and required `PhasePolicy.condition: string`. Add optional roster `candidates?: CandidateTrace[]`, `traceOmitted?: number`, exclusion `cause?: PrunedCause`, and new fallback literals `deadline | model-cold`. Allow template-literal rule values alongside the existing enum; legacy rows and exclusions still parse. Hard-excluded entries carry null total. Model-pruned eligible candidates have computed totals. Detail compaction may omit parts. Use a shared pure type for rules with literal unions and existing shared phase/task enums, validated by the router schema.

## Batches

**Project legend.** L and `libs/backend/lane-routing/src/index.ts` → `@ptah-extension/lane-routing`. M/N → `@ptah-extension/vscode-lm-tools`. P → `libs/backend/platform-core/src/` (`@ptah-extension/platform-core`); A → `libs/backend/agent-sdk/src/lib/types/` (`@ptah-extension/agent-sdk`); S → `libs/shared/src/lib/types/rpc/` (`@ptah-extension/shared`). Specs are in their production file’s project unless named separately. Read the cited symbols with neighboring fixtures and contract consumers; estimates include revised code and specs, in thousands of tokens. Cap read+write at 16k per batch. Independent batches may proceed in parallel when their dependencies are ready.

### B01 Results and public seams (5k)

- **Write set** — L `routing-constants.ts`, `contracts/route-decide-result.schema.ts`, `contracts/contracts.spec.ts`, `route-candidate-source.port.ts`; lane-routing `src/index.ts`
- **Read set and contract** — Constants 17–74,128–156; schema 14–82,120–174,214–276; port 5–end. Optional trace, typed causes, deadline and evidence exports.
- **Specs and acceptance** — Extend contracts with legacy round trip, negative/large trace totals, custom exclusion, both fallback causes and unavailable rows. Legacy fixtures parse.

Required Skills: none

### B02 Layered score, after B01 (6k)

- **Write set** — L `matrix/capability-matrix.store.ts` + spec; `ranking/score.ts` + spec
- **Read set and contract** — Store 92–124,188–224,450–529; score 52–209; `local-derivation.ts:273–334`. `ScoreLayers → ScoreParts → total`.
- **Specs and acceptance** — User suppresses learn/explore, seed and neutral baselines, n=0/2/3, signed cap, profile fallback, model promotion by total, legacy view intact.

Required Skills: none

### B03 Selectors and spread, after B01 (5k)

- **Write set** — L `ranking/candidate.types.ts`, `ranking/preference-match.ts` (new), `ranking/spread.ts` + spec
- **Read set and contract** — Candidates 19–49,65–135; spread 33–120,123–299; shared CLI rows 555–579. `resolvePreferences(entries, candidates): readonly PreferenceMatch[]`.
- **Specs and acceptance** — Exact ID beats alias; Kimi/Ollama display names; ambiguous family/CLI; duplicates; negative totals; deterministic ties; five-point rotation; at-limit; counterfactual from same cursor.

Required Skills: none

### B04 Settings persistence (5k)

- **Write set** — P `file-settings-keys.ts`, `file-settings-manager.ts` + manager spec; A `settings-export.types.ts` + spec
- **Read set and contract** — File keys 135–146,318–344,376–389; manager 50–57,216–249,604–615,802–824; export keys 53–118. Key round-trips as array.
- **Specs and acceptance** — Default, write/watch increments generation, export accepts key.

Required Skills: nx-workspace-architect

### B05a Rules and policy, after B01 (5k)

- **Write set** — S `rpc-agents.types.ts`; L new `scope/routing-rules-setting.ts` + spec, `pipeline/tier-effort-policy.ts` + spec
- **Read set and contract** — RPC 304,358–390; policy 5–35; args 9–18,20–29. `readRoutingRules(raw: unknown)`, `applyRoutingRule(policy, rule)`.
- **Specs and acceptance** — Invalid siblings, duplicate IDs, first match and AND, reversed bounds, R1–R5 thresholds/conditions.

Required Skills: nx-workspace-architect

### B05b Rule exclusion, after B01/B03 (4k)

- **Write set** — L `ranking/hard-constraints.ts` + spec
- **Read set and contract** — Constraints 59–113,138–167,228–328; result schema exclusion branch. Optional `userExclusions?: ReadonlyMap<string, UserRuleExclusion>` in constrain input.
- **Specs and acceptance** — Pin beats user exclusion, hard limit beats pin, all candidates excluded, reviewer fallback retains existing cause.

Required Skills: none

### B06 Bounded gather, after B01/B03 (5k)

- **Write set** — L new `pipeline/route-deadline.ts`, `pipeline/gather.ts` + spec, `pipeline/candidate-tools.ts`
- **Read set and contract** — Gather 42–114,117–274,275–330; tools 8–end. `withinBudget<T>(deadline, task: (signal: AbortSignal) => Promise<T>): Promise<BudgetResult<T>>`.
- **Specs and acceptance** — Never-resolving ports, late rejection, completed siblings preserved, evidence preferred over legacy, all four listing failures, tools degrade safely.

Required Skills: resilient-nestjs-patterns

### B07 Plan and model options, after B02/B03/B05a/B05b/B06 (8k)

- **Write set** — L `pipeline/phase-plan.ts`, `phase-resolve.ts`, `model-refine.ts`, `phase-plan.spec.ts`, `model-refine.spec.ts`, `live-model-options.spec.ts` (all pipeline)
- **Read set and contract** — Plan 45–206,229–409; resolve 29–end; refine 54–102,154–228,257–349. Carry inventory, per-phase rule diagnostics, total and per-lane fit.
- **Specs and acceptance** — Rule vs call, overrides before scoring, pin and alternate totals, three prune causes, no dispatch trace inputs, model response policy.

Required Skills: none

### B08 Trace and reasons, after B07 (6k)

- **Write set** — L `pipeline/assemble-gate.ts` + spec, `reasons/compile-reasons.ts` + spec
- **Read set and contract** — Assemble 54–177,206–385; reasons 113–163,188–202,280–387,435–end; schema 120–174. One trace per phase. Remove the generic “models unknown” line when per-lane detail is available; retain explicit missing-input reasons for limits, phase definitions and tool proofs.
- **Specs and acceptance** — Runner-up margin and preference loss, rotation/pin reason, freshness, hard vs pruned, ranking-only and unavailable inventory.

Required Skills: none

### B09 Service and local dispatch, after B04/B05a/B06–B08 (9k)

- **Write set** — L `route-decide.service.ts`, `di/register.ts`, `decision-model/decision-caller.ts`, `decision-model/system-one.client.ts`, `route-decide.gate.spec.ts`, `route-decide.preflight.spec.ts`
- **Read set and contract** — Service 88–360,386–469; DI 205–239; caller 33–117; client 150–185,249–278. Shared deadline, background warm path, stage fallback.
- **Specs and acceptance** — Exact budget, pass 2 skip, deadline usage, cold and unknown residency, dedup warmup, hung writes/recheck, host direct caller, transient fallback, reviewer hard gate.

Required Skills: resilient-nestjs-patterns

### B10 MCP adapter and output, after B01 (6k, integrate after B08/B09)

- **Write set** — N `route-namespace.builder.ts` + spec; M `route-tool-handlers.ts` + spec
- **Read set and contract** — Namespace 47–61,84–169; handler 84–136; budget 90–100; limit result 114–122. Context forwarded and optional evidence adapter; whole JSON.
- **Specs and acceptance** — Session key retained, sanitized freshness and failed lookup, full and compact dense 100-phase results, legacy overflow.

Required Skills: none

### B11 Input schema (4k)

- **Write set** — L `contracts/route-decide-args.schema.ts`; M `route-tools.ts`, `route-tools.spec.ts`, `__snapshots__/effective-tool-list.spec.ts.snap`
- **Read set and contract** — Args 41–65; tool 34–78,92–128; handler 108–115. Raw reject then trim; omit empty note.
- **Specs and acceptance** — Empty-owner optional descriptions, stage-required notes, semicolon/CR/LF rejected including edges, whitespace trimmed, correct fingerprints.

Required Skills: none

### B12 Docs and skills, after B08/B10/B11 (4k)

- **Write set** — Docs page and four skill files named in component 9. Page → `ptah-docs`; skill files → no Nx project.
- **Read set and contract** — Docs 1–86; lane-assignment 20–46 and agent-lanes 55–60 in both trees; final DTO and settings examples.
- **Specs and acceptance** — No spec file. Review examples against validators; confirm shipped and local edits match and preserve spawn instructions.

Required Skills: none

B01, B04 and B11 can start together. B02/B03/B10 start after B01. B05a starts after B01. B05b and B06 run together after B03, B07 joins their outputs, then B08/B09 integrate. Treat B02–B09 as a coordinated merge where intermediate fixture expectations depend on downstream batches. Keep legacy input shapes assignable until the new producer and consumer land together. Run the component specs against the combined tranche when those seams are in flight.

## Compatibility

- M `protocol-dispatcher.ts:3399–3416` and `../mcp-stdio/agent-tool.dispatcher.ts:343–356` retain the handler signature. M `effective-tool-list.ts:169`, `protocol-dispatcher.ts:225` and `../mcp-stdio/tool-builders.ts:139` retain tool builder signatures and names. `../ptah-api-builder.service.ts:890` and `../types.ts:81` retain namespace factory dependencies. The scoped search found no other production callers for the handler, builder, or namespace interface.
- `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:112–147,415–425,529–541,665–end` consumes the source builder, service, and pre-flight result directly. Optional context/port and unchanged null/skill-table signal preserve it. `chat/host-routing/register-host-routing.ts:42–64` retains DI tokens. `chat/host-routing/routing-reminder.format.ts:26–45` keeps the existing pre-flight fields and accepts new fallback literals. `handlers/capability-matrix-rpc.handlers.ts:76–106` retains view and rotation reader signatures. No frontend RPC DTO change.
- `apps/ptah-electron/src/di/phase-2-libraries.ts:401` and `libs/backend/cli-engine/src/lib/container.ts:899` keep the existing registration call. The platform Electron and CLI workspace providers use the expanded allowlist/default and generation getter automatically; `agent-sdk/src/lib/settings-export.service.ts:142` iterates the expanded key list.
- L `scope/scope-check.service.ts:99–105`, `task-kind/decision-model-task-kind-classifier.ts:36–57`, `child-session/child-setting-router.service.ts:109–126` and `decision-model/skill-ranking-caller.service.ts:39–107` keep current decision-caller behavior via optional route-only options. Pipeline-only symbols have no other-project production imports. Strict older result validators can reject additive fields or new literals; deploy the new schema with the producer and have external consumers tolerate additions.

## Test strategy

Implementation lanes run named Jest specs per batch with `--coverage=false --maxWorkers=2`, one heavy check at a time. Use fake clocks and deferred ports, no daemon or quota traffic. Reproduce the incident options with Kimi/Ollama display names, 18-run local evidence, all-fallback trace and an at-limit row. Validate legacy fields and compacted JSON through the handler with token-dense 100-phase fixtures. This planning lane ran no builds or tests. Ptah AST inspection confirmed the service and namespace structure. The session did not expose `ptah_grep` or `ptah_read_symbol`, so symbol and caller reads used scoped `rg` and line ranges.

## Risks

Async cancellation cannot interrupt synchronous CPU or a stalled event loop. Bound pair construction, diagnostic duplication and serialization work. A 2-second gather can miss sequential quota reads and produce unknown evidence; preserve the reason and avoid interpreting unknown as confirmed. Warmup consumes local resources; use bounded single-flight and cooldown. Strict legacy validators need coordinated rollout.

## Decisions

- Keep D1’s explicit user score unchanged within the existing matrix schema range (`matrix/matrix.schema.ts:25–35`). D5’s sample prose disagrees with D1’s arithmetic. Render computed parts, with unknown at −5. Remove the hidden design/visual-review score=100 override at `phase-plan.ts:175–181` to honor D1/D2; preserve the browser hard constraint.
- Interpret D2 as authoritative executor selection, including rotation. Existing `phase-resolve.ts:40–82` permits the model to pick a different lane. Keep candidate comparison and vetted model options, but treat a different executor as advisory and preserve the policy pick with an explicit reason. Model refinement may choose an offered model for the picked executor. This prevents a model from silently reversing D2.
- D4/D5 are subject to the cap. Handler 121–127 already errors when the baseline is too large. Full trace and every arbitrarily large legacy exclusion list cannot both fit. Preserve existing fields and overflow behavior, and report omissions when optional detail is compacted.
- D6's current local transport has separate residency and inference calls (`system-one.client.ts:150–177,253–278`). Positive residency plus keep-alive still permits eviction between calls. The plan defaults to deterministic routing and background warmup on that transport. Allow probe-then-dispatch only if the orchestrator explicitly relaxes the no-cold-load requirement, or enable an atomic warm-only transport when one is available.
- D10 has no in-tree VS Code manifest to edit. The file allowlist explicitly documents the same limitation for the neighboring decision-model setting (`file-settings-keys.ts:135–145`). Ship Electron/shared file settings here and mirror the array contribution in the owning VS Code repository when available.

## Orchestrator amendments (binding; override the sections above)

- **AM1 (D7 boundary, replaces plan decision 4 and B09 warmup).** Do not edit
  `decision-model/system-one.client.ts`, `system-one.residency.ts`, `decision-model.config.ts`,
  `decision-model.target.ts`, endpoint settings or keep-alive. No background warmup. Before each
  decision-model pass the router uses the EXISTING residency fact: dispatch only when residency is
  known loaded (or the target is remote) AND the remaining budget holds the full request timeout
  plus margin; otherwise skip with `fallbackCause: 'model-cold'` (residency not loaded/unknown) or
  `'deadline'` (budget). The router races the pass against the deadline at its own level;
  `decision-caller.ts` may get only an optional per-call `signal`/timeout cap. Remote targets are
  unchanged apart from the deadline.
- **AM2 (keeps preferredRank, replaces its removal in Component 1).** The configured preferred
  agent order stays a preference source. One preference list gives the boost, chosen by precedence:
  matched `routingRules[].set.prefer` > call `preferences.prefer` > configured order
  (`preferredRank > 0`). The trace and explanation name the source used and list the other sources
  as `overridden`. Precedence overall: pins > routingRules > call preferences > configured order >
  score.
- **AM3 (keeps the design/visual-review override, replaces plan decision 1 removal).** Keep the
  score=100 spread override at `phase-plan.ts:175-181`; render it as a named part
  `override: builtin design/visual-review subagent` in parts and explanation. A matching
  `routingRules` entry or pin still wins over it.
- **AM4 (replaces plan decision 2).** Keep today's behavior: the decision model may choose another
  offered executor inside the closeness band. The explanation names the deciding factor
  `model refinement` with both totals and the gap.
- **AM5 (execution grouping, user standing lane order 2026-11-24: "use codex, agy for most
  complex works, then kimi then glm").** One lane per group; inside a group the lane runs the
  batches in order and runs the named specs after each batch; the orchestrator runs scoped checks
  after each group.

  | Group | Batches | Complexity | Implementer | Phase reviewer (other family) | Starts after |
  |---|---|---|---|---|---|
  Updated order (user 2026-11-24, "agy has more usage and superior than kimi btw"): complex ->
  codex or antigravity; medium -> antigravity before kimi code; then kimi code; simple -> Ollama
  Code (glm).

  | Group | Batches | Complexity | Implementer | Phase reviewer (other family) | Starts after |
  |---|---|---|---|---|---|
  | G1 | B01 + B02 + B03 (result contract, score, spread, preference match) | complex | codex | antigravity | — |
  | G1s | B11 (input schema text) | simple | Ollama Code (glm) | codex | — (parallel with G1, file-disjoint) |
  | G1m | B04 (settings persistence) | medium | antigravity | codex | — (parallel with G1, file-disjoint) |
  | G2 | B05a + B05b (rules, policy condition, rule exclusion) | medium | antigravity | codex | G1 |
  | G3 | B06 + B07 + B08 (bounded gather, plan/options, trace and reasons) | complex | antigravity | codex | G2 |
  | G4 | B09 + B10 (service deadline, MCP adapter, compaction) | complex | codex | antigravity | G3 |
  | G4b | B13 (AM6 payload shrink + AM7 cost gate) | complex | codex | antigravity | G4 |
  | G5 | B12 (docs and skills) | simple | Ollama Code (glm) | kimi code | G4b |

  Fallback when the planned lane is unavailable: antigravity -> kimi code (medium) or codex
  (complex); codex -> antigravity; Ollama Code -> kimi code. A reviewer never shares the
  implementer's family.
  antigravity: its limit reader fails; after each antigravity run the orchestrator reads its
  output for a limit or quota error before acceptance; on a limit error use the fallback above.
  Final PR review (rule 5): family different from every writer (codex, antigravity,
  ollama-cloud) -> kimi code (confirmed room, wrote no code); if it cannot run, grok; then a
  Claude subagent with a weaker-evidence label.

- **AM6 (F1, sibling TASK_2026_2327_6814: payload size is the cause of the timeouts).** Shrink the
  decision-model request in router code only (`decision-model/decision-payload.ts`,
  `pipeline/model-call.ts`, `pipeline/model-refine.ts`; not the connection files of AM1):
  send shared state (task, depth, executor catalog) once per request and refer to executors by a
  short index; per option send only the fields the answer schema needs (id index, total, limit
  state, sample count); compact `pastOutcomes` to aggregate rates per executor and task kind; cap
  questions per call (`DECISION_QUESTIONS_PER_CALL`, default 2, replaces 32 for System One;
  questions beyond the cap resolve by ranking with `fallbackCause: 'question-cap'`). Spec: payload
  token estimate for the incident request (4 phases) drops by at least 50 percent against a
  recorded fixture of today's payload; answers still validate.
- **AM7 (F2, cost gate; refines AM1).** Before each pass the router estimates
  `costMs = promptTokens / prefillRate + DECISION_RETURN_MARGIN_MS` with `promptTokens` from the
  serialized payload (bytes / 4) and dispatches only when `costMs <= remainingBudget`; else
  `fallbackCause: 'deadline'` with the estimate in the reason. The request timeout is capped at the
  remaining budget (the saved `decisionModelTimeoutMs` is an upper bound, never extends the
  deadline). `prefillRate` per decision target key: setting
  `ptah.agentOrchestration.decisionModelPrefillTokensPerSecond` when set; else a measured value,
  EWMA (alpha 0.3) of `inputTokens / elapsedSeconds` from completed calls, in memory, keyed by
  selection + base URL; an aborted call lowers the estimate to at most `promptTokens / elapsed`.
  With no measurement and no setting, the first call per target dispatches with the remaining
  budget as timeout so a measurement exists. No machine-specific constant. One in-flight request
  per target: an overlapping caller skips with `fallbackCause: 'model-busy'` (avoids the measured
  'KV cache full' retries). Specs: estimate gate skip/dispatch, setting override, EWMA update,
  abort lowers rate, busy skip, timeout capped at budget.
- **AM5 addendum.** New batch B13 (AM6 + AM7) runs as group G4b after G4 (see the AM5 table).
  Setting key `decisionModelPrefillTokensPerSecond` added to the B04 allowlist (G1m).
  Note: the user set `decisionModelTimeoutMs` to 15000 (F3, ~/.ptah/settings.json); AM7 still
  caps each request at the remaining route budget.

- **AM8 (sibling review corrections, PR #1507; refines AM1, AM6, AM7; apply in the G4b/B13 and
  G4/B09 briefs).**
  1. Custom decision targets use probe `endpoint`, also on loopback: Ptah sends no `keep_alive`
     and gives no 60 s cold budget (`decision-model.target.ts:193-229`,
     `system-one.client.ts:110-121`). Ptah has no warm-model signal for them. AM1 residency gate
     applies ONLY to targets that Ptah probes for residency (local Ollama daemon). Custom and remote
     targets are never skipped as `model-cold`; for them only the AM7 cost gate and the deadline
     decide.
  2. Ptah already sends the shared state once (`decision-payload.ts:75-118`). AM6 is: compact the
     state and the lane criteria, cap questions per call (2), answer the rest deterministically
     (`question-cap`), and MEASURE input tokens (spec on payload size + a logged `inputTokens`
     metric per call). Drop any step that only re-implements send-once. The 4x growth for 4
     questions (590 -> 2361) is an inference, not confirmed by a server trace.
  3. AM7 cost estimate is a skip rule only. Reserve time for the deterministic fallback
     (`ROUTE_RETURN_RESERVE_MS` plus assembly); cap the model POST at the time that remains after
     that reserve.

## Open questions (answered by AM1-AM4; kept for the record)

1. Confirm whether D2 should permit a model-selected executor inside the score band. The batches assume it remains advisory.
2. Confirm whether to permit best-effort residency admission for D6. The strict plan disables local inference on the current transport.
3. Identify the downstream VS Code manifest owner. If guaranteed success for arbitrary legacy payloads is required, choose a paging or exclusion-compaction contract.
