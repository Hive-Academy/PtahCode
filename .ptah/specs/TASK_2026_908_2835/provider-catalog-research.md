# Provider catalog research — TASK_2026_908_2835 (R1)

Question: do the other provider entries share the native-Claude defect class — a
model list that stays stale after the provider publishes new models — and where
does each list come from?

Method: read-only. Line numbers on `sdk-model-service.ts`,
`config-rpc.handlers.ts` and `claude-cli-provider-entry.ts` are those of the
current working tree, which holds B1's uncommitted changes. No tests, builds,
network calls or app runs were made. All claims come from source reads; the
`ptah_code_search_symbols` index was empty, so file search fell back to
`ptah_search_files` and Grep.

## Answer

- **Same defect** (stable fingerprint, so the persisted `ptah.sdk.modelCatalog`
  entry hits on the first picker query of every boot, pre-B1 with no refresh):
  native Claude login, direct Anthropic API key, Ollama local, Ollama Cloud,
  Z.ai, Requesty, and custom providers with `lane: 'anthropic'`. B1's
  revalidation covers every one of them.
- **Not the same defect**: Codex, GitHub Copilot, Kimi Code, OpenRouter, Sakana,
  OpenCode zen/go, LM Studio, and custom providers with `lane: 'openai'`. Their
  fingerprint contains the ephemeral translation-proxy port, so a persisted entry
  never matches a later boot. No stale list. Cost: one SDK probe per boot, and
  dead entries sit in the store until the 8-entry LRU evicts them.
- The provider-settings list has **no stale-primary defect**: it is live-first,
  with a 30-day persisted catalog used only as a fallback when the live fetch
  fails.
- Separate real risks: the Kimi Code settings list is **static-only**; OpenCode's
  static list plus route table **block new models until a Ptah release**; static
  `defaultTiers` **outrank live-derived tiers**.

## Per-provider table

Cache shorthand used below:

- **SDK picker caches**: in-memory catalog per process (no time limit) +
  persisted `ptah.sdk.modelCatalog` (`sdk-model-service.ts:245`), key =
  `authFingerprint()` (`sdk-model-service.ts:612`), max 8 entries with LRU
  eviction (`sdk-model-service.ts:255`), no age limit pre-B1. B1 adds one
  background refetch per key per process after a persisted hit (10 s delay,
  `sdk-model-service.ts:233`, triggered at `:663` and `:913`, logic at
  `:744`, `:755`). `clearCache()` drops the persisted copy too
  (`sdk-model-service.ts:1426`, `:1438`), and tier set/clear calls it.
- **Settings caches**: in-memory 5-minute `modelCache` + persisted
  `provider.<id>.modelCatalog`, 30-day max age, **fallback-only**
  (`provider-models.service.ts:97-98`, `:109`, `:168-171`, cascade `:281-448`).

