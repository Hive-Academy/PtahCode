# Code logic review — round 2 (TASK_2026_908_2835)

Scope: the fixes for round 1 findings RB-1, RB-2, RS-1, RS-2 only. Read-only
review of the uncommitted worktree state. No tests, build, lint, typecheck,
`npm run verify`, `nx` or diagnostics were run (hard rule); only file reads,
`git diff` and text search were used. No source file was edited.

## Verdict
REVISE — all four round 1 fixes are correct and complete for their named scope, but check (d) of RB-2 found one low residual the migration missed: `clearModelTier` still writes the old `static ?? derived` fallback, so on the tier-clear path it can now write an id the unified rule would replace.

## Fix check
| Finding | Fixed (yes/partly/no) | Evidence file:line | Note |
|---------|----------------------|--------------------|------|
| RB-2 | yes | `libs/backend/auth-providers/src/lib/provider-models.service.ts:810-870` (rule), `:904-905` (site 1), `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.ts:422-427` (site 2), `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:815-819` (site 3) | (a) One method, three call sites, no private chain left in them: `applyPersistedTiers` passes `getModelTiers(providerId,'mainAgent')`, `buildTierValues` passes `getModelTiers(providerId,scope)`, `applyProviderTiers` passes `getModelTiers(providerId,'mainAgent')` — same provider + scope gives the same tiers. The rule matches the expected statement exactly: non-empty user tier wins (:833-837); no static default → derived (:838-842); static wins when no catalog is known (`!ids`, :845-848), for the exempt set (`FILTERED_TIER_CATALOG_PROVIDERS` → `knownCatalog()` returns null, :817-825), or when the known catalog contains it with one trailing `[...]` suffix removed on both sides (:844-848, same regex both sides); otherwise derived replaces it with one info log per provider and tier (:852-867, static Set :107/:858-859); else static stays (:853-856). The four exempt ids are real registry ids (codex-provider-entry.ts:35, copilot-provider-entry.ts:102, opencode-provider-entry.ts:108/:133). (b) Provider without `defaultTiers`: `!fallback` → `derivedFor(tier)` — identical to the old `user ?? static ?? derived`. The one syntactic difference (old `??` vs new truthiness `if (override)`) is unreachable: `getPersistedTierValue` returns only a non-empty string or null (provider-models.service.ts:1413/:1417), so `''` can never reach the chain. (c) The only new write source is the static→derived replacement. `reapplyTiersForWarmedCatalog` keeps its three guards (active provider, a hole in `authEnv`, a derived tier exists, :1045-1061) and `switchActiveProvider` clears all tier env vars before applying (:1155-1156), so a reapply can replace an already-set static value with the derived one — which is the intended rule, matches the lane and snapshot answer, and cannot write for an inactive provider, cannot override a user pick, and cannot write a fabricated id (derived reads the same catalog snapshot). (d) One residual private copy → new finding R2-1 below. Two other chain-like sites are NOT copies of the old chain and are unchanged, pre-existing files: `draft-verification.service.ts:615-617` (probe model deliberately prefers derived over static) and `ptah-cli-registry.ts:1645-1657` (cascade `agentTiers → cliAgent mainTiers → defaultTiers → staticModels[0]`, no live-derived link at all). (e) `provider-auth-resolver.spec.ts` mock is sound: it puts the real `ProviderModelsService.prototype.resolveEffectiveTiers` on a partial mock whose `this` has `getCachedModelIds` (:132-134), `getLiveDerivedTiers` (:122-124) and `logger` (:131) — everything the method reads (the registry lookup is a module import, not `this`); the file drives the replacement branch and asserts the one-log rule (:877-901), and no earlier test in the file can add the `kimi-code:sonnet` key to the static log Set first (every earlier case has no `knownModelIds` or keeps the static). `draft-verification.service.spec.ts:473-481` mock has no `logger`, but its `getCachedModelIds` is hardcoded to `null`, so `!ids` always short-circuits before `this.logger` is read — sound today, one-line-fragile if a future case there adds a known catalog. The static log-guard Set cannot cross-contaminate the two spec files (per-file module registries). `workspace-provider-profile-resolver.spec.ts` uses a REAL `ProviderModelsService` (:158) with a mock ConfigManager, so the snapshot site exercises the real method with a real logger. Rule coverage in `provider-models.service.spec.ts:1155-1219` pins every branch (no catalog, contains, suffix either side, replaced, no derived, exempt-not-read, user wins, logs once). |
| RB-1 | yes | `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts:765-777` (schedule inside the restore), `:779-788` (guard), `:790-804` (abort checks), `:1462-1471` (`hasCachedModels`), `:1480-1498` (`clearCache`) | The schedule now lives only inside `restorePersistedCatalog` (:775), so all three restore paths (`getSupportedModels:696`, `getNativeClaudeModels:966`, `hasCachedModels:1470`) start the one revalidation; grep finds no other call site. A key can only be scheduled after `readPersistedEntry` returned an entry, which requires `isPersistableCatalogKey` (:834-835) plus a schema-valid store hit — dead/ephemeral loopback keys cannot restore, so they cannot be probed. At fire time `revalidateCatalog` aborts unless the key still equals the current auth fingerprint (or is the native key) and the generation is unchanged (:791, :800-804), and `clearCache` cancels every timer and clears the guard set together with the persisted store (:1482-1484, :1496). The only production caller of `hasCachedModels` is the model pre-flight (`sdk-query-options-builder.ts:1998`), which already skips first-party base URLs (:1995-1996) and cross-provider sessions (:1986-1992) — so the fix adds no key class that round 1 had not already accepted. One probe per key per boot holds: the `revalidatedKeys` add is synchronous before the timer (:780-781), and a second restore can never be reached because the first restore filled the in-memory cache (:686-689, :1464-1465). New spec covers exactly the round 1 gap: `sdk-model-service.spec.ts:824` ("schedules the probe when hasCachedModels() restores the rows"). |
| RS-1 | yes | `libs/backend/rpc-handlers/src/lib/handlers/model-picker-groups.ts:10-12` (comment) vs `:25-26` (code) | The comment now states the exception ("A catalog with fewer than two alias rows stays flat… One alias row is not enough evidence… a boundary there would leave one visible row in the picker") and the code does exactly that: `aliases.length >= 2 ? last : rows.length - 1` gives all-`'primary'` for 0 or 1 aliases. Comment and code agree; the round 1 contradiction is gone. |
| RS-2 | yes | `libs/shared/src/lib/providers/entries/kimi-code-model-merge.ts:21-24` (helper, same `liveModelsSchema` as the merge at :33); `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:459-474` (log), import `:97` | The fetcher now logs one debug line exactly when a 2xx payload fails the schema: `isKimiCodeModelsPayload` and `mergeKimiCodeModels` parse with the same schema object, so the log fires precisely when the merge will degrade, with no shape the merge accepts. Log content: `payloadType` (a `typeof` string or `'array'`) and `keys` (top-level key NAMES, `slice(0,10)`, objects only, arrays/primitives/null log `[]`). No value is ever serialized, so no payload content can appear; credentials live in the request headers (`Authorization`/`x-api-key`, :435-441), never in the response body, so no credential can appear either — the response's key names are field names the models endpoint chooses. `Object.keys` cannot throw here (only called on a non-null, non-array `typeof === 'object'` produced by `response.json()`). The merge result is unchanged: `mergeKimiCodeModels` keeps the same schema, static-first ordering, fresh `capabilities` arrays, dedupe and suffix seeding; the helper only reads. |

