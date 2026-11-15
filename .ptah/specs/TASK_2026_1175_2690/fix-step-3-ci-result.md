# Step 3 CI fix result

## Root causes

- The generator at scripts/generate-content-manifest.js:146-150 hashes raw bytes. Two plugin Markdown worktree files had CRLF, while HEAD blobs had LF. The old hash was sha256:d626ff92... and the Git blob hash was sha256:53232238.... No generator defect was found.
- Rebase clone selected retired software-architect and was refused before upstream file resolution.
- Wizard preview selected retired software-architect and project-manager built-ins. Their deleted templates could not yield the expected rival copies. The exact path and count assertions remain after selecting active team-leader and custom reviewer.
- The guard spec assumed RETIRED_ROLES was empty. Its sample is now retired and correctly refused.

## Files changed

- content-manifest.json:4-5: regenerated hash and timestamp.
- libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.spec.ts:1291-1308: active team-leader fixture and .md path.
- libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts:582,633,650,705,732,775,813: active team-leader and custom reviewer fixtures; assertions retained.
- libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/retired-role-guard.spec.ts:46-60: default predicate allows team-leader and refuses a retired role.
- plugins/ptah-dotnet/skills/dotnet-solution-initializer/SKILL.md and plugins/ptah-nx-saas/commands/init-saas.md: Node fs converted CRLF worktree bytes to LF. Git reports i/lf w/lf attr/text=auto eol=lf. Git diff --exit-code is 0 for both, so there is no Git content diff.

## Checks

| Command | Exit | Result |
| --- | ---: | --- |
| npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath, three reported specs | 0 | 3 suites, 177 tests passed |
| Same RPC Jest config, setup and subagent specs | 0 | 2 suites, 121 tests passed |
| Same Jest pattern, vscode-lm-tools config, two specs | 0 | 2 suites, 24 tests passed |
| Same Jest pattern, harness-sync config, slug-rules spec | 0 | 1 suite, 17 tests passed |
| Same Jest pattern, cli-agent-runtime config, cli-adapter spec | 0 | 1 suite, 106 tests passed |
| npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json | 0 | No diagnostics |
| npx eslint on three changed TypeScript specs | 0 | No findings |
| npm run manifest:generate | 0 | 224 files |
| npm run manifest:check | 0 | 224 files; sha256:53232238bb3ba7ccfaa80819cfdb6ff90939842198505af8cfd8533cf1479dc5 |
| Git blob audit in .ptah/tmp/fix-ci-audit.cjs | 0 | Same hash from git show HEAD blobs; zero disk/blob mismatches |
| npm run validate-skill | 0 | 21 files, 0 errors, 0 warnings |
| npx ts-node --transpile-only tools/role-census/check-role-census.ts | 0 | templates 9, skills 72, generated-agents 176, docs 86, test 922, source 111, other 95; total 1471 lines in 271 files |
| npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts | 0 | 221 unsuppressed sites, within baselines |
| git diff --no-index -- plugins/ptah-core/skills/orchestration .claude/skills/orchestration | 0 | Identical trees |
| git diff --exit-code -- two normalized plugin files | 0 | No Git content changes |

Logs are under .ptah/tmp/fix-ci-*.log. The audit reads all 224 manifest paths with git show HEAD:<path>, hashes each relative path and Git blob bytes in manifest order, and compares the result with contentHash. This proves the Linux Git content yields the new hash.

## Other specs examined

Searched spec and fixture paths outside agent generation for all six retired slugs. Setup RPC checks the roles are absent from active choices; subagent RPC uses a historical record. Both passed. VS Code LM tools refer to retained skills or mocked provider roles and passed. Harness slug rules and CLI lane policy passed. Frontend chat, command center, and shared parser references are historical display or event fixtures. Electron e2e references were inspected but not run under lane rules. No other active built-in template selection was found.

## Decisions

- Kept the generator unchanged because raw-byte hashing is intentional.
- Kept retained skills, legacy references, retired guard coverage, and preview fidelity assertions.
- Local skill discovery found no matching testing skill. UI and Nx architecture skills do not cover this fixture-only batch.

## Not done

- No Nx, build, serve, dev, e2e, package, or workspace verify target was run, per lane rules.
- No commit, push, or baseline update was made.

## Needs another batch

None.