| Provider | Chat picker source | Settings list source | Caches (scope, key, limit) | Stale after restart? | Evidence |
|---|---|---|---|---|---|
| Native Claude login (claude-cli) | `getNativeClaudeModels()` → live SDK `supportedModels()` (`sdk-model-service.ts:887`, persisted hit `:911`) | same live probe via `registerAnthropicDirectFetcher` | SDK mem + persisted key `'native'` (stable), no TTL | **YES pre-B1** — the reported defect; B1 revalidates (`:913`) | `sdk-model-service.ts:887-913`; `provider-rpc.handlers.ts:435-523` |
| Anthropic API key | SDK third-party catalog, tier-mapped (`:927`, `:948`, `:1003`) + `/v1/models` rows from `getApiModels` | live `/v1/models` first (`provider-rpc.handlers.ts:435-523`) | SDK mem + persisted (stable key: base URL + key hash), no TTL; `/v1/models` rows mem-only, 5-min TTL (`:220`, `:1281`), skipped for `127.0.0.1` (`:1286`) | **YES pre-B1** for the SDK catalog part; the `/v1/models` part refreshes each boot | `sdk-model-service.ts:220`, `:927-1002`, `:1281-1286`; `config-rpc.handlers.ts:529-530` |
| OpenAI Codex | SDK probe skipped under the retired placeholder token (`:542`, `:1094`); CLI-lane picker uses the live app-server catalog | app-server `model/list` catalog → `codexAuthService.listModels()` → `[]`; no static fallback by design | SDK persisted key holds the retired legacy entry (contains a port) — never matches; settings mem 5 min + 30-day fallback | **NO** (port never matches); the legacy entry lingers until LRU eviction | `sdk-model-service.ts:542`, `:1094`; `provider-proxy-pool.ts:228-230`; `provider-rpc.handlers.ts:376-418`; `codex-provider-entry.ts:28-32` |
| GitHub Copilot | SDK catalog through the Copilot translation proxy (ephemeral port in the key) | platform modelDiscovery → `copilotAuthService.listModels()` (live `/models`) → CLI adapter list → `staticModels` | SDK persisted key never matches; settings mem 5 min + 30-day fallback | **NO** stale list; one SDK probe per boot | `oauth-proxy.strategy.ts:242`; `provider-rpc.handlers.ts:281-359`; `copilot-auth.service.ts:628-653` |
| Kimi Code | SDK catalog through the Kimi proxy (ephemeral port) | **STATIC ONLY** — `KIMI_CODE_STATIC_MODELS`; no `modelsEndpoint`, no dynamic fetcher registered | SDK persisted key never matches; the settings list is code, not a cache | **NO** stale cache, but the settings list cannot change without a Ptah release | `oauth-proxy.strategy.ts:147`; `kimi-code-provider-entry.ts:64`; no Kimi fetcher in `provider-rpc.handlers.ts:281-556` |
| OpenRouter | SDK catalog through the proxy (ephemeral port) | live `https://openrouter.ai/api/v1/models` via registry `modelsEndpoint` (`fetchDynamicModels`) | SDK persisted never matches; settings mem 5 min + 30-day fallback; no staticModels | **NO** | `api-key.strategy.ts:430-435`; `openrouter-translation-proxy.ts:113`; `provider-models.service.ts:281-448` |
| Ollama (local) | SDK catalog, direct fixed URL `http://127.0.0.1:11434` | live `/api/tags` discovery | SDK mem + persisted (**stable** key), no TTL; model metadata mem 10-min TTL + 1-min fallback | **YES pre-B1** (if the SDK probe returns rows — not verified, see Unknown 1); B1 revalidates | `local-native.strategy.ts:145`; `ollama-model-discovery.service.ts:330`, `:247-248` |
| Ollama Cloud | SDK catalog, direct cloud URL | live `ollama.com/api/tags`; `KNOWN_CLOUD_MODELS` is the list only when live is empty | SDK mem + persisted (**stable** direct key), no TTL | **YES pre-B1**; B1 revalidates | `local-native.strategy.ts:213`; `ollama-model-discovery.service.ts:126` |
| LM Studio | SDK catalog through the local proxy (ephemeral port) | proxy `listModels()` → live local `/v1/models` | SDK persisted never matches; proxy `getStaticModels` returns `[]` | **NO** | `local-proxy.strategy.ts:93`; `local-model-translation-proxy.ts:103`, `:112` |
| Z.ai (GLM) | SDK catalog, direct base URL | live `https://api.z.ai/api/paas/v4/models`; `staticModels` (15) fallback | SDK mem + persisted (**stable** key), no TTL | **YES pre-B1**; B1 revalidates | `api-key.strategy.ts:604`; `provider-registry.ts:238`, `:246` |
| Requesty | SDK catalog, direct base URL | live `https://router.requesty.ai/v1/models`; no staticModels | SDK mem + persisted (**stable** key), no TTL | **YES pre-B1**; B1 revalidates | `api-key.strategy.ts:650`; `requesty-provider-entry.ts` |
| Sakana | SDK catalog through the proxy (ephemeral port) | live `https://api.sakana.ai/v1/models`; `staticModels` (2) fallback | SDK persisted never matches | **NO** | `api-key.strategy.ts:430-435`; `sakana-provider-entry.ts:31` |
| OpenCode zen / go | SDK catalog through the proxy (ephemeral port) | route-table `staticModels` primary, filtered by live `/models` IDs when reachable (`isStatic` flag when not) | SDK persisted never matches; settings mem 5 min + 30-day fallback | **NO** stale cache, but a new model is unlisted AND 400-blocked until a release | `opencode-translation-proxy.ts:68-76`; `opencode-provider-entry.ts:78`; `provider-models.service.ts:281-448`; `translation-proxy-base.ts:539-548` |
| Custom (lane: anthropic) | SDK catalog, direct base URL | configured `modelsEndpoint` if set, else entry `staticModels` | SDK mem + persisted (**stable** key), no TTL | **YES pre-B1**; B1 revalidates | `api-key.strategy.ts:604`; `provider-models.service.ts:281-448` |
| Custom (lane: openai) | SDK catalog through the custom OpenAI proxy (ephemeral port) | proxy listModels / entry `staticModels` | SDK persisted never matches | **NO** | `custom-openai-translation-proxy.ts:188`; `provider-proxy-pool.ts:490-547` |

