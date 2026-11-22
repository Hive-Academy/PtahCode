# Backend implementation: `TASK_2026_2306_livemodels`, batch B4a (B4a.1, B4a.2)

**Verdict**: I implemented B4a.1 and B4a.2 to the plan, including Revision 2 S-C. All the
focused checks below pass: rpc-handlers lib tsc, rpc-handlers spec tsc, the 12 related
jest suites and eslint (0 errors). The 9 known spec-tsc errors in
`config-rpc.handlers.spec.ts` and `provider-rpc.handlers.spec.ts` are gone.

Two items need the caller's attention:
- I made one edit outside the write set: the `auth-providers` barrel. Without it the plan
  cannot work (see Deviations).
- These checks did not run, because the brief forbids `nx` and `verify`: the
  degradation-audit lint, the `ptah-electron` typecheck and the container smoke specs.

Nothing is staged, committed or stashed.

Worktree: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`.

## Files

### B4a.1: Provider and Ptah CLI list handlers, lane listing

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\provider-rpc.handlers.ts`
  - `provider:listModels`:
    - The no-key / `isPurelyDynamic` pre-check is deleted, and so is the string-matched 401/403 branch.
    - The handler always calls `fetchModels(providerId, key ?? null, toolUseOnly)`.
    - The new `toListModelsResult` maps the result:
      - `live` -> `{models, totalCount, source}`
      - `persisted` -> adds `failureReason`, `savedAt` and `notice: modelListNoticeText(...)`
      - `unavailable` -> `{models: [], totalCount: 0, source, failureReason, error: modelListErrorText(...)}`
    - The provider name comes from `getPtahCliLaneProvider(id)?.name`, else the id.
    - `isStatic` is no longer set.
    - `reapplyTiersForWarmedCatalog` still runs only when `totalCount > 0`.
    - A service throw (unknown provider) is still logged, captured by Sentry and rethrown.
  - Copilot fetcher:
    - The static step and the `COPILOT_PROVIDER_ENTRY` import are deleted.
    - It tracks the classified reason of the last source that threw (default `empty`).
    - When no source answers it throws `ModelListError('not-signed-in')` if `copilotAuthService.isAuthenticated()` is false, else that reason.
  - Kimi fetcher now reads `parseKimiCodeModels`. It throws `ModelListError` and never returns rows on failure:
    - no auth service or no base URL -> `no-live-source`
    - `KimiCodeAuthUnavailableError` -> `not-signed-in`
    - HTTP 401/403 -> `auth-rejected`; any other non-OK status -> `http-error`
    - parse `null` (including a body that is not JSON) -> `bad-response`
    - a thrown fetch -> `classifyModelListFailure`

    The shape log stays, and no token is logged.
  - claude-cli fetcher: an empty list still returns `[]`; only the log and comment wording changed.
  - Comment fixes: the Anthropic-direct, Ollama and provider-session fetchers no longer mention a static fallback.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\provider-rpc.handlers.spec.ts`
  - Copilot mock gains `isAuthenticated`.
  - Kimi cases:
    - lists live rows only
    - `http-error`, `auth-rejected`, and `bad-response` (×2) via it.each
    - `not-signed-in` with no fetch
    - thrown `ECONNREFUSED` -> `network`, with no token in the logs
  - The Copilot capacity case no longer asserts a static fallback. New no-answer cases: `not-signed-in`, `empty`, and the last classified reason (`network`).
  - The `provider:listModels` block is rewritten on `source`:
    - live, persisted (notice built with `modelListNoticeText` plus a `2026-11-01` date check), unavailable (fixed error, no Sentry)
    - a provider outside the registry is named by its id
    - the keyless call still reaches the service
    - Sakana with a key; the warm and no-warm cases; unknown provider -> Sentry and an RPC failure

    The short-circuit and 401 string-mapping cases are deleted. **This clears the 6 known
    errors at `:1417-1638`.**
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\ptah-cli-rpc.handlers.ts`
  - Injects `AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS` (`Pick<ProviderModelsService,'fetchModels'>`) and `TOKENS.AUTH_SECRETS_SERVICE`, both with explicit `@inject`.
  - `ptahCli:listModels`:
    - Reads the key with `resolveAgentKey`, following the A5 rule. `anthropic-api` with `credentialSource: 'shared-connection'` reads `getCredential('apiKey')`; every other agent reads `getProviderKey('ptahCli.<id>')` (`PTAH_CLI_KEY_PREFIX`). A blank key becomes `null`.
    - Calls `fetchModels(providerId, key, false)` and maps the result to `{models, source, failureReason?, error?}`, with `error` from `modelListErrorText`.
    - "Agent not found", "Provider not found" and the outer catch keep their text and add `source: 'unavailable'`.
    - The key is never logged.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\ptah-cli-rpc.handlers.spec.ts`: the harness gains `providerModels` and `authSecrets`. The listModels block covers:
  - agent not found (no fetch)
  - live, with the agent key slot
  - shared connection, with the host credential
  - a blank key -> `null`, with `unavailable` mapped to the fixed error
  - persisted
  - provider not found
  - a thrown registry error
  - the key absent from logs and from the result
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\services\lane-model-listing.adapter.ts`
  - The port returns `source` plus a deprecated optional `isStatic`, which stays until B6.3.
  - `runDiscovery` maps `unavailable` -> `{kind:'error', reason:'threw'}`, `persisted` -> provenance `fallback`, `live` -> `reported`.
  - `isPurelyDynamic`, `DiscoverySkipped` and the `skipped` path are deleted, along with the `getPtahCliLaneProvider` import.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\services\lane-model-listing.adapter.spec.ts`
  - `FetchResult` now carries `source`.
  - The "static -> fallback" case became "persisted -> fallback".
  - The two key pre-check cases became one case: `unavailable` -> a `threw` miss, with `fetchModels(..., null, ...)` called.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\services\cli-model-list.service.ts`: comments only. The seven "curated list" comments now name the adapter's own `listModels()` answer.

