# Plan Review - TASK_2026_2306_livemodels

Reviewed: `implementation-plan.md`, `parity-inventory.md` against worktree `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists` (branch `fix/live-only-model-lists`, main @ 6fb8d480c). Goal used: delete every repo-literal provider model list; lists come only from live endpoint, then the last persisted live catalog, then an explicit error; no repo literal fallback.

Verdict: **REVISE**. 1 Blocking, 9 Serious, 11 Moderate, 3 Minor. The architecture (one chain in `ProviderModelsService`, typed source, error/notice split) is sound and mostly well evidenced. The defects are around data the plan trusts without checking (old persisted catalogs), compile-time reach the plan did not map, and literals that survive under another name.

## Blocking

### B1. Persisted catalogs written by the CURRENT release already contain the repo static lists, and the plan serves them as "saved live lists"

- Evidence:
  - Kimi: `libs/shared/src/lib/providers/entries/kimi-code-model-merge.ts:27-35` starts from ALL `staticModels` and appends live-only ids. The fetcher (`provider-rpc.handlers.ts:483-546`) returns that merge, and `fetchModels` persists any non-empty fetcher result (`provider-models.service.ts:370-377`, `persistCatalog` at `:187-205`).
  - Copilot: the fetcher's last step returns `COPILOT_PROVIDER_ENTRY.staticModels` as a normal non-empty result (`provider-rpc.handlers.ts:366-375`). That result is cached and persisted exactly like live data.
  - Ollama Cloud: `listCloudModels` returns `staticModels` (plus extras) when ollama.com is down or empty (`ollama-model-discovery.service.ts:392-433`), which is also persisted.
- Scenario: a user upgrades, is offline (or the vendor is down) at first launch inside the 30-day window. `readPersistedCatalog` (`:212-240`) returns the old static list. The plan labels it `source: 'persisted'` with "Showing the list saved on <date>". The user gets the exact repo-literal list the task is deleting, now presented as real vendor data. The plan says "No new store, no migration: old persisted rows ... are valid lists" (plan, "State or persistence"). That is wrong for these three providers.
- Fix: version the persisted record. Write `{ models, timestamp, origin: 'live', schema: 2 }`, and make `readPersistedCatalog` ignore any record without it, so pre-change entries are discarded once. Add a test: a stored v1-shaped Kimi/Copilot/Ollama-Cloud record yields `unavailable`, not `persisted`. Add it to the Component 9 chain spec.

## Serious

### S1. A consumer of `isStatic` is missing from every batch; gate omits changed projects

- `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts:231` builds a `provider:listModels` result with `isStatic: true`. The plan's Component 8 fixture list names only `settings.fixtures.ts:143` and `skills.spec.ts:109-110`.
- The type change makes `source` required (`rpc-providers.types.ts:98-107` has `isStatic?` optional today), so this file stops compiling.
- The full-gate list (plan line 735) has 12 projects and omits `@ptah-extension/webview-e2e-harness`, `ptah-electron-e2e` (both have changed files) and `@ptah-extension/chat` (consumes `ProviderListModelsResult` in `providers-models-loader.service.ts:11`, `cli-tier-mapping-modal.component.ts:222`, `main-agent-reassign-popover.component.ts:452`, `decision-model-suggestions.ts:114`). Add all three, and update "for 12 projects" to the real count.
- Other consumers I confirmed (all covered by the plan): memory-curator and skill-synthesis `listModels` (`memory-diagnostics-rpc.service.ts:94-110`, `skill-synthesis-rpc.service.ts:115-130`), picker, `scenario-sanitizer.ts:170,201` (name only), `lane-model-listing.adapter.ts`, `ptah-cli-rpc.handlers.ts`, `config-rpc.handlers.ts:538`.

### S2. The chain text and the failure table contradict each other on 401/403

