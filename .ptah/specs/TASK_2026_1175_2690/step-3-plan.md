# Step 3 plan: retire definition and knowledge roles

Plan against the step-2 worktree HEAD. Step 3 starts on a new branch. Electron is the priority host. Keep platform-cli and cli-engine working.

## Scope

Retire six built-in subagents: `project-manager` to `plan`; `software-architect` to `architecture`; `researcher-expert` and `modernization-detector` to `research`; `technical-content-writer` to `docs`; `ui-ux-designer` to `design`. Keep old task and grade reads, aliases, custom same-name agents, edited wizard agents and tracked generated agents. `team-leader` stays active for step 4.

Keep the `ui-ux-designer` and `technical-content-writer` skills, their `plugins/ptah-core/skills/...` paths, their `.claude/skills/...` mirrors and their `Required Skills:` names. Keep `task-description.md`, `design-spec.md` and `content-specification.md` in `task-spec.contract.ts`. This lane changes no source code.

## Routing confirmation

`libs/shared/src/lib/types/retired-roles.ts:19-32` already maps all six slugs. Add six step-3 rows to `RETIRED_ROLES` only. `PhaseKind` in `libs/shared/src/lib/types/phase-contract.types.ts:6-15` contains all five target kinds. All five phase files exist in `plugins/ptah-core/skills/orchestration/phases/`. Keep the `.claude/skills/orchestration/phases/` copies byte-identical. No new kind or phase file is needed.

Route retired slugs by phase kind while preserving explicit custom-agent routing. Spawn, mirror, sync and reap retire only unchanged wizard agents proved by origin and file hash. Keep provider copies under P4-S1-1. Check Electron and CLI call paths. Replace the role-name design lane ban with capability-aware phase routing only where needed. A same-name skill invocation stays a skill invocation.

## Learned differences

Before deleting a template, compare it line by line with its target phase and relevant skill (Layer A). Read the scoped user-layer clone and each readable history snapshot (Layer B). Record source line, target line or drop reason and verdict in `step-3-learned-differences.md`. Publish no private paths, scopes, names or content. Hold deletion when a unique rule has no destination or history cannot be read.

| Role and template capability | Gap and destination to check |
| --- | --- |
| `project-manager.template.md:48-218`: classify task, scope, measurable criteria, parity inventory, task description, clarification. `role-file-comparison.md:28,140` reports generated-only Layer A. | `phases/plan.md` covers these. Check task-spec and refusal details. Add missing general rules to `plan.md`. |
| `software-architect.template.md:34-269`: inventory-only mode, verified contracts, component handoff. Inline hygiene at :43-56 covers bounded resources, command safety, external calls and tests. Learned repository patterns at `role-file-comparison.md:127-135`. | `phases/architecture.md` covers inventory and handoff. Check every hygiene rule against it and `review.md`; move missing general rules to `architecture.md` or a skill. Check ports in `ddd-architecture` and tags in `nx-workspace-architect`. Drop repository facts only when project guidance has them. |
| `researcher-expert.template.md:44-134`: bounded question, sources, options, disagreement and experiments. Generated-only Layer A. | `phases/research.md` covers these. Check source ranking, freshness and citation; add missing rules there. |
| `modernization-detector.template.md:43-133`: consolidate deferred work from task deliverables, scan current code, count and rank opportunities, write `future-enhancements.md`. Generated-only Layer A. | `phases/research.md` covers modernization and after-QA scan. Verify explicit consolidation and source trace; add gaps there. |
| `technical-content-writer.template.md:42-343`: load same-name skill; landing, post, docs and script formats; claim checks and asset briefs. Generated-only Layer A. | `phases/docs.md` and the existing skill cover these. Check format details; add a reusable gap to the phase or skill. Keep skill name and path. |
| `ui-ux-designer.template.md:43-119`: load same-name skill and selected reference; token trace, design spec, asset inventory, interactive prototype. Generated-only Layer A. | `phases/design.md` and existing skill cover these. Check reference routing and rendered review; add gaps to the phase or skill. Keep skill name and path. |

## Current references

