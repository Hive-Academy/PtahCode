# Batch Report — G-Generation-Service (Wave W4, TASK_2026_2325_899d)

## Summary
Completed batch `G-Generation-Service` (`@ptah-extension/agent-generation`) for `TASK_2026_2325_899d`. Threaded ephemeral `setupSnapshot?: ResolvedSetupSnapshot` through `OrchestratorGenerationOptions` and `ContentGenerationSdkConfig` into `AgentGenerationOrchestratorService` and `ContentGenerationService`, bypassing `workspaceLlm.resolveForPath` and ignoring conflicting `model` overrides whenever a launch snapshot is supplied, while preserving existing behavior for all callers that omit `setupSnapshot`. Added Set, Unset (TD 2.5 with conflicting chat-picker and chat-tab overrides), mid-run stability / per-launch auth isolation, and launch-pair error attribution specs in both test files.

## Files changed (6)
1. `libs/backend/agent-generation/src/lib/types/core.types.ts`
   - Imported `type { ResolvedSetupSnapshot } from '@ptah-extension/agent-sdk'`.
   - Added optional ephemeral `setupSnapshot?: ResolvedSetupSnapshot` to `OrchestratorGenerationOptions` (explicitly documented as never persisted or logged).
2. `libs/backend/agent-generation/src/lib/interfaces/content-generation.interface.ts`
   - Imported `type { ResolvedSetupSnapshot } from '@ptah-extension/agent-sdk'`.
   - Added optional ephemeral `setupSnapshot?: ResolvedSetupSnapshot` to `ContentGenerationSdkConfig`.
3. `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts`
   - Threaded `options.setupSnapshot` into `ContentGenerationSdkConfig` inside `produceAgents` (lines 812-822); when `options.setupSnapshot` is present, `sdkConfig.model` is omitted so no conflicting legacy/client model leaks into content generation. When `options.setupSnapshot` is absent, `sdkConfig.model` keeps its prior pass-through behavior.
   - Added `formatLaunchPairSuffix` so run-level errors returned by `generateAgents` name the non-secret launch pair `(<providerId>/<model>)` when `options.setupSnapshot` is present (and keep exact prior messages when absent), without ever logging or persisting `setupSnapshot` or `auth`.
4. `libs/backend/agent-generation/src/lib/services/content-generation.service.ts`
   - Replaced unconditional `this.workspaceLlm.resolveForPath(...)` in `fillDynamicSections` with `sdkConfig?.setupSnapshot ?? (await this.workspaceLlm.resolveForPath(context.rootPath, { requestedModel: sdkConfig?.model }))`. When `setupSnapshot` is supplied, `workspaceLlm.resolveForPath` is never called, `sdkConfig.model` is ignored, and `internalQueryService.execute` receives exact `setupSnapshot.model` and isolated `setupSnapshot.auth` (never falling back to process-wide `AuthEnv`).
   - Added non-secret `{ provider, model }` metadata to SDK failure warnings and outer `ContentGenerationError` messages/logs when `sdkConfig?.setupSnapshot` is present, never logging `auth`.
5. `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts`
   - Added 3 unit tests covering:
     - Set fixture threading `setupSnapshot` to every agent in a multi-agent run, dropping conflicting `options.model`, and verifying zero leakage of `auth` into summary, written files, or logs.
     - Unset fixture (TD 2.5) with separate concrete workspace snapshot alongside conflicting chat-picker and chat-tab override models.
     - Per-launch isolation across consecutive runs and launch-pair naming on run failure without leaking credentials.
6. `libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts`
   - Added 4 unit tests under `setupSnapshot dispatch (Set and Unset Setup pair)` covering:
     - Set fixture differing from workspace, chat picker, and chat tab override (bypasses `resolveForPath`, dispatches exact `model` and `auth`).
     - Unset fixture (TD 2.5) with conflicting chat-picker `currentModel` AND conflicting chat-tab `overrideModel` (`!== wsModel && !== pickerModel`), verifying both are ignored and exact concrete workspace `(provider, model, auth)` is dispatched without process-auth fallback.
     - Mid-run snapshot stability when workspace settings change mid-run and per-launch auth isolation between consecutive launches.
     - Failure after valid start naming launch pair in warnings and errors without logging credentials.

## Plan items done
- **Plan lines 145, 155, 268 (`G-Generation-Service`):** Threaded `setupSnapshot?: ResolvedSetupSnapshot` through `OrchestratorGenerationOptions` (`core.types.ts`) and `ContentGenerationSdkConfig` (`content-generation.interface.ts`) via `AgentGenerationOrchestratorService.produceAgents` (`orchestrator.service.ts`) into `ContentGenerationService.fillDynamicSections` (`content-generation.service.ts`), bypassing `workspaceLlm.resolveForPath` and pinning isolated `auth` to the single attempt without persisting or logging `setupSnapshot`/`auth`.
- **Plan lines 225-233 (Pair and chat-picker test matrix — Generation column) & line 577 (TD 2.5 Unset Setup):** Covered Set fixture, separate Unset fixture with conflicting chat-picker AND conflicting tab-override models, mid-run stability vs between-launch isolation, and launch-pair naming on failure in both `orchestrator.service.spec.ts` and `content-generation.service.spec.ts`.
- **Backwards compatibility for callers without `setupSnapshot`:** No behavior change for any caller omitting `setupSnapshot` — `orchestrator.service.ts` continues forwarding `options.model` and emitting identical error strings, and `content-generation.service.ts` continues resolving via `workspaceLlm.resolveForPath(context.rootPath, { requestedModel: sdkConfig?.model })`.