### B4a.2: Config readers and native child admission (with S-C)

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\config-saved-model-option.ts`
  - The registry import is dropped.
  - The option is offered only when `cachedModelIds?.includes(saved)`, as `{id, name: id, description: ''}`.
  - The unused `providerId` parameter is removed (signature `savedModelOption(savedModel, cachedModelIds)`).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\config-provider-session-models.ts`
  - `ProviderCatalogReader` now returns `{models, source, failureReason?}`.
  - `unavailable` takes the `catalogFailed` path: default plus the saved model, and `onCatalogFailure(new ModelListError(reason ?? 'unexpected'))`.
  - `onCatalogFailure` is called once, outside the try.
  - A `persisted` list is listed like a live one.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\config-provider-session-models.spec.ts`, 7 cases:
  - live with the saved model selected
  - persisted, with no failure reported
  - a retired saved id is not invented into the list
  - **unavailable -> default + saved**, with a `ModelListError('network')`
  - unavailable without a reason -> `unexpected`
  - unavailable with nothing saved -> default only
  - a thrown read still keeps the saved model
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\config-rpc.handlers.ts`
  - The `appendSavedModel` call (old `:640`) no longer passes `providerId`.
  - The caller at `:538` already passes the `fetchModels` result through unchanged.
  - The `seedStaticModelPricing` mention in the `config:pricing-get` doc (`:184`) is replaced.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\config-rpc.handlers.spec.ts`
  - The `fetchModels` mocks add `source: 'live'`. `isStatic: false` is kept, per correction 4. **This clears the known error at `:1123`.**
  - New case: an `unavailable` agy list keeps the saved model selected and warns with `Model list unavailable: not-signed-in`.
  - See also "Out-of-set spec fixes" for two fixture fixes inside this file.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\chat\session\child-model-admission.ts`
  - `nativeChildModelIds(catalog)` returns the catalog ids only (deduplicated).
  - `resolveNativeTierAlias(model, catalogIds, logger?)`:
    - `opus|sonnet|haiku`: the `claude-cli` `defaultTiers[tier]` preference if live, else `closestLiveModel(preference, catalogIds)`, else the newest `claude-<tier>-<n…>` in the catalog (numeric compare), else the alias.
    - `fable` -> the newest `claude-fable-<n…>`, else the alias.
    - Any other model is unchanged.
    - A replaced preference logs a warn with `{tier, preferred, resolved}`.
  - Following D6, a tier preference never admits a model.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\chat\session\child-model-admission.spec.ts`: rewritten:
  - catalog-only ids, and `[]` stays `[]`
  - a live preference for each tier
  - **a retired preference admits the successor** (`claude-opus-99-0`), with a warn carrying both ids
  - successor over predecessor, with `[1m]` ids excluded
  - an alias with no tier id is kept
  - `fable` resolves to the newest by numeric compare; `fable` with no match is kept
  - pass-through ids are unchanged
  - native-profile detection
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\chat\session\chat-session.service.ts`, `resolveAgentChildModel` (S-C, Task 4a.2.4):
  - `native` is hoisted.
  - Native profile with an empty catalog: `passNativeChildModelThrough(input.model)` runs before the empty-catalog refusal.
  - Native profile whose catalog read throws: the catch also passes the model through, with a `degradation-audit: reported` marker.
  - The pass-through returns `{accepted: true, resolvedModel: <requested model unchanged>}`. It warns **once** per service instance (`nativeChildPassThroughWarned`); later pass-throughs log at debug.
  - Non-native profiles still return `model-catalog-unavailable`.
  - The caller now passes `acceptedModels` and the logger to `resolveNativeTierAlias`.
