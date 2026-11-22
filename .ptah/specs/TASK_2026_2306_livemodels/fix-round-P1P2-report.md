# Fix round for code-logic-review-P1P2 - `TASK_2026_2306_livemodels`

Scope: backend only (`libs/backend/auth-providers`, `libs/backend/cli-agent-runtime`, `libs/backend/rpc-handlers`). I did not touch any frontend, renderer or e2e path, and I made no git operations. Line numbers refer to the working tree after this round.

## Serious

### S1 - Fetchers no longer return `[]` for a failure

- **Codex** (`provider-rpc.handlers.ts:414`):
  - Each failing source records `classifyModelListFailure(error)`.
  - When no source lists a model, `codexAuthService.isAuthenticated()` runs. `false` throws `ModelListError('not-signed-in')`. If a source failed, its reason is thrown.
  - `[]` comes back only when every source answered with no models while signed in.
- **Provider sessions (agy, and later Grok, OpenCode)** (`provider-rpc.handlers.ts:490`):
  - A missing adapter, or an adapter without `listModels`, throws `no-live-source`.
  - When nothing is listed, the adapter's own sign-in check runs (`ensureTokensFresh`). For agy that is the keyring or env sign-in reader. `false` throws `not-signed-in`. A thrown `listModels` throws its classified reason. A clean empty answer stays `[]`.
- **Shared helper `readSignIn`** (`provider-rpc.handlers.ts:539`): if the sign-in check itself throws, the result is `undefined` and the fetch reason stays as it was.
  - Copilot now uses it too (`:384`), which fixes the Moderate about `isAuthenticated()` being awaited unguarded.
