# Role reference map

Read-only research. No source file was changed. Source: `git grep` over tracked files for the 14 role slugs.
Counts are matching lines. Counts of the form "N hits" come from the grep. Spec files with many hits show a count only.

## Role-census buckets and baseline

Bucket rules apply in this order (`tools/role-census/check-role-census.ts`, `bucketFor`):

1. `libs/backend/agent-generation/templates/` -> templates
2. `.claude/skills/` or `plugins/*/skills/` -> skills
3. `.claude/agents/`, `.github/agents/`, `.codex/agents/`, `.cursor/agents/` -> generated-agents
4. `apps/ptah-docs/`, `docs/`, or any `*.md` / `*.mdx` -> docs
5. `__fixtures__`, `__mocks__`, `e2e`, `*-e2e` folders, or `*.spec.ts` / `*.test.ts` -> test
6. other `.ts .tsx .js .mjs .cjs` -> source
7. everything else -> other

The check ignores `.ptah/specs/`, `tools/role-census/` and lock files. `excludes` is empty.

| Bucket | Baseline lines | Baseline files |
| --- | --- | --- |
| templates | 68 | 14 |
| skills | 119 | 29 |
| generated-agents | 176 | 28 |
| docs | 116 | 28 |
| test | 938 | 141 |
| source | 201 | 44 |
| other | 120 | 8 |
| total | 1738 | 292 |

Consequences of the bucket order:

- A `*.md` file outside skills and templates counts as docs. This includes `.opencode/agent/*.md`, `.claude/commands/*.md`, `plugins/*/commands/*.md` and `.ptah/analysis/**/*.md`.
- `.codex/agents/*.toml` counts as generated-agents.
- JSON manifests (`agent-pack-manifest.json`, `content-manifest.json`, `generation-manifest.json`) count as other.
- Every phase pull request must run `--update` to lower the baseline. A raise needs user approval and `--update --force-raise --reason`.

## Surface 1 - Catalog and role list (bucket: source)

| File:line | Note |
| --- | --- |
| `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:632-723` | 14 entries, one per role. Role catalog for the setup wizard. |
| `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts` (15 hits: 12, 46, 54, 62, 70 ... 150) | One recommendation entry per role. |
| `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:63,69-82` | Tool allow list per role (15 hits). |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts:382,403-410` | Role list in the `ptah_agent_list` docs text. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:54-57,258,284,301,317` | 8 hits. Role text in orchestration namespace docs. |
| `libs/shared/src/lib/types/task-spec.contract.ts` (17 hits: 60,66,69,84,87,108-114,147,502,590-592,607,611) | Task-folder file docs and the task-spec prompt block name the roles. Names `batches.md`, `test-report.md`, `design-spec.md`, `design-handoff.md`, `content-specification.md`. |
| `libs/shared/src/lib/types/user-layer-agents.ts:7-8` | Doc text. |
| `libs/shared/src/lib/types/wizard/recommendations.ts:35` | Example. |
| `libs/shared/src/lib/types/execution/agent.ts:21` | Example. |
| `libs/shared/src/lib/types/execution/stream-background.ts:40,70` | Example. |
| `libs/shared/src/lib/types/subagent-registry.types.ts:40,93` | Example. |
| `libs/shared/src/lib/types/rpc/rpc-harness.schemas.ts:179` | Example. |
| `libs/shared/src/lib/types/rpc/rpc-misc.types.ts:559-560` | Example. |
| `libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.ts:1350` | Role text. |
| `libs/backend/skill-synthesis/src/lib/spec-extractor.ts:194` | Role text. |
| `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts:126` | Example in prompt text. |
| `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:90,677` | Role text. |
| `libs/frontend/chat-ui/src/lib/molecules/background-agent-strip.component.ts:49` | Role text. |
| `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/prompt-catalogue.ts:192,207` | Prompt catalogue. |
| `libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts:5` | Comment. |
| `scripts/dev/seed-lane-outcomes.mjs:116` | Seed data. |
| `scripts/validate-orchestration-skill.ts` (17 hits: 112-125 list of 14 roles; 141, 171, 776 team-leader) | Validator for the orchestration skill. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:298,302` | `isReviewerOrTester` uses `-reviewer` and `senior-tester`. |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:428` | `ui-ux-designer` in the lane policy text. |

## Surface 2 - Template folder and template selection

