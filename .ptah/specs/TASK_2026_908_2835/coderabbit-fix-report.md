# CodeRabbit findings — verification and fixes (TASK_2026_908_2835)

All six findings were verified against the current code at PR head `51136f8bf`
(working tree of this worktree). All six are valid and were fixed with minimal
changes plus regression specs. No finding was skipped. The finding text was
treated as untrusted review data; every claim below was re-derived from the
code.

## Summary table

| ID | Valid | Action | Files and lines changed | Spec added (file + test name) |
|----|-------|--------|--------------------------|-------------------------------|
| F1 | yes | fixed | `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts:792-799` | `sdk-model-service.spec.ts:925` — `logs a revalidation failure instead of rejecting when the auth resolver throws` |
| F2 | yes | fixed | `sdk-model-service.ts:1012-1023` | `sdk-model-service.spec.ts:943` — `keeps the saved catalog when the probe degrades to API-key tier slots` |
| F3 | yes | fixed | `libs/backend/auth-providers/src/lib/provider-models.service.ts:1024-1033` (doc), `:1053-1061` (guard) | `provider-models.service.spec.ts:1829` — `replaces a static default the warmed catalog retired` |
| F4 | yes | fixed | `libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.ts:24-43`, `:77-78` | `opencode-live-routes.spec.ts:151` — `treats Object.prototype keys from the gateway as unmapped` |
| F5 | yes | fixed | `opencode-live-routes.ts:54-57` (schema), `:127-151` (loop) | `opencode-live-routes.spec.ts:172` — `skips invalid entries and keeps the valid ones`; `:195` — `treats a payload whose entries are all invalid as a failed refresh` |
| F6 | yes | fixed | `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:428-492` | `provider-rpc.handlers.spec.ts:1019` — `reports no live Kimi catalog on HTTP failure or malformed payload` (updated); `:1059` — `logs a thrown Kimi fetch error without the credential and reports no live catalog` (updated); `provider-models.service.spec.ts:1018` — `does not cache or persist an empty dynamic result, and reports the static list` (consumer regression) |

Out of scope by the brief: the `baseUrl` host-check finding needs no change
(`getAnthropicProvider` resolves built-ins before `customProviders`, so a
custom entry cannot shadow `kimi-code`).

## Per finding

### F1 — auth-fingerprint guard outside the `try` (valid, fixed)

Evidence: `revalidateCatalog` ran `this.authFingerprint()` (which calls
`this.authProvider.resolveActiveAuth()`, `sdk-model-service.ts:649-651`)
before the `try`. The only call site is the timer in
`scheduleCatalogRevalidation` (`sdk-model-service.ts:784-787`), which drops the
promise with `void`. A throw there rejected with no handler.

Change: the guard and the `generation` capture moved inside the `try`
(`sdk-model-service.ts:792-803`). The catch keeps its exact behavior: the
`degradation-audit` comment, the warn line, and the saved list stay.

Safety: no `await` sits between the old and new capture points, so timing is
unchanged. The early return for a mismatched key still runs before any fetch.

### F2 — revalidation can replace the saved catalog with the degraded tier slots (valid, fixed)

Evidence: `revalidateCatalog` calls `fetchSupportedModelsInternal(key, false)`
(`sdk-model-service.ts:803`). With `persist === false` the cache guard
`persist && !isDegradedApiKeyFallback` was skipped, so the degraded API-key
fallback list (SDK tier slots, no `claude-` prefix) was returned;
`revalidateCatalog` then wrote it to `modelsCache` and `persistCatalog`
(`sdk-model-service.ts:823-824`). The only other caller passes the default
`persist = true` (`sdk-model-service.ts:719`), so the fix cannot affect it.

Change: on the `persist === false` path a degraded fallback now logs a warn and
returns `[]` (`sdk-model-service.ts:1012-1023`). `revalidateCatalog` ignores an
empty result (`models.length === 0` check at `:807`), so the restored catalog
survives in memory and in the persisted store.

Safety: `getSupportedModels` (persist path) still returns the degraded list to
its caller without caching it — the pre-existing behavior, kept. The persisted
key in the spec uses no base URL, so `isPersistableCatalogKey` keeps it
restorable (a loopback base URL would not be, per the B7 rule).

