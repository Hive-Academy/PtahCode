# Code Logic Review (backend phases B1-B4b) - `TASK_2026_2306_livemodels`

Diff reviewed: `git diff 6fb8d480c..d49d8c10b -- libs apps` (commits c9da92d3d, d1cdce98f, 829b4e5b7, cc12257d4, d49d8c10b). Frontend files are out of scope. Specs were read only where they pin behaviour. No source was edited and no checks were run.

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6/10 |
| Verdict | REVISE |
| Blocking | 0 |
| Serious | 4 |
| Moderate | 10 |
| Minor | 3 |

What is sound: the chain in `fetchModels` (live, then a persisted `{schema:2, origin:'live'}` record, then explicit `unavailable`). Persisted records are written only from live data. Static rows never get a schema:2 stamp, because the only writers are `persistCatalog` (live branch) and `savePersistedCatalog` (OpenCode live refresh). The Anthropic-scheme pagination fails closed. `closestLiveModel` only ever returns an id from the live set (`closest-live-model.ts:102-111`). The Copilot, Kimi and `/v1/models` routes classify credential failures correctly. The serious gaps are on the dynamic-fetcher side, where the plan's "credential reasons bypass the persisted rung" rule is not honoured.

## Five logic questions

### 1. How does this fail silently?
- Codex, provider-session (agy/Cursor/etc.) and LM Studio fetchers swallow every failure and return `[]`. `fetchLive` passes `[]` on and `fetchModels` reports it as `empty` (`provider-rpc.handlers.ts:432-448`, `:466-485`, `local-model-translation-proxy.ts:162-170`). `empty` is not in `CREDENTIAL_FAILURE_REASONS` (`model-list-failure.ts:17`), so the saved list is shown (`provider-models.service.ts:428`).
  - A signed-out Codex or Cursor account keeps showing the last account's models.
  - An unreachable LM Studio is reported as "returned no models".
- Ollama Cloud with ollama.com failing and the local daemon holding a few cloud tags returns only those tags as a `live` list (`ollama-model-discovery.service.ts:255-263`). It is memory-cached and persisted as the full catalog.
- `OpenCodeLiveRoutes.list` serves the last good map for up to 6 h after a failed refresh with no failure signal (`opencode-live-routes.ts:253-262`). The reason is kept on the cache but never surfaced while the map is under TTL.
- `closestLiveModel` null cases are silent by design, but see the agy finding below.

### 2. What user action produces unexpected behaviour?
- Deleting an API key and reopening the picker within 5 min still shows the full live list, because the cache is checked before the key check (`provider-models.service.ts:393-401` vs `:490`).
- Two Ptah CLI agents on the same provider with different keys share one 5-minute cache entry and one persisted record, so the second agent sees the first account's models (`modelCache` keyed by `providerId` only; `ptah-cli-rpc.handlers.ts:352`).
- Retrying after a transient Cursor failure does nothing until `invalidateCache()`. `loadModelsForAll` stores the post-failure map in `modelCache`, so Cursor stays omitted (`cli-detection.service.ts:486-506`).
- Entering a Cursor key later has the same stale effect: the `[]` for "no key" is cached.

### 3. What input data produces a wrong answer?
- An OpenCode row with several `api` keys and no mapped `recommended_api` is dropped from the list and from routing (`opencode-live-routes.ts:94-101`, `:179-186`). The skip count is only debug-logged.
- An OpenCode row whose `recommended_api` names a protocol that is not among its own `api` keys is routed to it unchecked (`rowProtocol`, `:105-112`).
- A retired agy saved id with an effort suffix is stripped to a base, which agy may not list (see S4).
- LM Studio rows are hardcoded `contextLength: 4096, supportsToolUse: false` (`local-model-translation-proxy.ts:154-160`). They are removed by `toolUseOnly` filters, because there is no `toolUseUnknown`.

### 4. What happens when a dependency fails?
- ollama.com 401/403 becomes `http-error`, not `auth-rejected` (`ollama-cloud-metadata.service.ts:~395`). A revoked key then falls back to a saved list.
- Copilot's `isAuthenticated()` is awaited unguarded after the three sources fail (`provider-rpc.handlers.ts:~375`). A throw becomes `unexpected` and the persisted list is shown.
- The Anthropic direct fetcher's catch retries `getSupportedModels()`, and a second throw is unclassified (`unexpected`, so persisted). A 401 on `getApiModels` is swallowed into the SDK list (`provider-rpc.handlers.ts:634-662`).
- The agy `models` probe failure is not cached, so every spawn waits up to 8 s again (`antigravity-cli.adapter.ts:~990`).

