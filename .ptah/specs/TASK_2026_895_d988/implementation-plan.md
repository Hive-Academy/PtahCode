# Implementation plan - TASK_2026_895_d988

## Summary

Make batch entries self-contained and bounded by measured context weight. Add optional phase shape/weight to the router and a pure kind+shape+weight tier/effort policy. Use the returned tier for per-call Claude Agent model overrides while keeping lane model resolution and agent frontmatter defaults.

## Verified contracts

- `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:19-26,36-59`: strict phase `{id,kind,role?,reviews?}`; Gate 0.1 takes request, taskType, depth, 1-100 phases, optional pins and preferences. Lines 60-103 validate duplicate IDs and references.
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:37-57,116-185,275-355`: `GateArgs` derives from Zod. Each phase is ranked; `scoreCandidate` uses `tierFor(kind)` for subagent configured model. The fixed function chooses opus for plan/architecture/review/document-review, sonnet otherwise. `applyPinModel` at 310-343 accepts only listed, lane-default or selected subagent tier.
- `libs/backend/lane-routing/src/lib/ranking/score.ts:43-49,69-84`: `FallbackModel={id,provenance:'configured'|'tier'}`; `CandidateScore` has model/provenance/score. Preserve existing listed/configured lane model choice.
- `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:72-119,126-153`: strict chosen and unavailable roster schemas; chosen has model, executor, score, provenance, confidence, reason; unavailable has null model/score and reason. Both need tier/effort.
- `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:51-105,242-337`: `rosterFrom`, `chosenEntry` and `unavailableEntry` construct rows from phase plans and compiled reasons. Attach tier/effort and an explanatory reason suffix here.
- `libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts:7-14,56-75`: System One sees only offered executor/model pairs and scores; retain its pinned payload so it never invents IDs.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.ts:110-123`: MCP input schema is generated from `RouteDecideArgsSchema`; prose description enumerates inputs. `route-tool-handlers.ts:114` validates with the same schema.
- `libs/backend/agent-generation/templates/agents/team-leader.template.md:145-242,437-464` and `.claude/agents/team-leader.md:164-261,456-480`: existing cap is six files/two projects and executor currently reads the plan. Decomposition may read the plan; executor must receive its batch entry only.
- `research-online.md:9-12`: supported Agent calls accept family aliases and override frontmatter; precedence is call -> frontmatter -> CLAUDE_CODE_SUBAGENT_MODEL -> parent. Per-call effort depends on version/model and an environment setting may override it.

## Design

### A. Batch splitting

At decomposition, run `ptah_count_tokens` for every existing read/write file. Count a read-only line range proportionally to file lines, round up, count overlaps once, and add 10% for inline contracts and prompt framing. Estimate new files explicitly and update after creation. Target **4,000-12,000 source tokens** and cap at **16,000** including margin; retain <=6 write files and <=2 Nx projects as secondary limits. Fixed lane overhead makes tiny batches inefficient, and the reported 1,300-line component plus 1,500-line spec is far beyond a safe single lane. A coherent batch below the floor is allowed. If one file alone exceeds the ceiling, first schedule a behavior-preserving split batch with scoped regression verification, then the dependent rewiring batch; record the unavoidable split exception.

Each `batches.md` entry must contain id/state, shape (`mechanical|logic|contract|test|docs|review`), estimated weight and actual lane tokens (initially pending), write set, bounded read set with paths and line ranges, inline contract excerpts, dependencies, parallel safety, routed executor/tier/effort/reason, exact verification command and acceptance criteria. Record unavailable actual usage as unavailable, never guessed. Calibrate later estimates from actual usage by shape. Shared contracts/ports land first; align later batches with Nx project boundaries and shared cache. Only independent, disjoint-write batches run in parallel. Every implementer must keep edited files UTF-8 without BOM and preserve legitimate non-ASCII text; never introduce mojibake. Prefer ASCII >=, -> and - in new prose. Before accepting each docs batch, search its touched files for the mojibake prefixes U+00E2 U+20AC, U+00E2 U+2030 and U+00E2 U+2020 and correct any matches; this plan is also written as clean UTF-8 without BOM.

