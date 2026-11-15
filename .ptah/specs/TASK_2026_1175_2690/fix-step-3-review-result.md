# Step 3 review fixes

## Findings

1. Restored the original UTF-8 punctuation in `plugins/ptah-core/commands/orchestrate.md:21,30,56` and `.claude/commands/orchestrate.md:21,30,56`. Restored em dashes in `plugins/ptah-core/skills/orchestration/references/agent-catalog.md:117-119,127-129` and its `.claude` mirror at the same lines. Node read and wrote UTF-8 without changing line endings. `git diff HEAD --` on each command file now shows only the intended `Active agent` line at line 48. `git grep -n 'â€' --` over the four files returned no lines (exit 1). `git diff --no-index -- plugins/ptah-core/skills/orchestration .claude/skills/orchestration` and the same command on the two `orchestrate.md` files both returned exit 0. A scan of all 66 paths from `git diff HEAD --name-only` found no `â€`, `â†`, or `Ã` hits in changed files.
2. Replaced the stale card sentence in `apps/ptah-docs/src/content/docs/agents/index.mdx:70` with “See the built-in agent and the phase workflow.”
3. Rewrote the first phase workflow sentence in `apps/ptah-docs/src/content/docs/agents/built-in-agents.md:18` as `plan` -> optional `research` / `design` -> `architecture` -> `team-leader` -> `implement` -> `tests` and `review`. The other “maps to” uses in that section are the intentional alias list at line 20.

`npm run manifest:generate` refreshed `content-manifest.json:4-5` for the repaired shipped files. `npm run manifest:check` confirmed its hash and 224 files.

## Checks

| Command | Exit | Result and log |
| --- | ---: | --- |
| `npm run manifest:generate` | 0 | 224 files; `.ptah/tmp/fix-s3-manifest-generate.log` |
| `npm run manifest:check` | 0 | Manifest current; `.ptah/tmp/fix-s3-manifest-check.log` |
| `npm run validate-skill` | 0 | 21 files, 0 errors, 0 warnings; `.ptah/tmp/fix-s3-validate-skill.log` |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 0 | `.ptah/tmp/fix-s3-role-census.log` |
| `git diff --check HEAD --` seven touched content files | 0 | No whitespace defects. |

Role census buckets: templates 9, skills 72, generated-agents 176, docs 86, test 923, source 111, other 95. Total: 1,472 lines in 270 files; 132 binary files skipped, 0 unreadable.

## Extra files read

`step-3-lane-rules.md`, `step-3-plan.md`, `review-step-3.md`, `.claude/skills/technical-content-writer/SKILL.md`, and the HEAD versions of the changed command files.

## Decisions

Kept the already-written retirement wording and changed only findings 1–3. Kept the role-alias “maps to” wording because it describes aliases correctly. Used Node for UTF-8 reads and writes.

## Not done

No Nx, build, serve, dev, e2e, package, or workspace verify run. No baseline update. No changes for review findings 4–9.

## Needs another batch

None for findings 1–3.
