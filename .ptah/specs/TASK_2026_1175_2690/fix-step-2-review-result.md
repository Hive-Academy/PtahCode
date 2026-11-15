# Phase 4 step 2 review fixes

| Finding | Change |
| --- | --- |
| M-1 | `libs/backend/vscode-lm-tools/src/lib/code-execution/types.ts:2031` adds `invoke-phase` and typed `phaseKind`. `namespace-builders/orchestration-namespace.builder.ts:283,307,331` returns a phase action for QA. Its spec at line 282 checks the result. The namespace help text describes phase actions. |
| m-1 | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1027` resolves the stored phase once for effort and the record. Its spec at line 796 covers a resumed review lane without a new phase. |
| m-2 | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts:113` carries phase kind through CLI options. `claude-cli.adapter.ts:538` uses it for reviewer effort. The adapter spec covers an implement lane with a reviewer name. |
| m-3 | `scripts/validate-orchestration-skill.ts:127,742` checks every retired role alias against its phase kind. |
| m-4 | Both `phases/review.md` copies, lines 17-19, add the three reviewer rules. `step-2-learned-differences.md:7` records why `LLM:REVIEW_FOCUS` was dropped. |
| m-5 | `decisions.md:27` records follow-up F-S2-1 for visual-review reviewer-family separation. |
| n-1 | `lane-spawn-policy.ts:364` says phase kind wins and the name rule applies only without one. |
| n-2 | `libs/shared/src/lib/types/task-spec.contract.ts:115` points to `phases/tests.md`. |
| n-5 | `agent-role-resolver.service.spec.ts:296` checks a custom same-name `senior-tester`. |

No changes were made for n-3, n-4 or n-6. The staged template deletions were kept. Skill discovery found no installed local skill for this backend task.

## Checks

- CLI runtime Jest: role resolver and Claude adapter specs passed, 111 tests. The first manager run found a CLI options type error. After the type fix, the manager spec passed, 256 tests.
- VS Code LM tools namespace Jest: 14 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: passed.
- `npx eslint` on the changed TypeScript files: 0 errors, 14 warnings.
- `npm run validate-skill`: passed, 0 errors and 0 warnings.
- `git diff --no-index -- plugins/ptah-core/skills/orchestration .claude/skills/orchestration`: no output; the directories match. PowerShell maps `diff` to `Compare-Object`, and Bash access was denied, so the exact `diff -r` command could not run.
- `git diff --check`: passed.