The orchestrator constructs each executor prompt solely from that one batch entry plus the generic lane policy and delivered role. Do not paste the plan, context or adjacent batches. The team leader reads the plan during decomposition and checks executor reports later. When a batch changes state, its entry remains the single prompt source.

### B. Batch-aware routing

Add optional `shape:z.enum(['mechanical','logic','contract','test','docs','review'])` and `weight:z.number().int().min(0).max(200000)` to `PhaseSchema` in `route-decide-args.schema.ts`. Weight means estimated source tokens. Omitted fields preserve existing calls. Reject negative, fractional and excessive weights. Do not change pre-flight, pins or phase kinds.

Create a pure `policyForPhase(kind,shape?,weight?):{tier,effort,ruleId}`. Apply rules in order:

| Rule | Kind / shape / weight | Tier | Effort |
|---|---|---|---|
| R1 | plan or architecture, any shape | opus | high; xhigh at >=8k |
| R2 | review, document-review or visual-review, any shape | opus | high; xhigh at >=8k |
| R3 | contract or logic shape, remaining kinds | sonnet below 8k; opus at >=8k | high; xhigh at >=8k |
| R4 | mechanical, test or docs shape, remaining kinds | haiku below 4k; sonnet at 4k-<12k; opus at >=12k | low / medium / high |
| R5 | remaining kinds/shapes | sonnet below 8k; opus at >=8k | medium / high |

Unknown weight takes the middle bucket: R3 sonnet/high, R4 sonnet/medium, R5 sonnet/medium. R1/R2 protect reasoning-heavy phases from a misleading shape label. The output enum includes `max` for compatibility with supported effort levels; no initial rule assigns it. Weight is one signal, not a prediction of difficulty.

Carry policy in `PhasePlan`, use tier in subagent scoring, and add required `tier:'haiku'|'sonnet'|'opus'` and `effort:'low'|'medium'|'high'|'xhigh'|'max'` to **chosen and unavailable** result rows. Keep `model` as selected lane ID/alias or null. Append `policy Rn; tier ..., effort ..., shape ..., weight ...` to each per-row reason without replacing compiled eligibility/fallback reasons. Pins retain existing semantics. Tier for lanes is advisory and does not select a vendor ID. Do not expose free-form tier/model selection to System One. A PhasePlan is created for every input phase, including unavailable ones, so its policy supplies tier/effort even without a ranked candidate. Legacy calls without shape/weight remain sonnet for non-plan/review kinds, matching old tierFor; haiku requires explicit mechanical/test/docs shape and weight below 4k. A review shape on a non-review kind intentionally follows R5. The policy spec must assert that no initial rule emits max. Update Zod-derived result types, typed fixtures, MCP description and specs. `ptah_lsp_references` was attempted for RouteDecideArgsSchema but the index stalled; retry during implementation, then use one targeted text fallback if needed. In this revision, references to ChosenEntrySchema, UnavailableEntrySchema and RouteDecideResult were checked; the truncated text-scan was followed by one targeted repository search, which found the B1/B3/B4 fixtures and only pre-flight results in the other typed consumers.

### C. Subagent override

For each Claude Agent call, pass chosen roster `tier` as call `model` alias, and `effort` only when host/model support it. Keep `.claude/agents/*.md` frontmatter `model:` as per-role defaults. Document call -> frontmatter -> CLAUDE_CODE_SUBAGENT_MODEL -> parent for supported versions, plus force-environment/version caveats in `research-online.md:9-12`. Record requested versus observed model when observable. CLI lanes keep their current raw/listed/configured resolution; per-CLI tier mapping belongs to TASK_2026_896_9339.

