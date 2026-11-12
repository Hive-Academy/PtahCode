## Summary

Inventory: 45 capabilities: 18 keep, 15 move, 12 remove-proposed. By first named owner phase: phase 1: 0; phase 2: 11; phase 3: 11; phase 4: 2; phase 5: 20; phase 6: 0; later bots task: 1. Phase 0 records these without behavior change. Census baseline: 43 non-test TypeScript files / 200 role-name lines, 137 specs / 934 lines, about 224 files / 1,500 lines overall (`evidence/coupling-census.md`); the overall figure is an estimate.

## Inventory

### 1. Agent generation and workspace analysis

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Persist workspace analysis/checkpoints | `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts:83` | `ANALYSIS_STORAGE_SERVICE` | keep | Phase 3, analysis storage | none found |
| Detect stale analysis | `libs/backend/agent-generation/src/lib/di/tokens.ts:122` | `ANALYSIS_FRESHNESS_SERVICE` | keep | Phase 3, workspace analysis | none found |
| Run multi-phase analysis | `libs/backend/agent-generation/src/lib/di/tokens.ts:130` | `MULTI_PHASE_ANALYSIS_SERVICE` | keep | Phase 3, workspace analysis | `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts` |
| Load bundled agent templates | `libs/backend/agent-generation/src/lib/di/register.ts:84` | `TEMPLATE_STORAGE_SERVICE` | remove-proposed | Phase 5, retire 14 templates | `libs/backend/agent-generation/src/lib/services/template-storage.service.spec.ts` |
| Select built-in agents (all score 100) | `libs/backend/agent-generation/src/lib/services/agent-selection.service.ts:114` | `AGENT_SELECTION_SERVICE` | remove-proposed | Phase 5, after skill selection | none found |
| Recommend named agents | `libs/backend/agent-generation/src/lib/di/tokens.ts:69` | `AGENT_RECOMMENDATION_SERVICE` | remove-proposed | Phase 5, after skill recommendations | none found |
| Render and write generated agents | `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:309` | `AGENT_GENERATION_ORCHESTRATOR`, renderer, writer | remove-proposed | Phase 5, stop regeneration; existing files stay | `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts` |
| Mirror user-layer skills and commands | `libs/backend/agent-generation/src/lib/di/register.ts:180` | `USER_LAYER_MIRROR_SERVICE` | move | Phase 5, host-neutral user-layer composition | `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.spec.ts` |

### 2. Setup wizard and renderer

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Deep analyze and resume workspace | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:295` | `wizard:deep-analyze`, `wizard:get-resumable-run`, `wizard:analysis-status` | keep | Phase 3, setup analysis | none found |
| List and load previous analyses | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:825` | `wizard:list-analyses`, `wizard:load-analysis` | keep | Phase 3, setup analysis | none found |
| Recommend agents to onboarding | `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts:234` | `wizard:recommend-agents` | remove-proposed | Phase 3 skill recommendations; Phase 5 RPC retirement | none found |
| Preview, submit, retry agent generation | `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:253` | `wizard:preview-generation`, `wizard:submit-selection`, `wizard:retry-item` | remove-proposed | Phase 3 skill install; Phase 5 generation retirement | none found |
| Browse and install agent packs | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:915` | `wizard:list-agent-packs`, `wizard:plan-pack-install`, `wizard:install-pack-agents` | remove-proposed | Phase 3 skill catalog; Phase 5 agent-pack retirement | none found |
| Cancel analysis | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:767` | `wizard:cancel-analysis` | keep | Phase 3, analysis lifecycle | none found |

### 3. Harness sync

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Gate agent propagation by workspace consent | `libs/backend/harness-sync/src/lib/gitignore/harness-state-store.ts:68` | `agentSyncEnabled` | remove-proposed | Phase 5, retire agent facet after migration | `libs/backend/harness-sync/src/lib/state/agent-workspace-scope.spec.ts` |
| Manifest agents for provider targets | `libs/backend/harness-sync/src/lib/manifest/harness-manifest.builder.ts:757` | `buildAgents` | remove-proposed | Phase 5, remove agent facet | `libs/backend/harness-sync/src/lib/manifest/harness-manifest.agent-enablement.spec.ts` |
| Transform agent instructions for rival CLIs | `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:293` | agent transformers | remove-proposed | Phase 5, retire `.codex/agents`, `.github/agents`, `.cursor/agents` targets | `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.spec.ts` |
| Retire only Ptah-owned artifacts, preserving edits | `libs/backend/harness-sync/src/lib/targets/artifact-retirement.ts:124` | `retireOwnedArtifact` | keep | Phase 5, consented cleanup; shared for other facets | `libs/backend/harness-sync/src/lib/targets/artifact-retirement.spec.ts` |
| Propagate selected skills to providers | `libs/backend/harness-sync/src/lib/gitignore/harness-state-store.ts:92` | `skillSyncMode`, `enabledSkillSlugs` | keep | Phase 3/5, skill sync | `libs/backend/harness-sync/src/lib/state/skill-sync-gate.spec.ts` |
| Rewrite skill Markdown/frontmatter for rival providers | `libs/backend/harness-sync/src/lib/targets/skill-transform.ts:114` | `transformSkillMarkdown` | keep | Phase 5, skill sync transform | none found |

