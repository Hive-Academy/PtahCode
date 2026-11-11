# Review thread fixes

| Thread | Verdict | Files changed | Test added |
| --- | --- | --- | --- |
| 819 | Correct | `harness-rpc.handlers.ts`, `harness-rpc.handlers.spec.ts` | Global plugin and skill disables |
| 828 | Correct | `harness-rpc.handlers.ts`, `harness-rpc.handlers.spec.ts` | Nested workspace root |
| 821 | Correct; same root cause as 819 | `harness-rpc.handlers.ts`, `harness-rpc.handlers.spec.ts` | Covered by global disable cases |

## Verification

`npm run verify -- -p rpc-handlers` (PowerShell output filter: `Select-Object -Last 40`): exit code **0**. Lint and typecheck: **2/2 tasks passed**. Test: **1/1 task passed**, **243/243 suites passed**, **6,457 tests passed**, **8 skipped**, **6,465 total**. `git diff --check` passed.

## Decisions

- Threads 819 and 821 are duplicate valid findings. `PluginConfigSourceResolver` reads `getEffectivePluginConfig` at `libs/backend/harness-sync/src/lib/sources/plugin-config-source-resolver.ts:270`. The handler now uses the same layered read to gate bundled plugin enablement (`harness-rpc.handlers.ts:935-943`) and skill availability (`:824-836`). Effective overlay paths and disabled skill IDs determine which discovered skills can be named in the seed prompt. Descriptor IDs prevent a same-slug skill from another source passing the filter.
- Thread 828 is valid. The skill selection service normalizes at `libs/backend/rpc-handlers/src/lib/harness/selection/harness-skill-selection-rpc.service.ts:192`. The handler now normalizes before `SkillSyncGate.resolve` (`harness-rpc.handlers.ts:823,839`).
- Regression cases are in `harness-rpc.handlers.spec.ts:861,888,912`.

## Open

None. The supplied `review-open-threads.md` was already untracked before this work and was left untouched. No files outside `libs/backend/rpc-handlers/**` and this report were changed.