The required `git grep -n -E` over `libs/ apps/ plugins/ .claude/skills .claude/commands scripts/ tools/` returned 336 matching lines in 86 paths at this HEAD. Re-run at implementation HEAD. Classify each line; do not replace strings blindly.

| File:line or file group | Class | Action |
| --- | --- | --- |
| `libs/backend/agent-generation/templates/agents/{project-manager,software-architect,researcher-expert,modernization-detector,technical-content-writer,ui-ux-designer}.template.md` (30 census lines) | Change | Delete six after Layer A/B audit. Keep `team-leader.template.md`. |
| `libs/shared/src/lib/types/retired-roles.ts:19-32`, `retired-roles.spec.ts` | Change and keep alias | Add retirement rows and tests; keep alias table and legacy reads. |
| `libs/backend/agent-generation/src/lib/{interfaces/template-storage.interface.ts,services/agent-recommendation.service.ts,services/orchestrator.service.ts,services/subagent-tool-allowlist.ts,services/template-storage.service.ts,types/core.types.ts,types/wizard.types.ts}` | Change | Remove built-in catalog, recommendation and template selection rows. Keep skill recommendations. |
| `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts:80-81`, its specs, `template-sharing.guard.spec.ts` | Change | Remove project-manager special case; keep team-leader task-spec path. Update template guard. |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/{orchestration-namespace.builder.ts,system-namespace.builders.ts}` and specs | Change | Offer phase kinds for built-in work. Keep explicit custom agents and skill names. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:428`; `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts` | Change or guard test | Remove role-based design lane wording. Keep capability guard and historical guard tests. |
| `libs/frontend/{chat-streaming/src/lib/agent-monitor.store.ts,chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts,chat-ui/src/lib/molecules/background-agent-strip.component.ts,chat-ui/src/lib/molecules/setup-plugins/prompt-catalogue.ts,onboarding/src/lib/shell/onboarding-announcer.service.ts}` | Change | Remove active role presentation; keep legacy event display and generic avatar. |
| `libs/shared/src/lib/types/task-spec.contract.ts:60,85-114,593`; `wizard/recommendations.ts:31` | Wording only | Remove role-name comments/examples. Keep deliverable names and contract behavior. |
| Both `commands/orchestrate.md:48`; both `orchestration/references/agent-catalog.md:70-71,117-130`; `scripts/validate-orchestration-skill.ts:117-123` | Change and keep | Replace active-agent list with phases. Keep skill routing rows, compatibility aliases and team-leader validator case. |
| Both `commands/init-saas.md:34`; `plugins/ptah-dotnet/skills/dotnet-solution-initializer/SKILL.md:32` | Change | Say `plan` phase instead of project-manager agent. |
| `apps/ptah-docs/src/content/docs/agents/{agent-orchestration.md,built-in-agents.md,cli-agents.md,index.mdx}`, `setup/setup-wizard.md`, `templates/{creating-templates.md,index.md,template-storage.md}` | Change | Document current phase workflow and template list. Keep team-leader current. Mark custom-template examples. |
| `apps/ptah-docs/src/content/docs/mcp-and-skills/popular-skills.md`; both `skills/{ui-ux-designer,technical-content-writer}/**`; both `skills/agent-lanes/SKILL.md`; both `skills/ptah-surface-authoring/SKILL.md` | Keep | Skill IDs, paths, examples and Required Skills stay. |
| `libs/backend/{agent-sdk,cli-agent-runtime,harness-sync,lane-outcomes,agent-generation,rpc-handlers,vscode-lm-tools}/**/*.spec.ts`; `libs/frontend/{chat,chat-ui,command-center,onboarding,webview-e2e-harness}/**/*.spec.ts` and fixtures | Mixed | Change active built-in expectations. Keep legacy-read, custom same-name, retired guard and historical fixtures. |
| `apps/ptah-electron-e2e/src/specs/**`; `libs/shared/src/lib/types/{execution/agent.ts,execution/stream-background.ts,subagent-registry.types.ts}` and SDK hook specs | Keep | Historical event examples and legacy parsing remain. |
| `tools/mcp-bench/fixtures/memory-skills/**`, `tools/mcp-bench/questions/**`, `tools/role-census/check-role-census.ts` | Keep | Historical skill fixtures and census role set remain. Never edit census baseline. |

