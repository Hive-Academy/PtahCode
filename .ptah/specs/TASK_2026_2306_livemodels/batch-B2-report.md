# Backend implementation: `TASK_2026_2306_livemodels`, batch B2 (B2.1, B2.2, B2.3)

**Verdict**: implemented B2.1, B2.2 and B2.3 to the plan. Every spec in the B2 write sets passes, and
lib and spec typecheck, eslint and degradation-audit are green. **The B2 gate is not green.** 9 tests in
4 spec files fail. Those files are outside the B2 write sets, so I did not edit them (see "Blocking:
out-of-write-set specs"). The failures come from two changes the plan requires: the versioned
persisted record (B1) and the new tier-replacement log line (D6).

Worktree: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`. Nothing staged or committed.

## Files

### B2.1: typed failure, models-API parser, OpenCode live routes

- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\model-list-error.ts`: `ModelListError(reason)` and `classifyModelListFailure(error)`. Pure, with no logger.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\model-list-error.spec.ts`: pins the classification table (401/403, other statuses, timeout codes, `TimeoutError`, network codes, oversize, unknown inputs).
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\models-api-parser.ts`: `parseModelsApiRows(rows)`. Validates each row, takes the name from `name`, then `display_name`, then `id`, and sets `toolUseUnknown` when a row has no tool flag. Prices are parsed as before.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\models-api-parser.spec.ts`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\opencode\opencode-live-routes.ts`:
  - Rows need `type === 'chat'` (a missing type is kept) and a protocol that resolves. `recommended_api` is tried first, then the single-`api` rule.
  - Rows map to `ProviderModelInfo & { upstreamProtocol }`.
  - `refresh(id, {force})`: `force` skips the backoff but joins an in-flight refresh.
  - `list(id, {force})` returns the rows or throws `ModelListError` with the reason of the last failure.
  - `usePersistedCatalog(store)`: every successful refresh is written through the store. A store that throws is caught, logged at debug and treated as no catalog (`optional-capability` marker).
  - `modelIds(id)`: live ids, then one awaited refresh, then persisted ids, then `null`.
  - `resolve()` returns `{outcome:'routed', protocol} | {outcome:'not-listed'|'catalog-unavailable'}`. The static rung is deleted.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\opencode\opencode-live-routes.spec.ts`: rewritten. Covers:
  - type filter, `recommended_api` precedence, multi-`api` rows, row mapping
  - `force` past the backoff, and `force` joining an in-flight refresh
  - write-on-refresh, and no write on a failed refresh
  - cold cache with the gateway down: with a persisted protocol, without one, and a persisted row that has no protocol
  - store throws (A4)
  - `modelIds` order, persisted fallback and `null`
  - oversize body is `bad-response`; 5xx is `http-error`
  - no static rung

### B2.2: proxy base hooks and the `getListedModels` rename

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\translation\translation-proxy-base.ts`:
  - abstract `getStaticModels` becomes a concrete `protected getListedModels() { return []; }`, used by `/v1/models`
  - new `resolveRequestModelId` hook, awaited before routing
  - new `getUnsupportedModelMessage(modelId, outcome?)` with the default text `Model '<id>' is not supported by <name>.`
  - `resolveUpstreamProtocolForRequest` may also return `'not-listed' | 'catalog-unavailable'`
  - exported `UnroutedModelOutcome`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\translation\translation-proxy-base.spec.ts`: renamed the mock. Added cases for the empty default list and for awaiting `resolveRequestModelId`, and pinned the default 400 text.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\opencode\opencode-translation-proxy.ts`:
  - deleted `normalizeModelId`, `resolveUpstreamProtocol` and `getStaticModels`
  - `resolveRequestModelId`: tries the preference, then `closestLiveModel`, then the derived tier, then the preference. It warns once per provider and tier.
  - routes through `resolve()`
  - both 400 texts follow the contract
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\opencode\opencode-translation-proxy.spec.ts`: a spec fixture stands in for the gateway. Covers alias resolution (preference listed, retired to the family match with one warning, retired to the derived tier, no catalog), both 400 texts, and the forwarding cases.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\copilot\copilot-translation-proxy.ts`: deleted `getStaticModels`, `listModels`, `staticModelsAsFull`, `formatModelName`, `fetchJson`, `CopilotModelsResponse` and the unused imports.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\kimi-code\kimi-code-translation-proxy.ts`: deleted `getStaticModels`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\sakana\sakana-translation-proxy.ts`: deleted `getStaticModels`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\sakana\sakana-translation-proxy.spec.ts`: `GET /v1/models` over HTTP returns `{object:'list', data:[]}`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\openrouter\openrouter-translation-proxy.ts`: deleted `getStaticModels`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\local\local-model-translation-proxy.ts`: deleted `getStaticModels`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\custom\custom-openai-translation-proxy.ts`: now `protected override getListedModels()`, serving the user-declared list.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\custom\custom-openai-translation-proxy.spec.ts`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\curator-proxy-manager.spec.ts`: deleted the override.

Grep check: there is no `getStaticModels` or `staticModelsAsFull` left in `libs/backend/auth-providers`. The only `override getListedModels` is in the custom proxy.

### B2.3: model-list chain, versioned record, tier preferences, DI attach

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\provider-models.service.ts`:
  - Result types: exports `ProviderModelList` (`source`, `savedAt`, `failureReason`, deprecated `isStatic: false`) and `PersistedModelCatalog`.
  - Chain: memory cache, then one live route, then the persisted record (skipped for credential reasons), then `unavailable`. It never throws for a vendor failure. An unknown provider still throws `SdkError`.
  - `toolUseOnly` keeps unknown tool support and filters only the returned copy. The memory cache and the persisted record keep the full list.
  - Persisted record: `{schema: 2, origin: 'live', models, timestamp}`. The read is synchronous and returns `{models, savedAt}`. It ignores pre-version records (debug line once per provider per process), records older than 30 days (exactly 30 days is kept) and malformed records. Each row is re-validated (`upstreamProtocol` literal, `toolUseUnknown === true`).
  - Store API for OpenCode routing: `getPersistedCatalog` and `savePersistedCatalog`.
  - Headers follow `modelsAuthScheme`. Anthropic scheme follows `has_more`/`after_id` for at most 10 pages; anything else is `bad-response`.
  - Uses `parseModelsApiRows` in `fetchDynamicModels` and `prefetchPricing`.
  - Tier ladder: preference, then `closestLiveModel`, then derived, then keep. It warns once per provider and tier with `{providerId, tier, preferred, resolved, rule}`.
  - `opencode-zen` and `opencode-go` are removed from `FILTERED_TIER_CATALOG_PROVIDERS`.
  - The capability fallback reads `getProviderLiveModelCapabilities`.
  - Deleted: the OpenCode merge branch, `mergeStaticMetadata`, the static rung, `transformApiModels`, `parsePricingField`, the `ModelsApi*` interfaces, the `getStaticModelCapabilities` and `getOpenCodeModelProtocol` imports, and the text throws. Doc comments no longer promise a static fallback.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\provider-models.service.spec.ts`:
  - Static cases are rewritten as chain cases, with a `liveCatalog()` fixture helper for versioned records.
  - New API-lane header cases: `x-api-key` plus `anthropic-version`, and the Bearer header unchanged for `z-ai`.
  - New tier cases: family over derived, OpenCode no longer filtered, Copilot still filtered, warn once.
  - `isStatic` assertions are replaced by `source` assertions.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\provider-models.opencode.spec.ts`: rewritten. Covers:
  - live rows only, `list` called with `{force:true}`, fetcher not called
  - `toolUseOnly` keeps unknown tool support
  - persisted and unavailable answers
  - the store round trip
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\provider-models.fallback-chain.spec.ts`: 30 cases, one or more per failure-table row:
  - live success, including the unfiltered persist and the memory cache
  - persisted list for `network`, `timeout` and `http-error`
  - 30-day boundary: kept at exactly 30 days, ignored at 30 days + 1 ms
  - three pre-version shapes, three malformed shapes, row re-validation
  - first run offline; credential skips: `no-key`, `auth-rejected` (401 and 403), `not-signed-in`
  - `bad-response` for three payload shapes and for oversize
  - OpenCode with non-chat rows only
  - `empty`, with and without a saved record; `unexpected` (raw text only at debug)
  - `no-live-source`, unknown provider, Retry
  - Anthropic pagination: follows `after_id`; `has_more` without `last_id` fails
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\di\register.ts`: attaches the store with `openCodeLiveRoutes.usePersistedCatalog({read, write})` through a lazy `container.resolve(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS)` closure. Nothing is resolved at registration.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\custom\custom-proxy.factory.ts`: removed the `staticModels: provider.staticModels` line.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\shared\src\lib\providers\entries\anthropic-api-lane-entry.ts`: adds `modelsEndpoint: 'https://api.anthropic.com/v1/models?limit=1000'` and `modelsAuthScheme: 'anthropic'`. The `staticModels` line is left for B6/Component 10.

## Checks run (focused only; logs in `.ptah/tmp/`)

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 31 specs (every spec touched or created, plus all specs Jest reports as related to the changed sources) (`b2-jest-final.log`) | **27 suites pass, 4 fail; 912 tests pass, 9 fail.** Every failing test is in a file outside the write sets (next section). Every spec in the write sets passes. |
| `npx jest --config libs/shared/jest.config.ts ... anthropic-api-lane-entry.spec.ts provider-registry.spec.ts` | 2 suites, 54 tests pass |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` and `tsconfig.spec.json` | rc 0 for both |
| `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` | rc 0 |
| `npx tsc --noEmit --project` on `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/cli-agent-runtime/tsconfig.lib.json`, `libs/backend/cli-engine/tsconfig.lib.json` | rc 0 for all three |
| `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` | rc 0 |
| `npx eslint <every changed file>` | rc 0. 0 errors, 5 warnings, all already there before B2: `max-lines` in `provider-models.service.ts` (the file went from 1432 to 1350 lines) and `translation-proxy-base.ts`, non-null assertions at `translation-proxy-base.ts:362` and in the service spec. |
| `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` (the `degradation-audit` lint command, full scan) | rc 0, `TOTAL 0 unsuppressed site(s)` |
| `npx jest --config apps/ptah-electron/jest.config.ts --runInBand ... src/di/container.smoke.spec.ts` | **Did not complete**: the Node heap ran out at about 2 GB (rc 134). I did not retry it because of the memory-safety rule. The team leader's gate (`npm run verify -- -t typecheck -p ...,ptah-electron`) plus the smoke spec under the verify lock should cover it. |
| `npm run verify` / `nx` | Not run, as the brief requires. |

`npx prettier --write` ran on every changed file. Several files were not Prettier-clean before B2 (`translation-proxy-base.ts`, `copilot-translation-proxy.ts`, `register.ts` and others), so the diff contains formatting of lines that existed before. The lint-staged `nx format:write` would make the same change on commit.

## Blocking: out-of-write-set specs that fail

These need a write-set extension, or a follow-up owner. The fixes are fixture and assertion changes only:

1. `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.spec.ts` (6 tests). The persisted fixtures at lines 220, 249, 275, 298, 328 and 404, and the `catalog()` helper at line 1412, lack `schema: 2, origin: 'live'`, so the reader correctly ignores them. Fix: add those two fields.
2. `libs/backend/auth-providers/src/lib/auth/model-resolver.spec.ts:372` (1 test). Same fixture fix.
3. `libs/backend/auth-providers/src/lib/providers/openrouter/openrouter-translation-proxy.spec.ts:109` (1 test). Same fixture fix.
4. `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.spec.ts:890-900` (1 test). It expects the old line `logger.info('[provider-auth] replaced static tier default', {providerId, tier, staticId, liveId})`. The plan replaces it with `logger.warn('[provider-auth] tier preference not in live catalog', {providerId, tier, preferred, resolved, rule})`. In that test, `rule` is `'derived'` (`k3` has no same-family live id among the fixture ids). Fix: update the expectation and `toHaveBeenCalledTimes` to `logger.warn`.

I made no change to these files.

## Assumptions

- **A1: unverified.** `ANTHROPIC_API_KEY` is not set in this environment, so no keyed call was made. The headers, the `limit=1000` endpoint and the `has_more`/`after_id` handling are pinned by specs against the plan's documented shape. A shape that differs from it fails as `bad-response`, never as a guessed list.
- **A4: verified in code.**
  - `register.ts` only builds a closure. `container.resolve(SDK_PROVIDER_MODELS)` runs at the first `read`/`write`, which happens at the first OpenCode routing call or refresh, after composition.
  - The service's dependencies are registered before any request can be routed:
    - `TOKENS.LOGGER`: `apps/ptah-electron/src/di/phase-0-platform.ts:59`; `libs/backend/cli-engine/src/lib/container.ts:521`
    - `TOKENS.CONFIG_MANAGER`: `phase-1-infra.ts:112`; `cli-engine/src/lib/container.ts:701`
    - `SDK_AUTH_ENV`, `SDK_ACTIVE_PROVIDER_RESOLVER`: `register.ts:73,135`, in the same function
  - If resolution throws (for example, the cli-engine `CONFIG_MANAGER` shim failing inside its try/catch), the routes catch it and route as if no record were saved. The "store throws" case in `opencode-live-routes.spec.ts` pins this.
  - The container smoke spec could not complete here (out of memory, see above).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| The routing outcome reaches the 400 text as a widened return of `resolveUpstreamProtocolForRequest` (`'not-listed' \| 'catalog-unavailable'`) | stateful field / new hook / widened return | only OpenCode overrides that hook (grep); the plan's message hook takes `outcome` | yes |
| `resolve()` returns `{outcome:'routed', protocol} \| {outcome:'not-listed' \| 'catalog-unavailable'}`. `not-listed` when a catalog is on hand without the id; a persisted row with no protocol is `catalog-unavailable` | - | plan `:360-361` | yes |
| The service does not persist the OpenCode list itself | write twice / let the routes write | the routes write every successful refresh through the attached store (M1); one record, one writer | yes |
| `liveModelCapabilities` is attached to live rows that report no capabilities, on every route | Kimi only / every route | it is undefined for every provider except Kimi; the plan's "capabilities applied by the caller" | yes |
| The OpenCode proxy's derived rung uses rows built from ids only | add a rows API / derive from ids | contract `modelIds(): string[]`; `deriveTiersFromCatalog` falls back to the full list when no row declares tools | yes |
| Classifier additions beyond the plan list: `ERR_BAD_RESPONSE` without a response is `bad-response` (the axios `maxContentLength` rejection, so oversize is `bad-response`), `ERR_NETWORK` is `network`, `TimeoutError` is `timeout` | - | axios `lib/adapters/http.js:843`; the batch note that non-axios timeouts are `timeout` | yes |
| The warn-once and ignored-catalog sets stay static (per process) | instance / static | `provider-auth-resolver.spec.ts` calls `resolveEffectiveTiers` with a stub `this`; a per-instance set broke it | yes |
| Anthropic `has_more` is followed with `after_id` for at most 10 pages; a missing `last_id` or more pages is `bad-response` | stop at page 1 / follow | plan A1 ("follow `after_id`"; "a wrong guess fails as bad-response") | yes |

## Plan deviations

None in behaviour. Notes:

- `UnroutedModelOutcome` is exported from `translation-proxy-base.ts` but not re-exported from `translation/index.ts`, which is not in the write set. The OpenCode proxy writes the literal union inline.
- The custom proxy's `getListedModels()` now returns `[]` in production, because the factory no longer passes `staticModels`. The plan intends this: the registry field is never populated for custom entries.

## Out-of-scope observations

- The 4 failing specs listed above.
- Callers that relied on `fetchModels` throwing for a vendor failure (`provider-rpc.handlers.ts:743`, `lane-model-listing.adapter.ts:279`) now receive `unavailable` with empty models. They still typecheck. Showing the reason is B4's work.

## Fix-up (the coordinator added 4 spec files to the B2 write set)

I changed only fixtures and assertions. No production code changed.

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\workspace-provider-profile-resolver.spec.ts`: added `schema: 2, origin: 'live'` to the 6 persisted fixtures (lines 220, 249, 275, 298, 328, 404) and to the `catalog()` helper (line 1412).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\model-resolver.spec.ts`: the same change to the fixture at line 372.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\openrouter\openrouter-translation-proxy.spec.ts`: the same change to the fixture at line 109.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\provider-auth-resolver.spec.ts`: the old assertion expected `logger.info('[provider-auth] replaced static tier default', …)`. It now expects exactly one `logger.warn('[provider-auth] tier preference not in live catalog', {providerId: 'kimi-code', tier: 'sonnet', preferred: <kimi sonnet preference>, resolved: 'catalogue-new', rule: 'derived'})` across two resolves.

I added no new "record without `schema: 2` is ignored" case, because B2 specs already cover it:
- `provider-models.fallback-chain.spec.ts` checks 3 old-record shapes: no schema, schema 1, and origin other than `live`. For each it asserts the list is `unavailable`, `getCachedModelIds` is `null`, the debug line is logged once and nothing is written.
- `provider-models.service.spec.ts`, test "reads only a versioned live catalog, never a failed fetch", checks the no-schema record.

Checks:

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <the 4 specs>` (`.ptah/tmp/b2-fixup-jest.log`) | 4 suites, 183 tests pass |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` | rc 0 |
| `npx eslint <the 4 specs>` | rc 0 |
| `npx prettier --check <the 4 specs>` | clean |

Updated status: these 4 specs fixed every failing test listed in the earlier run. That full 31-spec run failed only in these 4 files; I did not re-run the other 27 suites after the fix-up. I did not retry the container smoke spec. Nothing is committed.