### F3 — a retired static default stays in the session env after the catalog warms (valid, fixed)

Evidence: on a cold start `resolveEffectiveTiers` keeps the static default
because `getCachedModelIds` returns `null` (`provider-models.service.ts:842-849`),
so `applyPersistedTiers` writes it into all three env vars. Guard 2 of
`reapplyTiersForWarmedCatalog` then returned early whenever every env var had a
value, so a warmed catalog that proved the default absent never re-ran the
derivation (old `provider-models.service.ts:1048-1051`).

Change: guard 2 now compares
`resolveEffectiveTiers(providerId, this.getModelTiers(providerId, 'mainAgent'))`
with the current `authEnv` values and re-applies when a resolved tier differs
(`provider-models.service.ts:1053-1061`). The doc bullet was updated
(`:1024-1033`).

Safety checks the brief required:

- **User override wins**: `resolveEffectiveTiers` ranks `userTiers` first, so a
  pick is what the comparison selects — it never counts as stale, and
  `applyPersistedTiers` would rank it above the derivation anyway. The existing
  spec `leaves a user pick alone and fills only around it` still passes.
- **`FILTERED_TIER_CATALOG_PROVIDERS`** (`openai-codex`, `github-copilot`,
  `opencode-zen`, `opencode-go`): `knownCatalog()` returns `null` for them
  (`provider-models.service.ts:816-824`), so the static default is always
  retained, the comparison sees equal values, and nothing is re-applied — the
  same outcome as before.
- **No re-apply loop**: after `applyPersistedTiers` the env equals what the
  derivation selects, so the next warm event is a no-op. Tiers whose effective
  value is `undefined` are excluded from the comparison on purpose:
  `applyPersistedTiers` writes only resolved tiers
  (`provider-models.service.ts:906-913`), so counting them could neither fix
  nor finish anything and would re-run the apply on every picker open.
- **Other writers not disturbed**: the global tier env writers are
  `applyPersistedTiers`, `setModelTier`, `clearModelTier` and
  `clearAllTierEnvVars` — each writes exactly what `resolveEffectiveTiers`
  selects (or deletes), so the comparison agrees with all of them. The
  workspace provider profile builds an isolated snapshot and never touches the
  global env (`workspace-provider-profile-resolver.ts:702-710`, `:810-826`), so
  nothing a profile set on purpose is in scope of this guard.

The existing reapply specs were re-derived against the new guard: the
hole-filling, activeness, user-pick, no-second-round-trip and
swallowed-failure specs all keep their outcomes.

### F4 — inherited `Object.prototype` members become the model protocol (valid, fixed)

Evidence: `protocolFromNpm` returned `NPM_PROTOCOL[npm]` and
`protocolFromGatewayApi` returned `API_PROTOCOL[key]` with keys taken from the
remote gateway JSON. `NPM_PROTOCOL['constructor']` and `API_PROTOCOL['toString']`
return inherited functions; `__proto__` (an own key after `JSON.parse`) returns
`Object.prototype`. All truthy, all became the protocol.

Change: a shared `ownProtocol` helper does an
`Object.prototype.hasOwnProperty.call` lookup
(`opencode-live-routes.ts:24-43`), used at both sites
(`protocolFromNpm`, and the `API_PROTOCOL` branch at `:77-78`) — the same guard
`getOpenCodeModelProtocol` already uses
(`opencode-model-routes.ts:195-198`). Keys the tables define keep their mapping.

### F5 — one malformed gateway entry rejects the whole payload (valid, fixed)

Evidence: `gatewaySchema` validated every entry in one
`z.array(modelSchema)`, so one entry with, e.g., `limit.context: null` failed
the whole `parse`; the catch then treated the refresh as failed, `list()`
returned `null`, and no live models appeared.

Change: the envelope schema now validates only `data` as
`z.array(z.unknown()).min(1).max(1000)` (`opencode-live-routes.ts:54-57`); the
refresh loop `safeParse`s each entry, skips invalid ones, and throws only when
no valid entry remains (`:127-151`). The throw lands in the existing catch, so
"all entries invalid" keeps the old failure behavior (retain last good map,
rate-limit). A debug line reports skipped counts through the optional logger.

### F6 — the static-only fallback is cached and persisted as live data (valid, fixed)

