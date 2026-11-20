# Batch R01d report

Both LOW defects from batch-R01c Round 2 are fixed. All requested focused checks pass.

## Changes

- `libs/backend/bots/src/lib/bot-application.service.ts:539` retains the existing skill-specific unknown-state calculation (`unavailable`, `SKILLS_UNAVAILABLE`, or `SKILLS_PARTIAL`). At `:554`, a missing newly added skill is rejected only when skills are verified; that branch now always returns `INVALID_PARAMS` / `Choose an installed skill.` An unrelated partial catalog no longer produces `PERSISTENCE_UNAVAILABLE`. Unknown skills retain the existing warning/save behavior.
- `libs/backend/bots/src/lib/bot-application.skills.spec.ts:5` adds two regression cases: healthy catalog and partial catalog with `MODELS_UNAVAILABLE` from a timed-out model lookup, both with successful skill discovery. A missing new skill must yield `INVALID_PARAMS` and must not call repository save.
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts:55` defers timer creation until `startDeadline()` inside the cleanup-protected `try` at `:227`. CLI filtering and task creation now occur inside that same `try`; `finally` at `:273` releases the timer even if synchronous setup fails. The registry task retains access to the selected runtime through the typed local at `:142`. The shared 8-second deadline and parallel discovery behavior remain covered by existing tests.
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts:90` forces a synchronous selection getter failure during task setup and verifies the original rejection and zero remaining timers.

The existing 696-line `bot-application.service.spec.ts` is unchanged; the separate skills spec uses the explicitly allowed overflow exception. Changed file lengths: service 651, skills spec 58, adapter 374, adapter spec 519 lines. No other implementation files were written.

## Focused checks

All commands ran from `D:\projects\ptah-extension\.claude-worktrees\bots-phase-1`.

| Command                                                                                                                                                                                                                                                               | Final result                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/lib/bot-application.skills.spec.ts`                                                 | Exit 0; 2 suites, 26 tests passed. Existing healthy-catalog and unverified-skill behavior passed.               |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts`                                                                                         | Exit 0; 1 suite, 19 tests passed, including existing deadline tests and the new synchronous-failure regression. |
| `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`                                                                                                                                                                                                      | Exit 0; no diagnostics.                                                                                         |
| `npx tsc --noEmit --project libs/backend/bots/tsconfig.spec.json`                                                                                                                                                                                                     | Exit 0; no diagnostics.                                                                                         |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`                                                                                                                                                                                              | Exit 0; no diagnostics.                                                                                         |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`                                                                                                                                                                                             | Exit 0; no diagnostics.                                                                                         |
| `npx eslint libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-application.skills.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts`           | Exit 0; no diagnostics.                                                                                         |
| `npx prettier --check libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-application.skills.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts` | Exit 0; all matched files use Prettier style.                                                                   |

Total final Jest result: 45 tests passed across 3 suites.

## Tooling and intermediate results

- The first adapter Jest attempt failed with TS2304 because moving CLI setup also moved the runtime local out of the registry task's scope. The typed shared runtime local fixes this; the rerun and both rpc-handlers TypeScript projects pass.
- Adapter Jest emitted a non-fatal Node warning about loading the TypeScript Jest configuration as an ES module. Tests subsequently passed using the requested `.ts` configuration.
- Ptah AST inspection succeeded. Ptah dependent lookup succeeded with explicitly incomplete graph coverage. Initial calls using `filePath` were rejected; corrected calls used `file`.
- Scoped `ptah_get_diagnostics` reported its compiler check still running after 45 seconds and marked all four files unchecked. The four direct, sequential `npx tsc` checks above provide the requested compiler evidence instead; no clean Ptah diagnostics result is claimed.
- CLI skill discovery was unavailable as a dedicated mechanism. Native filesystem discovery found no matching skill for this narrow host-neutral TypeScript defect fix. The available agent-lanes instructions were inspected; no agent was spawned and no parent action was needed.
- Native filesystem reads and edits supplemented Ptah inspection. No git commands, Nx commands, npm verify, build, serve, dev, e2e, or package targets were run.

No implementation or verification requirement remains open. Electron packaging and runtime capture were outside this batch's permitted checks.