Mixed lines containing `team-leader` defer its retirement to step 4. Keep same-name skill references, old outcomes and alias-guard tests as compatibility evidence.

## Role census

The required read-only census ran once and exited 0: templates 46, skills 73, generated-agents 176, docs 106, test 933, source 152, other 107; total 1593 lines in 281 files. It skipped 132 binary and zero unreadable files. These values supersede the older `role-reference-map.md` counts.

| Bucket | Current | Expected after step 3, ceiling | Basis |
| --- | ---: | ---: | --- |
| templates | 46 | 16 | Six templates contain 30 counted lines. |
| skills | 73 | 73 | Keep named skills; phase edits add no role-name line. |
| generated-agents | 176 | 176 | U-D12 keeps tracked agents. |
| docs | 106 | 100 | Replace at least six active built-in rows. |
| test | 933 | 933 | Keep compatibility fixtures; do not add role-name lines. |
| source | 152 | 146 | Remove at least six active role-name lines. |
| other | 107 | 107 | Keep census and history fixtures. |
| total | 1593 | 1551 | Sum of ceilings. |

These are planned ceilings, since focused edits may lower counts further. Record final exact counts before the PR. Never use `--update` or edit the baseline. Review any bucket rise.

## Batches

A, B and C have file-disjoint writes and may run in parallel. D follows A's learning verdict and C's catalog changes. An earlier owner edits a file needed by two batches. The coordinator runs integration and `npm run verify`. Each lane runs only focused commands listed here, one heavy check at a time.