## Check commands and results
1. **Scoped Jest specs** (after final edit):
   ```bash
   npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts
   ```
   - Result: **PASS** — `Test Suites: 2 passed, 2 total`, `Tests: 199 passed, 199 total` (16.532 s).
2. **ESLint on all 6 changed files** (after final edit):
   ```bash
   npx eslint libs/backend/agent-generation/src/lib/types/core.types.ts libs/backend/agent-generation/src/lib/interfaces/content-generation.interface.ts libs/backend/agent-generation/src/lib/services/orchestrator.service.ts libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts libs/backend/agent-generation/src/lib/services/content-generation.service.ts libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts
   ```
   - Result: **PASS** — `0 errors` (172 pre-existing warnings in untouched lines; 0 warnings on added/modified lines).
3. **TypeScript library check** (after final edit):
   ```bash
   npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json
   ```
   - Result: **PASS** — exit code `0`, 0 errors across the library.
4. **Scoped `ptah_get_diagnostics`** on the 6 changed files:
   - Requested files: **0 errors, 0 warnings**.
   - Sibling file interim errors observed (untouched — owned by parallel Wave W4 lane `G-Analysis-Service`):
     - `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts` lines 1353, 1358, 1499, 1520, 1532 (`TS2345` argument not assignable to `never`).
5. **Ptah tool fallback note:** `ptah_code_search_symbols` returned `symbolCount: 0` (code index not yet built in worktree); fell back to `grep -rn` for cross-file symbol discovery.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Drop `sdkConfig.model` in `orchestrator.service.ts` when `options.setupSnapshot` is set | (A) Forward both `model` and `setupSnapshot` and rely solely on `ContentGenerationService` ignoring `model`; (B) Omit `model` from `sdkConfig` whenever `options.setupSnapshot` is present while keeping `model` pass-through when `setupSnapshot` is absent | Plan line 145 ("drop client `model` (D6)") and line 155; defense-in-depth ensures no custom/mocked `IContentGenerationService` or downstream consumer sees a conflicting `model` alongside `setupSnapshot`, while callers without `setupSnapshot` stay 100% unchanged | Yes |
| Preserve `workspaceLlm.resolveForPath` fallback when `sdkConfig?.setupSnapshot` is omitted | (A) Require `setupSnapshot` on every `ContentGenerationService` call; (B) Use `sdkConfig?.setupSnapshot ?? await this.workspaceLlm.resolveForPath(...)` | Prompt Acceptance ("other callers of the orchestrator and content generation without `setupSnapshot` keep their current behavior unless the plan says otherwise") and sibling pattern in `EnhancedPromptsService` (`enhanced-prompts.service.ts:1005-1009`) and `HarnessLlmRunner` (`harness-llm-runner.service.ts:156-160`) | Yes |
| Append non-secret `(<providerId>/<model>)` suffix to orchestrator/content-generation errors only when `setupSnapshot` is supplied | (A) Leave error messages without pair attribution; (B) Suffix `(${snapshot.providerId}/${snapshot.model})` only when `setupSnapshot` is present, and include `{ provider, model }` in failure logs without `auth` | Plan matrix row 233 ("Failure after valid start -> Run error names launch pair"), line 145 (non-secret pair only), and existing tests expecting exact strings when `setupSnapshot` is omitted (`orchestrator.service.spec.ts:2468`) | Yes |

## Open items and needed changes in other groups
- **No blockers in `G-Generation-Service`.**
- **`G-Generation-Handlers` (Wave W5, plan lines 151-155, 269):**
  - `resolveProviderRoute` exists only in `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-binding.ts:392` and `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts:114,443` (not in `@ptah-extension/agent-generation`). Its removal, resolving `workspaceLlm.resolveSetup(workspaceRoot)` at fresh/resume/retry launch entry, dropping client `model`, keeping `setupSnapshot`/`auth` out of `lastGenerationOptions` and checkpoints, and persisting `{ effectiveProvider, effectiveModel }` belong to `G-Generation-Handlers`.
- **`G-Analysis-Service` (parallel Wave W4 lane):**
  - `ptah_get_diagnostics` surfaced 5 interim `TS2345` errors in `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts` (lines 1353, 1358, 1499, 1520, 1532); left untouched as owned by that parallel lane.

## Extra reads
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` (verified `ResolvedSetupSnapshot`, `SetupResolution`, `IWorkspaceLlmResolver.resolveSetup`)
- `libs/backend/agent-sdk/src/index.ts` (verified public re-export of `ResolvedSetupSnapshot`)
- `libs/backend/agent-sdk/src/lib/internal-query/internal-query.types.ts` (verified `InternalQueryConfig` contract)
- `libs/backend/agent-sdk/src/lib/internal-query/internal-query.service.ts` (verified `execute` forwarding of `model`, `auth`, `onProviderSubmit`)
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts` (verified `OneShotRunInput` and `buildOneShotOptions` consumption of `model` + `auth`)
- `libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts` (verified runtime shape of Set/Unset `ResolvedSetupSnapshot`)
- `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts` (verified sibling snapshot bypass pattern)
- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts` (verified sibling `route ?? resolveForPath` pattern)
- `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts` (checked sibling convention in same package)
- `libs/backend/agent-generation/src/index.ts` (verified `OrchestratorGenerationOptions` and `ContentGenerationSdkConfig` exports)
- `libs/backend/agent-generation/tsconfig.lib.json` and `libs/backend/agent-generation/jest.config.ts` (verified scoped check config)
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts` and `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-run.supervisor.ts` (confirmed `resolveProviderRoute` location and `effectiveProvider`/`effectiveModel` run-error handoff for `G-Generation-Handlers`)
