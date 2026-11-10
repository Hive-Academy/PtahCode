## Changes

- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts`: schedule one delayed, unref'd background catalog refresh per restored key, with auth and generation guards.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.spec.ts`: cover delayed refresh, replacement, equality, failure, clear, and auth change.
- `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.ts`: group direct Anthropic SDK rows and remove recommendation heuristic.
- `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.spec.ts`: assert direct SDK grouping, ungrouped API rows, and absent recommendation field.
- `libs/backend/rpc-handlers/src/lib/handlers/model-picker-groups.ts`: pure SDK order grouping rule.
- `libs/backend/rpc-handlers/src/lib/handlers/model-picker-groups.spec.ts`: cover both CLI orders and proxy rows.
- `libs/shared/src/lib/providers/entries/claude-cli-provider-entry.ts`: add Fable 5.2 fallback without unverified prices.

## Decisions

- Decision: refresh through the existing fetch function with persistence disabled until comparison; options were duplicated fetch code or a shared fetch path. Evidence: `fetchSupportedModelsInternal` already implements auth strategy selection. Reversible: yes.
- Decision: retain saved catalog on refresh failure or empty result; options were eviction or retention. Evidence: approved stale-while-revalidate behavior. Reversible: yes.
- Decision: omit Fable 5.2 prices; options were copy Fable 5.1 prices or leave unknown. Evidence: [models.dev search](https://models.dev/models/anthropic/claude-fable-5) returned Fable 5 and 5.1, no verified Fable 5.2 entry. Reversible: yes.
- Decision: use SDK `ModelInfo.resolvedModel` directly; options were widening adapter type or direct use. Evidence: SDK declaration line 1466 and adapter's `Promise<ModelInfo[]>` signature. Reversible: yes.

## Verification

- Exact invocation: `npm run verify -- -p @ptah-extension/agent-sdk,@ptah-extension/rpc-handlers,@ptah-extension/shared | Select-Object -Last 60` (PowerShell equivalent of `tail -60`). Exit code 0.
- Target counts: agent-sdk lint 1/1, typecheck 1/1, test 1/1; rpc-handlers lint 1/1, typecheck 1/1, test 1/1; shared lint 1/1, typecheck 1/1, test 1/1. Nx summary: 6/6 lint and typecheck tasks succeeded, 3/3 test tasks succeeded.
- Last result lines: `NX 6 tasks: 6 succeeded`; `NX 3 tasks: 3 succeeded`; `[verify 2026-11-09T22:57:12.851Z] lock released after 1145.1s, exit code 0`.
- The output mode printed summary counts, not the requested literal `Running target ... for 3 projects` header. The command lists exactly three projects and the test summary reports three tasks.
- `ptah_get_diagnostics` was unavailable after a 45 s TypeScript timeout; scoped files remained unchecked.

## Extra reads

- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts` (adapter model return signature)
- `libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts` (SDK re-export)
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (resolvedModel declaration)
- `libs/shared/src/lib/utils/auth-env.utils.ts` (direct Anthropic scope predicate)
- `libs/shared/src/lib/providers/provider-lookup.spec.ts` and `provider-registry.spec.ts` (searched for pinned fallback list)

## Open items

- The handler regression spec was added while the long verification process was active, so the command's summary does not establish whether Jest picked up that final edit. No second full verification was run because the task requires exactly one invocation.

