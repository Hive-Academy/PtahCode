# RCA part B: lane candidate flow and limit state

Scope: read-only analysis of the reproduced gate calls in `context.md`. No source, build, or test command ran.

## B1. Silent candidate drops

### Finding

1. **Verified: gather and hard constraints do not silently drop these lanes.** `gatherRouteCall` maps every listed row to a lane (`libs/backend/lane-routing/src/lib/pipeline/gather.ts:78-86`). `constrainPhase` records every rejected candidate with a rule (`libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:228-250`). `unknown` is not an exclusion; only `at-limit`, `disabled`, `not-installed`, capability, and reviewer-family rules reject a lane (`libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:138-164`). Therefore antigravity with `unknown (reader failed)` and codex with `confirmed-room` remained eligible.
2. **Verified: spread, band, and rotation retain all eligible candidates internally.** The band and best-limit pool select a pick, but `spread` appends every other eligible candidate to `ranking` (`libs/backend/lane-routing/src/lib/ranking/spread.ts:87-115`). `orderScored` preserves that full ranking (`libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:438-448`). Rotation changes order, not membership (`libs/backend/lane-routing/src/lib/ranking/spread.ts:97-116`).
3. **Verified: model offering removes candidates before selection.** `laneQuestion` keeps only the closeness band (`libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:229-243`). `fitLane` and `sliceOptions` then cut options to at most four and can shrink further for payload size (`libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:257-297,337-347`; cap at `libs/backend/lane-routing/src/lib/routing-constants.ts:90-103`).
4. **Verified: final assembly omits eligible runner-ups.** It emits hard-constraint exclusions and, only when an offered list exists, labels ranked candidates absent from that list `pruned` (`libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:206-233`). An offered but unselected candidate gets no entry. With no model request, `offeredFrom` returns `undefined`, so even band/top-N removals get no entry (`libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:236-245`). The reproduction had `usage.requests = 0` (`.ptah/specs/TASK_2026_2326_5d16/context.md:44`), so this path explains antigravity, codex, grok, claude, subagent, and child-session absence. Their absence is not evidence of a hard exclusion.
5. **Verified: candidate generation adds only one subagent per phase.** It adds all lanes, an eligible child-session, and either the phase subagent or the named role (`libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:301-316`). It does not create a candidate for every registered role.

### Root cause

The result schema represents choices and exclusions, not the fate of every gathered candidate. Ranking and model-offer dispositions stay internal. Assembly conditionally derives `pruned` from model traffic instead of emitting a complete candidate audit.

### Fix proposal

Add a per-phase `candidateTrace` to `GateResult`: `{ candidate, score, disposition, rule? }`, with dispositions `chosen`, `eligible-not-selected`, `not-offered`, and `excluded`. Build it in `pipeline/assemble-gate.ts` from `constraint.excluded`, `plan.ranked`, the resolution, and offered options. Extend `contracts/route-decide-result.schema.ts` and compile matching reasons in `reasons/compile-reasons.ts`. Keep `roster` and `excluded` for compatibility. Add `route-decide.gate.spec.ts` cases proving every gathered candidate appears exactly once in ranking-only and model modes, including antigravity-unknown, codex-confirmed-room, an offered runner-up, a subagent, and child-session.

## B2. “Pruned” without a rule

### Finding

1. **Verified:** `pushExcluded` creates `rule: 'pruned'` for every ranked candidate absent from the model's offered options (`libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:223-232`).
2. **Verified:** the generic word does reach output. `compileResultReasons` emits `phase ... candidate ... excluded by pruned` (`libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:386-402`). The missing information is the causal rule.
3. **Verified:** one `pruned` label covers at least outside-closeness-band (`pipeline/phase-plan.ts:229-243`), top-N/payload shrinking (`pipeline/model-refine.ts:265-295,337-347`), and their combination. No offered-list provenance is retained for assembly.

### Root cause

`pruned` describes the observed outcome, not the decision. The pipeline discards whether the band, option cap, or byte-fit pass removed the option.