Picker and settings are two different consumers: the chat picker merges
`sdkAdapter.getSupportedModels()` + `getApiModels()` in
`config-rpc.handlers.ts:529-530` (handler registered `:521`); the settings list
goes through `provider:listModels` → `ProviderModelsService.fetchModels`
(`provider-rpc.handlers.ts:588-674`). A third consumer, the CLI-lane picker
(`agent:list-cli-models`), uses `cli-model-list.service.ts` (codex/copilot
cascades below).

Request-time gate, separate from lists: an unknown model ID on a gated proxy
returns HTTP 400 "not supported … in this Ptah version"
(`translation-proxy-base.ts:539-548`). Copilot, OpenRouter and Sakana always
resolve `chat/completions` (no gate: `copilot-translation-proxy.ts:108-110`,
`openrouter-translation-proxy.ts:102`, `sakana-translation-proxy.ts:107`); Kimi
always `messages` (`kimi-code-translation-proxy.ts:90`); OpenCode is gated by
the route table (`opencode-translation-proxy.ts:68-71`).

## Codex detail

**Port stability (point 3): NOT stable.** Every translation proxy listens on
port 0 and the OS assigns an ephemeral port per boot:
`translation-proxy-base.ts:21` (header comment "Listens on port 0 (OS-assigned)
to avoid port conflicts"), `:374` (`server.listen(0, '127.0.0.1')`), `:382-383`
(the assigned port becomes the proxy URL). The pooled proxies are documented
the same way (`provider-proxy-pool.ts:9`, `:120`). Consequences:

1. A persisted catalog whose key contains a proxy port can never match a later
   boot. The store entry on the user's machine
   (`method=thirdParty|provider=openai-codex|ANTHROPIC_BASE_URL=http://127.0.0.1:55396|…`)
   is dead. It leaves the store only through the 8-entry LRU eviction
   (`sdk-model-service.ts:255`).
2. No stale-list defect for Codex from the persisted store.
3. For identities that still resolve through a live proxy, the first picker
   query of each boot starts one SDK probe, because the in-memory cache is
   empty after a restart.

**Codex does not use a translation proxy at all today.**
`provider-proxy-pool.ts:228-230` throws `codexNativeRuntimeRequired()` for
`openai-codex`; `oauth-proxy.strategy.ts:266-283` refuses Codex OAuth with
`CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE`; the profile resolver rejects the legacy
shape (`workspace-provider-profile-resolver.ts:536`). The retired proxy env is
still observable, but its query launch is refused
(`sdk-query-runner.service.ts:751-756`), and model probes under its placeholder
token are skipped with "Skipping a stale Codex proxy model probe"
(`sdk-model-service.ts:542`, `:1094`).

**Codex model-list sources (live, in order):**

1. Codex app-server `model/list` catalog —
   `codex-app-server-lane.adapter.ts:246` `listModels()` →
   `readCodexLaneCatalog(() => this.runtime.openCatalog(…))`, with a timeout race
   in `codex-app-server-lane-catalog.ts:27-51`. No internal cache.
2. `CodexAuthService.listModels()` — `codex-home-auth.service.ts:466-522`:
   `GET ${endpoint}/models?client_version=${clientVersion}` with the Bearer
   token; endpoint resolution at `:431-454` (auth-file `api_base_url` → API-key
   default → OAuth ChatGPT backend default). ChatGPT shape
   `{models: [{slug, display_name, description, context_window, visibility}]}`
   filtered to `visibility === 'list'`; OpenAI shape `{data: [{id}]}` returned
   in full. No internal cache.
3. **No static fallback — deliberate.** `codex-provider-entry.ts:28-32`: a
   hardcoded ID list would hide every model that shipped after it. The settings
   fetcher ends with `[]` (`provider-rpc.handlers.ts:376-418`).

Caches in front of these: `ProviderModelsService`'s 5-minute in-memory cache and
its 30-day fallback-only persisted catalog (`provider-models.service.ts:97-98`,
`:109`). The CLI-lane picker cascade is: app-server catalog →
`codexAuthService.listModels()` → curated static map, with `codexReported`
marking fallback rows (`cli-model-list.service.ts`).

## Static lists

Production code in `libs/**` and `apps/**`. "Tiers" rows are tier-default maps,
not model lists.

| File:line | List | Provider | Entries | Role |
|---|---|---|---|---|
| `libs/shared/src/lib/providers/entries/copilot-provider-entry.ts:38-73` | `COPILOT_STATIC_MODELS` | github-copilot | 35 | settings-list last fallback; proxy `/v1/models` response (`copilot-translation-proxy.ts:73-75`); synced with models.dev `github-copilot` 2026-10-07; drift-check guarded |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:121-156` | `COPILOT_MODELS` | github-copilot | 35 | CLI-lane picker fallback + settings fetcher fallback; `:124` holds `claude-fable-5.1`; same 35 IDs duplicated in a second file |
| `libs/shared/src/lib/providers/entries/claude-cli-provider-entry.ts:44` | `staticModels` | claude-cli (native login) | 8 | settings fallback when the native login cannot list; B1 added Fable 5.2 (task decision 4); `defaultTiers` `:37-41` |
| `libs/shared/src/lib/providers/entries/codex-provider-entry.ts:14-18` | `CODEX_DEFAULT_TIERS` | openai-codex | 3 tiers | tier defaults: sonnet `gpt-6-sol`, opus `gpt-6.1-sol`, haiku `gpt-6-luna`; **no staticModels by design** (`:28-32`) |
| `libs/shared/src/lib/providers/entries/copilot-provider-entry.ts:95-99` | `COPILOT_DEFAULT_TIERS` | github-copilot | 3 tiers | tier defaults: `gpt-5.4` / `gpt-5.4` / `gpt-5-mini` |
| `libs/shared/src/lib/providers/entries/kimi-code-provider-entry.ts:64` | `KIMI_CODE_STATIC_MODELS` | kimi-code | 7 | **settings list PRIMARY — static-only** (no `modelsEndpoint`, no dynamic fetcher) |
| `libs/shared/src/lib/providers/entries/local-provider-entry.ts:47-83` | Ollama `staticModels` | ollama | 5 | settings fallback; `defaultTiers` `:84-88` |
| `libs/shared/src/lib/providers/entries/local-provider-entry.ts:133-137` | Ollama Cloud `defaultTiers` | ollama-cloud | 3 tiers | tier defaults: `gpt-oss:20b-cloud` / `kimi-k2.6:cloud` / `glm-5.3:cloud`; no staticModels |
| `libs/shared/src/lib/providers/entries/local-provider-entry.ts:150-163` | LM Studio entry | lm-studio | 0 | no staticModels — dynamic local `/v1/models` only |
| `libs/shared/src/lib/providers/entries/sakana-provider-entry.ts:31` | `SAKANA_STATIC_MODELS` | sakana | 2 | settings fallback; proxy static models (`sakana-translation-proxy.ts:115`) |
| `libs/shared/src/lib/providers/provider-registry.ts:246` | z-ai `staticModels` | z-ai | 15 | settings fallback; `defaultTiers` `:238` (sonnet `glm-5.2`, opus `glm-5.3`, haiku `glm-5.3-flash`); synced with models.dev `zai` 2026-10-07 |
| `libs/shared/src/lib/providers/entries/opencode-provider-entry.ts:78` | zen `staticModels` | opencode-zen | 78 | settings list PRIMARY, filtered by live `/models` IDs when reachable; cost fields omitted so pricing seeding skips them; entry omits `modelsEndpoint` (count per `opencode-provider-entry.spec.ts:357`) |
| `libs/shared/src/lib/providers/entries/opencode-provider-entry.ts` (go block) | go `staticModels` | opencode-go | 35 | same role for go (count per `opencode-provider-entry.spec.ts:377`); synced with the live `/zen/go/v1/models` list 2026-10-07 |
| `libs/shared/src/lib/providers/entries/opencode-model-routes.ts:41` | `OPENCODE_MODEL_ROUTES` | opencode-zen/go | zen 18 `messages` + 28 `chat/completions` + more | **request-time gate** — unknown IDs get HTTP 400 (`translation-proxy-base.ts:539-548`); also filters the settings list; synced 2026-10-07 |
| `libs/backend/auth-providers/src/lib/providers/local/ollama-model-discovery.service.ts:126` | `KNOWN_CLOUD_MODELS` | ollama-cloud | 18 | metadata catalog (context window, description); the list itself only when the live `/api/tags` fetch is empty or fails |
| `libs/shared/src/lib/utils/pricing.utils.ts:80` | `DEFAULT_MODEL_PRICING` | all | 6 | legacy pricing fallback (gpt-4o family, `local`); the runtime pricing map is hydrated from OpenRouter's public `/api/v1/models` at startup; pricing only, no list role |
| `libs/shared/src/lib/utils/codex-rate-card.ts:45` | `CODEX_RATE_CARD` | openai-codex | 7 | dated OpenAI API rate card for Codex fallback IDs (referenced `pricing.utils.ts:73-74`); pricing only |
| `libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts` | curated `modelMap` (codex, copilot) | codex, copilot | not recorded | CLI-lane picker last resort, flagged `codexReported` / `copilotReported` |
| `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts:1-22` | drift check | copilot, opencode, ollama-cloud, z-ai | — | not a shipped list: weekly `model-lists-probe.yml` workflow runs live probes (`PTAH_LIVE_PROBES=1`) and fails when a static list drifts from its public source |

**apps/** carries no production static model lists.** Grep for the list
constants (`staticModels`, `MODEL_ROUTES`, `STATIC_MODELS`, `DEFAULT_TIERS`,
`KNOWN_CLOUD_MODELS`, `COPILOT_MODELS`) found no file under `apps/`. Grep for
model-id literals (`gpt-6*`, `gpt-5*`, `claude-*`, `glm-5*`, `kimi-k*`, `k3.*`,
`fugu*`) found one file only:
`apps/ptah-electron-e2e/src/specs/chat/compaction-duplicate-session.spec.ts` —
an e2e spec, excluded by the task rule "not specs".

## Recommendations

1. **Ship B1's revalidation as-is (S — `sdk-model-service.ts`).** It fixes the
   defect for every stable-fingerprint identity: native login, API key, Ollama
   local, Ollama Cloud, Z.ai, Requesty, custom anthropic-lane. Verified
   behavior: one refetch per key per process (10 s delay, `:233`, `:744`,
   `:755`), skip when the key is no longer the active fingerprint, deep-equal
   compare, re-persist on change. No third-party identity needs a separate fix
   on the SDK catalog path.
2. **Add a live source for Kimi Code (M — `kimi-code-provider-entry.ts` +
   `provider-rpc.handlers.ts`).** The settings list is static-only: 7 IDs, no
   `modelsEndpoint`, no dynamic fetcher. A new Kimi model needs a Ptah release
   before it appears. Add a `modelsEndpoint` or a dynamic fetcher when Kimi
   publishes a listable endpoint.
3. **Decide the OpenCode release dependency (M — `opencode-provider-entry.ts` +
   `opencode-model-routes.ts`).** A new OpenCode model is both unlisted
   (static list is primary) and blocked (the route table returns 400,
   `translation-proxy-base.ts:539-548`). The weekly drift check catches drift,
   but the fix still needs a release. Either accept the dependency and document
   it, or add a default-protocol fallback for unknown IDs.
4. **Deduplicate the Copilot list (S — `copilot-provider-entry.ts` +
   `copilot-sdk.adapter.ts`).** The same 35 IDs are kept in two files. Export
   one list from shared and consume it in both places, so the drift check
   guards a single copy.
5. **Prune dead persisted keys (S — `sdk-model-service.ts`).** Persisted keys
   that contain an ephemeral `127.0.0.1` port, or the retired Codex shape,
   can never hit again but occupy the 8-entry LRU (`:255`). Drop them at
   restore time when no live proxy owns the port, or garbage-collect legacy
   Codex keys.
6. **Re-derive tier defaults from the live catalog (S/M —
   `provider-auth-resolver.ts`).** Registry `defaultTiers` outrank live-derived
   tiers (`provider-auth-resolver.ts:423-459`). A retired tier default can pin
   the picker default to a model the provider no longer serves. B1's
   revalidation refreshes the catalog but not the tier defaults.

## Unknown

1. **Ollama SDK catalog rows.** Whether the SDK `supportedModels()` probe
   returns rows against Ollama's direct endpoint was not verified. The
   stable-fingerprint exposure holds either way. Checked:
   `local-native.strategy.ts:145` (direct URL), `sdk-model-service.ts:927-1002`
   (third-party fetch path).
2. **Chat-picker rows for the active Codex identity today.** The legacy proxy
   probe is skipped and its query launch refused. The exact rows
   `config:models-list` shows for the native-runtime Codex identity were not
   verified. Checked: `sdk-model-service.ts:542`, `:1094`;
   `sdk-query-runner.service.ts:751-756`;
   `workspace-provider-profile-resolver.ts:536`.
3. **Counts of the curated CLI-lane static maps** in `cli-model-list.service.ts`
   were not recorded. Checked: the cascade and the `codexReported` /
   `copilotReported` flags.
4. **Platform modelDiscovery caching (Copilot).** Whether the platform
   model-discovery layer caches between calls was not verified.
   `ProviderModelsService`'s 5-minute cache sits in front in all cases.
5. **Line-number drift on B1-edited files.** `sdk-model-service.ts`,
   `config-rpc.handlers.ts` and `claude-cli-provider-entry.ts` hold B1's
   uncommitted changes in this worktree; the line numbers above match the
   current working tree and can shift before merge.
