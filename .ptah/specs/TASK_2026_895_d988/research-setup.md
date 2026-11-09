# Current MODEL and EXECUTOR selection

Decision served: map current routing and change surfaces for dynamic models and batch-aware assignment. All citations are workspace-relative file:line references. Findings are verified from source unless labeled **Inference**.

## 1. Subagent definitions

All 14 files in `.claude/agents/*.md` have a literal `model:` at line 4 and no frontmatter `effort:`.

| File in `.claude/agents/` | Model | Evidence |
|---|---|---|
| backend-developer.md | opus | `.claude/agents/backend-developer.md:4` |
| code-logic-reviewer.md | sonnet | `.claude/agents/code-logic-reviewer.md:4` |
| code-style-reviewer.md | sonnet | `.claude/agents/code-style-reviewer.md:4` |
| devops-engineer.md | sonnet | `.claude/agents/devops-engineer.md:4` |
| frontend-developer.md | opus | `.claude/agents/frontend-developer.md:4` |
| modernization-detector.md | sonnet | `.claude/agents/modernization-detector.md:4` |
| project-manager.md | opus | `.claude/agents/project-manager.md:4` |
| researcher-expert.md | sonnet | `.claude/agents/researcher-expert.md:4` |
| senior-tester.md | sonnet | `.claude/agents/senior-tester.md:4` |
| software-architect.md | opus | `.claude/agents/software-architect.md:4` |
| team-leader.md | opus | `.claude/agents/team-leader.md:4` |
| technical-content-writer.md | sonnet | `.claude/agents/technical-content-writer.md:4` |
| ui-ux-designer.md | sonnet | `.claude/agents/ui-ux-designer.md:4` |
| visual-reviewer.md | sonnet | `.claude/agents/visual-reviewer.md:4` |

The 14 matching `libs/backend/agent-generation/templates/agents/*.template.md` files also set opus/sonnet (for example `backend-developer.template.md:21`, `researcher-expert.template.md:19`). The generator chooses a valid `agentGeneration.models` override before the template value; accepted Claude values are `opus`, `sonnet`, `haiku`, `inherit`. Missing or invalid override uses the template model (`libs/backend/agent-generation/src/lib/services/agent-model-resolution.ts:21-58`). The orchestrator emits the resolved `model:` line (`libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1190-1210,1266-1273`); guarded writing occurs in `libs/backend/agent-generation/src/lib/services/file-writer.service.ts:82-101`. Thus checked-in files are fixed, but generation supports `inherit` and tier aliases. No `.claude/settings*.json` file was found in this worktree, so no workspace override is evidenced there.

## 2. CLI lane default models

| Surface | Current rule | Evidence |
|---|---|---|
| System CLI model | Request model, then `agentOrchestration.<cli>Model`, else `undefined` and native CLI default. `resolveLaneModel` emits `request`, `setting`, or `cli-default`. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:245-265`; `agent-spawn-environment.service.ts:65-75,189-209` |
| Claude CLI tier | `modelTier` becomes a request model only for `cli === 'claude'` with no raw model. | `agent-spawn-environment.service.ts:190-209` |
| Ptah CLI provider | Defaults tier to `sonnet`; raw spawn model wins, then agent `selectedModel`, then effective agent/main/provider tier mapping. | `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:831-849,1637-1683` |
| Defaults schema | `CLI_LANE_DEFAULT_SCHEMA` stores permission/network, no model. | `libs/shared/src/lib/types/cli-lane-defaults.types.ts:5-23` |
| Source enum | `LaneModelSource` includes `ptah-default`, though `resolveLaneModel` does not emit it. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts:94-100`; `lane-spawn-policy.ts:257-265` |
| Outcome key | `LANE_DEFAULT_MODEL = 'lane-default'` means a run spawned without a model, not a vendor model ID. | `libs/shared/src/lib/types/lane-outcome.types.ts:62-67,81-85` |
| Denylist | `mimo-v2.6-flash-free` is blocked after case-insensitive basename matching. | `lane-spawn-policy.ts:224-236` |