### 5. What is missing that the requirements never mentioned?
- `readPersistedCatalog` re-parses the whole record on every synchronous read and calls `replaceProviderContextWindows` on every read (`provider-models.service.ts:296-298`). Callers: `getCachedModelIds`, `resolveEffectiveTiers`, `applyTierMetadata`, `isStoredModelOffered` over all providers. It is a hot-path cost and a global-registry write on a read.
- Cold-catalog tier resolution gives nothing for providers without `defaultTiers`: Ollama, LM Studio, Requesty. The previous `staticModels[0]` fallback is gone, so a Ptah CLI agent spawns with `model=''` and a warn (`ptah-cli-registry.ts:896-906`).
- The claude-cli strategy no longer seeds pricing (`cli.strategy.ts`, removed `seedStaticModelPricing`). The removed comment documented that this caused "cost will render as unavailable" for Max/Pro sessions. Check this is an accepted regression; it is not in `decisions.md`.
- `ptahCli:listModels` drops `savedAt` and `notice` for `persisted` results (`ptah-cli-rpc.handlers.ts:~370`).

## Failure modes

### Credential failure falls back to a saved list (Codex, provider-session, claude-cli, LM Studio)
- Trigger: signed-out or revoked account; daemon down.
- Symptom: stale models of another or previous account offered, with the notice "returned no models", or no notice for the provider-session path (`providerSessionModelOptions` lists persisted like live).
- Evidence: `provider-rpc.handlers.ts:432-448`, `:466-485`, `:668-686` (claude-cli `[]`); `local-model-translation-proxy.ts:162-170`; `provider-models.service.ts:428`.
- Current handling: `[]` is mapped to `empty`, which is not a credential reason.
- Recommendation: throw `ModelListError('not-signed-in')` or the classified reason as Copilot and Kimi do. Never return `[]` for a failure. Keep `[]` only for a successful empty answer.

### Partial Ollama Cloud list persisted as complete
- Trigger: ollama.com fails (timeout, 5xx) while the local daemon lists one cloud tag.
- Symptom: the picker shows one model as `live`, and the saved full catalog is overwritten (`persistCatalog` writes it).
- Evidence: `ollama-model-discovery.service.ts:255-263`; `provider-models.service.ts:406-410`.
- Recommendation: when the remote leg fails, throw the remote reason. Alternatively return the local rows without letting them persist or cache (a flag on the fetcher result).

### Cache hit precedes credential check and is not key-scoped
- Evidence: `provider-models.service.ts:393-401`; `:490` (`no-key` thrown only on a miss).
- Recommendation: for `modelsEndpoint` providers, skip the cache when `apiKey` is null, and include a hash of the key (or the agent id) in the cache key and the persisted record.

### agy retired-id replacement yields an id agy does not list
- Trigger: saved `claude-sonnet-4-6`, the historical default named in the removed `AGY_STALE_MODEL_IDS`, with no `reasoningEffort`.
- Symptom: `--model claude-sonnet-5-5`, while live ids are `claude-sonnet-5-5-low|medium|high` (spec fixture `antigravity-cli.adapter.spec.ts:119-121`). The spec pins this output (`:542`). The previous code mapped to `claude-sonnet-5-5-medium`.
- Evidence: `antigravity-cli.adapter.ts:~335-345` (`closestLiveModel` over effort-stripped bases). `agyModelId` also strips an effort from a saved `…-high` id, so the user's chosen effort is lost.
- Recommendation: choose the closest base, then resolve to a live id: keep the saved effort when `base-effort` is live, else the default variant agy lists (prefer an unsuffixed id, else a middle effort). Verify against real `agy models`.

### OpenCode routing: sound, with residual gaps
- Cold cache: `resolve` refreshes once under backoff, then reads the persisted row. A failed refresh gets a 5-min backoff, and concurrent requests join `inFlight` (`opencode-live-routes.ts:208-258`, `:312-330`). Success resets `failedAt` and writes through the store. This is correct, and I found no race.
- Gap 1: the multi-`api` and `recommended_api` protocol issues listed above.
- Gap 2: `list()` can return a stale live map with no failure (Q1).
- Gap 3: the store is attached only in `registerAuthProvidersServices` (`register.ts`). A host that does not call it gets no persisted routing, which degrades safely to `catalog-unavailable`.

### Ollama Cloud auth and enrichment
- `/api/show` against ollama.com is sent without the API key (`httpRequest` sets only `Content-Type`, `:520`). If the endpoint needs auth, every row gets `contextLength: 0`.
- Each failure also calls `sentryService.captureException` (`:455`), so up to N events per minute while the fallback entry is cached.
- `tagsCache` is keyed by nothing, so a key change within 1 h serves the other account's tags (`ollama-cloud-metadata.service.ts`).
- Enrichment is serial in batches of 5 with 5 s timeouts. A hanging ollama.com can make the picker wait up to about N/5 x 5 s.