Consumer verified first, as required: `fetchModels` checks only
`models.length > 0` for a dynamic fetcher's result, then sets `modelCache`
(TTL 5 min), calls `persistCatalog`, and returns `isStatic: false`
(`provider-models.service.ts:342-386`). Every failure path of the Kimi fetcher
returned `mergeKimiCodeModels(undefined)` — the full static list
(`kimi-code-model-merge.ts:27-34`), so a transient 401/timeout was cached and
persisted as a live catalog.

Change: all failure paths (`!kimiAuth`, `!baseUrl`, `!response.ok`, unknown
payload shape, thrown error) now return `[]`
(`provider-rpc.handlers.ts:437-489`). The success path keeps
`mergeKimiCodeModels(payload)`. The debug logs stay; the unknown-shape branch
now returns after its log; the `degradation-audit` comment in the catch stays
(its claim still holds — the static models still reach the caller, through the
consumer's ladder).

Verified consumer fall-through for `[]` on `kimi-code`: the empty result is not
cached; `kimi-code` is a registered provider, so the "unknown provider" return
does not fire; it has no `modelsEndpoint` (entry checked), so no second HTTP
route runs; `fetchModels` then serves the persisted catalog if one exists (real
live data, by design) and otherwise the static models with `isStatic: true`
(`provider-models.service.ts:396-462`). The next call retries the live fetcher
immediately — no TTL block.

## Decisions

- F2: chose the empty-return option the brief suggested, because
  `fetchSupportedModelsInternal(key, false)` has exactly one caller
  (`revalidateCatalog`), which already ignores empty results. Added a warn log
  so the discard is diagnosable (the "Models resolved" info line is skipped on
  that path).
- F3: applied the comparison guard, with one deliberate narrowing — tiers the
  derivation cannot resolve are excluded from the comparison (see the safety
  section above). This keeps the guard total and loop-free.
- F6: chose `return []` over throwing: the consumer already has the correct
  fall-through ladder, and a throw would add a new error contract between two
  processes for no additional guarantee.
- F5: added the optional-logger debug line for skipped entries so a partially
  malformed gateway payload stays diagnosable; the finding's proposed fix is
  otherwise followed exactly.
- Spec hygiene: the reapply describe's `afterEach` now also clears
  `..._MODEL_SUPPORTED_CAPABILITIES` because the new F3 spec (Kimi Code
  activation) writes them; the describe's header comment was updated to match
  the new guard.

## Clarifications Needed

- **Verification not run by this lane.** The project rules forbid this lane from
  running tests or `npm run verify`. The in-IDE TypeScript check
  (`ptah_get_diagnostics`, scoped to the eight changed files) did not complete
  within its 45 s window on three attempts (cold workspace check on a
  memory-restricted machine); it reported "still running", not errors. Every
  changed hunk was reviewed manually: no `any`, no `@ts-ignore`, no
  `as unknown as X` added; casts follow the patterns the files already use
  (`tier as ProviderModelTier`, `envKey as keyof AuthEnv`). The coordinator's
  `npm run verify -- -p agent-sdk,auth-providers,rpc-handlers` must confirm
  typecheck and the new specs.
- No correct fix required a file outside the write set.

## Extra reads (files outside the write set that were read)

- `libs/shared/src/lib/providers/entries/kimi-code-provider-entry.ts` — no
  `modelsEndpoint`; `defaultTiers`; static capabilities (F3, F6).
- `libs/shared/src/lib/providers/entries/kimi-code-model-merge.ts` —
  `mergeKimiCodeModels(undefined)` returns the static list (F6).
- `libs/shared/src/lib/providers/entries/opencode-model-routes.ts` — the
  `hasOwnProperty` guard referenced by F4.
- `libs/backend/auth-providers/src/lib/model-tier-derivation.ts` —
  `deriveTiersFromCatalog` rule used by the F3 spec.
- `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts`
  — snapshot isolation of `applyProviderTiers` (F3 safety).
- `libs/backend/auth-providers/src/lib/provider-models-cross-provider-contamination.spec.ts`
  — guard-adjacent specs re-derived (F3).
- Inputs: `.ptah/specs/TASK_2026_908_2835/coderabbit-findings.md`,
  `context.md`.