### Fix proposal

Keep `rule: 'pruned'` for compatibility and add `cause: 'below-closeness-band' | 'option-cap' | 'payload-fit'`, plus `offerWidth` when relevant. Return per-candidate offer dispositions from `laneQuestion` and `fitLane`; consume them in `assemble-gate.ts`. Extend `ExcludedSchema` in `route-decide-result.schema.ts`. Add `pipeline/model-refine.spec.ts` and `route-decide.gate.spec.ts` cases that distinguish a band removal from a fifth-option cut and a byte-driven shrink.

## B3. “models unknown”

### Finding

1. **Verified:** the phrase is the global missing-input label for `model-lists` (`libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:72-98`).
2. **Verified:** gather sets that flag when the listing port is absent, any lane listing throws/times out, or any lane returns an empty list (`libs/backend/lane-routing/src/lib/pipeline/gather.ts:163-196,204-244`). The per-row budget is 2000 ms (`libs/backend/lane-routing/src/lib/routing-constants.ts:137-141`). One failure makes the single global reason; the output names neither lane nor failure.
3. **Verified:** a failed row remains eligible with `models: []` (`pipeline/gather.ts:185-195`). Scoring falls back to `lane-default` when no configured model is available (`libs/backend/lane-routing/src/lib/ranking/score.ts:92-113,139-158`). It also loses reported alternate models (`pipeline/phase-plan.ts:247-279`). This reason concerns lane model listing, not the decision-model call, and does not itself prune a lane.

### Root cause

The port returns only model arrays. Gather reduces all per-lane failures to one Boolean, losing lane identity and failure kind.

### Fix proposal

Add `status: 'ok' | 'empty' | 'timeout' | 'error' | 'unregistered'` to `LaneModelFacts` in `pipeline/gather.ts`. Emit structured per-lane diagnostics and a reason such as `models unknown for codex (timeout)`; retain one summary line if desired. Add `pipeline/gather.spec.ts` coverage for one slow lane beside a successful lane and `route-decide.gate.spec.ts` proof that the failed lane remains eligible with `lane-default`.

## B4. Limit state and reset windows

### Finding

1. **Verified: source and freshness.** The router calls `agent.limits(rows)` without refresh (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.ts:104-113`). `LaneLimitLookupService` calls `PlanUsageService.getOwnerSnapshot` without `refresh` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:216-241`). The service uses a 30-second per-owner cache and joins in-flight reads (`libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:88-91,297-334`). Classification uses the current time after lookup (`lane-limit-lookup.service.ts:160-170,285-316`). Thus each route classifies current evidence, but a provider reading can be 30 seconds old.
2. **Verified: reader failure is `unknown`, not room or automatic exclusion.** Failed lookups classify as `unknown` (`lane-limit-lookup.service.ts:295-304`; `libs/shared/src/lib/utils/plan-limits/lane-state.ts:314-324`). `confirmed-room` requires a successful established full-table read with all applicable windows OK (`lane-state.ts:296-361`). Active independent exhaustion can still produce `at-limit` after a later failure (`lane-state.ts:332-349`). `ptah_agent_list` displays `reader failed` from snapshot status (`agent-limit.formatter.ts:285-304`); the router copies only `state.state`, discarding lookup status, reasons, windows, and timestamps (`route-namespace.builder.ts:109-112`). Both keep unknown lanes eligible, while spread ranks them below confirmed-room and above near-limit inside the band (`libs/backend/lane-routing/src/lib/routing-constants.ts:38-51`; `ranking/spread.ts:167-193`).
3. **Verified: past resets expire.** Evidence is active only when reset is absent or in the future (`libs/shared/src/lib/utils/plan-limits/window-state.ts:58-83`). A passed reset after the last observation makes usage unknown rather than confirming room (`window-state.ts:189-204,222-253`).
4. **Verified/inferred: Kimi change.** Kimi parses percent and `reset_time` directly from the provider; no calendar computes the next month (`libs/backend/auth-providers/src/lib/quota/readers/kimi-code-plan-usage.reader.ts:64-97`). A newer below-limit full-table provider reading clears earlier provider-reported exhaustion, even before the old reset (`libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.rules.ts:151-177`). The reproduced old reset, 2026-11-25 00:00 UTC, was still future at about 15:35 UTC on 2026-11-24 (`context.md:33-48`). Therefore reset passage cannot explain this change. The code-supported explanation is a newer provider response reporting 0–1% and 2026-12-25; why the provider changed its answer is not visible locally. A 30-second cache cannot explain a 45-minute change.