### Native child pass-through
- Correct for the empty and throw cases. `native` is set only after the profile resolves, so earlier throws (account gate) are not passed through (`chat-session.service.ts:1467-1540`). The warn is once per service lifetime.
- Residual: with a non-empty catalog that lacks the model, the result is `invalid-model`, which is correct. With an empty or unreadable catalog the bare alias or arbitrary string passes (decision 11, accepted).

## Blocking issues
None.

## Serious issues

### S1. Fetchers return `[]` on failure, bypassing the credential rule
- File: `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:432-448` (Codex), `:466-485` (provider sessions), `:668-686` (claude-cli); `libs/backend/auth-providers/src/lib/providers/local/local-model-translation-proxy.ts:162-170` (LM Studio).
- Scenario: signed out of Codex, Cursor or agy, or LM Studio stopped.
- Impact: a saved list from an earlier account is offered. `config:models-list` for provider sessions lists it as live. The plan's S2 ("a removed, revoked or signed-out credential must not keep offering models") is not met for these providers, and LM Studio failures read as "returned no models".
- Fix: throw `ModelListError` with the real or classified reason (`not-signed-in` when the adapter reports no login). Reserve `[]` for a successful empty answer.

### S2. Local-only Ollama Cloud rows are persisted as the full catalog
- File: `ollama-model-discovery.service.ts:255-263`, with `provider-models.service.ts:406-410`.
- Scenario: ollama.com fails transiently while the daemon has pulled one `:cloud` model.
- Impact: the one-row list is `live`, is memory-cached 5 min, and overwrites the saved full catalog. The next outage shows 1 model as "saved".
- Fix: see Failure modes.

### S3. Cache hit before the key check, not key-scoped
- File: `provider-models.service.ts:393-401`, `:366-375`.
- Scenario: key deleted or rotated, or two agents with different keys on one provider.
- Impact: 5-min credential bypass and cross-account list leakage. The persisted record is per provider and is overwritten by whichever agent fetched last.
- Fix: scope the cache entry to a key fingerprint (or agent id), and skip it when `apiKey` is null for a `modelsEndpoint` provider.

### S4. agy replacement can produce a non-live id and drop the chosen effort
- File: `antigravity-cli.adapter.ts:~335-345`; pinned by `antigravity-cli.adapter.spec.ts:525-547`.
- See Failure modes. This is the case the removed `AGY_STALE_MODEL_IDS` existed for. The brief requires that derivation from live output never yields an id the output did not list.

## Moderate and minor issues

Moderate:
- `ollama-cloud-metadata.service.ts` `httpJson`: 401/403 gives `http-error`, so a bad key falls back to a persisted list. Map to `auth-rejected`. The same applies to the local Ollama `httpRequest`.
- `ollama-model-discovery.service.ts:455,520`: no auth header on ollama.com `/api/show`; per-model Sentry capture on every fallback.
- `ollama-cloud-metadata.service.ts`: `tagsCache` ignores the key.
- `opencode-live-routes.ts:94-112`: multi-`api` rows are dropped; `recommended_api` is not checked against the row's `api` keys. Log the skip count above debug or surface it.
- `opencode-live-routes.ts:253-262`: `list()` returns a stale live map after a failed refresh with no signal.
- `provider-models.service.ts:296-298`, `:626-632`: unmemoized persisted parse on hot sync paths, and a global context-window registry write on every read.
- `cli-detection.service.ts:486-506`: a failed or empty Cursor read is cached for the process lifetime (also the `[]` for "no key"). Do not cache failures, or invalidate on key save.
- `antigravity-cli.adapter.ts` `currentModelIds`: probe failure not cached, so each spawn pays up to 8 s.
- `ptah-cli-registry.ts:896-906`: no model resolved when the catalog is cold and the provider has no `defaultTiers`. Spawn proceeds with `''`.
- `provider-rpc.handlers.ts:634-662`: the Anthropic direct fallback can mask a 401. `isAuthenticated()` in the Copilot path is unguarded.
- `local-model-translation-proxy.ts:154-160`: fabricated `contextLength 4096` and `supportsToolUse:false`. Use `toolUseUnknown` and no provider source.
- `cli.strategy.ts`: the removed pricing seed for claude-cli sessions has no recorded decision.
- `ptah-cli-rpc.handlers.ts:~370`: `persisted` loses `savedAt` and `notice`.

