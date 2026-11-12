# Coupling census

Method: one ripgrep alternation of the 14 role names. Counts are matching LINES. Excluded: node_modules, dist, .claude-worktrees, .nx, .ptah/specs, tmp. Class counts marked ESTIMATE come from a sample, not a full read.

## 1 Orchestration skill

Path `.claude/skills/orchestration/**` (9 files, 2,439 lines, 212 role-name lines).

| File | Role lines | Total lines |
|---|---|---|
| SKILL.md | 13 | 244 |
| references/strategies.md | 67 | 628 |
| references/agent-catalog.md | 64 | 159 |
| references/checkpoints.md | 22 | 754 |
| references/task-tracking.md | 21 | 181 |
| references/lane-assignment.md | 13 | 181 |
| references/team-leader-modes.md | 10 | 124 |
| references/fleet.md | 1 | 54 |
| references/git-standards.md | 1 | 114 |

Classes (ESTIMATE, sample of SKILL.md, strategies.md, agent-catalog.md, team-leader-modes.md):

| Class | Meaning | Lines (ESTIMATE) | Example |
|---|---|---|---|
| A | phase labelled by a role title | ~120 | `SKILL.md:43` "PM → architect → team-leader → QA" |
| B | executor selection rule | ~45 | `team-leader-modes.md:88` reviewer family rule; `agent-catalog.md` |
| C | deliverable tied to a role | ~30 | `code-logic-review.md`, `implementation-plan.md`, `batches.md` |
| D | only a Task subagent can do it | ~17 | `SKILL.md:199` "Fresh team-leader per Mode 2/3 call" |

- `team-leader` is the heaviest single name. It is also the state owner of `batches.md` (`task-spec.contract.ts:591,611`).
- Class D is hard to prove by search. No line said "only a subagent" in plain words (grep, 0 hits).

## 2 Source of truth

- `.claude/skills/orchestration` is NOT the only copy. `plugins/ptah-core/skills/orchestration/` has the same 9 files.
- `diff -rq` result: 5 of 9 files differ (SKILL.md, agent-catalog, git-standards, strategies, task-tracking). 4 are identical.
- `plugins/ptah-core/skills/agent-lanes/SKILL.md` differs from `.claude/skills/agent-lanes/SKILL.md`.
- `plugin-loader.service.ts` reads `assets/plugins`. The tree has no `apps/*/assets/plugins` folder, so it is a build output (not in git).
- Specs read `plugins/ptah-core/skills`: `lane-rule-single-home.spec.ts:17`, `surface-catalog-reference.spec.ts:33`. The plugin copy looks like the shipped source.
- Recent commits touch `plugins/ptah-core/skills/orchestration` (`e4119eda3`). Which copy is authored first: OPEN.

| Copy | Path | Files |
|---|---|---|
| Local | `.claude/skills/orchestration/**` | 9 |
| Plugin | `plugins/ptah-core/skills/orchestration/**` | 9 |
| Docs page | `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md` | 1 |
| Agent pages | `.github/agents/*.agent.md` | 14 |

- `agent-lanes`: 2 role lines (local) plus the plugin copy. `tribunal`: 1 line, `references/crucible.md`.
- Validator: `scripts/validate-orchestration-skill.ts` (17 role lines) checks the skill text.

## 3 Other skills

Top files outside orchestration (role-name lines):

| File | Lines |
|---|---|
| .claude/skills/technical-content-writer/SKILL.md | 6 |
| .claude/skills/ui-ux-designer/SKILL.md | 3 |
| .claude/skills/ui-ux-designer/PROTOTYPING.md | 2 |
| .claude/skills/ui-ux-designer/DEVELOPER-HANDOFF.md | 2 |
| .claude/skills/agent-lanes/SKILL.md | 2 |
| .claude/commands/orchestrate.md | 2 |
| .claude/skills/tribunal/references/crucible.md | 1 |

Only 7 files match. Most of the self-name hits in the two design skills are the skill's own name.

## 4 Agent templates

`libs/backend/agent-generation/templates/agents/*.template.md`: all 14 contain at least 2 role-name lines. The counts include the template's own name, so the cross-reference count is lower (not separated).

| Template | Lines | Template | Lines |
|---|---|---|---|
| team-leader | 16 | backend-developer | 3 |
| software-architect | 9 | devops-engineer | 3 |
| technical-content-writer | 7 | frontend-developer | 3 |
| ui-ux-designer | 6 | senior-tester | 3 |
| code-logic-reviewer | 4 | modernization-detector | 2 |
| code-style-reviewer | 4 | researcher-expert | 2 |
| project-manager | 4 | visual-reviewer | 2 |

Total 68 lines. Cross-references only: OPEN (needs a read of each file).

## 5 Code sites

Non-test TypeScript: 43 files, 200 lines.