## Doc changes

- `libs/backend/agent-generation/templates/agents/team-leader.template.md` **and** `.claude/agents/team-leader.md`: weight-first split, complete entry schema and calibration, contracts-first/heavy-file rules, executor prompt from entry alone; retain frontmatter default.
- `plugins/ptah-core/skills/orchestration/SKILL.md` **and** `.claude/skills/orchestration/SKILL.md`: entry-only prompt and per-call Agent tier/effort.
- `plugins/ptah-core/skills/orchestration/references/lane-assignment.md` **and** `.claude/skills/orchestration/references/lane-assignment.md`: phase shape/weight, roster tier/effort, lane versus subagent model handling.
- `plugins/ptah-core/skills/orchestration/references/team-leader-modes.md` **and** `.claude/skills/orchestration/references/team-leader-modes.md`: entry-only spawn and Mode 2 actual-token calibration.
- `plugins/ptah-core/skills/agent-lanes/SKILL.md` **and** `.claude/skills/agent-lanes/SKILL.md`: bounded read/write sets and excerpts, no exploration, actual usage, existing lane model semantics.
- The plugin skill trees contain matching source paths for the checked-in `.claude/skills` copies. Agent-generation has the team-leader template corresponding to the checked-in agent. Update both sides and compare policy sections; preserve unrelated local differences. No other agent frontmatter rewrite is required.

## Batches

Measured whole-file counts from `ptah_count_tokens`: args 779, result 1797, contracts spec 3877, phase-plan 2752, assemble-gate 2735, gate spec 8610, MCP route-tools 1112/spec 545/handler spec 3229, orchestration skill 4044 per copy, lane assignment 2716 per copy, team-leader modes 1751 per copy, agent-lanes source 6233/copy 6484, team-leader template 5949/copy 7700. Weights below add bounded read ranges/new-file allowance and 10% framing. B6, B8 and B9 exceed the 12k target because paired source/copy edits must stay coherent; all remain below the 16k ceiling. If measured prompt framing crosses 16k, split source and copy into dependent batches before dispatch. **Actual lane tokens: pending for every batch**; copy the field into `batches.md` and fill from runtime usage. Each excerpt below must appear inline in its entry.

**B1 Contracts - shape contract; estimated 13.4k.** Write `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts`, `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts`, `libs/backend/lane-routing/src/lib/contracts/contracts.spec.ts`, `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts`. Read those files at 19-59, 104-153, 1-120, and 20-45,210-235,410-440 respectively; `pipeline/phase-plan.ts:55-57`. Excerpt: `Phase={id,kind,role?,reviews?,shape?,weight?}`; chosen `model:string`, unavailable `model:null`; both require tier/effort; update the unavailable parse and chosen roster fixtures in hard-constraints.spec.ts. Depends none; parallel-safe no. Verify `npm run verify -- -p @ptah-extension/lane-routing`. Accept strict new bounds/enums, legacy input parse and updated hard-constraints fixtures. This scoped command may fail until B4 completes assembly and remaining fixture edits; only B4 is the first expected green lane-routing verification gate. Preserve the failing output as a known intermediate state.

**B2 Policy and phase plan - shape logic; estimated 6.3k.** Write `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts`, new `pipeline/tier-effort-policy.ts`, new `pipeline/tier-effort-policy.spec.ts`. Read `phase-plan.ts:37-57,77-185,275-355`; `ranking/score.ts:43-49,69-84`; `decision-model/decision-payload.ts:7-14,56-75`. Excerpt: `scoreCandidate` configures subagent model from policy tier; policy returns `{tier,effort,ruleId}`. Depends B1; parallel-safe no. Verify `npm run verify -- -p @ptah-extension/lane-routing`. Accept rule boundary tests, old defaults, unchanged lane model choice, no haiku without explicit eligible shape and weight, and downstream haiku handling in decision payload/applyPinModel.