- **agy adapter** (`antigravity-cli.adapter.ts`): `listModels` can now tell a failure from an empty answer.
  - `probeModels` (`:1073`) returns `output` / `timeout` / `error`.
  - `readModels` (`:1004`) throws on a timeout (`code: 'ETIMEDOUT'`, so the reason is `timeout`) and on a start error (the spawn error's code).
  - A non-zero exit with no models also throws ("agy models exited with code N"). With the sign-in check, a signed-out agy becomes `not-signed-in`.
  - A clean exit that lists nothing is `[]`.
- **claude-cli** (`provider-rpc.handlers.ts:756`): an empty answer from `getNativeClaudeModels()` now throws `ModelListError('unexpected')`.
  - The SDK bridge answers `[]` for every failure, and Claude never lists zero models, so `[]` is a lost failure, not an empty catalog.
  - Limit: the native login state cannot be seen from here, so a signed-out native login still reaches the saved-list rung. See "Deferred".
- **LM Studio** (`local-model-translation-proxy.ts:34`, `:208`): every failure throws a classified `ModelListError`:
  - refused or unreachable -> `network`
  - no answer in 5 s -> `timeout` (`ETIMEDOUT`)
  - non-2xx -> `http-error`, but 401/403 -> `auth-rejected`
  - non-JSON body, or no `data`/`models` array -> `bad-response` (`parseLocalModelRows`)
  - A server that answers with no models gives `[]`.
- **Anthropic direct catch (Moderate)** (`provider-rpc.handlers.ts:702`): a credential reason from the first try is now thrown and not retried through the SDK. A second SDK failure throws the first failure's classified reason, where before it surfaced as `unexpected`.
- **Specs that pin this:**
  - `provider-rpc.handlers.spec.ts`: the provider-session classify test, "reports a signed-out provider-session CLI as not-signed-in…", the Codex network / not-signed-in / honest-empty tests, the Copilot sign-in-throws test, the Anthropic auth-rejected test, and claude-cli `unexpected`.
  - `antigravity-cli.adapter.spec.ts`: the timeout throw, the non-zero-exit throw, the ENOENT throw, and clean empty stays `[]`.
  - New `local-model-translation-proxy.spec.ts` (6 cases against a real local HTTP server).

### S2 - A partial Ollama Cloud list is never returned as the catalog

- Decision: `listCloudModels` throws the ollama.com reason whenever ollama.com fails, even when the local daemon lists `:cloud` tags (`ollama-model-discovery.service.ts:~258-268`, doc comment updated).
- Options considered:
  - (a) Throw the remote reason. Chosen.
  - (b) Return the local rows with a "do not persist or cache" flag. That changes the `DynamicModelFetcher` contract.
- Evidence for (a):
  - A cloud model also runs on ollama.com, so an unreachable ollama.com cannot serve the local tags anyway.
  - The caller's chain then shows the saved full list (non-credential reason) or `unavailable` (credential reason). The partial list is never memory-cached or persisted.
- Reversible: yes, it is local to one method.
- Spec: `ollama-model-discovery.service.spec.ts`, "throws the ollama.com reason instead of a partial list when only ollama.com fails".

### S3 - The model-list cache and saved list are scoped to the key

In `provider-models.service.ts`:
- `credentialFingerprint` (`:74`): the first 16 hex digits of a SHA-256 over a fixed prefix plus the key, or `''` with no key. The raw key is never stored.
- `fetchModels` (`:432`): the fingerprint applies only to the `/v1/models` route, i.e. the only route that sends `apiKey`. Fetchers read their own credential, and the OpenCode gateway is credential-free, so both use `''`.
- Memory-cache hit only when the fingerprint matches (`:439`). A deleted key therefore misses the cache, and the live route reports `no-key`.
- `persistCatalog` writes `credential` into the record (`:268`). `readPersistedCatalog` returns it, and `PersistedModelCatalog.credential` was added.
- The saved-list rung serves a record only when its fingerprint matches (`:479`). Otherwise the result is `unavailable` and a debug line is logged.
- Specs in `provider-models.fallback-chain.spec.ts`:
  - "a deleted key never reads the list cached under it: no-key"
  - "two keys on one provider never share a cached list"
  - "a list saved under another key is not shown: unavailable"
  - The record write now asserts the fingerprint and that the raw key is not in the write.
  - The `record()` fixture writes the fingerprint.
- `provider-models.opencode.spec.ts` now expects `credential: ''`.
- Residual: there is still one saved record per provider, overwritten by the last agent that fetched. A second agent with another key now gets `unavailable` on an offline failure instead of the other account's list. The sync tier reader (`readLiveCatalog`) is still per provider; see "Deferred".

### S4 - The agy replacement id is always a live id and keeps the chosen effort

- `agyModelId(value, liveIds, logger, effort?)` (`antigravity-cli.adapter.ts:352`). The chosen effort is the saved id's own effort suffix, or else the lane's `reasoningEffort`.
- It picks the closest live base and then tries only ids that are in `liveIds`, in this order:
  1. `<base>-<chosen effort>`
  2. the bare `<base>`
  3. `<base>-medium|high|low|xhigh|max` (`AGY_DEFAULT_EFFORT_ORDER`, `:336`)
- If no close base exists, the saved id passes through unchanged and agy reports it. No derived id outside the live list is ever produced.
- Both call sites pass the effort: the stream-json args and the ACP model option.
- Specs:
  - `antigravity-cli.adapter.spec.ts`: `claude-sonnet-4-6` -> `claude-sonnet-5-5-medium` (pinned fixture, no bare base); `claude-sonnet-4-6-high` -> `claude-sonnet-5-5-high`; the existing `claude-opus-4-8` + `high` -> `claude-opus-5-5-high`; a new `agyModelId` block (chosen effort, bare base, variant fallback, "never an id the live list does not hold").
  - `antigravity-cli.adapter.acp.spec.ts`: ACP now sends `claude-sonnet-5-5-medium`. The ACP profile accepts full ids, and an id that carries an effort sends no `thought_level`.
- Not verified against a real `agy models` run in this round. The pinned 1.5.14 fixture lists only suffixed Claude ids.

## Moderates fixed (local)

- **Ollama 401/403 -> `auth-rejected`, so no saved-list fallback.** Fixed in `ollama-cloud-metadata.service.ts:579` (ollama.com `httpJson`) and `ollama-model-discovery.service.ts:666` (local `httpRequest`). Specs: the metadata `it.each` HTTP 401/403 rows, and the discovery transport "rejects HTTP 401/403 as auth-rejected".
- **Ollama `tagsCache` ignored the key.** The cache is now scoped to a SHA-256 fingerprint of the key (`ollama-cloud-metadata.service.ts:147`, `:230`). Spec: "scopes the tags cache to the API key…".
- **OpenCode multi-`api` rows were dropped.**
  - `rowProtocol` still uses `recommended_api` first, then the single-key rule.
  - A row with several `api` keys now takes the most preferred protocol among its own resolvable keys: Messages, then Responses, then Chat Completions (`opencode-live-routes.ts:111`, `:139`).
  - Specs: "routes a multi-api row without a usable recommendation…". The "only unroutable rows" case now uses really unroutable keys.
  - Not changed: an unchecked `recommended_api` that names a protocol outside the row's `api` keys. The existing spec "prefers recommended_api over the api keys" pins that behaviour, and it was not in this brief.
- **The agy probe failure was not cached.** A probe that listed nothing or failed is now kept for 60 s (`AGY_MODEL_IDS_RETRY_MS`, `antigravity-cli.adapter.ts:179`, `currentModelIds` `:1030`), so each spawn no longer waits up to 8 s. Spec: "does not re-probe agy models for every spawn after a failed probe".
- **The `CliDetectionService` model map pinned failures.** A map in which any CLI threw is returned but not cached (`cli-detection.service.ts:508`). Spec: "does not cache a model map in which a CLI failed…".
- **Copilot `isAuthenticated()` unguarded, and the Anthropic direct fallback.** Covered under S1.

## `sdk-model-service.ts` persisted catalog (`ptah.sdk.modelCatalog`)

- **No static repo rows.** It holds only SDK `supportedModels()` or `/v1/models` answers, tier-mapped from env for third-party providers. Every entry is written by `cacheModels` or `revalidateCatalog`, and only from a fetched non-empty list. The degraded API-key fallback is never persisted.
- **It does serve saved rows as live:**
  - `getSupportedModels` and `getNativeClaudeModels` return a restored entry with no "saved" marker, no age limit and no schema/origin stamp. A revalidation runs 10 s later.
  - Keys are auth fingerprints (secrets hashed). The `native` key is fixed and is cleared only by a Ptah-driven `clearCache()`. An outside `claude logout` keeps the saved native list.
  - The `claude-cli` and `anthropic` fetchers then pass these rows to `ProviderModelsService` as live, which re-persists them with a fresh timestamp. That bypasses its 30-day age rule.
- **Not fixed here.** A fix needs a contract change: the SDK model methods would have to report the row origin (live vs restored), and the fetchers would have to map it. That spans `agent-sdk` and `rpc-handlers` and is not a one-file change. Recommended follow-up:
  1. Add `{schema, origin, savedAt}` to the entries, with a max age.
  2. Return a `{ models, origin }` result from `getNativeClaudeModels` / `getSupportedModels`.
  3. Have the fetchers throw (or mark) for a restored list, so `ProviderModelsService` reports it as `persisted`.

## Deferred (with reason)

| Item | Reason |
| --- | --- |
| claude-cli signed-out -> `not-signed-in` | The native login state is not exposed to `rpc-handlers`, and the SDK bridge returns `[]` for every failure. Needs an agent-sdk contract change (see above). |
| Anthropic direct 401 on `getApiModels` masked | `SdkModelService.fetchModelsViaApi` swallows the error into `[]` before the handler sees it. Same agent-sdk change. |
| LM Studio fabricated `contextLength: 4096`, `supportsToolUse: false` | `model-tier-derivation.ts:62` and its spec depend on the LM Studio 4096 stamp. Changing it changes tier derivation, so it is not local. |
| ollama.com `/api/show` sent without auth; per-model Sentry capture | Not verified that the endpoint needs auth; it needs a live check. The Sentry de-duplication would change the fallback-cache contract. |
| `OpenCodeLiveRoutes.list()` serving a stale live map with no signal | Needs a new failure or stale field on the routes result, which is a contract change. |
| `readPersistedCatalog` unmemoized parse plus registry write on every sync read | Needs a memo with invalidation on every write path, in a file that is already over its size limit. A behaviour-preserving refactor; not done in a fix round. |
| `ptah-cli-registry.ts` cold catalog with no `defaultTiers` spawns `''` | Needs a product decision on what to spawn with no live data. |
| `cli.strategy.ts` removed pricing seed | A decision record (`decisions.md`), not code. |
| `ptahCli:listModels` drops `savedAt`/`notice` | RPC result contract (`libs/shared`) and frontend consumer. |
| Cursor `[]` for "no key" cached in the detection map | Only failed reads are uncached now. Not caching empties would re-probe every empty CLI (agy up to 8 s) on each call; an invalidate-on-key-save hook is the better fix. |
| `recommended_api` not checked against `api` keys | An existing spec pins the current behaviour; outside this brief. |
| Minors (`modelCount` 0, `register.ts` formatter churn, `isStatic` export) | Cosmetic or intentional until B6. |

## Decisions

- **S2**: throw the remote reason instead of a flagged partial list (options and evidence above). Reversible.
- **S3**: scope only the `/v1/models` route by fingerprint. Fetcher and OpenCode lists use `''`, because `apiKey` does not reach those routes, and scoping them would split the cache on an unused value. A record with no `credential` field reads as `''`, so an older keyed record is ignored until the next live success. Reversible.
- **S4**: the variant order after the chosen effort is bare base, then medium, high, low, xhigh, max ("prefer an unsuffixed id, else a middle effort", from the review). Reversible.
- **OpenCode multi-api**: protocol preference is Messages, then Responses, then Chat Completions. Messages needs no translation, and every candidate is one the row declares. Reversible.

## Checks (focused only; logs in `.ptah/tmp/fix-*.log`)

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath …`:
  - `antigravity-cli.adapter.spec.ts`: 76/76 pass.
  - `antigravity-cli.adapter.acp.spec.ts`: 52/52 pass.
  - `cli-detection.service.spec.ts`: 27/27 pass.
  - `ptah-cli-registry-lmstudio-proxy.spec.ts` + `cli-detection.service.spec.ts`: 29/29 pass, run before the detection-cache change.
- `npx jest --config libs/backend/auth-providers/jest.config.ts …`: 12 suites, 372/372 pass. Suites: fallback-chain, opencode, provider-models.service, cross-provider-contamination, local-model-translation-proxy (new), ollama-model-discovery, ollama-cloud-metadata, opencode-live-routes, model-resolver, provider-proxy-pool, local-native.strategy, workspace-provider-profile-resolver.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts …`:
  - `provider-rpc.handlers.spec.ts` + `config-provider-session-models.spec.ts`: 81/81 pass.
  - `config-rpc.handlers.spec.ts`: 70 pass, 1 skipped (pre-existing skip).
- `npx tsc --noEmit`, lib and spec tsconfig, exit 0 for all of: auth-providers, cli-agent-runtime, rpc-handlers (with `NODE_OPTIONS=--max-old-space-size=8192`).
- `npx eslint <changed files>`: 0 errors. 26 warnings, all pre-existing: `max-lines` on `provider-models.service.ts`, `antigravity-cli.adapter.ts` and `provider-rpc.handlers.ts`, plus non-null assertions in `antigravity-cli.adapter.ts` around lines 1460-1523, which this round did not touch.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: TOTAL 0 unsuppressed sites.
- Not run (per brief): `npm run verify`, `nx`, build, e2e, container smoke specs. Not run: the full test targets of the three projects. The coordinator's gate must cover them.

## Files changed

- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts`, `provider-rpc.handlers.spec.ts`
- MODIFIED `libs/backend/auth-providers/src/lib/provider-models.service.ts`, `provider-models.fallback-chain.spec.ts`, `provider-models.opencode.spec.ts`
- MODIFIED `libs/backend/auth-providers/src/lib/providers/local/local-model-translation-proxy.ts`; CREATED `local-model-translation-proxy.spec.ts`
- MODIFIED `libs/backend/auth-providers/src/lib/providers/local/ollama-model-discovery.service.ts` (+spec), `ollama-cloud-metadata.service.ts` (+spec)
- MODIFIED `libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.ts` (+spec)
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`, `antigravity-cli.adapter.spec.ts`, `antigravity-cli.adapter.acp.spec.ts`
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-detection.service.ts` (+spec)
