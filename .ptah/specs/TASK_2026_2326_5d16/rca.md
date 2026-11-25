# RCA — lane router `ptah_route_decide` (synthesis)

Sources: `rca-a.md` (codex), `rca-b.md` (kimi code), orchestrator reads. Paths are relative to
`libs/backend/lane-routing/src/lib/` unless they start with `MCP/`
(`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/`) or a workspace-root path.
Classification: **BUGFIX** (D1 confirmed) — the defects below violate the documented contract
(explainable output, preferences, budget), they are not only design choices.

## Root causes

| # | Symptom | Root cause | Evidence |
|---|---------|-----------|----------|
| R1 | Timeouts at gate-0.1 and pre-flight | No end-to-end deadline. Handler awaits the namespace with no timer. Limit reads 3 s per row, 12 s for codex/antigravity/kimi/grok; local Ollama cold load up to 60 s when no timeout is saved; `OVERALL_CALL_BUDGET_MS` (8.5 s) is documentation only. | `MCP/route-tool-handlers.ts:108`, `routing-constants.ts:146-156`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:161,295`, `decision-model/system-one.residency.ts:26`, `pipeline/gather.ts:77-204` |
| R2 | Eligible candidates in neither roster nor `excluded` (antigravity, codex, grok, claude, subagents, child-session) | Result has no per-candidate disposition. Runner-ups are reported only as `pruned` and only when a model request was sent; with `usage.requests = 0` they vanish. | `pipeline/assemble-gate.ts:206-245`, `ranking/spread.ts:87-115` |
| R3 | "preference did not change the choice" on every row | (a) Exact, case-sensitive candidate-ID match: display names `kimi code`, `Ollama Code` never match (`ptahCliId` is the ID). (b) Preference is only a tie-break inside the 5-point band after the limit-class pool; kimi 75 vs untried 50 is outside the band. | `ranking/spread.ts:207,227,278`, `ranking/candidate.types.ts:65,98,120`, `routing-constants.ts:36,59` |
| R4 | One lane wins every phase (kimi 75) | Learning is pure exploitation: local rate blended toward prior with k=10, no bound, no exploration. Untried lanes stay at 50 forever. Benchmark seed has one row (`z-ai/glm-5`) that matches no installed lane, so no lane has evidence-based prior. | `matrix/local-derivation.ts` (blend), `routing-constants.ts:174`, `matrix/seed-matrix.ts:61-69` |
| R5 | "pruned" with no reason | One label covers band cut, option cap (4) and payload fit. | `pipeline/assemble-gate.ts:223-232`, `pipeline/phase-plan.ts:229-243`, `pipeline/model-refine.ts:257-347` |
| R6 | "models unknown" | Global flag set when ANY lane listing fails/times out (2 s)/returns empty; lane and cause are lost. Affected lane stays eligible with `lane-default`. | `reasons/compile-reasons.ts:72-98`, `pipeline/gather.ts:163-244` |
| R7 | opus + xhigh for every implement phase | Fixed first-match table: R3 (shape logic/contract) gives opus/xhigh at weight >= 8,000; no user override; the reason names the rule but not the condition. | `pipeline/tier-effort-policy.ts:11` |
| R8 | kimi "confirmed-room" 45 min after AT LIMIT | Not a router defect. Kimi reader parses provider percent and `reset_time`; a newer below-limit full-table reading clears old exhaustion. Old reset was still in the future, so the provider changed its answer. Router copies only `state.state` and drops `readAt`, lookup status and windows, so the user cannot see freshness. Cache 30 s. | `libs/backend/auth-providers/src/lib/quota/readers/kimi-code-plan-usage.reader.ts:64-97`, `.../plan-limit-ledger.rules.ts:151-177`, `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.ts:104-113` |
| R9 | Tool schema "Required when stage is ." | Required-owner note rendered for an empty owner list. | `MCP/route-tools.ts:34,54,69` |
| R10 | `preferenceSource` refuses `;` with no hint | Rule enforced late in reason compilation, not in the Zod args schema that generates the description; can fail after routing. | `reasons/compile-reasons.ts:188-202,284`, `contracts/route-decide-args.schema.ts:56` |
| R11 | Users cannot set rules (for example opus for UI/UX) | Only per-call `pins`. Hidden user score file `~/.ptah/routing/capability-matrix.json` overrides scores but is undocumented and cannot set tier/effort. | `matrix/capability-matrix.store.ts:70,204-224` |

## Phase 1 design decisions (orchestrator, D6)

1. **Additive, documented score** per candidate, every part reported:
   `total = prior + learned + preference + limit`.
   - `prior`: user matrix cell when present (replaces prior AND learned — explicit user value,
     not clamped); else seed cell; else `NEUTRAL_SCORE` 50.
   - `learned`: `clamp(localScore - prior, -LEARNED_DELTA_CAP, +LEARNED_DELTA_CAP)`, cap 15;
     plus `EXPLORATION_BONUS` 5 when the cell has fewer than `EXPLORATION_MIN_SAMPLES` 3 runs.
   - `preference`: rank 1 +12, rank 2 +8, rank 3 +4, rank >= 4 +2 (`PREFERENCE_BOOST`).
   - `limit` (`LIMIT_ADJUST`): confirmed-room 0, unknown -5, near-limit -10 (keeps today's
     `INSIDE_BAND_LIMIT_ORDER`, routing-constants.ts:43); at-limit stays a hard exclusion.
2. **Selection**: highest total; inside `CLOSENESS_BAND` (5) rotation may apply as today; total
   tie-break order: preference rank, limit class, executor kind, candidate ID. The limit-class pool
   step is replaced by the `limit` score part (one mechanism, visible in numbers).
3. **Preference matching**: match exact ID first, then case-insensitive display name, family
   token, and `cli`. Unknown or ambiguous entries are reported per entry
   (`preference "x": no candidate` / `matches A, B`).
4. **Every candidate accounted for**: new per-phase `candidates[]` with
   `{ candidate, displayName, total, parts, disposition, rule?, cause? }`,
   disposition `chosen | ranked | excluded`; `excluded` rules unchanged plus `pruned` causes
   `below-band | option-cap | payload-fit`. `excluded` and `roster` stay for compatibility.
5. **Explanation per phase**: one sentence on the roster row, for example
   `kimi code 73 (prior 50, learned +15, pref +8) beat codex 59 (prior 50, explore +5, pref +4) by 14; antigravity 57 (limit unknown -10)`.
6. **Hard deadline**: `ROUTE_DEADLINE_MS` gate 8000, pre-flight 4000, passed from the MCP handler
   into the service; gather inputs raced against the remaining budget (missing facts become
   explicit reasons); decision-model pass skipped when the remaining budget is below one request
   budget (`fallbackCause: deadline`); cold local load never on the request path
   (`fallbackCause: model-cold`, warm in background). Deterministic ranking always returns.
7. **Limit evidence**: candidate carries `limitEvidence { state, status, readAt }`; explanation
   shows state and age.
8. **models unknown per lane**: `models unknown for <lane> (timeout|error|empty|unregistered)`.
9. **Schema text**: no required note for an empty owner list; `preferenceSource` rule (trimmed,
   no `;`, CR, LF) in the Zod schema and its description, validated before routing.
10. **`ptah.agentOrchestration.routingRules`**: ordered list `{ id, match: { kind?, shape?,
    taskType?, role? }, set: { minTier?, maxTier?, effort?, prefer?, exclude? } }`, first match
    wins; precedence `pins > routingRules > call preferences > score`; invalid rules reported, not
    ignored; `exclude` gives rule `user-rule:<id>`; reason names the matched rule. Document the
    user score file next to it.
11. **Tier/effort reason** names the matched condition (for example `R3 shape=logic weight>=8000`).

Out of Phase 1 (Phase 2, D5): benchmark snapshot, alias map, weekly refresh.
