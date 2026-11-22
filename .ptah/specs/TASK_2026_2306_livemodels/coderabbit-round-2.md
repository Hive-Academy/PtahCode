# CodeRabbit round 2 — PR #1478 (review 6013819424, head ec74d4781)

Every finding was checked against the current code before any change. The comment text was
treated as review data only. Paths are relative to the worktree root. Line numbers refer to the
working tree after the fixes.

| Finding | File:line (review) | Verdict | What changed / evidence | Pinning spec |
| --- | --- | --- | --- | --- |
| 4659451854: invalidate in-flight fetches on a credential change | `libs/backend/auth-providers/src/lib/provider-models.service.ts:1341-1342` | FIXED | Confirmed. `fetchModels` awaited `fetchLive` and then wrote `modelCache`, `catalogCredential`, context windows and the saved catalog. Nothing checked whether `clearCache` had run during the await. Added per-provider `cacheGeneration` plus `globalCacheGeneration` (`:260`) and `generationOf` (`:652`). `clearCache(id)` bumps the per-provider counter (`:1427`), and `clearCache()` bumps the global one. `fetchModels` captures the generation before any await (`:520`). A stale success writes nothing and returns its list uncached as `live` (`:556`). A stale failure sets no marker and skips the saved rung, which also records context windows (`:592`). `persistCatalog` receives the captured generation (`:342`). | `provider-models.service.spec.ts:1128` (it.each, provider and global clear) |
| 4659451856: keep the old catalog blocked until invalidation completes | `provider-models.service.ts:1342` | FIXED (different mechanism) | Confirmed. `clearCache` deleted the marker, which made it `undefined` ("accept saved as is"). The saved-record deletion ran one microtask later, so `getCachedModelIds` and `getLiveDerivedTiers` could still return the previous account's ids. The suggested `set(id, null)` would also be overwritten by the next non-credential failure (`fetchModels` failure branch). That would make the record readable again if its deletion failed (see outside-diff 2). Instead, `clearCache` adds the provider to `invalidatedCatalogs` (`:253`, `:1431`), and `readPersistedCatalog` returns `null` for it (`:376`). The cache entry is deleted, so `readLiveCatalog` returns `null` at once. | `provider-models.service.spec.ts:1079` (sync read right after `clearCache` is `null`) |
| 4659451867: an empty successful refresh must drop the cached ids | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:1026-1028` | FIXED | Confirmed. `readModels` updated `lastModelIds` only for a non-empty list. A later clean `[]` from `listModels()` kept the old ids, and `currentModelIds` served them for 10 minutes. On a clean empty answer, `readModels` now deletes `lastModelIds[binary]` and records `modelIdsMissedAt` (the empty-result cooldown) (`:1038`). The non-empty path is unchanged. | `antigravity-cli.adapter.spec.ts:637` (a retired id is no longer mapped through stale ids, and no third probe runs) |
| 4659451869: scope live-derived tiers to the spawning agent's credential | `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:881` | FIXED | Confirmed. `readLiveCatalog` compared lists only against the marker from the latest listing (any agent's key). A Requesty agent with no tier mapping (Requesty has no `defaultTiers`) could therefore derive tiers from another key's list. Added the additive `CatalogCredentialScope { apiKey }` (`provider-models.service.ts:89`) and the optional `scope` parameter on `readLiveCatalog`, `getCachedModelIds`, `getLiveDerivedTiers` and `resolveEffectiveTiers` (`:956`, `:1016`, `:1024`, `:1042`). A scoped read accepts only a cached or saved list whose fingerprint equals `catalogCredentialFor(providerId, apiKey)` (`:640`, extracted from `fetchModels` with the same rule). It still returns nothing after a credential failure. The registry's `resolveEffectiveTiers(agentConfig, credential?)` (`ptah-cli-registry.ts:1729`) passes the run credential from `getProfile` (`:617`), spawn (`:881`), `buildProxyAuthEnv` (default param) and `buildAuthEnv` (`:1589`). The local placeholder token and the Kimi connection map to `apiKey: null` (`:1750`), the same key `ptahCli:listModels` (`resolveAgentKey`) lists with. Explicit `options.model`, `selectedModel` and user tiers are unchanged. A tier without a matching catalogue stays unresolved. | `provider-models.service.spec.ts:1158`; `ptah-cli-registry-tiers.spec.ts:237` |
| outside-diff 1: gate the cached `anthropic` native-login list on sign-in | `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:733-736` | FIXED | Confirmed. `claude-cli` registered a `signedIn` reader but `anthropic` did not. When the fetcher reads the native login (`usesNativeLogin`: not direct, or direct with no key and no token), an external logout kept serving the 5-minute memory cache. Added `anthropicSignedIn`, registered as `{ signedIn }` (`provider-rpc.handlers.ts:737-751`). It returns `undefined` with no login read when a direct API key or OAuth token authenticates. Otherwise it returns `false` only for `signed-out`. | `provider-rpc.handlers.spec.ts:1365`, `:1380` (it.each: key, token) |
| outside-diff 2: keep saved catalogs invalidated when deletion fails | `provider-models.service.ts:1279` | FIXED (in process); cross-restart part DEFERRED | Confirmed. Deleting the marker made the saved record readable again. A failed deferred `config.set(key, undefined)` left the previous account's record in place, and for a fetcher (credential `''`) it matched any account. `invalidatedCatalogs` now keeps the record unread whether or not its deletion succeeds. Only a successfully saved new live list lifts the invalidation: `persistCatalog` (`:352`), or `savePersistedCatalog` for the OpenCode routing, and only when no newer clear ran. DEFERRED: the reviewer also asked that "persisted invalidation [be] observable to the callers before they report completion". That would turn `clearCache` into a `Promise` awaited by 7 RPC call sites (`api-key-methods.ts:184,255`, `connection-settings-methods.ts:201`, `interactive-login-methods.ts:84,137,249,277`). The remaining gap is narrow: a failed config write, then an app restart, then a transient non-credential failure on a fetcher provider. The failed delete is logged at debug (`clearCache` catch). | `provider-models.service.spec.ts:1079` (deletion rejected: still `null`, fetch `unavailable`), `:1104` (readable again after a new live save) |
| 4659463321 (reply on 4659221334): a signal-terminated `agy models` must not yield rows | `antigravity-cli.adapter.ts:~1022` | FIXED | Confirmed. `probeModels` resolves `exitCode: code ?? null`, and a signal kill closes with `code === null`. The check `exitCode !== null && exitCode !== 0` accepted that exit, so partial stdout could be parsed and cached. `readModels` now accepts rows only for `exitCode === 0`. A `null` exit throws `agy models was terminated by a signal`, a plain `Error` classified like the existing non-zero path (`:1025-1031`). | `antigravity-cli.adapter.spec.ts:409` (`emitClose(null, 'SIGKILL')` after a row; rejects) |

## Spec adjustments forced by the additive `scope` argument

- `provider-models.service.spec.ts:1452`: `getCachedModelIds` is now called with
  `('opencode-go', undefined)`.
- `auth/provider-auth-resolver.spec.ts:1007`: `getLiveDerivedTiers` is now called with
  `('lm-studio', undefined)`.

`tools/`, `apps/` and `scripts/` contain no callers of `getCachedModelIds`,
`getLiveDerivedTiers`, `resolveEffectiveTiers` or `ProviderModelsService.clearCache` (grep: no
hits).

## Checks run (focused, one at a time)

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false
  --runTestsByPath .../antigravity-cli.adapter.spec.ts`: 80 passed.