**B3 Assembly - shape logic; estimated 13.2k.** Write `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts` and `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts`. Keep reason suffix assembly local; do not edit compile-reasons.ts unless a new batch is created. Read `assemble-gate.ts:51-105,242-337`; `compile-reasons.ts:1-105`; `compile-reasons.spec.ts:440-480,585-615`; `phase-plan.ts:77-115`; `route-decide-result.schema.ts:104-153`. Excerpt: both roster statuses receive policy tier/effort; unavailable model remains null; reason retains eligibility explanation. Depends B2; parallel-safe no. Verify `npm run verify -- -p @ptah-extension/lane-routing`. Accept schema-valid chosen/unavailable rows, updated direct ChosenEntrySchema/UnavailableEntrySchema parse fixtures and auditable reasons. This intermediate verify may remain red until B4 updates gate fixtures.

**B4 Gate regression - shape test; estimated 10.2k.** Write `libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts` and only a smaller same-project fixture if scoped diagnostics name it. Read that spec at 1-110,200-320; `route-decide-result.schema.ts:104-153`; `tier-effort-policy.ts:1-100`. Excerpt: old phase inputs omit shape/weight; all outputs require tier/effort. Depends B3; parallel-safe no. Verify `npm run verify -- -p @ptah-extension/lane-routing`. Accept explicit weighted, pin (including subagent model), fallback and unavailable cases without changed executor eligibility. This is the first lane-routing batch whose scoped verification must pass.

**B5 MCP surface - shape contract; estimated 6.2k.** Write `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.ts`, `route-tools.spec.ts`, `route-tool-handlers.spec.ts` if typed fixture requires it. Read `route-tools.ts:91-123`; `route-tool-handlers.ts:105-125`; `route-tool-handlers.spec.ts:20-55,120-145`; `route-decide-args.schema.ts:19-59`. Excerpt: `inputSchema:inputSchemaOf(RouteDecideArgsSchema)`; description names optional weight/shape and output tier/effort. Depends B1/B3; parallel-safe no. Verify `npm run verify -- -p @ptah-extension/vscode-lm-tools,ptah-electron`. Accept schema, description, typed fixture and Electron DI/surface checks; confirm the verify output header says targets ran for both named projects.

**B6 Orchestration docs - shape docs; estimated 14.9k.** Write paired `plugins/ptah-core/skills/orchestration/SKILL.md` / `.claude/skills/orchestration/SKILL.md` and paired `references/lane-assignment.md` under both roots. Read each at 8-39,125-140,174-195 and 18-42,91-128; `research-online.md:9-12`. Excerpt: gate phase adds shape?/weight?; chosen roster includes executor/model/tier/effort/reason. Depends B5; parallel-safe yes with B7/B8. Verify `npm run verify -- -p @ptah-extension/agent-generation`. Accept entry-only prompts and per-call precedence in both copies. Keep the orchestration SKILL.md below the 300-line target and require the pre-commit validate-skill hook to pass; inspect touched files for mojibake.

**B7 Team-leader modes - shape docs; estimated 4.2k.** Write paired `plugins/ptah-core/skills/orchestration/references/team-leader-modes.md` / `.claude/skills/orchestration/references/team-leader-modes.md`. Read both at 1-35,75-105; `.claude/agents/team-leader.md:456-480`. Excerpt: Mode 1 makes batches.md; Mode 2 consumes reports/usage; executor gets one batch entry. Depends B1; parallel-safe yes with B6/B8. Verify `npm run verify -- -p @ptah-extension/agent-generation`. Accept no plan pasted into executor prompt, the pre-commit validate-skill hook passing, and touched files free of mojibake.