Model lists are mixed. Codex reads the selected app-server catalog, maps the returned `model.model` runnable IDs, labels the server's default, and does not inject a stale fallback (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:246-266`; `codex-app-server-lane-models.ts:19-34`). Antigravity and Grok probe CLI model commands (`antigravity-cli.adapter.ts:531-542`; `grok-cli.adapter.ts:212-222`); OpenCode and Pi probe binaries (`opencode-cli.adapter.ts:402-412`; `pi-cli.adapter.ts:292-303`). Cursor uses SDK listing with static fallback (`cursor-cli.adapter.ts:310-347`); Copilot returns static `COPILOT_MODELS` (`copilot-sdk.adapter.ts:121,271-276`); Claude reads a native catalog (`claude-cli.adapter.ts:140-151`). **Inference:** system CLIs have no common opus/sonnet/haiku mapping; only Claude accepts `modelTier` in system CLI resolution, while other settings are raw IDs.

## 3. Routing decision model

`ptah_route_decide` accepts pre-flight request text or Gate 0.1 request/taskType/depth plus up to 100 phases. A phase has `id`, `kind`, optional `role` and `reviews`; a pin has executor and optional exact model (`libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:19-59`). There is no typed batch size, context weight or required tier. **Inference:** phase kind/id already carry batch kind and identity if callers create one phase per batch; global `request` can carry prose but does not give scoring a structured per-batch weight.

Gather reads live rows, limits, roles, model lists, outcome matrix and rotation (`libs/backend/lane-routing/src/lib/pipeline/gather.ts:68-104`). Model listing has a 2,000 ms per-row budget (`gather.ts:153-184`; `routing-constants.ts:129-133`). Each phase adds gathered lanes and a named/default subagent, then constrains, scores, ranks and spreads candidates (`pipeline/phase-plan.ts:120-185,242-273`). Hard rules exclude at-limit, disabled and uninstalled lanes, keep design/visual-review off lanes, and separate review from implementer family. A broken pin makes the phase unavailable (`ranking/hard-constraints.ts:1-20,31-56,123-159`).

`tierFor` hardcodes `opus` for plan, architecture, review and document-review, and `sonnet` for other phase kinds. This is a subagent configured model; lanes use their listed/configured model. A pin can select a listed model, `lane-default`, or subagent tier (`pipeline/phase-plan.ts:275-355`). Scoring selects a listed model only if it beats the family fallback beyond the closeness band; otherwise it uses configured model or `lane-default` (`ranking/score.ts:5-12,120-159`). Decision options carry executor ID, family, pre-scored model, limit state and score (`phase-plan.ts:396-403`). Decision payload sends request, options and aggregated delivered/failed outcome counts, with no raw outcomes (`decision-model/decision-payload.ts:36-47,56-95`).

The decision model is asked only for an eligible unpinned phase with enough close options. Otherwise `rankingPick` uses spread pick or top ranked. A valid answer selects one offered candidate; timeout, invalid answer, question limit or blocked caller falls back to ranking and records cause (`pipeline/phase-resolve.ts:17-107`). Final roster model comes from the selected candidate's pre-scored row (`pipeline/assemble-gate.ts:110-132`); the decision model does not invent model IDs.

`SystemOneClient.decide` sends one POST to `/v1/systemone` with model, state and questions, using `AbortSignal.timeout`; default per-request budget is 3,000 ms and target resolution can use `agentOrchestration.decisionModelTimeoutMs` (`decision-model/system-one.client.ts:10-17,107-163`; `routing-constants.ts:109-127`; `decision-model/decision-model.target.ts:181-196`). Structured-output calls also return `requestCause: timeout` on deadline (`pipeline/model-call.ts:102-140`). Thus the observed pre-flight `fallbackCause: timeout` refers to decision inference, not spawned-lane inactivity. The documented overall default budget is 8,500 ms and is not enforced as a single timer (`routing-constants.ts:132-148`).

## 4. Orchestration docs

