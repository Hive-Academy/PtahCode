# Code Logic Review (CodeRabbit round 1, commit e8bd0edb1)

Verdict: APPROVED. Blocking 0, Serious 0.

Scope: provider-models.service.ts, sdk-model-service.ts, opencode-live-routes.ts and opencode-translation-proxy.ts, ptah-cli-registry.ts, lane-model-listing.adapter.ts, provider-rpc.handlers.ts, interactive-login-methods.ts. Not run: tests.

## Checks requested

- `clearCache(providerId)` (provider-models.service.ts:1339) callers: only user-driven paths. These are api-key-methods.ts:184 (setApiKey), api-key-methods.ts:255 (deleteStoredKey), connection-settings-methods.ts:201 (key change), and interactive-login-methods.ts:84, 137, 249 and 277 (Copilot and Codex login and logout). None runs at startup, on a settings save without a key change, or on a key read. Saved lists do not vanish on a hot path. The delete is fire-and-forget and logged on failure, and `fetchModels` still checks the saved credential, so a failed delete cannot serve another account's list.
- `signedIn` probe (provider-models.service.ts:491, provider-rpc.handlers.ts:733): it is registered only for `claude-cli`. It calls `ambientLogin.read()`, which is cached for 60 s (`AMBIENT_STATUS_FRESH_MS`) and shares a single serial slot (claude-ambient-login-status.ts:131). That is at most one `claude auth status` spawn per minute. A throw gives `undefined`, so the chain continues. Only `signed-out` blocks.
- OpenCode `list()` throw: the only production caller is provider-models.service.ts:622, inside the `fetchModels` chain. That chain classifies the throw into `unavailable` or a saved list. Routing uses `resolve` and `modelIds`, which still read the retained map. `vendor-model-parsers.live.spec.ts:122` goes through `fetchModels` and asserts `source`, so it is unaffected.
- Synchronous `readLiveCatalog`: returns null only after a credential failure or a credential mismatch. With no entry yet (startup) it accepts the saved list (provider-models.service.ts:884-902). Spawn pass-through is not touched. `ptah-cli-registry.ts` now passes one `spawnTiers` and `effectiveTiers` snapshot into `buildProxyAuthEnv`, which removes a fingerprint/env disagreement.
- SDK paging: the loop ends on `has_more !== true`, an empty or repeated `last_id`, or page 10, and the last three return `bad-response` (sdk-model-service.ts paging block; provider-models.service.ts:711-722). The 1 h `LIVE_READ_MAX_AGE_MS` refetch is bounded by `pendingModels` sharing. `apiModelsGeneration` guards a stale write. The auth-identity discard applies only to the keyed `getLiveSupportedModels` path. The native key is constant, so no false discards.
- Lane discovery: the map key is `providerId:` plus the first 16 hex characters of a sha256 of the key (lane-model-listing.adapter.ts:299). No raw secret is used as a key or logged. The secret-read failure path logs nothing raw.

## Minor

- provider-rpc.handlers.ts:749: the sign-in probe is awaited before any cached `claude-cli` list is served. On a cache miss it can add up to 20 s (`AMBIENT_STATUS_BUDGET_MS`) to a list call. This is bounded and shared, so it is acceptable.
- provider-models.service.ts:1339: re-saving an identical key also drops the saved list. If the user is offline at that moment, the list is `unavailable` until the next live success. This follows the task rule.
- provider-models.service.ts:1347: the saved-catalog delete is async and unordered with `fetchModels`. A read in the same tick can see the old saved list, but it is credential-checked. Negligible.