Minor:
- `ptah-cli-registry.ts:344,458`: `modelCount` is 0 until the first list. Cosmetic.
- `libs/backend/auth-providers/src/lib/di/register.ts`: about 100 lines of formatter churn in an unrelated diff.
- `provider-models.service.ts:83` still exports `isStatic: false`, which is intentional until B6.

## Static-row readers (new code only)
No new code path reads `staticModels`, `getStaticModelCapabilities`, `seedStaticModelPricing` or `getOpenCodeModelProtocol`. The remaining hits are definitions and the B6 deletions. `buildStaticTierCapabilityEnv` and `getStaticModelCapabilities` are defined but have no non-spec caller in the diff. `opencode-provider-entry.ts:98` still builds rows from `OPENCODE_MODEL_ROUTES`. It feeds only the static rows, which nothing reads now.

## Callers outside the diff
- `apps/ptah-electron/src/di/phase-4-handlers.ts:130` and `libs/backend/cli-engine/src/lib/container.ts:1034` register `PtahCliRpcHandlers` with the new injections. `AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS` and `TOKENS.AUTH_SECRETS_SERVICE` are both registered for those hosts (the second via `register-platform-agnostic.ts`). No registration gap found.
- `platform-cli` does not reference the changed exports.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts` has its own `restorePersistedCatalog` (`ptah.sdk.modelCatalog`), untouched here. I did not verify its age rule. It is a separate persisted catalog and could still serve an old list. Confirm it holds only SDK-live data.

## Data flow
1. `provider:listModels` parses params, reads the key, then calls `fetchModels` (OK).
2. The memory cache is checked (S3 gap).
3. `fetchLive` picks the OpenCode route, a dynamic fetcher, or `/v1/models` (fetcher errors swallowed for Codex, provider sessions, LM Studio: S1).
4. The result goes through `withLiveCapabilities`, the cache, `recordContextWindows` and `persistCatalog` (partial Ollama list: S2).
5. A failure is classified (OK; Ollama 401 misclassified).
6. The persisted rung is skipped for credential reasons (OK for those that reach it), otherwise `readPersistedCatalog` validates schema, origin, age and rows (OK).
7. `toListModelsResult` maps the result to fixed-copy text (OK; no vendor text leaks).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Lists only from live, persisted live, or explicit unavailable | PARTIAL | No repo literal found on the new paths. Persisted partial (S2) and credential bypass (S1). |
| Persisted `{schema:2, origin:'live'}` only from live data | COMPLETE | Full list only, except S2. |
| Closed failure reasons, fixed copy | PARTIAL | Misclassified reasons for the swallowing fetchers and Ollama 401. |
| Tier ids are preferences resolved against live data | COMPLETE | `closestLiveModel` returns only live ids. Never used to admit. |
| agy ids derived from live output | PARTIAL | S4. |
| Cursor empty and failure behaviour | PARTIAL | `[]` and throw are implemented; the detection cache pins failures. |
| Native child pass-through | COMPLETE | Per decision 11. |
| OpenCode live-route routing | PARTIAL | Multi-`api` handling and stale-live signal. |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Pre-version persisted record | YES | Ignored, logged once | None |
| Record older than 30 d | YES | Ignored | None |
| Malformed row, bad `upstreamProtocol` | YES | `persistedRow` validates | None |
| Concurrent OpenCode refresh | YES | `inFlight` join | None |
| Refresh failure backoff | YES | 5-min retry, `force` bypass | `list()` serves stale silently |
| Paginated Anthropic list | YES | `bad-response` on missing `last_id` or more than 10 pages | None |
| Key deleted | NO | Cache first | S3 |
| Signed-out fetcher | NO | `[]` to `empty` to persisted | S1 |
| Partial remote failure | NO | Local rows persisted | S2 |
| Retired agy id | PARTIAL | Base, possibly not live | S4 |

## Verdict
- Recommendation: REVISE
- Confidence: HIGH on S1 to S3, MEDIUM on S4 (depends on real `agy models` output; the spec fixture shows effort-only variants)
- Top risk: the saved-list fallback runs for signed-out and revoked credentials on the Codex, provider-session, claude-cli and LM Studio routes, and an Ollama Cloud list assembled from a failed remote can overwrite the saved full catalog.
- What a robust implementation would add:
  - Fetchers that throw classified errors instead of returning `[]` on failure.
  - A key-aware cache and persisted record, and a no-key bypass before the cache.
  - Remote-failure handling for the Ollama Cloud union that does not persist.
  - A live-id resolution step in `agyModelId`.
  - `auth-rejected` classification on the Ollama paths.
  - A memoized persisted read with no registry write.
  - A Cursor detection cache that does not pin failures.
  - Specs for each of the above.
