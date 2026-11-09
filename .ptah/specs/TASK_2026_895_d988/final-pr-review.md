# Final PR Review — TASK_2026_895_d988 (whole task diff, 5 commits)

Branch: `refactor/lane-batching-model-routing` at `e0e56ec27` (5 commits on `main`).
Scope reviewed: `git diff main...HEAD`, read whole for the changed code files and
all markdown hunks. Read-only review; no repo file was edited.

## Verdict

**APPROVED**, score **9/10**.

Evidence for 9: every Phase 1 finding (4) and every Phase 1 test gap (5) has a
fix in `a0e2f14f1` or an earlier commit, and each fix has a spec that asserts
the real behavior path (unit level in `phase-plan.spec.ts` and
`tier-effort-policy.spec.ts`, full-service level in `route-decide.gate.spec.ts`).
An exhaustive consumer search found no construction or parse site for roster
entries outside `libs/backend/lane-routing`, so the newly required `tier`/`effort`
fields break nothing. The docs match the code field by field, and every paired
copy carries the same new text. Diagnostics scoped to the six changed code
files report 0 errors.

Evidence against 10: two Minor findings remain (weight recipe drift between the
tool text and the skills; a spec helper that couples `shape` to `weight`). Two
uncertainties stay open because repo tests cannot close them: whether the
Claude host accepts `haiku` as a Task `model` alias, and a fresh scoped
`ptah-electron` typecheck (see Remaining uncertainty).

## Five logic questions

1. **Does legacy input parse and route as before?** Yes. `shape` and `weight`
   are optional on the `.strict()` phase schema, so old calls parse
   (`contracts.spec.ts` "accepts legacy phases without batch hints"). With no
   hints, `policyForPhase` returns opus for plan/architecture/review/
   document-review and sonnet for everything else — the same tiers as the
   removed `tierFor`. One intended change: `visual-review` moves from sonnet
   to opus (R2), approved in Phase 1 and required by the plan table.
2. **Boundaries.** `weight: 0` stays distinct from omitted because every check
   uses `!== undefined`; 0 gives haiku under R4. Specs pin 0, 3999, 4000,
   11999, 12000, 7999, 8000, 200000 and reject -1, 1.5, 200001
   (`tier-effort-policy.spec.ts:22-26`, `contracts.spec.ts`). No rule emits
   `max`, and a spec asserts it (`tier-effort-policy.spec.ts:44`).