- MODIFIED (out of the write set, required) `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\index.ts`: adds `ModelListError`, `classifyModelListFailure` and `type ProviderModelList` to the barrel (see Deviations).

### Out-of-set spec fixes

- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\chat\session\chat-session-agent-child.spec.ts`: Task 4a.2.4 names this as "the chat-session spec that covers admission". Its native cases encoded the removed static union (`claude-*-5-5`, `claude-fable-5-2` admitted "despite an old SDK catalog"). New cases in a `native Claude profile` block (preferences are read from the registry `defaultTiers`, ids are fixtures):
  - each tier admits its preference when the catalog lists it
  - a retired preference admits the successor, with a warn
  - `fable` resolves to the newest id
  - a concrete id is admitted, and an unlisted one is refused
  - listing returns catalog ids only
  - **S-C**: an empty native catalog passes `opus` and `claude-any-model` through unchanged with exactly one pass-through warn, and does not log the "empty model catalog" refusal
  - **S-C**: a native catalog throw passes the model through
  - **a non-native profile with an empty catalog still returns `model-catalog-unavailable`**, and so does an empty ambient catalog with no profile
- `config-rpc.handlers.spec.ts` (inside the set), two cases at `:1458` and `:1501`: the saved `claude-haiku-4-5` used to be offered with the name "Claude Haiku 4.5" from the registry's static rows. The fixtures now put that id in `getCachedModelIds`, and the expected name is the id itself.

## Checks

| Command | Log | Result |
| --- | --- | --- |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` (before edits) | `.ptah/tmp/b4a-tsc-spec-before.log` | 9 errors, the known debt |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` | `.ptah/tmp/b4a-tsc-lib.log` | exit 0 |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` (final) | `.ptah/tmp/b4a-tsc-spec.log` | exit 0, **0 errors** |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 11 suites: chat-session-agent-child, child-chat-session-host.adapter, child-model-admission, config-provider-session-models, config-rpc.handlers, provider-rpc.custom-entries, provider-rpc.handlers, ptah-cli-rpc.handlers, register-shared-rpc-handlers, lane-model-listing.adapter, cli-model-list.service | `.ptah/tmp/b4a-jest.log` | 9/11 passed at first. 2 failures were fixed (see below) |
| Re-run of the 2 suites that failed | `.ptah/tmp/b4a-jest2.log` | 2/2 suites passed, 77 passed, 1 skipped (already skipped before) |
| Re-run of `config-provider-session-models.spec.ts` after prettier | `.ptah/tmp/b4a-jest3.log` | 7/7 passed |
| `npx eslint <17 changed .ts files>` | `.ptah/tmp/b4a-eslint.log` | 0 errors. 3 `max-lines` warnings on files that were already over the limit (chat-session.service, config-rpc.handlers, provider-rpc.handlers) |

