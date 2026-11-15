# Batch 1 A result

## Changed files

- `step-1-learned-differences.md`: audited all Layer A items and seven readable local frontend history bodies in time order. No private content was copied.
- Both copies of `orchestration/phases/implement.md`: added source verification and long-lived UI resource rules.
- Both copies of `orchestration/references/agent-catalog.md`: marked the three roles as retired aliases of `implement` and removed active invocation text.
- Both copies of `orchestration/references/strategies.md`: removed the infrastructure executor alias.
- Both copies of `commands/orchestrate.md`: replaced the active role list with phase routing.
- `scripts/validate-orchestration-skill.ts`: removed the three roles from active template checks and required retired alias rows.
- This report.

The Angular, Nx and DDD skills already contain the needed generic rules. The review phase already checks unsafe rendering and boundary validation. No skill or `CLAUDE.md` edit was needed.

## Checks

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run validate-skill` | 0 | 21 Markdown files; 0 errors, 0 warnings. |
| `diff -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration` | 0 | PowerShell resolved `diff` as `Compare-Object`, so this was not a recursive byte check. |
| Recursive SHA-256 comparison of both orchestration trees | 0 | All 21 files byte-identical. |
| `npx eslint scripts/validate-orchestration-skill.ts` | 0 | No errors; two existing warnings (non-null assertion and file length). |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 1 | `git ls-files failed: undefined`. Node `spawnSync('git', ...)` returned `EPERM` under this sandbox. Direct `git ls-files` worked. No census counts were produced. |

No validate-script spec exists in the workspace, so the requested focused Jest command was not applicable. The validator and lint were rerun after the final alias assertion change; both exited 0.

## Open issue

The parent or integration lane must rerun the official read-only census in an environment that allows Node to spawn Git. No baseline was changed. The `ptah_agent_report` attempt for this blocker was not delivered because the parent inbox was full.