- Component 2 step 3 says: after a live failure, read the persisted catalog; the 401/403 text is only the `liveFailure` string. So a rejected key returns `persisted` plus a notice.
- The failure table (plan line 601) says "Key rejected (401/403): `unavailable`". The "key missing" row explicitly skips persisted; "key rejected" is not described that way in the chain.
- Pick one. A removed key must not offer models (the plan's own decision, line 748); the same reasoning applies to a revoked key. Recommend: 401/403 bypasses persisted, like the no-key case. Make the typed failure carry a reason kind (`no-key | auth | network | shape | empty`) instead of a string, so this is a testable branch and not a string match like the one being deleted (`provider-rpc.handlers.ts:769-789`).

### S3. `noImplicitOverride` breaks code the plan does not list

- `libs/backend/auth-providers/tsconfig.lib.json:14` sets `noImplicitOverride: true`. Component 3 makes `getStaticModels` a concrete base method. Every remaining subclass that implements it without `override` then fails (TS4114): `custom-openai-translation-proxy.ts:188` (kept by the plan, but the file is not in any MODIFY list; only `custom-proxy.factory.ts` is) and `auth/curator-proxy-manager.spec.ts:36`.
- `providers/sakana/sakana-translation-proxy.spec.ts:13,124` asserts "fugu / fugu-ultra from the registry entry" through `getStaticModels`; it fails once the override is removed. It is not in the plan's spec list (plan lines 631-652). `providers/kimi-code` and `copilot` proxy specs also need a check.
- Add these three files to B2 or B3 (curator spec is under `auth/`, which B3 owns). Alternative that avoids all of it: leave `getStaticModels` abstract.

### S4. Native child admission: the `opus|sonnet|haiku` alias still resolves to a repo literal, then gets rejected

- `child-model-admission.ts:23-34` today unions catalog + static + `defaultTiers` ids, so a stale default id is still "accepted". The plan (Component 6) removes the union but keeps `resolveNativeTierAlias` mapping `opus|sonnet|haiku` through `defaultTiers` (`:37-41`), then `chat-session.service.ts:1510-1513` checks `acceptedModels.includes(resolved)`.
- Scenario: the vendor retires the `defaultTiers.opus` id. Live catalog has a newer opus. `opus` resolves to the retired literal, is not in the catalog, and the child is refused with `invalid-model`. Before this change it was admitted. The plan treats `fable` correctly (newest in live catalog) but not the three tier words.
- Fix: resolve all four aliases from the live catalog (newest `claude-opus-*`, etc.), the same way `deriveTiersFromCatalog` does; use `defaultTiers` only if the live catalog is empty, and then the empty-catalog refusal already applies (`chat-session.service.ts:1499-1507`).

### S5. `liveModelDefaults.supportsToolUse: true` masks a missing capability for every live row

- Today `mergeStaticMetadata` (`provider-models.service.ts:576-614`) ORs `true` only for ids in the static rows. The plan applies `true` to every row of z-ai, sakana, anthropic-api whenever the live row lacks a flag (parser rule, Component 2). Those endpoints report no tool flag (plan line 63), so `toolUseOnly` becomes a no-op and embedding/image/other non-chat rows the vendor lists are offered as tool-capable. That is a declared literal masking an unknown: exactly the failure the user wants surfaced.
- Anthropic `/v1/models` does list only Claude chat models, so `true` is defensible there. For Z.AI and Sakana it is not verifiable (both 401 keyless; plan never saw a payload). Recommend: keep `liveModelDefaults` only for Kimi capabilities and Anthropic; for Z.AI and Sakana treat an unreported flag as unknown and do not filter those rows out under `toolUseOnly` (or document the assumption and add the one keyed call as an acceptance check like A1/A2).

### S6. `toolUseOnly` filtering leaks into the persisted catalog

- `fetchModels` persists `result.models` from `fetchDynamicModels` (`provider-models.service.ts:382-386`), and `fetchDynamicModels` returns the already `toolUseOnly`-filtered `filtered` (`:556`). A picker call with `toolUseOnly: true` therefore persists a partial catalog; later fallbacks, `getCachedModelIds`, and the new "catalog ids only" readers (stored-model-offer, saved-model option, child admission) see a subset.
- The new `ProviderModelList.models` is documented as "after toolUseOnly" (plan line 233). The plan never says what is persisted. Require: persist and memory-cache the unfiltered list; filter only on return. Add a chain test.

### S7. The failure table does not cover several required paths, so Component 9's "one case per row" leaves them untested

Missing rows (each needs an expected `source`, text and a test):
- Persisted catalog older than 30 days (`PERSISTED_CATALOG_MAX_AGE_MS`, `:236-238`) and the 31-day boundary. Currently only a debug log.
- Persisted record malformed or all rows invalid (`:218-231` returns null).
- Vendor timeout (10 s generic, 4 s OpenCode) versus HTTP error versus DNS failure: all collapse to "first line of the error message", which is not testable as a stable string.
- Cold OpenCode cache at request time is in prose (Component 3 failure behaviour) but not in the table or the chain spec; it is the case most likely to hurt (see M1).
- Fetcher that throws versus fetcher that returns `[]` (Kimi/claude-cli keep `[]`): the plan says empty becomes "returned no usable models" but the claude-cli reason would be misleading when the SDK simply could not reach the login.

### S8. Cursor and agy model literals remain; the Q3 default leaves them in

- `cursor-cli.adapter.ts:310-312,319-347` returns `FALLBACK_MODELS` (`composer-2.5`, `composer-2`, `isFallback: true`) on three failure paths. That is a repo-literal fallback list, exactly the thing the user rejected ("a fall back means a major issue ... rather than just show a list of old models"). Plan Q3 recommends leaving it for a follow-up.
- `antigravity-cli.adapter.ts:168-178` (`AGY_EFFORT_MODEL_BASES`, `AGY_STALE_MODEL_IDS`) is a repo-literal id table that gates routing behaviour (same role as `OPENCODE_MODEL_ROUTES`). It is not in the parity inventory section D ("looked at and left alone").
- `cli-model-list.service.ts:41,49` stamps `isFallback: true` on these. The user's request was "delete every" list; deferring needs the user's explicit yes, not a recommended default. Either include Cursor in this task, or record the user's confirmation and add Cursor/agy to section D with reasons.

### S9. Auth header change affects every `ANTHROPIC_API_KEY` provider that has a `modelsEndpoint`, including user-defined custom ones

- Component 2 switches the header on `provider.authEnvVar`: `ANTHROPIC_API_KEY` -> `x-api-key` + `anthropic-version`. Today everything uses `Authorization: Bearer` (`provider-models.service.ts:520-526`). `CustomProviderEntrySchema` allows `authEnvVar: 'ANTHROPIC_API_KEY'` plus `modelsEndpoint` (`provider-registry.ts:562-565,671-680`), and custom OpenAI-compatible endpoints expect Bearer. Result: a working custom provider's list breaks silently (401) after this change.
- Fix: put the header scheme on the provider entry for the Anthropic lane only (e.g. a `modelsAuthScheme` field), default Bearer.

## Moderate

- M1. Cold OpenCode cache, offline: `resolve` -> awaited refresh (4 s) -> persisted protocol -> 400 (plan lines 360-362). The persisted catalog is only written by `fetchModels`, i.e. when the picker opens or `refreshTiersFromLiveCatalog` runs (`provider-models.service.ts:976`); a successful routing refresh in `OpenCodeLiveRoutes` writes nothing (plan rejected a second store). A user who has routed OpenCode traffic but never opened the picker, then starts offline, gets a 400 for every request where the static table used to work. Also, after 30 days the persisted record ages out although routing refreshed it daily. Require the attached closure to also persist on a successful routing refresh, or document and test the limitation.
- M2. `defaultTiers` stay and are "applied unverified" when no catalog is on hand (table row 2, plan line 599). OpenCode's proxy `normalizeModelId` reads raw `this.entry.defaultTiers` (`opencode-translation-proxy.ts:60-68`), not the effective/derived tiers, so a retired default becomes a 400 at request time even after the live list was fetched. The plan's claim "never used to list or admit models" (Q1) is not true for this path or for S4. Route `normalizeModelId` through the effective tiers, or state the exception.
- M3. `ZAI_RATE_CARD` (Component 1, Q2 recommended) re-creates a dated, repo-literal table keyed by 14 Z.AI model ids. It is "pricing, not a list" but it will drift the same way and is the first thing the next reviewer will call a sneaked fallback. Same for the pre-existing `ANTHROPIC_RATE_CARD`/`CODEX_RATE_CARD` (section D). Since Q2 is unanswered, make it explicit that the default is user-reserved, and prefer "cost unknown" as the default consistent with the stated goal.
- M4. `liveFailure` is "first line of the error message, capped at 180 chars" for any thrown error (plan line 251). The plan claims upstream bodies are never relayed (line 593), but fetchers such as `copilotAuthService.listModels`, axios errors (`Request failed with status code ...`, with URL) and Ollama's HTTP errors can carry URLs or vendor text. The existing precedent (`file-settings-errors.ts`: code + fixed text) is not followed. Use a closed reason enum with fixed copy.
- M5. Ollama Cloud enrichment: the existing `/api/show` path takes the local daemon `baseUrl` (`ollama-model-discovery.service.ts:526-583`). The plan says "existing bounded enrichment" against `https://ollama.com/api/show`, but that is a new POST path (the metadata service has `httpJson`, not a POST). The Quality line "no additional network request per picker open versus today" (plan line 621) is false for this: up to 25 POSTs (1 h cache). The live check (A3, Component 9 case 2) calls a "production enrichment parser" that does not exist yet. Specify the new method and its tests. Specify id normalisation via `toCloudId` (`ollama-cloud-model-id.ts`) when unioning with local `:cloud` tags, or rows duplicate.
- M6. New swallow sites need the repo's ratchet annotation. CI runs `degradation-audit` (`.github/workflows/ci.yml:91-94`, `tools/degradation-audit`); existing code carries `degradation-audit:` comments. The plan adds catches (reader exceptions treated as "no persisted catalog", Kimi/Copilot step failures, enrichment failure keeps row) and never mentions it. Add to quality requirements.
- M7. `getPersistedCatalog(providerId)` is specified as returning models for OpenCode (`readonly ProviderModelInfo[] | null`, plan line 316), but the chain needs `savedAt` too ("`savedAt` = stored timestamp", Component 2 step 3). Define the return type (`{models, savedAt} | null`) before B2 and B2's `register.ts` closure diverge.
- M8. `isStoredModelOffered` (`stored-model-offer.ts:58-76`) detects "model belongs to another provider" using other providers' `staticModels`. Reducing it to cached ids means cold providers no longer claim their models, so a stale cross-provider saved model is kept and sent (vendor 400). This is a behaviour regression the plan lists as a plain "move"; add a note and a test (the plan has a new `stored-model-offer.spec.ts`, so it can pin it).
- M9. `config:models-list` for provider-session providers (`config-rpc.handlers.ts:538`, `config-provider-session-models.ts:42-60`) consumes `fetchModels` but only looks at `models`; an `unavailable` result is indistinguishable from an empty catalog (`catalogFailed` is set only on throw), so the composer silently lists only "default" and the saved model. Neither file is in Component 6's file list. Surface `source/error` or throw on `unavailable` there.
- M10. Live check scope (item 6 of the brief). What it does right: it never compares against repo lists, never asserts ids or `defaultTiers`, and the OpenCode and keyless OpenRouter/Requesty cases run the production classes (`OpenCodeLiveRoutes`, `parseModelsApiRows`). Gaps: (a) keyed providers (Z.AI, Sakana, Kimi, Anthropic lane, Copilot) have zero live coverage, so A1/A2 and the `liveModelDefaults` assumptions stay unproven in CI; (b) it does not run `ProviderModelsService.fetchModels`, so the persist/chain glue is only unit tested; (c) with `defaultTiers` kept (Q1) and never asserted, a retired default tier is now silently undetectable (the old probe caught it); (d) the "every raw row had `type === 'chat'`" cross-check re-states the parser's own filter, so it cannot catch a wrong filter rule. Cheap improvement for (c): assert each `defaultTiers` id is present in the live list for OpenCode/Ollama Cloud. That compares to a repo literal, but as a staleness alarm for the one literal that stays; the user should decide.
- M11. Batches and ordering (item 5). File-disjointness holds on the plan's own lists: B2 (provider-models.service, models-api-parser, opencode/*, translation-proxy-base, five proxies, custom factory, `di/register.ts`) vs B3 (`providers/local/*`, `auth/*`, agent-sdk) vs B6 (new specs + workflow) share no file. Problems: (a) B6 is listed under "parallel-safe" but its chain spec exercises B2/B3 behaviour and the live spec needs B3's Ollama change; it must follow B2+B3 (plan line 670 says so, the table does not). (b) B1 deletes `seedStaticModelPricing` while `agent-sdk/src/index.ts:527` re-exports it (B3), and deletes shared exports used by agent-sdk and auth-providers, so shared's own commit leaves every downstream project red; the plan accepts this (lines 671-672) but then "team-leader commits each batch once its scoped checks pass" cannot be satisfied for B2/B4/B5 individually. Either merge B1+B3(agent-sdk part) or tell the team-leader to commit B1-B5 as one verified unit. (c) The unlisted files in S1/S3 are the gap in disjointness. (d) B2 verify says typecheck "green only after B3"; the plan's inner loop for B2 therefore cannot gate B2.

## Minor

- m1. Verify commands match CLAUDE.md in form: scoped `npm run verify -- --related -p ...` then `-t lint,typecheck`; the live run uses `node scripts/verify.mjs --exec`. All 12 project names resolve (`@ptah-extension/*`, `ptah-electron`, `ptah-extension-webview`). Only the missing projects in S1 are wrong. `typecheck-templates` is correctly scoped to `ptah-extension-webview`.
- m2. The grep gate (plan line 729) omits `getStaticModels` (kept) and would not catch Cursor/agy literals (S8); add a gate for `isFallback: true` and for hard-coded model id arrays in `cli-adapters/`.
- m3. `parity-inventory.md` row "Copilot proxy listModels fallback" and Component 3 say "rethrow"; `translation-proxy-base.ts:465-473` `/v1/models` then needs the throw handled (500 vs empty list) - state which.

## Answers to the brief's six checks

1. Completeness. Covered: `staticModels` readers `provider-models.service.ts`, `provider-rpc.handlers.ts`, `ptah-cli-rpc.handlers.ts`, `lane-model-listing.adapter.ts`, `config-saved-model-option.ts`, `child-model-admission.ts`, `workspace-provider-profile-resolver.ts`, `stored-model-offer.ts`, `ptah-cli-registry.ts`, `child-model-tier.ts`, `seed-matrix.ts`, the five proxies, `copilot-sdk.adapter.ts` (`COPILOT_MODELS`), Ollama `KNOWN_CLOUD_MODELS`, `OPENCODE_MODEL_ROUTES`/`getOpenCodeModelProtocol`. Verified by grep over `apps libs tools`: no reader in `apps/ptah-electron`, `apps/ptah-extension-webview`, `libs/frontend/*`, `platform-cli`, `cli-engine` (the matches in `tools/mcp-bench` and `model-state.service.ts` are unrelated). Missed: `settings-lanes.fixtures.ts:231` (S1), `custom-openai-translation-proxy.ts:188` and `curator-proxy-manager.spec.ts:36` (S3), `sakana-translation-proxy.spec.ts` (S3), `cursor-cli.adapter.ts:310-347` and `antigravity-cli.adapter.ts:168-178` (S8), `config-provider-session-models.ts` (M9).
2. Literal sneak-back. Yes, in four places: old persisted catalogs (B1), `defaultTiers` as unverified offline defaults and the proxy alias map (M2, S4), `liveModelDefaults.supportsToolUse` for providers whose endpoints do not report it (S5), `ZAI_RATE_CARD` (M3). Rate cards are not used to admit models in the plan; the `ollama` `/api/show` default 128000 is removed correctly.
3. Failure behaviour. Offline first run, key missing: concrete and testable. Cold OpenCode: concrete in prose, no table row/test, weak fallback (M1). Malformed gateway rows: concrete (per-row skip, zero rows = failure; existing `opencode-live-routes.ts:53-57,145`). 30-day stale persisted: not specified in the plan beyond "already implemented" (S7). 401 versus persisted: contradictory (S2).
4. Contract change. All `isStatic` readers found by grep: handlers, three backend callers, `rpc-agents.types.ts:835`, ~20 specs, 4 fixtures. Production renderer consumers read only `error`/`models`, so safe as the plan says; `source` becomes required, so every fixture must change; one fixture is missing (S1). `PtahCliListModelsResult` has no renderer caller (confirmed, only `scenario-sanitizer.ts:201`).
5. Batches. See M11, S1, S3.
6. Live check. See M10.

## Decisions

None taken by the reviewer; the items needing a user answer are S8 (Cursor/agy), M3 (Z.AI rate card), M10(c) (tier staleness alarm).