### 4. CLI lane roles

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Resolve user-written `.claude/agents/*.md` | `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts:58` | `AgentRoleResolver.resolve` | keep | Phase 5, user-agent compatibility | none found |
| Accept a role name on lane spawn | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts:93` | `ptah_agent_spawn`, `ptah.agent.spawn` | move | Phase 2, `(phase, skills?, role?)`, user file only | none found |
| Deliver role instructions to lane | `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:389` | `resolveRole`, adapter `role` | move | Phase 2, phase contract plus optional user role | none found |
| List roles in lane discovery | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/agent-tool.dispatcher.ts:869` | `ptah_agent_list` | move | Phase 5, user-file roles only | none found |

### 5. Routing

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Resolve default built-in role for phase | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:43` | `DEFAULT_ROLE` | move | Phase 2, phase-definition resolver; Phase 4 alias retirement | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts` |
| Add a matching subagent candidate | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:312` | `BUILTIN_SUBAGENT_ROLES`, gathered roles | move | Phase 2, capability-based candidate | `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts` |
| Refuse lanes for specified phase names | `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:157` | `NEVER_ON_A_LANE_PHASE_KINDS` | move | Phase 2, effective capability plus ranking/pin | `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts` |
| Accept requested route role | `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:34` | `routeDecideArgsSchema.role` | move | Phase 2, phase primary; role user-file alias | none found |

### 6. Outcomes and scorecards

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Classify role slug into task kind | `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:49` | `taskKindForRole` | move | Phase 2, phase-kind primary, role aliases until Phase 4 | none found |
| Read historical subagent grade attribution | `libs/backend/skill-synthesis/src/lib/skill-task-grade.store.ts:167` | `lane_outcome_records.role`, `registry.kind='agent'` | keep | Phase 5, historical read or explicit migration | none found |
| Show agent-clone scorecards | `libs/backend/skill-synthesis/src/lib/skill-scorecard.service.ts:84` | `getAggregates('agent',...)` | move | Phase 5, preserve old records, new phase/skill views | none found |

### 7. Harness wizard designer

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Design custom subagents with roles, modes, triggers | `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:53` | `harness:design-agents` caller at `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:676` | keep | Later bots task; designer stays | `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.spec.ts` |

### 8. Non-Electron consumers

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Boot CLI/TUI harness via mirror token | `libs/backend/cli-engine/src/lib/bootstrap/harness-boot.ts:134` | `bootHarness`, `USER_LAYER_MIRROR_SERVICE` | move | Phase 5, relocate mirror token without generation dependency | none found |
| Explain generated built-in agents | `apps/ptah-docs/src/content/docs/agents/built-in-agents.md:8` | docs page | remove-proposed | Phase 4/5, phase/skill docs | none found |
| Explain cross-CLI agent copies | `apps/ptah-docs/src/content/docs/agents/syncing-to-cli.md:8` | docs page | remove-proposed | Phase 5, skill/command/MCP sync docs | none found |
| Explain user-written agent files | `apps/ptah-docs/src/content/docs/agents/custom-agents.md:49` | docs page | keep | Phase 5, update regeneration wording | none found |

### 9. Renderer roles

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Give built-in roles distinct glyphs | `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts:120` | `roleIconFor` | move | Phase 4, phase glyphs plus user-agent fallback | `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.spec.ts` |
| Show live SDK subagents and CLI lanes | `libs/frontend/chat-ui/src/lib/organisms/ptah-ui/sources/ptah-ui-agents.source.ts:33` | `$agents` source | keep | Phase 2/5, runtime monitor | `libs/frontend/chat-ui/src/lib/organisms/ptah-ui/sources/ptah-ui-agents.source.spec.ts` |

### 10. Budgets and tool limits

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Enforce subagent budget at runtime | `libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts:77` | `SubagentBudgetMonitor` | keep | Phase 2, executor budget | none found |
| Deny costly tool definitions for built-in agents | `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:66` | `SUBAGENT_DISALLOWED_TOOLS` | move | Phase 2, phase tool profile and executor adapters | `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.spec.ts` |
| Track SDK Task start/stop and resume | `libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts:139` | SDK hooks | keep | Phase 2/5, SDK runtime | none found |

### 11. DI guards

| Capability | Where today (file:line) | Backing RPC / API / token | Decision (keep / move / remove-proposed) | New location (program phase and target) | Test that proves it today (spec file, or "none found") |
|---|---|---|---|---|---|
| Resolve generation service in Electron smoke | `apps/ptah-electron/src/di/container.smoke.spec.ts:694` | `AGENT_FILE_WRITER_SERVICE` | move | Phase 5, guard replacement services | `apps/ptah-electron/src/di/container.smoke.spec.ts` |
| Guard Electron wizard RPC presence | `apps/ptah-electron/src/di/rpc-surface.spec.ts:64` | agent-pack RPCs | move | Phase 3/5, guard skill RPCs | `apps/ptah-electron/src/di/rpc-surface.spec.ts` |
| Guard expected-resolvable DI fixture | `apps/ptah-electron/src/di/expected-resolvable.ts:41` | `SetupRpcHandlers` expected token | keep | Phase 5, update token set | none found |
| Guard Electron composed surface | `apps/ptah-electron/src/di/surface-composition.spec.ts:1` | surface assertion | keep | Phase 5, update surface | `apps/ptah-electron/src/di/surface-composition.spec.ts` |

## Proposed Removals

Each approval is independent. Existing generated files stay in place; cleanup is offered with consent.

| Capability | User loses | Replacement | Phase |
|---|---|---|---|
| Bundled templates | 14 installable agent templates | Phase discipline and skills | 5 |
| Built-in selection | Selection of named templates | Dependency-backed skill choice | 5 |
| Named-agent recommendation | Agent recommendation cards | Skill recommendations | 5 |
| Generated-file writing | New/refreshed Ptah agent files | Phase contract, skills, project guidance | 5 |
| Onboarding agent recommendation | Agent choice in onboarding | Skill choice | 5 |
| Wizard generation controls | Preview/submit/retry agent generation | Skill install and consent | 5 |
| Agent packs | Curated pack install | Skill catalog | 5 |
| Agent sync consent | Agent propagation toggle | Skill sync controls stay | 5 |
| Agent manifest facet | Ptah-managed agent discovery | User files remain local | 5 |
| Agent transforms/targets | Copies to rival provider agent folders | Phase/skill delivery | 5 |
| Built-in-agent docs | Catalog of generated roles | Phase/skill docs | 4/5 |
| Agent-copy docs | Cross-CLI agent-copy instructions | Skills/commands/MCP sync docs | 5 |

## Keep list

- Workspace analysis supplies project guidance and skill selection.
- SDK Task, hooks, monitors and budgets remain runtime executor functions.
- User-written `.claude/agents/*.md` and `AgentRoleResolver` remain.
- Harness wizard custom designer remains for the later bots task.
- Skill sync and owned-artifact retirement remain shared capabilities.
- Rival-provider skill Markdown rewrites remain: skill copies are transformed today.
- Historical scorecard keys remain readable.
- Existing generated files remain until consented removal.

## Callers outside the listed surfaces

- `apps/ptah-electron/src/replay/scenario-sanitizer.ts:162` allowlists wizard agent RPCs for replay.
- `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts:293` starts generation from onboarding.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:389` resolves and delivers lane role instructions; `mcp-stdio/agent-tool.dispatcher.ts:869` lists roles.
- `libs/backend/harness-sync/src/lib/manifest/harness-manifest.builder.ts:757` builds agent desired state before targets write it.
- `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:676` calls the custom harness designer through `harness:design-agents`; this caller stays.

## Electron, CLI, TUI and docs impact

| Host | Impact |
|---|---|
| Electron | Setup renderer loses agent recommendations, packs and generation; RPC and replay guards change. SDK Task and user files stay. |
| CLI | `harness-boot.ts` must keep mirror/skill composition after dropping generation and agent sync; spawn keeps optional user-file role. |
| TUI | Shares CLI boot and lane runtime. `apps/ptah-tui` is absent in this checkout; CLI integration is the reachable dependency. |
| Docs | Replace built-in-agent and sync pages; preserve custom-agent instructions while correcting regeneration claims. |

## Decisions

| Judgment | Options | Evidence | Reversible |
|---|---|---|---|
| Separate analysis from generation | Retire whole library / split | `analysis-storage.service.ts:83`; final workspace-analysis decision | Yes |
| Retain custom designer | Retire with templates / keep for bots | `harness-subagent-design.service.ts:53`; U-D10 | Yes |
| Restrict role to user-written file | Drop role / unrestricted role / user file | `agent-role-resolver.service.ts:58`; final spawn model | Yes |
| Preserve historical grades | Delete keys / read or migrate | `skill-task-grade.store.ts:167` | Yes, with migration |
| Leave generated files | Auto-delete / consented cleanup | `artifact-retirement.ts:124`; U-D7 | Yes |
| Separate skill and agent sync | Retire both / agent facet only | `harness-state-store.ts:68`, `:92` | Yes |
| Keep skill transforms | Assume verbatim skill copy / retain provider rewrites | `skill-transform.ts:2`, `workspace-target.ts:429` | Yes |
| Move CLI mirror token | Drop CLI import / relocate contract | `harness-boot.ts:42`, `:134` | Yes |

No verification commands were run. `none found` means no proving spec was established in this inventory.

