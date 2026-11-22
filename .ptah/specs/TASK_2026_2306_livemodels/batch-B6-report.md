# Batch B6 report — Part 0 (SDK catalog fix), B6.1, B6.2, B6.3

Worktree: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists` (HEAD 0909a93e0, nothing
committed, staged, or stashed). 40 files changed, +477 / -1775 lines.
`.github/workflows/model-lists-probe.yml` was not touched: batches.md assigns it to B7.

## Part 0 — SDK catalog fix (`ptah.sdk.modelCatalog`)

Root `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\`:

- MODIFIED `libs\backend\agent-sdk\src\lib\helpers\sdk-model-service.ts`
  - Each persisted entry is now `{schema: 2, origin: 'live', savedAt, models}`
    (`persistedRecordSchema`, `PERSISTED_CATALOG_SCHEMA = 2`).
  - `readPersistedEntry` ignores these entries: an unstamped bare row array from an older
    release, any other schema or origin, or one older than `PERSISTED_CATALOG_MAX_AGE_MS`
    (30 days, the same rule as `provider.<id>.modelCatalog`).
  - A new `restoredKeys` set marks memory entries that came from the store. A live fetch
    (`cacheModels`) clears the mark, and so does a revalidation that changed or confirmed
    the rows. `clearCache()` clears all marks.
  - New public `getLiveSupportedModels()` and `getLiveNativeClaudeModels()`. Each one
    serves a live memory entry or joins an in-flight fetch. Otherwise it fetches. It never
    answers from a restored entry, and it returns `[]` when every source fails.
  - The native fetch closure was extracted to `fetchNativeModels()`, which both native
    paths share.
- MODIFIED `libs\backend\agent-sdk\src\lib\sdk-agent-adapter.ts`: adds the
  `getLiveSupportedModels()` and `getLiveNativeClaudeModels()` pass-throughs.
- MODIFIED `libs\backend\rpc-handlers\src\lib\handlers\provider-rpc.handlers.ts`
  - The `anthropic` fetcher (primary and fallback SDK reads) and the `claude-cli` fetcher
    now call the `getLive*` reads.
  - The fetcher doc explains why.
  - The `[]` paths keep their behaviour. `ProviderModelsService` then reports its own
    persisted list, with the original `savedAt` and `source: 'persisted'`, or `unavailable`.
- MODIFIED `libs\backend\rpc-handlers\src\lib\handlers\provider-rpc.handlers.spec.ts`: the
  mock adapter and its expectations use the `getLive*` names.
- MODIFIED `libs\backend\agent-sdk\src\lib\helpers\sdk-model-service.spec.ts`: new describe
  "persisted catalog record and live reads", with 9 cases:
  - stamp shape;
  - unstamped entry ignored;
  - `origin: 'static'` and `schema: 1` ignored;
  - 30-day boundary (exactly 30 days served, older not);
  - live read fetches instead of answering from restored rows, then is served from memory;
  - live read returns `[]` rather than the restored rows when the fetch fails;
  - native live read ignores the restored native entry;
  - a revalidated entry is served to the live read with no second spawn.

## B6.1 — shared static rows and the Kimi merge

- MODIFIED `libs\shared\src\lib\providers\provider-registry.ts`: z-ai rows and every Z.AI
  price field (D7).
- MODIFIED `libs\shared\src\lib\providers\entries\claude-cli-provider-entry.ts`: static rows
  removed; the entry doc is updated.
- MODIFIED `libs\shared\src\lib\providers\entries\copilot-provider-entry.ts`:
  `COPILOT_STATIC_MODELS`, `copilotModel()` and the field are removed. The entry doc block,
  which sat above `COPILOT_DEFAULT_TIERS`, was moved back above the entry.
- MODIFIED `libs\shared\src\lib\providers\entries\kimi-code-provider-entry.ts`: static rows
  removed; the header is updated. `liveModelCapabilities` and `defaultTiers` stay.
- MODIFIED `libs\shared\src\lib\providers\entries\sakana-provider-entry.ts`: static rows
  removed; the header is updated.
- MODIFIED `libs\shared\src\lib\providers\entries\local-provider-entry.ts`: Ollama rows
  removed; the doc is updated.
- DELETED `libs\shared\src\lib\providers\entries\kimi-code-model-merge.ts`
- DELETED `libs\shared\src\lib\providers\entries\kimi-code-model-merge.spec.ts`
- MODIFIED `libs\shared\src\lib\providers\index.ts`: drops `mergeKimiCodeModels` and
  `isKimiCodeModelsPayload`.
- Specs:
  - `libs\shared\src\lib\providers\provider-lookup.spec.ts`:
    - removed the fixture shapes, the `seedStaticModelPricing` describe, the
      `getStaticModelCapabilities` describe, and the Kimi static-list and static-cost cases;
    - added a Kimi `liveModelCapabilities` case and "no kimi-code rate (cost unknown)".
  - `libs\shared\src\lib\providers\provider-registry.spec.ts`: the subscription $0 seed case
    is removed.
  - `libs\shared\src\lib\providers\entries\provider-session-provider-entries.spec.ts`: the
    static field assertion and the seed call are removed.
  - `libs\shared\src\lib\utils\pricing-review-regressions.spec.ts`: the claude-cli seed case
    is replaced. A new `it.each` over `glm-5.3`, `glm-5.3-flash` and `glm-4.5-air` asserts
    `findModelPricing` is null and the cost is `totalCost: null` / `rate-missing` (Z.AI cost
    unknown, D7).
  - `libs\shared\src\lib\utils\anthropic-spend-regressions.spec.ts`: the "static rows in sync
    with the rate card" case and its import are removed.

## B6.2 — static symbols in shared and agent-sdk

- MODIFIED `libs\shared\src\lib\providers\provider-registry.ts`: removed
  - `ProviderStaticModel`;
  - `AnthropicProvider.staticModels`;
  - `getStaticModelCapabilities`;
  - `seedStaticModelPricing`;
  - the `updatePricingMap` and `staticModelPricing` imports.
- DELETED `libs\shared\src\lib\providers\static-model-pricing.ts`
- DELETED `libs\shared\src\lib\providers\entries\opencode-model-routes.ts`
- MODIFIED `libs\shared\src\lib\providers\entries\opencode-provider-entry.ts`: removed
  `buildOpenCodeStaticModels`, `OPENCODE_ZEN_STATIC_MODELS`, `OPENCODE_GO_STATIC_MODELS`
  and the fields. The "reviewed routing tables" and "Excluded models" paragraphs are
  replaced by a live-catalog note.
- MODIFIED `libs\shared\src\lib\providers\entries\anthropic-api-lane-entry.ts`: field removed.
- MODIFIED `libs\shared\src\lib\providers\index.ts`: drops `OPENCODE_MODEL_ROUTES`,
  `getOpenCodeModelProtocol` and `OpenCodeModelRoutes`. `getStaticModelCapabilities` and
  `seedStaticModelPricing` went with `export *`.
- MODIFIED `libs\backend\agent-sdk\src\lib\helpers\sdk-model-service.ts`:
  `buildStaticTierCapabilityEnv` and the `getStaticModelCapabilities` import are removed.
- MODIFIED `libs\backend\agent-sdk\src\lib\helpers\index.ts`: re-export removed.
- MODIFIED `libs\backend\agent-sdk\src\index.ts`: removes the `buildStaticTierCapabilityEnv`,
  `seedStaticModelPricing` and `ProviderStaticModel` re-exports.
- Specs:
  - `libs\shared\src\lib\providers\anthropic-api-lane-entry.spec.ts`: now asserts the
    `/v1/models` endpoint and that the tiers equal the claude-cli `defaultTiers`.
  - `libs\shared\src\lib\providers\entries\codex-provider-entry.spec.ts`: the static and seed
    cases are removed.
  - `libs\shared\src\lib\providers\entries\opencode-provider-entry.spec.ts`: rewritten. The
    route-table cases went with the table. The id guard, registry integration, entry
    properties, default tiers and subscription policy stay.
  - `libs\backend\agent-sdk\src\lib\helpers\tier-capability-env.spec.ts` (forced; not in the
    write set): the `buildStaticTierCapabilityEnv` describe is removed. The
    `buildTierCapabilityEnv` cases, including the subprocess-forwarding case, stay.

## B6.3 — `source` required, `isStatic` deleted

- MODIFIED `libs\shared\src\lib\types\rpc\rpc-providers.types.ts`:
  `ProviderListModelsResult.source` is required; `isStatic` is removed.
- MODIFIED `libs\shared\src\lib\types\rpc\rpc-agents.types.ts`:
  `PtahCliListModelsResult.source` is required; `isStatic` is removed.
- MODIFIED `libs\backend\auth-providers\src\lib\provider-models.service.ts`: the deprecated
  `isStatic: false` is removed from `ProviderModelList` and from `shape()`.
- MODIFIED `libs\backend\rpc-handlers\src\lib\services\lane-model-listing.adapter.ts`: the
  port field is removed.
- Spec literals were removed in:
  - `libs\backend\auth-providers\src\lib\provider-models.service.spec.ts`
  - `libs\backend\auth-providers\src\lib\provider-models.opencode.spec.ts`
  - `libs\backend\auth-providers\src\lib\provider-models.fallback-chain.spec.ts` (not listed
    in the batch; it held literals)
  - `libs\backend\rpc-handlers\src\lib\handlers\config-rpc.handlers.spec.ts`
  - `libs\backend\rpc-handlers\src\lib\handlers\provider-rpc.handlers.spec.ts`: also drops
    `not.toHaveProperty('isStatic')` and "without isStatic" from a test title.
  - `libs\backend\rpc-handlers\src\lib\handlers\ptah-cli-rpc.handlers.spec.ts`: the
    `ListResult` field and the `not.toHaveProperty('isStatic')` are removed.
- `lane-model-listing.adapter.spec.ts` needed no change.
- No frontend file needed a change: every producer already sets `source` (B5).

## Production files outside the write sets (forced by the grep gate)

- `libs\shared\src\lib\providers\entries\codex-provider-entry.ts`: doc only.
  "No \`staticModels\`" became "No built-in model list", because the gate token matched the
  pattern doc the batch cites.
- `libs\shared\src\lib\providers\entries\requesty-provider-entry.ts`: doc only, same reason.
- Part 0 files (`sdk-agent-adapter.ts`, `provider-rpc.handlers.ts` + spec): needed by the
  Part 0 brief, not by B6.

## Checks (focused, one at a time)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 |
| `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` / `tsconfig.spec.json` | exit 0 / exit 0 |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` | exit 0 |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` | exit 0 (6.3 GB free beforehand) |
| tsc `tsconfig.lib.json`: cli-agent-runtime, lane-routing, frontend core, chat, ui, memory-curator-ui, skill-synthesis-ui, webview-e2e-harness | all exit 0 |
| tsc `apps/ptah-electron-e2e/tsconfig.spec.json`, `apps/ptah-electron/tsconfig.app.json` | exit 0 / exit 0 |
| tsc `libs/frontend/{core,chat}/tsconfig.spec.json` | errors exist, but none name `source`, `isStatic` or a list-models type. All are unrelated spec typing errors (e.g. `transportTimeout`, `RpcResult` variance). These spec tsconfigs are not the `typecheck` target, which is `ngc -p tsconfig.lib.json`. |
| jest shared (11 suites: registry, lookup, provider-session entries, pricing-review, anthropic-spend, api-lane, codex, opencode, kimi-code-models, closest-live-model, ollama-cloud-model-id) | 11 passed, 150 tests |
| jest shared (index.zod-free, provider-session-registry x2, auth-strategy.types) | 4 passed, 106 tests |
| jest agent-sdk (sdk-model-service, .accounts, tier-capability-env, deleted-exports.contract) | 4 passed, 76 tests |
| jest auth-providers (provider-models.service, .opencode, .fallback-chain, cross-provider-contamination) | 4 passed, 136 tests |
| jest rpc-handlers (provider-rpc, ptah-cli-rpc, config-rpc, provider-rpc.custom-entries, lane-model-listing.adapter) | 5 passed, 219 passed, 1 skipped |
| `npx eslint <36 modified .ts files>` | exit 0, 0 errors, 9 warnings. All are earlier warnings: `max-lines` on four already-oversized files, empty async generators, two `no-useless-assignment`, one spec non-null assertion. |

The first sdk-model-service run had one 5 s timeout, on the existing "does not let one auth
identity answer for another" case: a cold transform, with that case's real `/v1/models`
call. The case passed alone and the whole suite passed on the rerun (58/58).

Checks not run:
- The whole-project shared jest run was denied by the permission classifier, so only
  focused paths ran.
- degradation-audit lint is an nx target, which the brief forbids. No new catch was added.
- The full gate, `typecheck-templates` and `npm run verify` stay with the coordinator.
- `cli-engine` and `platform-cli` were not typechecked. The symbol grep shows that no file
  in `libs/` or `apps/` references a removed export.

## Acceptance greps

```
== B6.1: staticModels in the six files
(no output) exit 1
== B6.1: Kimi merge
ls: cannot access 'libs/shared/src/lib/providers/entries/kimi-code-model-merge*': No such file or directory
grep mergeKimiCodeModels|isKimiCodeModelsPayload libs apps -> (no output) exit 1
== B6.2 symbols (staticModels|ProviderStaticModel|OPENCODE_MODEL_ROUTES|getOpenCodeModelProtocol|seedStaticModelPricing|getStaticModelCapabilities|buildStaticTierCapabilityEnv)
libs/backend/auth-providers/src/lib/providers/custom/custom-openai-translation-proxy.spec.ts:209:      staticModels: [{ id: 'llama-3.1-70b' }, { id: 'qwen-2.5-coder' }],
libs/backend/auth-providers/src/lib/providers/custom/custom-openai-translation-proxy.ts:188:    return [...(this.customConfig.staticModels ?? [])];
libs/backend/auth-providers/src/lib/providers/custom/custom-provider.types.ts:62:  staticModels?: ReadonlyArray<{ id: string }>;
== plan gate (implementation-plan.md:899-903 pattern)
libs/backend/agent-sdk/src/lib/__contracts__/deleted-exports.contract.spec.ts:7:    'STATIC_FALLBACK_MODELS',
libs/backend/auth-providers/src/lib/providers/custom/custom-openai-translation-proxy.spec.ts:209:      staticModels: [...]
libs/backend/auth-providers/src/lib/providers/custom/custom-openai-translation-proxy.ts:188:    return [...(this.customConfig.staticModels ?? [])];
libs/backend/auth-providers/src/lib/providers/custom/custom-provider.types.ts:62:  staticModels?: ReadonlyArray<{ id: string }>;
libs/backend/workspace-intelligence/... (31 lines of AST `isStatic`: ast-analysis.interfaces.ts, csharp-context.ts,
  csharp-import-resolver.ts/.spec.ts, csharp.language.ts, java.language.ts, languages/types.ts,
  declaration-summary.ts, ast-analysis.service.spec.ts, java-rust-grammar.integration.spec.ts)
