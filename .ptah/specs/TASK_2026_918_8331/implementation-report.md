## Root cause
- `libs/shared/src/lib/providers/provider-registry.ts:776-779` resolves `anthropic-api` only through `getPtahCliLaneProvider`; the main-agent `getAnthropicProvider` deliberately excludes it (`anthropic-api-lane-entry.spec.ts:32-34`).
- `libs/backend/auth-providers/src/lib/provider-models.service.ts:396-402` used the main-agent lookup on the model path, so `fetchModels('anthropic-api', null)` threw `Unknown provider`. The same lookup hid lane defaults at line 813 and its endpoint at line 968.
- `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:677,723` and `services/lane-model-listing.adapter.ts:299` also used the main-agent lookup when a lane ID could arrive.

## Changes
- `libs/backend/auth-providers/src/lib/provider-models.service.ts`: resolve lane IDs for model discovery, default tiers, and dynamic endpoint checks.
- `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts`: resolve lane IDs in keyless catalog and auth-error paths.
- `libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts`: use the lane-aware registry for the dynamic-only guard.
- `libs/backend/auth-providers/src/lib/provider-models.service.spec.ts`: cover static lane models, scoped tier persistence, and default resolution.
- `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.spec.ts`: cover the list-models RPC for a keyless `anthropic-api` lane.

## Tier write-path trace
- Instance-row Tiers button emits `tiersRequested` (`ptah-cli-instances.component.ts:227-230`); matrix opens `CliTierMappingModalComponent` (`cli-orchestration-matrix.component.ts:236,251-256,404-411`).
- The modal loads `provider:listModels` and `provider:getModelTiers` with `scope: 'cliAgent'` (`cli-tier-mapping-modal.component.ts:203,234-239`), then calls `state.setCliInstanceTiers` on a pick (`:291`). The state sends `ptahCli:update` through `cliInstanceTiersOperation` (`providers-settings-state.service.ts:658-666`; `providers-commit.service.ts:288-306`).
- `ptah-cli-rpc.handlers.ts:175-215` forwards `tierMappings` to `PtahCliRegistry.updateAgent`; `ptah-cli-registry.ts:475-523` replaces that instance's mappings and `PtahCliConfigPersistence.saveConfigs` stores the full array in ConfigManager key `ptahCliAgents` (`ptah-cli-config-persistence.service.ts:37-49`, constant in `ptah-cli-registry.utils.ts:27`). The write is instance-scoped by config `id`.
- At spawn, `PtahCliRegistry.resolveEffectiveTiers` reads instance mappings first, then `ProviderModelsService.getModelTiers(providerId, 'cliAgent')`, then provider defaults (`ptah-cli-registry.ts:1686-1709`). Provider-scoped RPC writes use `provider.<providerId>.cliAgent.modelTier.<tier>` (`provider-models.service.ts:171,630-646`); `getModelTiers` and `clearModelTier` read/clear that same key (`:675-687,702-712`). No second instance-save defect was found.

## Tests added
- Static `fetchModels('anthropic-api', null)` catalog and `isStatic` result, while `getAnthropicProvider('anthropic-api')` remains undefined.
- Lane default tier resolution and set/get/clear of the `cliAgent` scoped config key.
- `provider:listModels` returns the lane catalog from the service with no provider key.

## Verification
Command: `npm run verify -- -p auth-providers,rpc-handlers | Select-Object -Last 40` (PowerShell equivalent of requested `tail -40`). Exit code: **1**. The verify label lists two requested projects; Nx compact output did not print a `Running target ... for 2 projects` header. Lint/typecheck: 4/4 tasks passed. Tests: 1/2 project tasks passed. `auth-providers:test` failed on two assertions in unchanged `codex-account-usage.service.spec.ts` due to Windows drive-letter casing (`D:` expected, `d:` received). Its summary: 90 passed suites, 1 failed, 1 skipped; 2687 passed tests, 2 failed, 10 skipped. No failure was reported in the changed specs.

Tail of real output:
```text
 NX   2 tasks: 1 succeeded, 1 failed

? nx run @ptah-extension/auth-providers:test
  full log: ~\.nx\d60e02896ae18ad9\cache\terminalOutputs\14102798567389634167

Re-run with --output-style=static to inline logs.

> @ptah-extension/source@0.0.0 verify
> node scripts/verify.mjs -p auth-providers,rpc-handlers

[verify 2026-11-10T16:12:36.949Z] lock slot 0 acquired after 0s: verify lint,typecheck (auth-providers,rpc-handlers) then verify test (auth-providers,rpc-handlers)
[verify 2026-11-10T16:12:36.951Z] starting verify lint,typecheck (auth-providers,rpc-handlers)

 NX   4 tasks: 4 succeeded

Re-run with --output-style=static to inline logs.

  Run duration:      55.7s
  Cache:             0/4 hit (0%)
  Critical path:     43.0s (1 task)
  Recoverable time:  12.7s (23% of the run)
[verify 2026-11-10T16:13:52.680Z] starting verify test (auth-providers,rpc-handlers)
  Run duration:      7m 15s
  Cache:             0/1 hit (0%)
  Critical path:     4m 50s (1 task)
  Recoverable time:  2m 24s (33% of the run)
[verify 2026-11-10T16:21:11.199Z] lock released after 514.2s, exit code 1
```
## Decisions
- Kept `ANTHROPIC_PROVIDERS` unchanged, so the lane entry remains absent from main-agent lists.
- No Angular code changed: the modal's model loader and instance tier save already use the correct RPCs and storage scope.
- Skill discovery returned zero local skills; no matching local skill was available through the CLI mechanism.

## Clarifications Needed
None.


