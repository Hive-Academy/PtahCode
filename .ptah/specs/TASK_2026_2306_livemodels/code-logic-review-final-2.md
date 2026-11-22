# Code Logic Review (final, round 2) - fix commits e1d8ce2d2, 9a1d9db78

Verdict: APPROVED. 0 Blocking, 0 Serious.

## Resolution of prior findings

- S1 (bad Anthropic key): RESOLVED. `provider-rpc.handlers.ts` (anthropic fetcher, `hasApiKey` branch) calls `sdkAdapter.getLiveApiModels()` and throws `ModelListError(read.reason)` on any failure, with no SDK fall-through. `sdk-model-service.ts` `readApiModels` maps 401/403 to `auth-rejected`, other statuses to `http-error`, a missing `data` array to `bad-response`, an empty claude list to `empty`, and thrown errors through `classifyApiModelsError`. A failed read is not cached (cache write moved after the empty check). `fetchApiModels` keeps its `[]` contract for other callers.
- S2 (saved-list notice on the tier modal, reassign popover and decision-model suggestions): RESOLVED. All three call the shared `savedModelListNotice(result)`, which returns null when `result.error` is set or `source !== 'persisted'`. The notice and its Retry are bound in each template. The Retry re-runs the same load path.
- M2 (signed-out claude-cli): RESOLVED. `nativeClaudeFailureReason()` maps `signed-out` and `unknown/cli-missing` to `not-signed-in`, and any other state to `unexpected`. It is reached only when the SDK list is empty.
- M3 (`ptahCli:listModels`): RESOLVED. `savedAt` and `notice` are passed for `persisted`, and the result type has the two optional fields.
- "API API key" copy: RESOLVED. `no-key` now reads "add an API key for <name> in Settings".

## Regression checks

- New required constructor parameter (`ClaudeAmbientLoginStatusReader`): registered via `registerAuthProvidersServices` (`auth-providers/src/lib/di/register.ts:206`, `instanceCachingFactory`). Electron calls it in `phase-2-libraries.ts:262` before `registerSingleton(ProviderRpcHandlers)` in `phase-4-handlers.ts:132`. cli-engine calls it at `container.ts:746` before `container.ts:1036`. It sits before the optional parameters, so ordering is valid. The two specs that construct the handler were updated.
- Extra `claude auth status` spawns: only on the empty-list path (native login or an empty SDK result). The reader is a cached, serial single-slot reader (`claude-ambient-login-status.ts`: fresh-window cache, same-key callers join the active attempt, bounded budget, `read()` never throws). No spawn on the success path or on hot paths.
- Angular notice state resets: `loadModels` and `refreshSuggestions` set `notice: null` or omit it while loading and on error, so a stale notice cannot persist across a Retry or a provider change. The request-id guards are kept. `ProvidersModelsLoader` does not cache, so Retry reaches the host.

## Minor

- `sdk-model-service.ts` ~1558: the 5-minute `cachedApiModels` hit returns `ok` after a key is revoked until TTL expiry or `clearCache` (~1787). This predates the commits and is bounded.
- `unknown` ambient states other than `cli-missing` (for example timeout) fall to `unexpected`, which is the intended conservative result.
- The `ANTHROPIC_AUTH_TOKEN` (non-API-key) path with an empty SDK list maps to `unexpected`, not an auth reason. This is acceptable.