| Rule | Evidence |
|---|---|
| Gate 0.1 asks for per-phase executor/model; use chosen roster or live-list fallback. | `.claude/skills/orchestration/references/lane-assignment.md:18-29` |
| A capable CLI lane is the default executor for a bounded batch; parallel tasks must be file-disjoint. | `lane-assignment.md:51-56` |
| Whole-phase lane cap: ≤6 files, ≤2 libs, one scoped verification per batch; split larger implement phases sequentially. | `lane-assignment.md:91-100` |
| Plan/architecture default to strong reasoning; implement to capable coding; review to independent different-family lane; document review to opposite side. | `lane-assignment.md:102-108` |
| Unpinned choices use live capability/availability; record phase → lane → model. | `lane-assignment.md:110-126` |
| Team leader reads batch Recommended executor/Execution mode; sequential batch one lane, parallel batch one lane per disjoint task, unavailable recommendation uses fallback. No named model/tier in this rule. | `.claude/skills/orchestration/references/team-leader-modes.md:89-104` |
| Spawn raw `model` overrides ptah-cli tier; `modelTier` is opus/sonnet/haiku for ptah-cli only; omitted system `cli` uses user's default; user-pinned lane/model passes through. | `.claude/skills/agent-lanes/SKILL.md:39-59` |
| Confirmed-limit fallback is other family, then same family different provider/model, then subagent. | `.claude/skills/agent-lanes/SKILL.md:163-172` |

## 5. Integration points

These are change surfaces, not a design proposal.

| Surface and Nx owner | Current behavior | Risk of change |
|---|---|---|
| `libs/backend/agent-generation/src/lib/services/agent-model-resolution.ts:21-58`; `@ptah-extension/agent-generation` | Template model or accepted user override generates Claude frontmatter. | Regeneration changes role behavior; Claude accepted values are constrained. |
| `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:275-355`; `@ptah-extension/lane-routing` | Fixed phase tier and one scored model per candidate. | Matrix history and pins depend on model keys; ranking and roster change. |
| `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:831-849`; `@ptah-extension/cli-agent-runtime` | Provider tier mapping follows raw override and selected model. | Missing provider tier map or precedence change affects launch. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:65-75,189-209`; `@ptah-extension/cli-agent-runtime` | System CLI request/setting/native default resolution. | A tier mapping crosses a raw-model adapter boundary and may override user settings. |
| `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:19-59`, `pipeline/phase-plan.ts:120-185`, `decision-model/decision-payload.ts:44-95`; `@ptah-extension/lane-routing` | Phase kind/role/reviews and global request feed scoring/model prompt; no batch weight. | Strict schema, prompt allowlist and 64 KiB cap affect callers and payload size. |
| `.claude/skills/orchestration/references/lane-assignment.md:20-28,91-100`; orchestration docs, no Nx project | One Gate 0.1 phase roster and later capped batches. | Per-batch routing would change current call count and workflow. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-models.ts:19-34`, `copilot-sdk.adapter.ts:121,271-276`, `cursor-cli.adapter.ts:310-347`; `@ptah-extension/cli-agent-runtime` | Codex live; Copilot static; Cursor live with static fallback. | Vendor catalog unavailability can leave an empty picker or change routing coverage. |

## Decisions

- Treated Claude role frontmatter, routing's `tierFor`, and ptah-cli provider tiers as separate current mechanisms because they have separate entry points (`agent-model-resolution.ts:21-58`; `phase-plan.ts:275-355`; `ptah-cli-registry.ts:831-849`). This reporting choice is reversible.
- Attributed pre-flight timeout to decision inference generically; source alone cannot prove whether the specific event used System One or structured output (`system-one.client.ts:112-163`; `model-call.ts:102-140`). This attribution is reversible.

## Open questions

- Which decision-model caller handled the timed-out pre-flight, and was its timeout setting overridden? Source cannot identify that runtime event.
- What source will estimate batch context weight? The current route schema has no structured weight field (`route-decide-args.schema.ts:19-59`).
