# Batch 3 D result

## Files changed

- `libs/backend/agent-generation/templates/agents/`: six retired role templates deleted with `git rm`; deletions remain staged. `team-leader.template.md` remains.
- `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts:79` and `.spec.ts:118`: only `team-leader` receives the coordinator task-spec block.
- `libs/backend/agent-generation/src/lib/services/template-sharing.guard.spec.ts:52,1038,1115,1163`: the corpus and partial guards cover the surviving template. The deleted architect reference block and designer delegation test were removed.
- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts:22`: on-disk roster no longer filters retired templates.
- `libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts:1006,1207,2433`, `invocable-plugin-skills.spec.ts:70`, and `orchestrator.service.spec.ts:1512,1556,1824`: known active built-in fixtures use `team-leader`. Custom same-name and legacy-read fixtures remain.
- `libs/backend/agent-generation/src/lib/interfaces/template-storage.interface.ts:59`, `services/orchestrator.service.ts:1286`, `services/template-storage.service.ts:228`, `types/core.types.ts:37`, `types/wizard.types.ts:37`: active examples use `team-leader`.
- `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:684` and `libs/frontend/chat-ui/src/lib/molecules/background-agent-strip.component.ts:49`: example labels use `team-leader`; legacy event display remains. No Angular template changed.
- `scripts/validate-orchestration-skill.ts:116`: active roster requires only `team-leader`; alias rows still derive from `RETIRED_ROLES`.
- `apps/ptah-docs/src/content/docs/agents/{agent-orchestration.md,built-in-agents.md,cli-agents.md,index.mdx}` and `setup/setup-wizard.md`: explain phase workflow and the surviving built-in agent.
- `apps/ptah-docs/src/content/docs/templates/{creating-templates.md,index.md,template-storage.md}`: use active or generic examples and show the current storage layout.
- `.claude/commands/init-saas.md:34` and `plugins/ptah-nx-saas/commands/init-saas.md:34`: both copies direct users to the `plan` phase. The requested `plugins/ptah-core/commands/init-saas.md` path does not exist; the matching plugin copy is under `ptah-nx-saas`.
- `plugins/ptah-dotnet/skills/dotnet-solution-initializer/SKILL.md:32`: directs users to the `plan` phase. No `.claude/skills` mirror exists.
- `agent-pack-manifest.json:9`: programmatically filtered the roster against surviving template stems; no generator script exists. `content-manifest.json` regenerated with `npm run manifest:generate`.

## Checks

- `npm run manifest:generate`: exit 0; `npm run manifest:check`: exit 0, 224 files and current content hash. Logs: `.ptah/tmp/batch-d-manifest-{generate,check}.log`.
- Role census: exit 0. Buckets: templates 16, skills 72, generated-agents 176, docs 86, test 923, source 111, other 95. All are within requested ceilings. Log: `.ptah/tmp/batch-d-census.log`.
- `npm run validate-skill`: exit 0, 21 files, 0 errors, 0 warnings. Log: `.ptah/tmp/batch-d-validate-skill.log`.
- Degradation audit: exit 0, 221 unsuppressed sites within baseline. Log: `.ptah/tmp/batch-d-degradation.log`.
- PowerShell aliases `diff` to `Compare-Object`, so `diff -r` did not compare directory contents. `git diff --no-index -- plugins/ptah-core/skills/orchestration .claude/skills/orchestration`: exit 0, no output. Log: `.ptah/tmp/batch-d-skill-diff-git.log`.
- Agent-generation library and spec `tsc --noEmit`: exit 0 each. Focused Jest across seven named specs: initial run found stale retired-role expectations; after fixes, five suites passed with 123 tests, and the other two suites passed with 193 tests. Logs: `.ptah/tmp/batch-d-agent-jest-{final,fix}.log`.
- Chat-streaming and chat-ui library `tsc --noEmit`: exit 0 each. No frontend spec changed.
- ESLint on 15 changed TypeScript files: exit 0, 0 errors, 220 warnings (existing style and file-size warnings). Log: `.ptah/tmp/batch-d-eslint.log`.
- Ptah diagnostics was attempted for two changed files but timed out before returning a result. The direct TypeScript checks above passed.

## Remaining role-name hits

The requested final `git grep` returned hits in these groups. See `.ptah/tmp/batch-d-final-grep.log` for file:line detail.

| File group | Hits | Class |
| --- | ---: | --- |
| `libs/**/**/*.spec.ts` | 80 | Legacy read, custom same-name agent, historical fixture, and retired-role guard tests |
| `libs/**/__fixtures__` and frontend fixture files | 8 | Historical fixtures |
| `libs/shared` | 23 | Alias table and compatibility contracts |
| `plugins/**/skills` and `.claude/skills` | 46 | Skill names, required skill names, and alias catalog rows |
| `apps/ptah-docs` | 3 | Phase alias documentation and skill listing |
| `libs/frontend/chat-ui/.../prompt-catalogue.ts` | 2 | Skill invocation examples |
| `libs/backend/cli-agent-runtime/.../cli-adapter.utils.ts` | 1 | Skill-name example in lane policy |
| `libs/backend/agent-generation/templates/agents/team-leader.template.md` | 4 | Active references; follow-up required below |

Tracked generated agents and old event names remain supported. No other active role use was found in this sweep.

## Extra files read

`step-3-lane-rules.md`, `step-3-plan.md`, batch A/B/C results, `step-3-learned-differences.md`, `.claude/skills/angular-frontend-patterns/SKILL.md`, step-2 commit diff for `agent-pack-manifest.json`, manifest scripts and package scripts, and scoped source/spec/doc files in this report.

## Decisions

- The prompt catalogue entries `/ui-ux-designer` and `/technical-content-writer` call skills with those names, so they stay.
- The source examples changed only comments and documentation; legacy event display and generic avatar behavior stay.
- The active template hygiene test now verifies the deleted partial stays absent. Its architect reference block no longer exists.

## Not done

- No rendered UI screenshot: no Angular template changed, and build/serve targets are prohibited by lane rules. Visual quality was not inferred from source checks.

## Needs another batch

- `libs/backend/agent-generation/templates/agents/team-leader.template.md:141`: replace `researcher-expert` fallback with the `research` phase.
- `libs/backend/agent-generation/templates/agents/team-leader.template.md:422-423`: replace `researcher-expert` with `research` and `software-architect` with the `architecture` phase; preserve the Gate 2 distinction.
- `libs/backend/agent-generation/templates/agents/team-leader.template.md:524`: replace `researcher-expert` with `research` and `software-architect` with `architecture`.
- This template was explicitly excluded from batch D edits. It is the remaining active-role wording found by the final sweep.