## New findings
| ID | Severity (high/medium/low) | file:line | Finding | Failure scenario | Suggested fix |
|----|----------------------------|-----------|---------|------------------|----------------|
| R2-1 | low | `libs/backend/auth-providers/src/lib/provider-models.service.ts:726-732` | `clearModelTier` keeps a private copy of the OLD chain's last two links — `getAnthropicProvider(providerId)?.defaultTiers?.[tier] ?? this.getLiveDerivedTiers(providerId)[tier]` — and its comment (:723-725) claims it falls back to "the same default applyPersistedTiers would pick". The fix changed what `applyPersistedTiers` picks, so that claim and this writer are now stale: the unified rule replaces a static default the known catalog lacks, while `clearModelTier` writes the static default unconditionally. | The active provider has a `defaultTiers` entry for a tier (e.g. `sakana`), its known catalog lacks that static id but yields a derived tier (vendor renamed the model), and the user clears their tier override in settings. `clearModelTier` writes the dead static id into `authEnv`, `process.env` and the tier metadata (:729-732). The next message that resolves the tier alias fails upstream, while a background lane (`buildTierValues`) and workspace snapshots resolve the live-derived id — the same one-alias-two-models symptom RB-2 was filed for, on the clear path. No guaranteed self-heal: `reapplyTiersForWarmedCatalog` needs an env hole and all three vars are set, and `refreshTiersFromLiveCatalog` is not scheduled; recovery waits for the next provider switch/activation. | Derive the fallback from the shared rule, e.g. `this.resolveEffectiveTiers(providerId, this.getModelTiers(providerId, 'mainAgent'))[tier]` (the config keys were already cleared above, so the user-tier link reads null), or a per-tier helper extracted from `resolveEffectiveTiers`. |