| Batch | Write set | Read set and exact change | Focused check | Acceptance |
| --- | --- | --- | --- | --- |
| A, phase guidance | `step-3-learned-differences.md`; both copies of `orchestration/phases/{plan,architecture,research,docs,design}.md`, `orchestration/references/agent-catalog.md`, `commands/orchestrate.md` | Read six templates, tracked agents, local clone/history, five phases and two named skills. Move missing rules. Keep skill routing and compatibility appendix. Replace active-agent list. | No code check for Markdown-only work. | Every Layer A/B row has a verdict; mirrored files match; active six-role workflow rows gone. |
| B, routing and contracts | `libs/shared/src/lib/types/{retired-roles.ts,retired-roles.spec.ts,task-spec.contract.ts,wizard/recommendations.ts}`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts`; `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts` | Read phase-plan, origin helper, spawn policy and contract. Add six retirement rows. Keep filenames. Remove role lane wording; test aliases and custom agents. | `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/retired-roles.spec.ts`; `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`; `npx eslint <changed files>` | Six aliases route by phase; team-leader stays; legacy and custom reads work. |
| C, catalog and host | `libs/backend/agent-generation/src/lib/{interfaces/template-storage.interface.ts,services/agent-recommendation.service.ts,services/orchestrator.service.ts,services/subagent-tool-allowlist.ts,services/template-storage.service.ts,types/core.types.ts,types/wizard.types.ts}`; `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/{orchestration-namespace.builder.ts,system-namespace.builders.ts}`; `libs/frontend/{chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts,onboarding/src/lib/shell/onboarding-announcer.service.ts}` | Read recommendations, namespace specs and Electron RPC route. Remove six built-in entries and offer five kinds. Keep skills and custom agents. Avoid service and RPC registration changes. | `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`; `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`; `npx eslint <changed files>` | Wizard and Electron setup show phase choices; both skills remain. |
| D, template and surface cleanup | Six named templates; `libs/backend/agent-generation/src/lib/services/{template-partial-resolver.ts,template-sharing.guard.spec.ts}`; `agent-pack-manifest.json`, `content-manifest.json`; `scripts/validate-orchestration-skill.ts`; docs and init-saas/dotnet files listed above; focused affected specs. Docs and manifests are mechanical edits. | Read A verdict, manifest, guards, docs and remaining grep hits. Keep team-leader task-spec path. Delete six templates, update manifests and active documentation, keep skill names. | `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/template-sharing.guard.spec.ts libs/backend/agent-generation/src/lib/services/template-partial-resolver.spec.ts`; `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`; `npx eslint <changed files>` | Six templates absent, team-leader intact, manifest valid, active docs updated, skills load. |

The owner of each changed project adds only its focused specs. If D needs a C-owned file, C edits it before D starts. Mechanical one-line edits may exceed the six-file preference. Keep at most two Nx projects per focused verification run where possible.

## Real task

After implementation, run one real `plan` or `architecture` phase from a new task brief on a provider CLI lane and one `research` phase for a bounded code question on a lane. The research run cites repository evidence and dated primary sources when external facts matter. Record task, kind, executor, loaded skills, deliverable, verdict and persisted outcome in `step-3-real-task.md`. Run an Electron setup and phase-selection smoke path first. Check platform-cli and cli-engine can spawn and finish. Include modernization consolidation if that capability changed. A separate focused regression proves custom same-name agent selection.

## Gates

- Coordinator runs read-only census and records exact counts. No `--update` or baseline edit. Run `npm run validate-skill`, `npm run manifest:check`, degradation audit and byte comparison of both orchestration skill trees.
- Coordinator runs scoped `npm run verify -- -p <changed projects>`. Candidate Nx projects: `shared`, `agent-generation`, `cli-agent-runtime`, `lane-routing`, `rpc-handlers`, `vscode-lm-tools`, `chat-ui`, `onboarding`, `ptah-docs`; add `chat-streaming` or another project only when its files change. Check actual Nx names. Run `typecheck-templates` for `ptah-extension-webview` only if a webview template changes. Lanes do not run Nx or workspace verify.
- Test alias routing, unchanged wizard origin proof, custom same-name agent, mirror/sync/reap, catalog, template guard, skill preservation, old event parsing and deliverable names. Update DI guards only if a service or RPC method changes.
- Run Electron step list, platform-cli and cli-engine smoke, two real phases, independent other-family review, full-diff review and green CI. Parent merges after all gates.

## Preserve list

Keep aliases, historical task and grade attribution, user clones and history, custom and edited same-name agents, tracked generated agents, both named skills and Required Skills, all three deliverable names, team-leader, transferable template rules, provider CLI lanes, platform-cli and cli-engine.

## Proposed Removals

Remove six built-in source templates, six active catalog and recommendation rows, their manifest rows and obsolete active UI/help wording. Remove no capability, skill, tracked generated agent, user layer, history or deliverable. A unique rule without a destination holds deletion.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Add six rows to one retirement table | One table / new map | `retired-roles.ts:17-43`, P4-7 | Yes |
| Keep same-name skills and Required Skills | Keep / rename | Step-3 scope; `agent-catalog.md:70-71` | Yes |
| Keep filenames and team-leader | Keep / retire now | `implementation-plan.md` steps 3 and 4 | Yes |
| Audit Layer A/B before deletion | Audit / delete directly | `role-file-comparison.md:127-140`, P4-5, P4-13 | Yes |
| Keep tracked generated files | Keep / delete | U-D12, P4-9 | Yes |
| Use census ceilings until final edits | Ceiling / invented exact count | Read-only census at this HEAD | Yes |

## Coordinator decisions

A owns skill and command mirrors. B owns shared contracts and CLI routing. C owns catalog and host namespace. D owns templates, manifests, validator, docs and guards. Coordinator resolves cross-owner edits, checks actual project names, runs gates and reviews full diff. No decision authorizes step-4 team-leader retirement.

## Lane-introduced constraints

This lane wrote only this document. It ran the required read-only grep and census. It did not run Nx, build, serve, e2e, package or workspace verify. Skill discovery through this CLI was unavailable; implementation owners should load applicable project skills through their CLI mechanism before editing.

## Clarifications Needed

None. If Layer B has a unique rule or missing history, hold that deletion and send the parent the evidence and destination options.