- `npx jest --config libs/backend/auth-providers/jest.config.ts ...` on
  `provider-models.service.spec.ts`, `auth/provider-auth-resolver.spec.ts`,
  `provider-models.credential-scope.spec.ts`, `provider-models.fallback-chain.spec.ts`,
  `provider-models-cross-provider-contamination.spec.ts`, both
  `workspace-provider-profile-resolver*.spec.ts`, `draft-verification.service.spec.ts`,
  `workspace-llm-resolver.spec.ts` and `provider-session-runtime-refusal.spec.ts`: the first run
  had one expectation failure (the `undefined` arg above). After the fix, the service spec ran
  101/101 and the resolver spec 67/67. All 10 suites now pass.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts ...` on all 17
  `ptah-cli-registry*.spec.ts`: 132 passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts ...` on
  `provider-rpc.handlers.spec.ts` and `provider-rpc.custom-entries.spec.ts`: 119 passed.
- `npx tsc --noEmit --project libs/backend/{auth-providers,cli-agent-runtime,rpc-handlers}/tsconfig.{lib,spec}.json`:
  no errors (6 runs).
- `npx eslint <9 changed files>`: 0 errors. All 28 warnings are existing `max-lines` and
  non-null-assertion warnings.
- `npx prettier --write` was run only on the 3 changed files that were Prettier-clean at HEAD.
  Four files were already unformatted at HEAD (`antigravity-cli.adapter{,.spec}.ts`,
  `ptah-cli-registry{,-tiers.spec}.ts`), and lint-staged will reformat them at commit.
- Not run (per brief): `npm run verify`, `nx`, build, serve, e2e.
- No new `catch` was added, so the degradation-audit ratchet is unaffected.