## Not checked / extra reads
Not run, by the hard rules of this review:
- No tests, `npm`, `nx`, build, lint, typecheck or diagnostics. The
  coordinator's verify runs remain the only execution evidence. Static
  reachability reasoning replaces the two mock-behaviour checks (RB-2 (e)
  and the `loggedTierReplacements` cross-test question); if the coordinator
  wants runtime proof, the relevant specs are `provider-models.service.spec.ts`
  (`resolveEffectiveTiers` describe), `provider-auth-resolver.spec.ts:828-1000`,
  `draft-verification.service.spec.ts`, `workspace-provider-profile-resolver.spec.ts`
  and `sdk-model-service.spec.ts:787-893`.
- The pre-existing `IStateStorage` update/get race around `clearCache()` and
  the async `clearPersistedCatalogs()` (carried over from round 1, unchanged by
  the fix; the `hasCachedModels` entry point joins the same race but every
  outcome is benign because `revalidateCatalog` re-checks fingerprint and
  generation at fire time).
- The round 1 intermediate state (inline `buildTierValues` rule with its
  exempt list at old :431-447) is not diffable — the worktree evolved in place
  — so the exempt-set membership was checked against the registry and the
  new specs (`provider-models.service.spec.ts:1193-1201`), not against the
  intermediate code. Count matches round 1's description ("the four exempt
  providers").
- `draft-verification.service.ts:609-618` (`resolveProbeModel` prefers the
  derived tier over the static one) and `ptah-cli-registry.ts:1633-1677`
  (cascade with no live-derived link): both are pre-existing, unchanged files
  with deliberately different chains (a connectivity probe's model pick and a
  Ptah CLI agent's tier cascade). The fix does not worsen either; recorded as
  observations, not findings.

Extra reads made for proof (beyond the files named in the task):
- `provider-models.service.ts` sections: 25-52 (imports), 92-110 (constant,
  static Set), 614-658 (`setModelTier`), 660-748 (`getModelTiers`,
  `clearModelTier`), 761-931 (`readLiveCatalog`, `getCachedModelIds`,
  `getLiveDerivedTiers`, `resolveEffectiveTiers`, `applyPersistedTiers`),
  958-1071 (`refreshTiersFromLiveCatalog`, `reapplyTiersForWarmedCatalog`),
  1132-1161 (`switchActiveProvider`), 1406-1421 (`getPersistedTierValue`).
- `sdk-model-service.ts` sections: 106-110 (`TIER_ENV_VAR_MAP` — exactly
  opus/sonnet/haiku, so no tier is skipped by the
  `['sonnet','opus','haiku']` loop), 262-323 (persisted schema,
  `isPersistableCatalogKey`), 640-708 (`authFingerprint`,
  `getSupportedModels`), 799-909 (`revalidateCatalog`, `readPersistedEntry`,
  `persistCatalog`), 940-977 (`getNativeClaudeModels`), 1500-1537
  (`invalidateForAuthChange` — deliberately leaves timers alone; the
  fingerprint check covers it).
- `sdk-query-options-builder.ts:1975-2024` — pre-flight guards around
  `hasCachedModels()`.
- `draft-verification.service.ts:603-618`, `ptah-cli-registry.ts:1625-1693`,
  `workspace-llm-resolver.ts:62-84`, `custom-provider-probe.ts:350-389`,
  `config-rpc.handlers.ts` (grep) — check (d) chain-copy hunt.
- `libs/shared/src/lib/types/rpc/rpc-providers.types.ts:23` (`ProviderModelTier`)
  and the codex/copilot/opencode provider entries (exempt-id existence).
- Specs: `provider-auth-resolver.spec.ts:40-211` (harness) and `:815-1000`
  (tier tests), `draft-verification.service.spec.ts:451-545` (harness),
  `workspace-provider-profile-resolver.spec.ts:1-60` (real-collaborator
  design), `provider-models.service.spec.ts:1150-1220`, greps of
  `sdk-model-service.spec.ts` and `workspace-provider-profile-resolver.spec.ts`.