| Group | Files | Lines |
|---|---|---|
| libs/backend/agent-generation | 10 | 48 |
| libs/shared | 8 | 28 |
| scripts/validate-orchestration-skill.ts | 1 | 17 |
| libs/frontend/chat-ui | 3 | 17 |
| libs/backend/vscode-lm-tools | 2 | 17 |
| libs/frontend/webview-e2e-harness | 3 | 15 (fixtures) |
| libs/backend/rpc-handlers | 2 | 15 |
| libs/backend/lane-outcomes | 2 | 14 |
| libs/backend/lane-routing | 2 | 11 |
| libs/backend/harness-sync | 4 | 10 |
| Others (cli-agent-runtime 3, chat-streaming 2, 3 libs 1 each) | 6 | 8 |

Top sites:

| Site | What it does |
|---|---|
| `scripts/validate-orchestration-skill.ts:109-119,168` | role list; checks skill text and template path |
| `libs/shared/.../task-spec.contract.ts:66-147,591,611` | file contract, comments, specialist prompt text |
| `agent-generation/.../subagent-tool-allowlist.ts:70-82` | tool allowlist per role |
| `agent-generation/.../agent-recommendation.service.ts:78,118` | catalog of agent ids |
| `chat-ui/.../agent-marks.ts:122-134` | icon map per role |
| `rpc-handlers/.../setup-rpc.handlers.ts:600,635,670` | setup wizard agent ids |
| `lane-outcomes/.../task-kind-mapping.ts:13-25` | role to task kind map |
| `lane-routing/.../pipeline/phase-plan.ts` | phase plan (10 lines) |
| `vscode-lm-tools/.../orchestration-namespace.builder.ts` | prompt text and tools (8 lines) |
| `agent-generation/.../core.types.ts` | type unions (6 lines) |
| `harness-sync/.../transform-rules.ts` | agent transform (3 lines) |
| `agent-generation/.../template-storage.service.ts` | template paths (3 lines) |
| `lane-routing/.../hard-constraints.ts` | routing (1 line) |
| `agent-sdk/.../ptah-core-prompt.ts` | prompt text (1 line) |
| `skill-synthesis/.../spec-extractor.ts` | parser (1 line) |

Tests: 137 spec/test files, 934 role-name lines. Fixtures: 3 `*.fixtures.ts` files, 15 lines (already in the 200 above).

## 6 Role-free vocabulary

| Vocabulary | Definition site | Main consumers |
|---|---|---|
| `OUTCOME_TASK_KINDS` = plan, implement, review, research, tests, docs | `libs/shared/src/lib/types/lane-outcome.types.ts:18` | `lane-routing` (score, rotation, task-kind classifier), `chat` capability matrix |
| `PHASE_KINDS` | `lane-routing/src/lib/contracts/route-decide-args.schema.ts:4` | `phase-plan.ts`, `REVIEW_PHASE_KINDS` |
| Role to task kind map | `lane-outcomes/src/lib/task-kind-mapping.ts` | outcome reports (`taskKindSource: 'mapped'`) |
| Task status | `task-spec.contract.ts` (values created, in_progress, in_review, done; line not confirmed) | task tools, close-out |

- `batches.md` executor: the writer in `task-spec.contract.ts:269,404` stores a free `executor?: string`. The docs text says "Recommended executor: CLI lane" (`validate-orchestration-skill.ts:666`). Both a role name and an executor kind can appear. The parser format: OPEN.
- A phase enum for the orchestration workflow does not exist. `PHASE_KINDS` is for routing only.

## 7 Summary table

| Group | Files | Role lines | Class | Size |
|---|---|---|---|---|
| Orchestration skill (local) | 9 | 212 | A, B, C, D | S to M |
| Orchestration skill (plugin copy) | 9 | ~212 (ESTIMATE) | A, B, C, D | S (repeat) |
| agent-lanes, tribunal, commands, 3 skills | 7 | ~18 | A, B | S |
| Docs page and `.github/agents` | 15 | not counted | A | S |
| Agent templates | 14 | 68 | A, C | S to M |
| Validator script | 1 | 17 | C | M |
| Catalog, allowlist, icons, wizard | ~16 | ~110 (ESTIMATE) | catalog | L |
| Task-spec contract and prompts | ~8 | ~28 | C | M |
| Routing and outcome mapping | 4 | 25 | B | M |
| Tests and fixtures | 137 + 3 | 934 + 15 | all | L |

Total: ~224 files, ~1,500 role-name lines (ESTIMATE: sum of measured groups; the 15 docs and agent files are not counted).

## Open points

- Which copy is authored: `.claude` or `plugins/ptah-core`. The 5 differing files need a diff review.
- Class counts in section 1 are ESTIMATE. A full read is needed for exact values.
- The `batches.md` executor parser was not found. Find the reader of the `executor` field.
- Template cross-references need a separate count that excludes the template's own name.
- Status values and the line of the status enum are not confirmed.
