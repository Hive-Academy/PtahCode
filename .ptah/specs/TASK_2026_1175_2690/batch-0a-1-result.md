# Batch 0a-1 result

Status: checks pending (updated at the end of this file).

## Changed files

- `libs/shared/src/lib/types/retired-roles.ts` (new)
- `libs/shared/src/lib/types/retired-roles.spec.ts` (new)
- `libs/shared/src/index.ts` (export added)
- `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts` (agent rows removed, `phaseKindForRole` fallback, comments)
- `libs/backend/lane-outcomes/src/lib/task-kind-mapping.spec.ts` (14 slugs, unknown slugs)

## Other copies of a role table (candidates for later batches, not changed)

Non-test source, found with `git grep -n "'software-architect'"`:

- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts:54` (agent id list)
- `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:73` (tool allowlist by role)
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:639` (setup agent list)
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:55` (`design: ['software-architect']`, a phase-to-role table)
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts:124` (icon by role)
- `libs/frontend/webview-e2e-harness/.../onboarding-analyze.fixtures.ts:93`, `onboarding-generate.fixtures.ts:54,66,97` (fixtures)
- Doc comments only: `libs/shared/src/lib/types/execution/agent.ts:21`, `stream-background.ts:40,70`, `subagent-registry.types.ts:40`.

The search pattern covers only the slug `software-architect`. Other role tables that omit it are not listed.

## Not done

Nothing from the brief is open. `RETIRED_ROLES` stays empty.

## Checks

NOT RUN. The tool permission layer denied each check command ("requires approval"):

- `node scripts/verify.mjs --exec --task b0a1-shared -- npx jest ... retired-roles.spec.ts`: blocked
- `node scripts/verify.mjs --exec --task b0a1-outcomes -- npx jest ... task-kind-mapping.spec.ts`: blocked
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: blocked
- `npx tsc --noEmit --project libs/backend/lane-outcomes/tsconfig.lib.json`: not tried after the block
- `npx eslint <changed files>`: not tried after the block

The coordinator must run these checks. I did not use another tool to bypass the denial.
The code is untested. Review points: `satisfies` inside `Object.freeze` in `retired-roles.ts`
(needs TypeScript 4.9 or later), and the `PhaseKind` index type of `ROLE_PHASE_ALIASES[key]`.

## Coordinator verification (2026-11-14)

- `retired-roles.spec.ts`: 7/7 pass. `task-kind-mapping.spec.ts`: 33/33 pass (run under the lock).
- `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/lane-outcomes`: 4/4 pass.
- `npm run verify -- --related` for `lane-outcomes`: 134/135 tests pass, 3 suites fail. Not task
  related: 2 suites cannot load `marked` (the worktree has no `node_modules`; `jest.preset.js`
  maps `marked` from the worktree root), and `di/register.spec.ts` expects POSIX paths on
  Windows (known in the PR 1174 test plan). CI is the final proof.
- Code review by the coordinator: table equals the appendix; own-property lookup; the 13 old
  rows keep their task kind; `modernization-detector` now maps to `research`.