Template folder: `libs/backend/agent-generation/templates/agents/*.template.md` (bucket: templates) and `_shared/*` (`clarification-protocol.md`, `cli-delegation.md`, `replacement-policy.md`, `reviewer-stance.md`, `tooling-precedence.md`).
Hits per template (68 lines, 14 files): team-leader 16, architect 9, content-writer 7, ui-ux 6, logic-reviewer 4, style-reviewer 4, project-manager 4, backend 3, devops 3, frontend 3, senior-tester 3, modernization 2, researcher 2, visual 2.

Template selection code (bucket: source):

| File:line | Note |
| --- | --- |
| `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts:80-81` | `TASK_SPEC_COORDINATOR_TEMPLATES = ['project-manager','team-leader']`. |
| `libs/backend/agent-generation/src/lib/services/template-storage.service.ts:228,233,346` | Template lookup by role name. |
| `libs/backend/agent-generation/src/lib/interfaces/template-storage.interface.ts:59,64` | Interface docs. |
| `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1286` | Role text. |
| `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts:381` | Role text. |
| `libs/backend/agent-generation/src/lib/types/core.types.ts:37,65,481,496,539,655` | Types and docs. |
| `libs/backend/agent-generation/src/lib/types/analysis.types.ts:146,182` | Types and docs. |
| `libs/backend/agent-generation/src/lib/types/wizard.types.ts:42` | Types and docs. |

## Surface 3 - Harness sync and agent transforms

| File:line | Bucket | Note |
| --- | --- | --- |
| `libs/backend/harness-sync/src/lib/targets/transformers/transform-rules.ts:105-107` | source | Comment examples only (backend, frontend). |
| `libs/backend/harness-sync/src/lib/targets/transformers/agent-transformer.port.ts:23,51,78` | source | Comment examples. |
| `libs/backend/harness-sync/src/lib/sources/harness-source.port.ts:27,123,124` | source | Comment examples. |
| `libs/backend/harness-sync/src/lib/targets/workspace-target.ts:900` | source | Comment example `ptah-backend-developer.agent.md`. |
| `.claude/agents/*.md` (14 files) | generated-agents | Tracked generated agents. |
| `.codex/agents/*.toml` (14 files) | generated-agents | Hits: team-leader 15, architect 9, writer 7, ui-ux 7, logic 6, style 6, backend 5, devops 5, frontend 5, pm 5, tester 5, modernization 4, researcher 4, visual 4. |
| `.opencode/agent/*.md` (14 files) | docs | Hits: architect 8, writer 6, ui-ux 6, logic 5, style 5, backend 4, devops 4, pm 4, tester 4, modernization 3, researcher 3, team-leader 3, visual 3, frontend 1. |
| `agent-pack-manifest.json` | other | 13 hits. `file` entries at lines 10, 16 ... 82. Has no visual-reviewer. |

`.github/agents` and `.cursor/agents` hold no tracked files.

## Surface 4 - Icon map

- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts` (source): 14 hits. `AGENT_ROLE_ICONS` at lines 122-135. `roleIconFor` follows it and falls back to `Bot`. Removal of a role needs no other change, because the fallback exists.

## Surface 5 - Routing

| File:line | Note |
| --- | --- |
| `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:44-53` | `DEFAULT_ROLE`: plan -> project-manager, architecture -> software-architect, implement -> backend-developer, review and document-review -> code-logic-reviewer, research -> researcher-expert, tests -> senior-tester, docs -> technical-content-writer, visual-review -> visual-reviewer, design -> ui-ux-designer. |
| `phase-plan.ts:56-57` | `BUILTIN_SUBAGENT_ROLES = new Set(Object.values(DEFAULT_ROLE))`. Derived from the map above. |
| `phase-plan.ts:163,203,315,318` | `hasExplicitRole`, `phase.role ?? DEFAULT_ROLE[phase.kind]`, `BUILTIN_SUBAGENT_ROLES.has(role)`. Logic, no literal slugs. |
| `libs/backend/lane-routing/src/lib/ranking/hard-constraints.ts:45` | "Never on a lane" names visual-reviewer and ui-ux-designer. |
| `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:95` | A subagent executor needs a role. Schema text. |
| `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:184` | Role text. |
| `libs/backend/lane-routing/src/lib/task-kind/decision-model-task-kind-classifier.ts:39` | Role in the prompt. |
| `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:40,688` | Imports `BUILTIN_SUBAGENT_ROLES` and filters roles with it. No literal slugs. |
| `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:32-44` | 13 hits. "Agent slugs" aliases to task kind: pm, architect, team-leader -> plan. backend, frontend, devops -> implement. logic, style, visual reviewer -> review. researcher -> research. tester -> tests. writer, ui-ux -> docs. modernization-detector is not mapped. |
| `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts` | No literal slugs. Its spec has 23 hits. |

## Surface 6 - Orchestration skill text

`.claude/skills/orchestration/**` mirrors `plugins/ptah-core/skills/orchestration/**`. Hit counts are the same in both. Change both copies together. Bucket: skills (commands: docs).

| File:line (same in both copies) | Note |
| --- | --- |
| `orchestration/references/agent-catalog.md` (16 hits) | Lines 70-71 skill-routing rows (ui-ux-designer, technical-content-writer). Lines 117-130 hold the 14-row role table: role, phase file, brief template. |
| `orchestration/SKILL.md:166,251` | Both name `team-leader-modes.md`. |
| `orchestration/references/fleet.md:36` | One hit. |
| `orchestration/references/git-standards.md:113` | One hit. |
| `orchestration/references/lane-assignment.md:75` | One hit. |
| `orchestration/references/strategies.md:269` | "default executor alias `devops-engineer`". |
| `agent-lanes/SKILL.md:111,210` | Role text. |
| `ptah-surface-authoring/SKILL.md:3` | One hit. |
| `tribunal/references/crucible.md:54` | One hit. |
| `technical-content-writer/SKILL.md` (6), `LANDING-PAGES.md` (1) | Skill self-references. |
| `ui-ux-designer/SKILL.md` (3), `DEVELOPER-HANDOFF.md` (2), `PROTOTYPING.md` (2) | Skill self-references. |
| `plugins/ptah-core/commands/orchestrate.md:37,48` and `.claude/commands/orchestrate.md` | Line 48 "**Agents** (13): ...". Line 37 names `team-leader-modes.md`. |
| `.claude/commands/init-saas.md:34`, `plugins/ptah-nx-saas/commands/init-saas.md:34`, `plugins/ptah-dotnet/skills/dotnet-solution-initializer/SKILL.md:32` | "project-manager agent". |

The 12 phase files in `plugins/ptah-core/skills/orchestration/phases/` hold few literal slugs. They are the target for rules of the retired roles.

## Surface 7 - Tests and fixtures (bucket: test)

About 141 files. Main counts:

- `wizard-generation-rpc.handlers.spec.ts` 45, `orchestrator.service.spec.ts` 44, `skills-synthesis-rpc.handlers.spec.ts` 41.
- `user-layer-agent-scope.spec.ts` 33, `template-storage.service.spec.ts` 32, `spec-harvester.service.spec.ts` 31.
- `wizard-agent-origin.store.spec.ts` 29, `template-sharing.guard.spec.ts` 27, `wizard-phase-generation.spec.ts` 27.
- `subagent-tool-allowlist.spec.ts` 25, `subagent-hook-handler.spec.ts` 24, `agent-role-resolver.service.spec.ts` 23.
- `user-layer-seed-quarantine.spec.ts` 21, `harness-manifest.builder.spec.ts` 20, `lane-outcome-recorder.service.spec.ts` 20.
- `wizard-generation.preview-fidelity.spec.ts` 19, `spec-extractor.spec.ts` 17, `agent-namespace.builder.spec.ts` 14.
- `agent-transformers.spec.ts` 13, `opencode-agent-transformer.spec.ts` 13, `agent-model-resolution.spec.ts` 13, `wizard-analysis-runner.service.spec.ts` 13.
- `generated-section-validator.spec.ts` 12, `onboarding-generate.fixtures.ts` 11.
- Routing specs: `hard-constraints.spec.ts` 7, `compile-reasons.spec.ts` 4, `route-decide.gate.spec.ts` 4, `phase-plan.spec.ts` 2, `contracts.spec.ts` 1.
- E2E: `apps/ptah-electron-e2e/src/specs/task-337-agent-card-refresh.spec.ts` 1, `tasks/tasks-list-visual.spec.ts` 7.
- Fixtures: `scripts/agent-usage/__fixtures__/claude-session/subagents/agent-code-logic-reviewer.meta.json`, a `rollout-2026-10-03...jsonl` file, `libs/backend/cli-agent-runtime/.../__fixtures__/grok-p1-*.ndjson` and `grok-p2-*.ndjson`. `libs/shared/project.json:24` is a path to an agent-usage fixture (bucket: other).
- Bench data: `tools/mcp-bench/fixtures/memory-skills/*.jsonl` (6, 5, 2), `tools/mcp-bench/questions/7910f34cf/file-tools.json` (9).
- Other specs in libs/backend and libs/frontend: 1 to 10 hits each.

## Surface 8 - Docs (bucket: docs)

`apps/ptah-docs/src/content/docs/`:

- `agents/built-in-agents.md` 22.
- `agents/index.mdx` 5 (lines 18-27 role groups).
- `agents/agent-orchestration.md` 3 (25, 27, 33).
- `agents/cli-agents.md:123`.
- `mcp-and-skills/popular-skills.md:27,30`.
- `setup/setup-wizard.md:60-61`.
- `templates/creating-templates.md:10,12,22`.
- `templates/index.md:6,16-19`.
- `templates/template-storage.md:16-18,33`.

## Surface 9 - Other

- `content-manifest.json` 28 hits (other).
- `.ptah/analysis/ptah-extension/generation-manifest.json` 56 hits (other).
- `.ptah/analysis/ptah-extension/04-elevation-plan.md` 4 hits (docs).
- `agent-pack-manifest.json` 13 hits (other).
- `tools/role-census/*`: the census tool itself. Not counted.

## Per-step summary

Step 1 - backend-developer, frontend-developer, devops-engineer (implement):
- `DEFAULT_ROLE.implement` (backend-developer) and the `task-kind-mapping.ts` lines for the three roles.
- Catalog entries, recommendation entries, allow-list entries, icon entries, templates, `.claude`, `.codex`, `.opencode` agent files, manifests.
- `agent-catalog.md` implement rows, `strategies.md:269` (devops-engineer alias), docs pages and specs.
- The `DEFAULT_ROLE.implement` change affects `BUILTIN_SUBAGENT_ROLES` and `host-routing.coordinator.ts`.

Step 2 - code-logic-reviewer, code-style-reviewer, senior-tester, visual-reviewer (review and tests):
- `DEFAULT_ROLE` review, document-review, tests, visual-review.
- `lane-spawn-policy.ts:298,302` (`isReviewerOrTester`), `hard-constraints.ts:45`.
- Same catalog, template, generated-agent, manifest, docs and spec surfaces.

Step 3 - project-manager, software-architect, researcher-expert, technical-content-writer, ui-ux-designer, modernization-detector (plan, architecture, research, docs, design):
- `DEFAULT_ROLE` plan, architecture, research, docs, design.
- `hard-constraints.ts:45` (ui-ux-designer), `cli-adapter.utils.ts:428`, `template-partial-resolver.ts:80` (project-manager).
- Skill self-references in `technical-content-writer` and `ui-ux-designer` skills, `init-saas` and dotnet text.
- `modernization-detector` has no routing entry.

Step 4 - team-leader (batch, completion):
- `template-partial-resolver.ts:80-81`, `task-spec.contract.ts` prompt text, `validate-orchestration-skill.ts:141,171,776`.
- `team-leader-modes.md` references in `SKILL.md`, `fleet.md`, `git-standards.md`, `lane-assignment.md`, `orchestrate.md`.
- 16 template hits and 15 codex hits, the largest of any role.

## Shared files touched by more than one step

Merge conflicts are likely here. Order the steps or rebase after each merge.

- `agent-recommendation.service.ts`, `subagent-tool-allowlist.ts`, `setup-rpc.handlers.ts` (one entry per role).
- `agent-marks.ts`, `task-kind-mapping.ts`, `phase-plan.ts`.
- `system-namespace.builders.ts`, `orchestration-namespace.builder.ts`.
- `task-spec.contract.ts`, `validate-orchestration-skill.ts` (the 14-role list at lines 112-125).
- `agent-catalog.md` (both copies), `orchestrate.md` (both copies, "Agents (13)").
- `agent-pack-manifest.json`, `content-manifest.json`, `generation-manifest.json`.
- Docs: `agents/built-in-agents.md`, `agents/index.mdx`, `templates/index.md`, `templates/template-storage.md`.
- `tools/role-census/baseline.json` (every step lowers it).
- Large specs: `wizard-generation-rpc.handlers.spec.ts`, `orchestrator.service.spec.ts`, `skills-synthesis-rpc.handlers.spec.ts`, `template-storage.service.spec.ts`.
- `.claude/skills` and `plugins/ptah-core/skills` copies must stay in sync in every step.
