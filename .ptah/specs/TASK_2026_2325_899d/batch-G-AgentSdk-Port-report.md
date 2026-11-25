# Batch G-AgentSdk-Port report (wave W2, TASK_2026_2325_899d)

## Files changed

- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` — added
  `ResolvedSetupSnapshot`, `SetupResolution`, and `resolveSetup` on
  `IWorkspaceLlmResolver`. Declaration only, no implementation.
- `libs/backend/agent-sdk/src/index.ts` — added `ResolvedSetupSnapshot` and
  `SetupResolution` to the existing type-export block of the port.
- `libs/backend/agent-sdk/src/lib/commit-message/commit-message-generator.service.spec.ts`
  — `makeResolver` mock gains `resolveSetup: jest.fn()`. No test behavior changed.
- `libs/backend/cron-scheduler/src/lib/job-runner.spec.ts` — `workspaceLlm` mock
  gains `resolveSetup: jest.fn()`; Harness field type widened to include it. No
  test behavior changed.

## Plan items done

- Plan lines 77-78 (component 2): `resolveSetup(workspaceRoot: string |
  undefined): Promise<SetupResolution>` added to `IWorkspaceLlmResolver`
  (plan line 258 row, write file 1). Doc comment states the strictness policy
  (never reads chat-tab `overrideModel` / chat picker, never substitutes another
  workspace's provider) per plan line 77 / D6.
- `ResolvedSetupSnapshot = WorkspaceLlmSnapshot & { readonly auth:
  OneShotAuthOverride }` per plan line 78 (auth mandatory, prevents
  process-auth fallback).
- `SetupResolution = { kind: 'set' | 'unset'; snapshot: ResolvedSetupSnapshot } |
  Extract<SetupPairState, { kind: 'invalid' | 'unavailable' }>` — the failure
  variants are exactly the shared `SetupPairState` failure variants (plan line
  41: same `source`, `provider`, `model`, `cause` fields as plan line 78).
- New public types exported from `libs/backend/agent-sdk/src/index.ts`.
- Both named spec mocks updated so they still satisfy the interface.

## Check commands and results

- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — PASS
  (no output).
- `npx tsc --noEmit --project libs/backend/cron-scheduler/tsconfig.lib.json` —
  PASS (no output).
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand
  --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/commit-message/commit-message-generator.service.spec.ts`
  — PASS: 1 suite, 28 tests.
- `npx jest --config libs/backend/cron-scheduler/jest.config.ts --runInBand
  --coverage=false --runTestsByPath libs/backend/cron-scheduler/src/lib/job-runner.spec.ts`
  — PASS: 1 suite, 15 tests. (First run failed to load: the worktree had no
  `node_modules`, so the jest preset's `^marked$` mapping to
  `node_modules/marked/lib/marked.umd.js` could not resolve — an environment
  issue, not a code issue. Fixed by creating the same symlink every sibling
  worktree uses: `skill-judge/node_modules ->
  /home/amun/ptah-extension/node_modules`. The spec then passed unchanged.)
- `npx eslint <the 4 changed files>` — PASS (no findings).
- Extra (not required, run to confirm the break list below):
  `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` — 3
  errors, all in the two unowned curator-llm spec files listed below; none in
  my files.

## Decisions

1. Failure variants derived, not duplicated.
   - Decision: `SetupResolution` failure arm is
     `Extract<SetupPairState, { kind: 'invalid' | 'unavailable' }>` imported
     from `@ptah-extension/shared`.
   - Options: (a) re-declare the `invalid`/`unavailable` variants inline with
     copied `cause` unions; (b) derive from the shared type.
   - Evidence: plan line 78's failure fields (`source`, `cause`, `provider`,
     `model`) are field-identical to `SetupPairState`'s failure variants (plan
     line 41, `rpc-skill-judge.types.ts:12-31`); the brief says to use
     `SetupPairState`/`ModelPair` from `@ptah-extension/shared` where the plan
     uses them. Deriving keeps one source of truth for the `cause` unions, and
     a failure value is directly assignable to `SetupPairState` for the
     surfaces that map resolution to state.
   - Reversible: yes — replacing `Extract<...>` with inline variants is a
     type-only change.
2. `resolveSetup` parameter is `workspaceRoot: string | undefined`.
   - Options: (a) `path: string` as the plan's pseudo-signature literally reads;
     (b) mirror the sibling `resolveForPath(workspaceRoot: string | undefined)`
     port convention.
   - Evidence: plan line 77 writes `resolveSetup(path)` loosely; the port's own
     `resolveForPath` (this file, before my change) takes
     `workspaceRoot: string | undefined` so rootless callers resolve app-/global
     scope. Interface method parameters are bivariant in TypeScript, so an
     implementer declaring `path: string` still satisfies the port either way;
     the wider signature is the safe superset.
   - Reversible: yes.

## Open items and needed changes in other groups

- `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.spec.ts`
  (lines 1296 and 1567) and
  `.../sdk-internal-query.curator-llm.provider-session.spec.ts` (line 105):
  fresh `{ resolveForPath }` literals passed to the `SdkInternalQueryCuratorLlm`
  constructor (param typed `IWorkspaceLlmResolver | null`,
  `sdk-internal-query.curator-llm.ts:251`). They now fail type-check with
  "Property 'resolveSetup' is missing" (confirmed with tsc on
  `agent-sdk/tsconfig.spec.json`). These files are NOT in any batch group row I
  was shown (plan lines 254-264); the coordinator needs to add
  `resolveSetup: jest.fn()` to those three literals or assign the files to a
  lane. I did not edit them.
- `libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts:50` —
  `WorkspaceLlmResolver implements IWorkspaceLlmResolver` now misses
  `resolveSetup`, so `auth-providers` fails type-check until wave-2 batch
  `G-Setup-Scope-Resolver` implements it (their planned write file). Expected
  interim break; listed for completeness.
- Verified NOT broken (checked each, no edit needed): `as IWorkspaceLlmResolver`
  cast in `harness-llm-runner.service.spec.ts:52` (cast stays legal because the
  interface remains assignable to the partial object type); `as never` casts in
  `content-generation.service.spec.ts:194,2152,2351`,
  `multi-phase-analysis.service.spec.ts:248`, and
  `enhanced-prompts.service.spec.ts:160-170` (spread with
  `as unknown as ConstructorParameters<...>`); all pure consumers
  (`job-runner.ts`, `commit-message-generator.service.ts`,
  `sdk-internal-query.curator-llm.ts`, `harness-llm-runner.service.ts`,
  `di/tokens.ts`, agent-generation services) that only call `resolveForPath`
  on an injected `IWorkspaceLlmResolver`.
- Environment fix applied (git-ignored, matches sibling-worktree convention):
  `node_modules` symlink in the `skill-judge` worktree. Without it, every jest
  run in this worktree whose import graph reaches `marked` fails on the preset's
  `^marked$` moduleNameMapper absolute path.

## Extra reads (outside my write set, read-only)

- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` (SetupPairState shape).
- `libs/backend/agent-sdk/jest.config.ts`, `jest.preset.js` (marked mapping).
- `libs/backend/cron-scheduler/src/lib/job-runner.ts` (consumer; param :113).
- `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.ts`
  (constructor param type :251).
- Spec files inspected read-only for the break list: `harness-llm-runner.service.spec.ts`,
  `enhanced-prompts.service.spec.ts`, `multi-phase-analysis.service.spec.ts`,
  `content-generation.service.spec.ts`, both curator-llm specs,
  `workspace-llm-resolver.ts` (auth-providers).