The two failures in the first run:
- `config-provider-session-models.spec.ts` was missing `reflect-metadata`, which the `auth-providers` barrel needs. Fixed.
- `config-rpc.handlers.spec.ts` had two static-row fixtures (see Out-of-set spec fixes). Fixed.

Related-spec grep: specs in `libs/backend/rpc-handlers/src` that reference `isStatic`, `savedModelOption`, `resolveNativeTierAlias`, `nativeChildModelIds`, `providerSessionModelOptions`, `LaneModelListingAdapter`, `PtahCliRpcHandlers`, `ProviderRpcHandlers`, `mergeKimiCodeModels`, `getNativeClaudeModels`, `resolveAgentChildModel` or `listAgentChildModels`. All matches are in the jest run above.

These checks did not run because the brief forbids `nx`, `verify` and container smoke specs. The coordinator should run them:
- the B4a gate: `npm run verify -- -p @ptah-extension/rpc-handlers`
- `npm run verify -- -t typecheck -p ptah-electron`
- `npm run verify -- -t lint -p degradation-audit`. New catches carry markers: three Copilot source catches, the Kimi fetch catch, the Kimi `json()` catch and the native pass-through catch in `chat-session.service.ts`.
- `PtahCliRpcHandlers` gained two constructor dependencies. Both tokens are already registered on Electron, but no container smoke spec ran.

Prettier: 12 of the modified files were already unformatted at HEAD (checked against `git show HEAD:<file>`). I did not reformat them, to keep the diff reviewable; lint-staged formats them at commit. Only the new spec was run through `prettier --write`.

## Deviations

1. **`auth-providers` barrel export** (outside the write set). `ModelListError`, `classifyModelListFailure` and `ProviderModelList` were not exported from `@ptah-extension/auth-providers`. Plan Tasks 4a.1.1 and 4a.2.2 require `ModelListError` in rpc-handlers, and imports must go through the barrel. I added three re-export lines (additive only).
   - Options: export the names; or fake the reason without `ModelListError`, which cannot express `not-signed-in` and breaks the closed reason set. I chose the export.
   - Reversible: yes.
2. **`savedModelOption` signature**: I dropped the `providerId` parameter, which became unused once the registry read was gone. Its only caller, `config-rpc.handlers.ts:appendSavedModel`, is in the set and was updated.
3. **Copilot "no session" signal**: `CopilotAuthService.listModels()` swallows its own errors and returns `[]`, so it cannot report "not signed in". I use `copilotAuthService.isAuthenticated()`, which is evaluated only after all three sources came back empty.
4. **Kimi `no-live-source`**: when the Kimi auth service is not injected, or the registry has no base URL, the fetcher throws `no-live-source`. It does not throw `not-signed-in`, because it cannot tell whether a sign-in exists.
5. **S-C on a catalog throw**: the plan says "empty or `unavailable`". The native catalog read (`getNativeClaudeModels`) can also throw, so the catch passes the model through for native profiles too. Non-native throws keep `model-catalog-unavailable`.
6. **Lane port key**: `runDiscovery` still reads `getProviderKey(providerId)`. The A5 per-agent rule applies to `ptahCli:listModels` only; for the lane adapter the plan asks only for the `source` mapping.

## Decisions

- Provider display name for the notice and error copy: `getPtahCliLaneProvider(id)?.name ?? id`. The virtual `anthropic` provider therefore reads "anthropic", and a spec pins this.
  - Options: a new name map, which would mean new literals.
  - Evidence: `provider-rpc.handlers.ts` already used this lookup in the deleted auth branch.
  - Reversible: yes.
- The S-C warn fires once per `ChatSessionService` instance (a singleton). Repeats log at debug.
  - Evidence: the batch wording "warn once".
  - Reversible: yes.

## Out-of-scope observations

- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\rpc-handlers\src\lib\handlers\agent-rpc.handlers.ts:15`: a doc comment still says "the curated CLI list is used". This file is not in B4a's write set.
- `ptahCli:listModels` reads `params.id` without a zod parse. The gap already existed and was not in scope.
- Provider-session and Codex fetchers still return `[]` on failure, so the chain reports them as `empty` and not with a classified reason. The plan does not ask to change them.
