Reviewed head: 4d6fe94274ffac74200a5a1fc4ec647955d6ca13
Verdict: APPROVED

## Findings

1. **Minor — `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:522-542`.** Switching a Claude API instance from `shared-connection` to `instance` saves the new credential source before `setProviderKey`. If the secret write rejects, `updateAgent` rejects but leaves the saved instance configured for an absent instance key, so its previously working shared connection stops working. Store the key before committing the source change, or restore the previous config on secret-write failure. Add a failure-path test for this direction of the switch.

## Earlier findings

1. **Corrected — active-route replacement.** `libs/frontend/core/src/lib/services/providers-connection-setup.service.ts:551-555,669-680` derives local activation from the persisted `apiKey` route when a new Claude API key is present; even a connect-only draft then uses `auth:saveSettings` to refresh the existing route. The regression case is at `providers-connection-setup.service.spec.ts:338-345`.
2. **Corrected — edit-dialog key replacement.** `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:672-681` sends a new Claude API instance key together with `credentialSource: 'instance'`; `libs/backend/rpc-handlers/src/lib/handlers/ptah-cli-rpc.handlers.ts:184-211` passes that source to `PtahCliRegistry.updateAgent`, which accepts it at `ptah-cli-registry.ts:503-512,538-542`. The UI assertion is at `add-cli-instance-modal.component.spec.ts:440-452`.

## Requirement checklist

1. **Met.** The strict nullable-key schema is at `auth-rpc.schema.ts:28-31`; the secret-only handler is at `auth/api-key-methods.ts:46-81`; registration and allowlists are at `auth-rpc.handlers.ts:83,298,329`. It writes only the direct `apiKey` secret.
2. **Met.** The wizard offers and defaults to connect-only when a main route exists (`provider-setup-wizard.component.ts:1264-1267,2364`). Inactive Claude API edits use the secret-only RPC; active replacements use `auth:saveSettings` with the same route (`providers-connection-setup.service.ts:551-564,669-680`). The tab and service block active-route deletion (`credentials-tab.component.ts:321-324,600-604`; `providers-connection-setup.service.ts:839-859`). A connect-only draft without a new key has no credential or activation operation.
3. **Met.** `anthropic-api-lane-entry.ts:5-18` defines the lane-only provider; `provider-registry.ts:775-780` keeps it outside the main-agent list; `ptah-cli-registry.ts:99-103` resolves only that lane specially and uses `getAnthropicProvider` for others.
4. **Met, with Minor failure path above.** Shared credentials are read from secret storage at lane resolution/spawn (`ptah-cli-registry.ts:256-264,854-857`), and the UI defaults new Claude API instances to the saved connection while allowing an instance key (`add-cli-instance-modal.component.ts:279-284,634-636`). Config persists only the typed source, not the shared key. The edit RPC accepts source plus key.
5. **Met in inspected source.** The direct-key RPC returns fixed errors and logs only error type (`auth/api-key-methods.ts:62-80`). Direct Anthropic lane auth env receives `ANTHROPIC_API_KEY` (`ptah-cli-registry.ts:1584-1587`); native `claude-cli` returns an empty auth env (`:1565-1575`). The secret-only path does not write settings or process environment.
6. **Met for the specified paths.** Tests cover strict payload rejection and no route/settings/log/env mutation (`auth-rpc.handlers.spec.ts:1312-1375`), connect-only and active-route replacement plus deletion (`providers-connection-setup.service.spec.ts:300-345,410-423`), and direct versus nonvacuous subscription lane environments (`ptah-cli-registry-anthropic-api.spec.ts:45-115`). The new switch-to-instance secret-write failure is untested; see Finding 1.
7. **Met in changed production source.** Zod guards the new RPC input, injected Logger handles diagnostics, and changed Angular components retain standalone/signals/OnPush. No added `any`, `@ts-ignore`, `as unknown as X`, deep `/src/` import, or console call was found.

## Not reviewed

- Tests, builds, lint, rendered UI, live Anthropic behavior, and actual secret-store failures were not run, per the read-only review instructions.
- No matching code-review skill was exposed in this lane's available skill catalog; review used Git diff and source reads.
