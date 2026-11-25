# Batch CR-A

| Item | Verdict | Files and lines | Regression test |
| --- | --- | --- | --- |
| CR1 — unset workspace default tier | CONFIRMED | `workspace-llm-resolver.ts:264` | `workspace-llm-resolver.spec.ts:654` checks default and empty selections with distinct Opus and Sonnet tiers, plus both explicit aliases. |
| CR2 — Undo after reload | CONFIRMED | `workspace-llm-resolver.ts:475`, `setup-rpc.handlers.ts:403`, `rpc-skill-judge.types.ts:124`, `providers-settings-state.service.ts:269` | `workspace-llm-resolver.spec.ts:459` checks that the resolver preserves the raw selector. `setup-rpc.handlers.spec.ts:1014` checks status output and `providers-settings-state.service.spec.ts:281` checks the Undo RPC for both direct selectors. |
| CR3 — pending single-key value leaks into batch | CONFIRMED | `file-settings-manager.ts:139`, `:230`, `:297`, `:438`, `:674`, `:727`, `:831` | `file-settings-manager.spec.ts:1545` queues a batch followed by a rejected optimistic write, then checks the committed pair and the original unrelated value after restart. |
| CR4 — partial cache refresh | CONFIRMED | `reactive-settings-store.ts:59` | `settings-core.spec.ts:1446` updates the pair out of band, invalidates only the model, and checks the refreshed slice and cached provider. |
| Minor — external update during rename | DEFERRED | No additional change. At `file-settings-manager.ts:297` the batch takes its snapshot, `:684` can accept an external reload, and `:830` still replaces the file with the earlier snapshot. | Deferred to the cross-process persistence follow-up. |
| Trivial — direct third-party profile duplication | SKIPPED | No change. `workspace-provider-profile-resolver.ts:685` and `:1003` independently build the direct profile. | Optional refactor. |

## PR thread replies

- **CR1** Setup now tries Opus first for the unset workspace default. The regression uses different Opus and Sonnet models and checks that explicit tier selections still resolve to their tier.
- **CR2** Setup status now includes the stored pair alongside the effective pair. After reload, Undo restores the original `apiKey` or `claudeCli` selector. Tests cover both.
- **CR3** Queued writes now build their file image from committed settings. A later single-key write is still visible immediately in memory, and a failed write can no longer leak into the earlier Setup commit. The restart test covers this ordering.
- **CR4** When any requested key is missing, the store now fetches the entire slice in one batch read. The regression checks that an out-of-band update cannot combine an old provider with a new model after partial invalidation.
- **Minor** This is a pre-existing cross-process limit of settings.json and is outside this PR’s scope. It is tracked as a follow-up.
- **Trivial** The endpoint and auth setup are duplicated. This batch leaves the optional refactor open so the strict Setup path and the legacy fallback can be reviewed independently.

## Checks run