### Root cause

Routing intentionally consumes a coarse state while the list surface retains diagnostic evidence. That hides freshness and reader failure. The Kimi transition itself matches a new authoritative reading, not stale-cache or reset-expiration behavior.

### Fix proposal

Carry a safe `LimitEvidence` object (`state`, `lookup`, `status`, `readAt`, sanitized reasons) through `route-candidate-source.port.ts`, `route-namespace.builder.ts`, and `ranking/candidate.types.ts`; expose it in candidate trace and chosen reasons. Keep the 30-second cache, but show its age. Add adapter specs for reader-failed unknown, `plan-usage.service.spec.ts` cache-age coverage, `lane-state.spec.ts` passed-reset coverage, and a ledger spec proving a newer low Kimi table clears the old exhaustion.

## B5. Subagents and child-session

### Finding

1. **Verified:** child-session enters only when `canStart().ok` (`route-namespace.builder.ts:89-97`; `pipeline/phase-plan.ts:305-308`). Subagents and child-session use the subagent family and phase policy tier for scoring (`ranking/candidate.types.ts:119-135`; `pipeline/phase-plan.ts:342-364`). They have no lane limit state; assembly reports `unknown` (`pipeline/assemble-gate.ts:201-204`).
2. **Verified:** they inherit the best lane limit class in the band, so they do not outrank a confirmed-room lane (`libs/backend/lane-routing/src/lib/ranking/spread.ts:167-185`). Default ties prefer `lane`, then `subagent`, then `child-session` (`libs/backend/lane-routing/src/lib/routing-constants.ts:53-74`; `ranking/spread.ts:207-218,262-269`). `claude` in the reproduction is a CLI lane, not an in-process subagent.
3. **Verified:** candidate-ID `prefer` runs before executor kind and can override the default (`ranking/spread.ts:207-218,227-237`). `preferenceSource` is only a reported string (`contracts/route-decide-args.schema.ts:56-61`; `pipeline/assemble-gate.ts:127-138`). There is no structured “prefer CLI lanes” policy and no executor-kind explanation in the reason.

### Root cause

CLI preference exists only as a default tie-break inside the best score/limit pool. The natural-language preference source does not configure routing, and the output hides the executor-kind comparison.

### Fix proposal

Add optional `preferences.executorKindOrder` to `route-decide-args.schema.ts` and `SpreadPreferences`; apply it after explicit candidate IDs and before the default kind tie-break. Add an `executorKindChangedChoice` flag and reason clause. Add `ranking/spread.spec.ts` and gate tests for lane-over-subagent, subagent-over-child, explicit override, and confirmation that score band and at-limit rules still win.

## Decisions

- Treat missing candidates as an output-contract defect, not proof of exclusion.
- Keep `unknown` eligible and distinct from `confirmed-room`.
- Explain the Kimi transition as a newer provider reading, not a passed reset.
- Use a complete compact candidate trace rather than more runner-up exclusions.
- Tooling note: `ptah_grep` and `ptah_read_symbol` were unavailable. The symbol index returned zero while updating, so analysis used `ptah_ast_analyze`, targeted reads, and scoped `rg` free-text searches.

## Open questions

1. Should “prefer CLI lanes” affect only ties inside the best pool, or strictly override higher-scoring subagents? Recommendation: tie-break only.
2. May `unknown` limit state implement critical phases when a confirmed-room lane exists outside the closeness band? Current code permits it.