**B8 Lane skill - shape docs; estimated 14.0k.** Write paired `plugins/ptah-core/skills/agent-lanes/SKILL.md` / `.claude/skills/agent-lanes/SKILL.md`. Read both at 35-112,265-280; `research-setup.md:28-40`. Excerpt: lane model is a listed raw ID; modelTier applies only where currently supported; roster tier is not a universal CLI model ID. Depends B1; parallel-safe yes with B6/B7. Verify `npm run verify -- -p @ptah-extension/agent-generation`. Accept bounded reads, no exploration, actual usage recording, unchanged lane model resolution, the pre-commit validate-skill hook passing, and touched files free of mojibake.

**B9 Team-leader source/copy - shape docs; estimated 15.1k.** Write `libs/backend/agent-generation/templates/agents/team-leader.template.md` and `.claude/agents/team-leader.md`. Read template 145-242,437-464; agent 127-175,199-261,456-480; `research-online.md:9-12`. Excerpt: batch entry has write/read sets, contracts, shape, estimated/actual weight, dependencies, verification; executor receives entry alone. Depends B6-B8; parallel-safe no. Verify `npm run verify -- -p @ptah-extension/agent-generation`. Accept source/copy policy parity, contracts first and heavy-file split rule; the pre-commit validate-skill hook passes and touched files are free of mojibake.

Electron is the priority host: B5 checks `ptah-electron` with `@ptah-extension/vscode-lm-tools`. Targeted search found no direct route-decide consumer in `ptah-extension-webview` or frontend renderer libraries, so there is no renderer edit or mandatory renderer check. If implementation adds renderer RPC exposure, add `ptah-extension-webview` to B5's scoped verify command. No workspace-wide verification.

## Risks

- Fixed role and MCP overhead is outside source weight; retain margin and recalibrate from actual usage.
- Claude effort/call override varies by version and model; gate unsupported fields and record substitutions when observable.
- Known strict-schema fixtures are assigned in B1/B3/B4. The result-type reference scan found no additional gate-result fixture requiring an edit; retry targeted references if implementation exposes another one.
- Template and checked-in agent may differ intentionally; edit matching policy sections rather than copying whole files.
- One indivisible file may exceed 16k; document the split exception and require behavior-preserving verification.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| 4k-12k target, 16k ceiling | Smaller/larger band | Fixed lane overhead; reported 2,800-line pair too heavy; measured current files | Yes, calibrate |
| Deterministic policy before System One | Let model invent tier/ID | Pinned payload at decision-payload.ts:56-75; requested auditability | Yes |
| Tier/effort on unavailable rows | Chosen only | Requirement says each roster entry; strict result union | Yes |
| Frontmatter stays default | Rewrite all agent model fields | research-online.md:9-12, generator supports aliases | Yes |
| Edit plugin sources and checked-in copies | One side only | Matching plugin paths and agent template/copy | Yes |
| Lane model resolution unchanged | Universal tier map | research-setup.md:28-40; TASK_2026_896_9339 | Yes |

## Clarifications Needed

None. Scope is approved in `decisions.md:10-11`.



## Revision log

- F1 (Serious): Added hard-constraints.spec.ts to B1 and compile-reasons.spec.ts to B3 with read ranges, recalculated weights, and marked B4 as the first expected green lane-routing gate. Rechecked result schema/type references and consumers.
- F2 (Serious): Corrected B5 to comma-separated Nx project names and added a two-project verify-header check.
- F3 (Moderate): Repaired mojibake, wrote this plan as UTF-8 without BOM, and required encoding preservation and mojibake scans for every implementer/doc batch.
- F4 (Moderate): Added pre-commit validate-skill acceptance to B6-B9 and the 300-line orchestration SKILL.md target.
- F5 (Moderate): Defined legacy behavior, the explicit conditions for haiku, non-review review-shape behavior, and downstream haiku/pin tests.
- F6 (Minor): Explained unavailable-row policy origin and required a spec asserting max is not initially emitted.
- F7 (Minor): Confirmed A1-A8 are covered; no change needed.
- F8 (Minor): Documented B6/B8/B9 as paired-copy target-band exceptions.