== isFallback: true under cli-adapters/
(no output) exit 1
```

What remains:
- The custom proxy config field (allowed exception).
- `libs/backend/workspace-intelligence` AST `isStatic`. This is C#, and also Java and the
  shared AST type: the same code-analysis concept as the allowed C# exception, unrelated
  to model lists.
- `'STATIC_FALLBACK_MODELS'` in the deleted-exports contract spec. This is an older
  anti-regression entry asserting that a symbol is *not* exported. It matches only the
  `FALLBACK_MODELS` substring of the gate pattern, so it was kept. Removing it would drop a
  regression guard.

## Deviations

1. **Part 0: restored rows are not passed to the provider chain marked as saved.** The
   provider chain gets live reads instead.
   - The brief offered "throw (or mark)" (follow-up step 3).
   - Passing the restored rows as `persisted` needs a `failureReason`. The contract sets it
     exactly when `source !== 'live'`, and `toListModelsResult` collapses a persisted list
     without one into `live`.
   - No closed reason honestly describes "restored at boot, not yet revalidated". `unexpected`
     would show "an unexpected error occurred" on every first open after a boot.
   - So the fetchers use `getLive*`, which never answer from a restored entry. A failed live
     read keeps today's `[]` path, and `ProviderModelsService` falls back to its own persisted
     record with its original `savedAt` and `source: 'persisted'`.
   - Result: SDK-restored rows can no longer be re-saved with a fresh timestamp.
   - Cost: the first `provider:listModels` for `anthropic` / `claude-cli` per boot pays one
     SDK probe, unless a live fetch or the 10 s revalidation already ran.
   - Unchanged: `config:models-list`, the pre-flight and `hasCachedModels` still use the
     restore, now age-limited and version-checked.
   - Reversible: add a reason and map a `{models, savedAt}` fetcher result instead.
2. **Unchanged revalidation does not refresh `savedAt`.** The existing specs "does not
   rewrite an equal catalog" and "treats live-only SDK fields as unchanged without a write"
   pin "no write". So a stable catalog ages out 30 days after the fetch that wrote it, which
   costs one probe. It only clears the restored mark.
3. **`deleted-exports.contract.spec.ts` was not extended** with the removed names. Its list
   convention would add `buildStaticTierCapabilityEnv` and `seedStaticModelPricing` literals,
   which the B6 grep gate forbids anywhere in `libs/`. Typecheck of every consumer enforces
   that they are absent.
4. **Some B6.2 spec edits went in with B6.1.** In `pricing-review-regressions`,
   `provider-lookup`, `provider-registry` and `provider-session-provider-entries` specs, the
   seed and capability cases were removed when the rows went. Nothing is committed, so the
   B6.1 → B6.2 split is in the file lists above only.
5. **Prettier.** It was run on the edited files. Four files are not prettier-clean at HEAD
   (`sdk-agent-adapter.ts`, `config-rpc.handlers.spec.ts`, `anthropic-spend-regressions.spec.ts`,
   `pricing-review-regressions.spec.ts`). They were restored to HEAD and edited by hand, so
   their diffs hold only the task change. The pre-commit `nx format:write` will still reformat
   them on commit. `ptah-cli-rpc.handlers.spec.ts` and `rpc-agents.types.ts` carry small
   prettier reflows of nearby lines.

## Out-of-scope observations

- `libs/backend/auth-providers/src/lib/auth/strategies/local-native.strategy.ts:184`: a log
  message still says "using static catalog".
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts:1-12`: the header still lists
  "3. Hardcoded fallback".
- `sdk-model-service.ts` is now 1130 lines against the 700-line `max-lines` warning (it was
  already over).