3. **Failure injection.** The fix removed the `args.phases.find` lookup and its
   throw; each draft now reads `shape`/`weight` carried on its own plan, so a
   missing phase input can no longer produce a wrong-phase hint. The
   `roster.length !== args.phases.length` invariant stays
   (`assemble-gate.ts:276`), so a lost draft still fails loudly. A
   decision-model timeout keeps policy fields and the fallback text
   (`route-decide.gate.spec.ts` "keeps policy fields and fallback text when the
   decision model times out"); an unavailable row keeps them too
   (same file, null-model row test).
4. **Tier and effort source.** Both come from `plan.policy`, set at both
   `PhasePlan` construction sites from `policyForPhase` — the blocked path
   (`phase-plan.ts:152-154`) and the ranked path (`phase-plan.ts:190-192`). No
   roster row is built without them: `chosenEntry` and `unavailableEntry` read
   `plan.policy` (`assemble-gate.ts:317-318`, `:346-347`), and the schemas
   require both fields, with a spec proving `undefined` fails parse.
5. **Requirements gaps.** None against the plan contract. The plan table
   (`implementation-plan.md:35-43`) matches `policyForPhase` rule for rule,
   including the middle buckets for omitted weight and the R5 fall-through for
   a `review` shape on a non-review kind. The two Minor findings below are
   polish, not contract violations.

## Findings

1. **Minor** — weight recipe drift between the tool text and the skills.
   - `route-tools.ts:120` says `weight` is "estimated source tokens in its
     batch read and write sets". The paired skill copies
     (`.claude`/`plugins` `orchestration/references/lane-assignment.md:24-26`,
     `team-leader.md` and template batch fields) instruct adding "plus 10%
     framing" to the same estimate.
   - Scenario: a batch measured at 7,300 tokens. A caller that follows only
     the tool text sends `weight: 7300` and gets R5 sonnet. A caller that
     follows the skills sends `weight: 8030` and gets R5 opus. The same batch
     routes to a different tier. The schema accepts both, so no error occurs.
   - Fix: align on one recipe. Add the framing margin to the tool text, or
     drop the 10% instruction from the skills.

2. **Minor** — spec helper couples `shape` to `weight`.
   - `phase-plan.spec.ts:68-93`: `subagentPlan(weight?, pinModel?)` sets
     `shape: 'mechanical'` only when a weight is set, so the helper cannot
     express a shape without a weight or a weight without a shape.
   - Scenario: no `planRoutePhases`-level test covers a mechanical shape with
     an omitted weight (R4 sonnet/medium) or a weight-only phase (R5 with
     weight). `tier-effort-policy.spec.ts` covers the rule at unit level, so
     the gap is pipeline coverage only.
   - Fix: give `shape` and `weight` separate optional parameters.

## Fix-commit re-review (a0e2f14f1)

- **`PhasePlan` carries `shape`/`weight`.** Both construction sites set them
  (`phase-plan.ts:152-153` blocked path, `:190-191` ranked path), copied from
  the phase that builds the plan, so the blocked path also reports hints.
- **`rosterFrom` no longer looks phases up by id.** The lookup and its throw
  are gone (`assemble-gate.ts:242-280`); both the chosen and unavailable rows
  now call `withPolicyReason(reason, draft.plan)`. The roster-covers-every-
  phase invariant stays at `assemble-gate.ts:276`. This removes the O(n²)
  scan and the duplicate-id hazard Phase 1 flagged.
- **`withPolicyReason` keeps the required suffix.**
  `assemble-gate.ts:287` emits
  `` `${reason}; policy ${ruleId}; tier ${tier}, effort ${effort}, shape ${plan.shape ?? 'unset'}, weight ${plan.weight ?? 'unset'}` ``
  — exactly `; policy <ruleId>; tier <tier>, effort <effort>, shape
  <shape|unset>, weight <weight|unset>`. `weight: 0` prints `0`, not `unset`.
  The suffix is appended after the compiled eligibility/fallback reason, per
  the plan. Gate specs pin the suffix with `$`-anchored regexes for R5-unset,
  R4, R3 and R2 rows, chosen and unavailable.
- **New `phase-plan.spec.ts` haiku cases assert real behavior.** All three
  (`phase-plan.spec.ts:95`, `:101`, `:107`) call the real `planRoutePhases`
  with a stub matrix; the stub fixes only the score, so the assertions pin
  the real propagation: R4 haiku/low with `model: 'haiku'`,
  `provenance: 'tier'` for an unpinned subagent; a haiku pin accepted as a
  tier pin (`applyPinModel` `tierPin` branch, `phase-plan.ts:334`); and a
  legacy R5 sonnet phase that keeps `model: 'sonnet'` when a pin names the
  unlisted `haiku`. The gate spec adds the end-to-end pin case through
  `service.decide` (source `'pin'`, model `haiku`, tier `haiku`).
- Phase 1 test gaps all closed: haiku subagent alias; legacy golden row
  (`route-decide.gate.spec.ts` R5 default row); boundary weights;
  `review` shape on a non-review kind (`tier-effort-policy.spec.ts:31`);
  unavailable row with shape and weight set (gate spec null-model row).

## Consumers checked

Method note: `ptah_code_search_symbols` returned an empty index
(`symbolCount: 0`) and all four `ptah_lsp_references` calls timed out, so the
consumer search is a whole-worktree Grep over the export names (import lines
match even under aliasing), plus targeted reads of every construction site.

- `withPolicyReason` — callers: `assemble-gate.ts` `rosterFrom` (2 sites, in
  diff) and `compile-reasons.spec.ts:451`, `:608` (in diff, updated to the new
  signature). Nothing outside lane-routing.
- `PhasePlan` — consumers all inside lane-routing: `route-decide.service.ts`
  (`:66` import, `:268` map, `:336` parameter), `phase-resolve.ts:17`, `:27`,
  `assemble-gate.ts` drafts. Constructed only at `phase-plan.ts:147-158` and
  `phase-plan.ts:186-193`, both in diff. No outside consumer.
- `policyForPhase` — callers: `phase-plan.ts:133` and
  `tier-effort-policy.spec.ts`, both in diff.
- `ChosenEntrySchema` / `UnavailableEntrySchema` — used only inside
  lane-routing: the `RouteDecideResultSchema` union
  (`route-decide-result.schema.ts:246-247`), `contracts.spec.ts`,
  `compile-reasons.spec.ts`, `hard-constraints.spec.ts`. No consumer outside
  lane-routing constructs or parses roster entries. Nothing breaks from the
  newly required `tier`/`effort`.
- `RouteDecideResult` (typed, outside lane-routing) — vscode-lm-tools:
  `route-namespace.builder.ts:47` is a return type only;
  `route-namespace.builder.spec.ts:28` builds a pre-flight-shaped result with
  no `entries` (read the file); `route-tool-handlers.ts:118` assigns from
  cache or call; `route-tool-handlers.spec.ts` fixtures were updated in the
  diff with `tier`/`effort` (`:257-258`) and recalibrated char budgets
  (54,375 → 57,775; 58,775 → 61,675 — both still under the 64,000 cap).
  rpc-handlers: `host-routing.multi-turn.spec.ts:157` and
  `host-routing.coordinator.spec.ts:242` return pre-flight results parsed by
  `PreflightResultSchema` with no entries (read both). No roster literals
  exist in rpc-handlers (grep for `entries` in host-routing specs: none).
- `PhaseSchema` (`shape`, `weight`) — embedded in `RouteDecideArgsSchema`;
  parse sites `route-decide.service.ts:137`, `route-tool-handlers.ts:114`,
  `route-tools.ts:125`, all pass-through or in diff. Optional fields keep
  every legacy producer valid.
- `ModelTier` / `ModelEffort` / `MODEL_TIERS` / `MODEL_EFFORTS` — same-name
  symbols in agent-sdk (`sdk-model-service.ts:53`), auth-providers
  (`ProviderModelTier`), frontend core (`providers-commit.service.ts:23`) and
  the electron `provider:getModelTiers` RPC are a separate pre-existing
  provider-tier system; none imports the lane-routing types. No import
  collision, no consumer break.
- `GatePhase` — a local alias (`phase-plan.ts:58`), not exported.
- apps — no route-decide roster consumer exists in `apps/ptah-electron` or the
  e2e specs (grep over `apps` found only provider-tier strings). Phase 1 had
  already verified the Electron wiring is registration-only.

## Docs/code consistency (81d8ed9b1, e0e56ec27, plus earlier doc hunks)

- **Roster fields.** `lane-assignment.md` (both copies) lists `executor`,
  `model` (null when unavailable), `tier` (`haiku|sonnet|opus`), `effort`
  (`low|medium|high|xhigh|max`) and a `reason` ending
  `policy Rn; tier ..., effort ..., shape ..., weight ...`. This matches
  `ChosenEntrySchema` and `UnavailableEntrySchema` exactly:
  `MODEL_TIERS`/`MODEL_EFFORTS` at `route-decide-result.schema.ts:104`,
  `:108`, `model: null` on unavailable at `:157`, and the suffix at
  `assemble-gate.ts:287`.
- **Shape enum.** `mechanical|logic|contract|test|docs|review` in every doc
  location equals `PHASE_SHAPES` (`route-decide-args.schema.ts:19-26`), and
  the tool description lists the same six values in the same order.
- **Weight bounds.** "integer 0-200000" equals
  `z.number().int().min(0).max(200000)`; `contracts.spec.ts` pins accept at 0
  and 200000 and reject at -1, 1.5, 200001.
- **Tier semantics.** "For subagents, `tier` is the model alias to pass; for
  CLI lanes, both are advisory" (`route-tools.ts:120-122`, spec-asserted in
  `route-tools.spec.ts`) is repeated consistently in orchestration/SKILL.md,
  lane-assignment.md, team-leader-modes.md, team-leader.md/template and
  agent-lanes/SKILL.md. The `modelTier` row ("mapped only for ptah-cli
  providers and `cli: "claude"`") matches the `ptah_agent_spawn` contract.
  The per-CLI tier map is explicitly deferred to TASK_2026_896_9339, matching
  decision 7 in `decisions.md`.
- **Paired copies.** orchestration/SKILL.md, lane-assignment.md and
  team-leader-modes.md are byte-identical between `.claude` and `plugins`
  (same blob hashes on both sides of the diff). The two agent-lanes SKILL.md
  copies kept their pre-existing main differences; I compared every new hunk
  line by line and they are identical in both copies. The team-leader
  template (`libs/backend/agent-generation/templates/agents/`) and
  `.claude/agents/team-leader.md` new hunks are identical word for word;
  `team-leader-template.policy.spec.ts` reads the template and passed in the
  agent-generation run (1461 passed; the 2 failures are the pre-existing
  Windows symlink EPERM cases in `user-layer-reap.spec.ts`, untouched here).
- Batch sizing text ("target 4,000–12,000; hard ceiling 16,000") aligns with
  the R4 sonnet band edges (4,000 to <12,000) and allows the below-4,000
  haiku batches.

## Verification evidence and remaining uncertainty

- Scoped `ptah_get_diagnostics` (TypeScript compiler) on the six changed code
  files: 0 errors, 0 warnings, coverage clean.
- Known results, not re-run here: lane-routing and vscode-lm-tools verify
  green; agent-generation 1461 passed with the 2 pre-existing EPERM failures
  outside this diff. No build/serve/e2e target was run, per the task rules.
- Remaining uncertainty: a fresh scoped `ptah-electron` typecheck is not in my
  own evidence. Phase 1 verified its wiring is registration-only, no roster
  construction exists anywhere in `apps`, and the pre-push `validate-deps` gate
  ran on push, so the risk is low but the run itself was not repeated for this
  re-review. Also, repo tests cannot prove the Claude host accepts `haiku` as
  a Task `model` alias; the docs instruct it and the roster emits it, so this
  stays a host-level assumption.

## Decisions

- Verdict APPROVED rather than REVISE: both findings are Minor, neither blocks
  merge, and each has a one-line fix that can land in a follow-up.
- Options for the weight recipe: change the tool text, or change the skills.
  Evidence: the plan (`implementation-plan.md:31`) says only "estimated source
  tokens", and the skills add the 10% instruction. Recommendation: add the
  framing margin to the tool text, because the skills also drive the
  calibration loop and both texts should tell the same story. Reversible.