Each focused Jest command below ran with `--runInBand --coverage=false --runTestsByPath`. The regression tests failed before the fixes with the expected assertions. Output is in `.ptah/tmp/cr-a-red-0.log` through `.ptah/tmp/cr-a-red-4.log`.

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.spec.ts` | 37 passed. `.ptah/tmp/cr-a-retry-auth.log` |
| `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/file-settings-manager.spec.ts libs/backend/platform-core/src/file-settings-manager.error-paths.spec.ts libs/backend/platform-core/src/file-settings-manager.cross-process.spec.ts` | 97 passed (three suites). `.ptah/tmp/cr-a-check-1.log` |
| `npx jest --config libs/backend/settings-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/settings-core/src/settings-core.spec.ts` | 52 passed. `.ptah/tmp/cr-a-check-2.log` |
| `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` | 131 passed. `.ptah/tmp/cr-a-check-4.log` |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts` | 76 passed on retry. `.ptah/tmp/cr-a-retry-rpc.log` |
| `npx eslint libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts libs/backend/platform-core/src/file-settings-manager.ts libs/backend/settings-core/src/reactive/reactive-settings-store.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.spec.ts libs/backend/platform-core/src/file-settings-manager.spec.ts libs/backend/settings-core/src/settings-core.spec.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` | 0 errors, 17 warnings. `.ptah/tmp/cr-a-check-5.log` |
| `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | `TOTAL 0` unsuppressed sites. `.ptah/tmp/cr-a-check-6.log` |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` | Passed. `.ptah/tmp/cr-a-tsc-auth-providers.log` |
| `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json` | Passed. `.ptah/tmp/cr-a-tsc-platform-core.log` |
| `npx tsc --noEmit --project libs/backend/settings-core/tsconfig.lib.json` | Passed. `.ptah/tmp/cr-a-tsc-settings-core.log` |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` | Passed. `.ptah/tmp/cr-a-tsc-rpc-handlers.log` |
| `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` | Passed. `.ptah/tmp/cr-a-tsc-core.log` |
| `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` | Passed. `.ptah/tmp/cr-a-tsc-shared.log` |

`ptah_get_diagnostics` was scoped to the 11 changed files. The first request exceeded its 45-second response window, and the cached result reported the 1,024 MB compiler limit. Per-project `tsc` checks were used as the fallback.

The first post-fix auth resolver run found a TS2339 in the lane’s new type. The local resolution now splits the existing success shape by its discriminant. The rerun passed. The first post-fix Setup RPC suite was blocked before test execution by CR-B’s in-progress `pairConfigured` edit (TS2353 at `skill-ranking-caller.service.ts:174`). The retry passed.

## Decisions

- **CR1.** Use the workspace default tier order for Setup when no pair is stored. D7 requires the workspace model, and `workspace-provider-profile-resolver.ts:1247` applies the workspace tier ladder. A Setup-specific ladder has no binding decision. The tier change is reversible.
- **CR2.** Carry the raw pair from the resolver's original read, expose it through the get RPC, and consume it as the loaded Undo baseline. This avoids a second settings read after asynchronous resolution. The effective pair stays in the established status field. The RPC addition is optional for compatibility with existing responses and can be rolled back as one change.
- **CR3.** Use a committed image for serialized writes and retain optimistic single-key reads. Moving the visible mutation into the queue would conflict with D22. The post-rename snapshot also gives single-key failures a committed rollback value. The change is local to the file manager and reversible.
- **CR4.** Refresh the requested slice together on a cache miss. A missing-key-only refresh mixed values from two snapshots. The change is local and reversible.
- **Minor.** The coordinator deferred a cross-process write protocol to a follow-up. A fresh read can reduce the window, while shared coordination across read, merge and rename is needed for a guarantee among participating writers.
- **Trivial.** Leave the optional extraction out of the correctness patch. The two paths have different admission and model handling. This can be revisited independently.

## Extra reads

- `workspace-provider-profile-resolver.ts` direct profile blocks and legacy model ladder, for the optional finding and CR1 comparison.
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` Setup RPC result declarations, the authorized shared contract for CR2.
- `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:154–181`, named by the first post-fix RPC suite’s TS2353. The coordinator confirmed it belonged to CR-B.
- `file-settings-manager.error-paths.spec.ts` overlapping single-key rollback cases, to check existing expectations for CR3.
- Symbol text search located existing `WizardGetSetupModelResult` declarations and fixture references in `rpc.types.ts`, `onboarding-analyze.fixtures.ts`, and `settings.fixtures.ts`, and `ReactiveSettingsStore` references in `workspace-scope-resolver.spec.ts`, `index.ts`, `settings-store.interface.ts`, `electron-settings-registration.ts`, `cli-settings-registration.ts`, and `tasks-rpc.views-durability.spec.ts`. Those files were not opened.
- `ptah_search_files` returned zero hits for the combined task input pattern and for a colocated reactive-store spec. The task input paths supplied in the assignment and the existing `settings-core.spec.ts` supplied the needed files. The session exposed no skill catalogue or skill loader.
