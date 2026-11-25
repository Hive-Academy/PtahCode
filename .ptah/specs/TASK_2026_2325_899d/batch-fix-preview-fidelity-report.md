# Batch fix — wizard-generation.preview-fidelity.spec.ts Setup resolver fixture

## Cause

`wizard:submit-selection` now resolves the "Setup" provider/model pair first, through
`SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER` (`IWorkspaceLlmResolver.resolveSetup(workspaceRoot)`,
`libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts`). See
`wizard-generation-rpc.handlers.ts:1492-1516` (`resolveSetupSnapshot`): when the token is not
registered in the container, `resolveService` throws, the `catch` maps it to
`RpcUserError('The Setup model could not be resolved. Update Background models and retry.',
'SETUP_MODEL_INVALID')`. The fixture's tsyrige child container in
`wizard-generation.preview-fidelity.spec.ts` registered no resolver, so all 7 tests failed with
that message on every submit call.

## Change

Only `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts`
was changed. No production file. No assertion was weakened or deleted.

1. Import: `import type { PluginLoaderService } from '@ptah-extension/agent-sdk';` became
   `import { SDK_TOKENS, type PluginLoaderService } from '@ptah-extension/agent-sdk';`
   (the real token, not a local `Symbol.for` copy).
2. In `buildFixture`, right after the `TOKENS.LOGGER` / `TOKENS.SENTRY_SERVICE` registrations,
   the container now registers a fake resolver at `SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER` whose
   `resolveSetup` returns a valid `'set'` resolution:
   `snapshot: { providerId: 'anthropic', model: 'sonnet', auth: { env: { ANTHROPIC_API_KEY: 'preview-fidelity-setup-secret' } } }`
   — the exact `SetupResolution` / `ResolvedSetupSnapshot` shape from the port
   (`kind: 'set'` + snapshot with mandatory isolated `auth`), copied in shape from
   `makeSetupSnapshot` / `DEFAULT_SETUP_SNAPSHOT` in `wizard-generation-rpc.handlers.spec.ts`
   (lines 222-236, 1429-1433).
3. Consistency of the pair onward: the handler builds `route = { provider, model }` from the
   snapshot and passes `setupSnapshot` into the orchestrator inputs. `providerId: 'anthropic'`
   matches the fixture's existing `SdkProviderModels` fake (`resolveActiveProviderId() ->
   'anthropic'`, `getModelTiers() -> { sonnet: 'sonnet' }`), so provider and model agree.
   The stubbed `CONTENT_GENERATION_SERVICE` fake ignores extra arguments, so the snapshot
   passed onward needs no change there.

## Check results

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false
  --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts`
  — **Tests: 7 passed, 7 total** (suite passed, ~17 s).
- `npx eslint libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts`
  — clean, no output.

## Decisions

- **Use the real `SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER` token instead of a local
  `Symbol.for('SdkWorkspaceLlmResolver')` copy** (as `wizard-generation-rpc.handlers.spec.ts`
  does). Options: real token import vs local symbol. Evidence: both resolve to
  `Symbol.for('SdkWorkspaceLlmResolver')` (`agent-sdk/src/lib/di/tokens.ts:193`), but the real
  token cannot drift from production. Reversible: yes, one-line.
- **'set' resolution with `auth.env` present** (not `'unset'`, not a missing `auth`):
  `ResolvedSetupSnapshot` requires `auth` (port lines 44-52) and the handler rejects
  `invalid`/`unavailable` kinds, so `'set'` with isolated auth is the only passing shape.
  Reversible: yes.

## Open items

None for this batch.

## Extra reads

Read outside the write file (read-only, needed to confirm the contract and the failure path):
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` (port types)
- `libs/backend/agent-sdk/src/lib/di/tokens.ts` (token value)
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts`
  (`resolveSetupSnapshot`, route construction)
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts`
  (existing fake resolver and `makeSetupSnapshot`)
