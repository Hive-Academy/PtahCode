# Batch G-Generation-Handlers report

## Files changed

- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-binding.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts`

No other source file was edited. `enhanced-prompts-rpc.handlers*` was not modified.

## Plan items completed

- Plan lines 151-155 and Revision 2 line 310: every fresh, resume, bound retry, and unbound retry launch calls `IWorkspaceLlmResolver.resolveSetup` once for that attempt.
- Plan line 153: `lastGenerationInputs` retains only non-secret unbound inputs. The stored copy excludes `model` and `setupSnapshot`; every retry receives a new options object and a new Setup snapshot.
- Plan lines 153-155: orchestrator options carry `setupSnapshot` and no execution `model`. Bound retry ignores `manifest.effectiveModel`, `manifest.input.model`, and legacy client `model` for execution.
- Plan lines 154 and 230: fresh and resume checkpoints persist the current `effectiveProvider` and `effectiveModel`. `GenerationCheckpointService.recordEffectivePair` persists the new pair before bound or unbound retry execution.
- Plan line 155: removed `GenerationProviderModels` and `resolveProviderRoute` from `wizard-generation-binding.ts` and removed their handler usage.
- Plan lines 227-232 and 577: tests cover Set and Unset snapshots, conflicting legacy picker and tab models, fresh launch, resume, bound retry, unbound retry, per-attempt auth isolation, ignored legacy models, and secret-free persistence.
- Plan line 229: fresh, resume, bound retry, and unbound retry Setup failures return `RpcUserError` with `SETUP_MODEL_INVALID` before checkpoint or agent work. Retry resolution occurs outside its broad catch. Submit rethrows the typed error.
- Checkpoint specs cover pair persistence on create, resume, and retry. They also verify that resume does not rewrite legacy `input.model` and that no snapshot or auth field is persisted.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.spec.ts`
  - PASS: 2 suites, 143 tests, 0 failures.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
  - Batch files PASS: no TypeScript error names any of the five assigned files.
  - Command exit 2 due only to the two known external errors listed below.
- `npx eslint <five assigned files>`
  - PASS: exit 0, 0 errors, 7 warnings. Warnings are non-null assertions, `max-lines`, and `preserve-caught-error`.
- `ptah_get_diagnostics` scoped to the five assigned files
  - UNAVAILABLE: the TypeScript check exceeded 45 seconds on two calls. The native scoped `tsc` result above provides the verification evidence.

Logs: `.ptah/tmp/batch-G-generation-handlers-{jest,tsc,eslint}.log`.

## Decisions

1. **Resolve the Setup resolver through the existing lazy DI helper.**
   - Options: constructor injection or `resolveService` with `SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER`.
   - Evidence: this handler already uses lazy DI for generation services. Another unassigned spec directly constructs the handler, so the constructor remained unchanged.
   - Reversible: yes; constructor injection can replace the helper in a coordinated change.
2. **Keep legacy checkpoint `input.model` as inert data and stop writing it for fresh runs.**
   - Options: rewrite the legacy model on resume or persist only the separate effective pair.
   - Evidence: plan line 154 requires execution to ignore old models and persist `effectiveProvider` / `effectiveModel`. Rewriting `input.model` is unnecessary and obscures the distinction.
   - Reversible: yes; a later migration can remove legacy input fields.
3. **Add a narrow checkpoint pair-update method for retry.**
   - Options: reuse `prepareResume` or add `recordEffectivePair`.
   - Evidence: `prepareResume` changes agent scheduling and carried-over state, which a single-item retry must not do. The new method changes only the pair and timestamp before work starts.
   - Reversible: yes; the method is local to the checkpoint service and handlers.
4. **Map resolver exceptions and failed resolutions to safe Setup RPC errors.**
   - Options: propagate raw provider failures or return `SETUP_MODEL_INVALID` with a safe message.
   - Evidence: the lane brief requires raw provider errors and credentials to stay out of UI-facing contracts. Resolution failures include only the typed `source` and `cause` fields.
   - Reversible: yes; messages can change without changing the control flow.

## Open items and needed changes in other groups

- `setup-rpc.handlers.ts:647` (`G-Setup-RPC-Integration`): the empty recommendation result still lacks `judge` and `analysisPair` (TS2739).
- `skill-recommendation.service.ts:304` (`G-Skills-Rec-And-DI`): the returned recommendation result still lacks `judge` and `analysisPair` (TS2739).
- No unresolved decision remains in this batch.

## Extra reads

- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` — verified `IWorkspaceLlmResolver`, `SetupResolution`, and `ResolvedSetupSnapshot` contracts.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts` — verified the isolated auth shape for fixtures.
- `libs/backend/agent-generation/src/lib/types/core.types.ts` — verified `OrchestratorGenerationOptions.setupSnapshot` and its non-persistence contract.
- `libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.ts` — checked the existing Setup resolution and safe error pattern; not modified.
- `libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.spec.ts` — checked a valid Setup failure fixture; not modified.
- `ptah_code_search_symbols` returned an empty, unavailable symbol index. Targeted native `rg` searches were the fallback for symbol references and free-text plan lookup.
