# Implementation Plan - TASK_2026_2306_livemodels

Live-only provider model lists. Every repo-literal model list is deleted. A list comes from the
vendor's live endpoint (or the CLI's own model command); when that fails, from the last LIVE
catalog this machine persisted under the new versioned record (30-day cap); when that is absent,
or when the failure is a credential failure, from nothing: the result carries a closed failure
reason and fixed copy ("Couldn't load models from <provider>: ...") that the UI shows with Retry.

All paths are relative to the worktree `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`
unless absolute. Companion inventory: `parity-inventory.md` in this folder. This is Revision 1;
the finding-by-finding resolution table is the last section (`## Revision 1`).

## Inputs and constraints

- Requirements used: `context.md`, `decisions.md` (rows 1-9), `task.md`, `plan-review.md`
  (round 1: 1 Blocking, 9 Serious, 11 Moderate, 3 Minor), the caller's revision brief with the
  binding user decisions, `CLAUDE.md` (verification, Electron-first, CLI lanes must keep working).
- Corrections applied: `plan-review.md` (all Blocking and Serious findings; Moderates per the
  resolution table).
- Design handoff used: none (one existing picker row gains a sibling notice row).
- Binding user decisions (decisions.md 6-9 and the revision brief):
  - D6 tiers: `defaultTiers` stay as curated PREFERENCES, checked against the live catalog; an id
    absent from the live catalog resolves to the closest live model of the same family with a
    warning. Tiers never list or admit models.
  - D7 Z.AI: no `ZAI_RATE_CARD`; Z.AI static rows deleted; Z.AI cost shows unknown. Z.AI GLM
    coding plan is TASK_2026_2307_glmcode, not designed here.
  - D8 Cursor `FALLBACK_MODELS` and the agy model-id tables are in scope; the Pi list is checked
    under the same rule.
  - D9 the persisted catalog record is versioned; pre-version records are ignored.
- Missing decision-critical input: none. No `task-description.md` / `research-report.md`;
  `context.md` carries the approved goal and vendor payload facts were verified live on
  2026-11-22 (table below).

Live vendor facts checked on 2026-11-22 (keyless `curl` from this machine):

| Endpoint | Status | Facts used by the design |
| --- | --- | --- |
| `https://opencode.ai/zen/v1/models` | 200, 105 rows | `type`: chat 83, embedding 12, decision 4, image 3, realtime 2, video 1. `recommended_api` on every row. 10 rows have more than one `api` key. `capabilities.tools.supported` on every row. `limit.context` present. |
| `https://opencode.ai/zen/go/v1/models` | 200, 31 rows | all `type: chat`; `recommended_api` messages 6, chat-completions 19, responses 5, interactions 1. |
| `https://ollama.com/api/tags` | 200, 25 rows | rows carry `capabilities: string[]` (`completion`, `tools`, `thinking`, `vision`, `decision`); names have no `:cloud` suffix. |
| `POST https://ollama.com/api/show` | 200 | `capabilities[]` and `model_info["<arch>.context_length"]` (key is `model_info`, not the `modelinfo` the local parser reads). |
| `https://openrouter.ai/api/v1/models` | 200 keyless | already used keyless by `prefetchPricing`. |
| `https://router.requesty.ai/v1/models` | 200 keyless, 787 rows | rows `{api:'chat', id, input_price, output_price, context_window}`. |
| `https://api.sakana.ai/v1/models`, `https://api.z.ai/api/paas/v4/models` | 401 keyless | keyed only; row shape not observed (no tool flag assumed). |

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| `AnthropicProvider.staticModels?` and `ProviderStaticModel` | `libs/shared/src/lib/providers/provider-registry.ts:50-79,113` | Deleted in the LAST batch, after every reader has moved. |
| Chain today: OpenCode merge, dynamic fetcher, endpoint, persisted, static, empty | `libs/backend/auth-providers/src/lib/provider-models.service.ts:288-475` | One chain with a typed source replaces it. |
| Persisted record `{models, timestamp}` written for ANY non-empty fetcher result | `provider-models.service.ts:187-205` (write), `:212-240` (read, 30-day cap) | Kimi merge (`kimi-code-model-merge.ts:27-35`), Copilot static step (`provider-rpc.handlers.ts:366-375`) and Ollama Cloud `staticModels` (`ollama-model-discovery.service.ts:392-433`) write repo literals into this record today. The record must be versioned (B1). |
| Persisted list is the `toolUseOnly`-filtered list | `provider-models.service.ts:382-386` persists `result.models` from `fetchDynamicModels`, which returns `filtered` (`:552-556`) | Persist and memory-cache the unfiltered list; filter only on return (S6). |
| `readLiveCatalog` = memory cache then persisted | `provider-models.service.ts:761-765` | Tier validation, `getCachedModelIds`, stored-model checks all read the versioned record through one reader. |
| Tier ladder: user -> default (kept when catalog contains it or no catalog) -> `deriveTiersFromCatalog` replacement with an info log | `provider-models.service.ts:810-870` | The replacement step changes to "closest live model of the same family" first, with `warn` (D6). |
| `deriveTiersFromCatalog` tier-word / ordinal rule | `libs/backend/auth-providers/src/lib/model-tier-derivation.ts:113-157` | Kept as the second step after the family match. |
| `FILTERED_TIER_CATALOG_PROVIDERS` includes opencode | `provider-models.service.ts:98-104` | Remove opencode: its live list is now the routable set. |
| Generic endpoint header always `Authorization: Bearer` | `provider-models.service.ts:525-532` | A scheme field on the entry, default Bearer (S9). |
| Custom entries may combine `authEnvVar: 'ANTHROPIC_API_KEY'` with `modelsEndpoint` | `provider-registry.ts:562-565,679` | Header scheme must not be keyed on `authEnvVar` (S9). |
| Auth failure string-matched in the handler; service throws text | `provider-rpc.handlers.ts:769-789`; `provider-models.service.ts:558-566` | Replaced by a closed reason enum (S2, M4). |
| `ProviderModelInfo.supportsToolUse: boolean` required; 125 production reads | `libs/shared/src/lib/types/rpc/rpc-providers.types.ts:67`; repo grep | Cannot become optional; an opt-in `toolUseUnknown?: true` marker carries "not reported" (S5). |
| Precedent for opt-in provenance markers | `contextLengthSource?: 'provider'`, `rpc-providers.types.ts:65` | Same style for `toolUseUnknown`. |
| RPC result has `error?`, `isStatic?` | `rpc-providers.types.ts:97-107` | Add optional fields first, make `source` required in the last batch. |
| 3 renderer consumers treat any `error` as `status: 'error'` | `libs/frontend/chat/.../cli-tier-mapping-modal.component.ts:224-227`, `main-agent-reassign-popover.component.ts:454-457`, `decision-model-suggestions.ts:114-118` | `error` keeps "no usable list"; persisted lists use `notice`. |
| Picker renders `result.error` with Retry | `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:324-343,762-799` | Notice row is a sibling of the existing error row. |
| OpenCode live parser: per-row validation, own-property lookups, 4 s timeout, 2 MiB cap, 5-min failure backoff, 6-h TTL | `libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.ts:10-11,31-60,95-207` | Extended with `type` / `recommended_api`, `force`, a persisted store (read and write) and a model-id read. |
| OpenCode proxy aliases read raw `this.entry.defaultTiers` synchronously | `opencode-translation-proxy.ts:60-68`; base calls it at `translation-proxy-base.ts:535`, then awaits the protocol at `:541` | Base gains an async request-model hook so OpenCode can resolve aliases against its live ids (M2). |
| `getStaticModels` is abstract; `noImplicitOverride: true` | `translation-proxy-base.ts:248,466`; `libs/backend/auth-providers/tsconfig.lib.json:14` | Concrete default means every surviving implementer needs `override`; implementers listed in Component 3 (S3). |
| Implementers / spec subclasses of `getStaticModels` | `copilot-translation-proxy.ts:73`, `custom-openai-translation-proxy.ts:188`, `kimi-code-translation-proxy.ts:103`, `local-model-translation-proxy.ts:103`, `opencode-translation-proxy.ts:82`, `openrouter-translation-proxy.ts:113`, `sakana-translation-proxy.ts:115`; specs `auth/curator-proxy-manager.spec.ts:36`, `custom-openai-translation-proxy.spec.ts:45`, `sakana-translation-proxy.spec.ts:40,124`, `translation-proxy-base.spec.ts:108-123,290` | All in Component 3's file list. |
| Copilot proxy `listModels()` has no production caller | repo grep `listModels()` in `libs/backend`, `apps` (only spec / unrelated callers) | Delete the method with `staticModelsAsFull` (m3). |
| Native child admission unions catalog + static + `defaultTiers`; aliases resolve through `defaultTiers` | `libs/backend/rpc-handlers/src/lib/chat/session/child-model-admission.ts:22-51`; check `chat-session.service.ts:1498-1519` | Aliases resolve against the live catalog (S4). |
| `config:models-list` for provider-session providers reads only `.models` and detects failure only on throw | `libs/backend/rpc-handlers/src/lib/handlers/config-provider-session-models.ts:19-21,42-52` | Reader carries `source`; `unavailable` takes the failure path (M9). |
| Cursor lane `FALLBACK_MODELS` returned on 3 paths; live list from `sdk.Cursor.models.list({ apiKey })` | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts:310-347` | Delete the literal; the live SDK call is the only source. |
| agy `AGY_EFFORT_MODEL_BASES` gates `<model>-<effort>`; `AGY_STALE_MODEL_IDS` maps a retired saved id | `antigravity-cli.adapter.ts:163-179,328-336`; readers `buildAntigravityArgs` `:338-375` (print lane, called at `:1165`) and ACP lane options `:839` | Both become derivations from the live `agy models` ids (`parseAgyModels`, `:302-322`; `listModels`, `:909-916`). |
| Pi lists from `pi --list-models` and returns `[]` on failure; no id literal | `pi-cli.adapter.ts:184-205,293-300` | Pi has no curated list: no change (inventory section D). Grok (`grok-cli.adapter.ts:215-219`), OpenCode CLI (`opencode-cli.adapter.ts:404-415`) and Codex (`codex/codex-app-server-lane-models.ts:20-34`) are also live-only. |
| Copilot CLI adapter `COPILOT_MODELS` = registry static rows | `copilot-sdk.adapter.ts:120-122,247-249` | Deleted; host LM API and account `/models` stay first (`cli-model-list.service.ts:72-77`). |
| CLI detection catches an adapter throw, logs, Sentry-captures, omits the CLI | `cli-detection.service.ts:486-500` (`degradation-audit: reported`) | A Cursor failure reaches an existing reported path; no new RPC field. |
| `ptah-cli-registry.ts` imports `seedStaticModelPricing` and `buildStaticTierCapabilityEnv` from agent-sdk | `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:50,52,616,688,890,1568` | agent-sdk re-exports and the old helper name can only be deleted after cli-agent-runtime moves (batch order). |
| `isStatic` consumers include an e2e design-preview fixture | `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts:231` plus the list under Testability | Added to the fixture batch and the gate (S1). |
| degradation-audit ratchet in CI | `.github/workflows/ci.yml:91-94`; `tools/degradation-audit/check-degradation.ts` (kinds `optional-capability`, `reported`); `tools/degradation-audit/project.json` (`lint` target) | Every new swallowing catch carries a marker; the batch gate runs the audit (M6). |
| Ollama `/api/show` path takes a base URL and posts via `httpRequest` (https capable, 5 s timeout, no size cap); metadata TTL 10 min, failure TTL 1 min, 5 concurrent | `ollama-model-discovery.service.ts:247-249,491-495,550-607,712-760` | Cloud enrichment reuses `getModelMetadata('https://ollama.com', ...)`; parser reads `model_info`; a response cap is added (M5). |
| `toCloudId` normalises ollama.com names | `libs/shared/src/lib/providers/ollama-cloud-model-id.ts` | Union key for ollama.com rows and local `:cloud` tags (M5). |
| Module singleton reached by import, attached at registration | `libs/backend/auth-providers/src/lib/di/register.ts:66-73` (`providerQuotaStore`) | Same pattern for the OpenCode catalog store. |
| `registerAuthProvidersServices` runs on Electron and the benchmark | `apps/ptah-electron/src/di/phase-2-libraries.ts:262`; `libs/backend/cli-engine/src/lib/container.ts:746` | One attach point covers both hosts. |
| Claude prices exist outside `staticModels` | `libs/shared/src/lib/utils/anthropic-rate-card.ts:9-18`; `pricing.utils.ts:96-97` | Removing price seeding loses no Claude price; Z.AI cost becomes unknown (D7). |
| Drift probe and daily workflow | `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts:1-171`; `.github/workflows/model-lists-probe.yml:1-118` | Replaced by a live parser + tier-preference check. |

## Architecture decision

- Chosen approach: one model-list chain in `ProviderModelsService` for every built-in provider
  (`live -> versioned persisted live catalog -> unavailable`, credential failures skip the
  persisted rung), returning a typed `source` and a closed `failureReason`. Registry entries keep
  provider facts only (endpoints, auth, a models-endpoint auth scheme, tier preferences, Kimi's
  SDK capability allowlist). Tier preferences resolve against the live catalog through one pure
  family matcher. OpenCode listing and routing both read the gateway payload; routing falls back
  to the protocol stored in the persisted catalog, and a successful routing refresh also writes
  that catalog. CLI lanes (Cursor, agy) read only their CLI's live answer.
- Rationale: chain, persisted catalog, picker error+Retry and the OpenCode parser already exist.
  Deleting the static rung, versioning the record and typing the failure is the smallest change
  that makes a failure visible instead of covering it with an old list.
- Rejected alternatives:
  - Keep static rows as metadata only. Loses: still a drifting repo list (context.md: 7/10
    probe failures); the user asked for deletion.
  - Clear old persisted records with a one-off migration. Loses: needs a migration runner; a
    version check on read discards them with no write and no ordering risk.
  - Provider-wide `supportsToolUse: true` default. Loses: masks an unknown capability (S5, user
    decision); `toolUseUnknown` keeps it visible and defined.
  - Header scheme from `authEnvVar`. Loses: breaks custom providers (S9).
  - A second persisted store owned by `OpenCodeLiveRoutes`. Loses: two copies with two
    staleness rules; the attached store writes the same versioned record.
  - Add a per-CLI `error` to `agent:listCliModels`. Loses here: a renderer contract change for 8
    CLI keys; Cursor's failure already reaches the reported detection path. Recorded as a
    follow-up candidate, not designed.
  - Derive every tier from the catalog and delete `defaultTiers`. Rejected by the user (D6).
- Assumptions (each with its resolving check):
  - A1. Anthropic `GET /v1/models?limit=1000` returns `{data:[{id, display_name, type}],
    has_more}` and needs `x-api-key` + `anthropic-version: 2023-06-01`. Check: one keyed call
    while implementing Component 2; `has_more: true` at 1000 means follow `after_id`. A wrong
    guess fails as `bad-response`, never as a guessed list.
  - A2. Kimi `/coding/v1/models` rows are `{id, name?, context_length?}`
    (`kimi-code-model-merge.ts:8-19`). Check: one signed-in call; another shape fails as
    `bad-response`.
  - A3. `POST https://ollama.com/api/show` is keyless for public cloud tags (verified for one).
    Check: the live probe enriches the first three tags.
  - A4. `ProviderModelsService` is resolvable when the first OpenCode request is routed (lazy
    closure). Check: `container.smoke.spec.ts` and the `opencode-live-routes.spec.ts` case
    "store throws -> treated as no persisted catalog".
  - A5. `ptahCli:listModels` can read the agent's key without a new registry API. Check:
    `ptah-cli-registry.ts:330-345`; otherwise `authSecrets.getProviderKey(agent.providerId)` as
    `lane-model-listing.adapter.ts:272` does.
  - A6. Z.AI and Sakana rows carry no tool flag. Check: optional keyed live cases (Component 9)
    when `PTAH_LIVE_ZAI_KEY` / `PTAH_LIVE_SAKANA_KEY` are set; if a flag exists, the parser
    already reads `supported_parameters` / `supports_tool_calling`.
  - A7. `agy models` lists effort variants as `<base>-<effort>` ids (the format the old table
    encoded, `antigravity-cli.adapter.ts:163-179`). Check: run `agy models` once from
    PowerShell on the dev machine (local command, not a billed turn) and pin its output as a
    spec fixture. If agy lists bases only, the effort rule below appends nothing and passes
    `--effort` instead (one branch in Component 7b).
- Effect on existing code: deletes `staticModels` from 9 entries and the type,
  `opencode-model-routes.ts`, `static-model-pricing.ts`, `KNOWN_CLOUD_MODELS`, `COPILOT_MODELS`,
  Cursor `FALLBACK_MODELS`, `AGY_EFFORT_MODEL_BASES`, `AGY_STALE_MODEL_IDS`,
  `mergeKimiCodeModels`, `mergeStaticMetadata`, `seedStaticModelPricing`,
  `getStaticModelCapabilities`, `buildStaticTierCapabilityEnv`, Copilot proxy `listModels`, the
  drift spec. Leaves `defaultTiers` (as preferences), `ANTHROPIC_RATE_CARD`, `CODEX_RATE_CARD`,
  LM Studio, Codex, OpenRouter, Requesty, Pi, Grok and OpenCode-CLI sources untouched.

## Component specifications

### 1. Shared contracts and pure helpers (`@ptah-extension/shared`) - additive part

- Purpose: every type and pure helper the new chain needs, added without removing anything, so
  each later batch compiles against it.
- Responsibilities:
  - `types/rpc/rpc-providers.types.ts`:
    ```ts
    export type ProviderModelListSource = 'live' | 'persisted' | 'unavailable';
    /** Closed set; text is fixed copy, never relayed vendor or error text. */
    export type ModelListFailureReason =
      | 'no-key' | 'not-signed-in' | 'auth-rejected'      // credential: never use persisted
      | 'timeout' | 'network' | 'http-error' | 'bad-response'
      | 'empty' | 'no-live-source' | 'unexpected';
    export interface ProviderModelInfo {
      // ...existing fields...
      /** Present only when the vendor's row did not report tool support. `supportsToolUse`
       *  is then `false`, and `toolUseOnly` keeps the row (unknown is not "no"). */
      toolUseUnknown?: true;
      /** OpenCode only: upstream API from the live row; persisted for request routing. */
      upstreamProtocol?: 'messages' | 'chat/completions' | 'responses';
    }
    export interface ProviderListModelsResult {
      models: ProviderModelInfo[];
      totalCount: number;
      /** Optional until the cleanup batch (Component 10) makes it required. */
      source?: ProviderModelListSource;
      /** source 'persisted' or 'unavailable'. */
      failureReason?: ModelListFailureReason;
      /** source 'persisted': epoch ms the saved list was fetched. */
      savedAt?: number;
      /** source 'persisted': fixed-copy sentence. */
      notice?: string;
      /** source 'unavailable' only; models is []. Meaning unchanged: "no usable list". */
      error?: string;
      /** Deleted in Component 10. */
      isStatic?: boolean;
    }
    ```
    `rpc-agents.types.ts:828-837` `PtahCliListModelsResult`: add `source?`, `failureReason?`;
    make `isStatic` optional (deleted in Component 10).
  - CREATE `providers/model-list-failure.ts`: `CREDENTIAL_FAILURE_REASONS` (readonly set of the
    three credential reasons) and `describeModelListFailure(reason, providerName): string`, one
    fixed sentence per reason: no-key "add your <name> API key in Settings"; not-signed-in
    "sign in to <name> in Settings"; auth-rejected "<name> rejected the API key; delete it and
    enter a valid one in Settings"; timeout "<name> did not answer in time"; network "couldn't
    reach <name>"; http-error "<name> returned an error"; bad-response "<name> sent a model
    list Ptah can't read"; empty "<name> returned no models"; no-live-source "<name> has no
    model list endpoint"; unexpected "an unexpected error occurred (details in the log)". Plus
    `modelListErrorText(reason, name)` = `Couldn't load models from <name>: <copy>.` and
    `modelListNoticeText(reason, name, savedAt)` = `Couldn't load models from <name> (<copy>).
    Showing the list saved on <YYYY-MM-DD>.` (UTC date). Precedent for code + fixed text:
    `file-settings-errors.ts` (review M4).
  - CREATE `providers/closest-live-model.ts` (pure, deterministic, no clock):
    `closestLiveModel(preferred: string, liveIds: readonly string[]): string | null`.
    Rule: strip a trailing `[...]` suffix from both sides for comparison; split on
    `-`, `.`, `:`, `/`, `_`; family key = the tokens with no digit, in order; version vector =
    the numbers found in digit-bearing tokens, in order. A preferred id whose family key is
    empty or which has no version is matched only exactly (returns `null` otherwise).
    Candidates = live ids with an identical family key. Pick the smallest version greater than
    the preferred one (successor); otherwise the greatest smaller one; ties by id ascending.
    Re-append the preferred suffix only when `<candidate><suffix>` is itself a live id.
    Examples pinned by the spec: `claude-opus-5-5` -> `claude-opus-5-6` over `claude-opus-6-0`;
    `glm-5.3-flash` never matches `glm-5.4` (family `glm,flash` vs `glm`); `kimi-for-coding`
    exact only; `gpt-oss:20b` -> `gpt-oss:30b` when 20b is gone.
  - `AnthropicProvider` (`provider-registry.ts:91-214`) gains
    `modelsAuthScheme?: 'bearer' | 'anthropic'` (absent = Bearer; never set by
    `customEntryToAnthropicProvider`, `:657-683`) and
    `liveModelCapabilities?: readonly ModelCapability[]` (Kimi's SDK allowlist; never a model
    list, never a tool flag). Add `getProviderLiveModelCapabilities(providerId)` beside
    `getAnthropicProvider`, resolving through `getPtahCliLaneProvider` (`:859-863`).
  - `kimi-code-provider-entry.ts`: set `liveModelCapabilities: KIMI_CODE_MODEL_CAPABILITIES`
    (`:43-49`). Static rows stay until Component 10.
  - CREATE `providers/entries/kimi-code-models.ts`: `parseKimiCodeModels(payload: unknown):
    ProviderModelInfo[] | null` - live rows only, `null` when the envelope fails the schema,
    invalid rows skipped; `toolUseUnknown: true` unless a row reports tools; `capabilities` from
    `liveModelCapabilities`. The old merge stays until Component 10.
  - Move `OpenCodeProviderId`, `OpenCodeProtocol` and `isOpenCodeProviderId` into
    `entries/opencode-provider-entry.ts`; `opencode-model-routes.ts` re-imports them (temporary
    until its deletion in Component 10, so no export moves twice).
  - `index.ts` exports the new symbols.
- Verified contracts and entry points: `rpc-providers.types.ts:55-107`;
  `rpc-agents.types.ts:828-837`; `provider-registry.ts:91-214,657-683,859-863,896-913`;
  `kimi-code-provider-entry.ts:43-62`; `kimi-code-model-merge.ts:8-19`; `index.ts:11-58`.
- Dependencies: none new. `types/rpc` keeps literal unions (no import from `providers/`).
- Integration points: Components 2-9.
- Failure behaviour: not applicable (types and pure functions).
- Quality requirements: `closestLiveModel` total and deterministic (no throw on any string).
- Verification seam: new `closest-live-model.spec.ts`, `model-list-failure.spec.ts`,
  `kimi-code-models.spec.ts`; existing shared specs unchanged and green.
- Files: CREATE `libs/shared/src/lib/providers/{closest-live-model.ts,model-list-failure.ts}`
  (+ specs), `libs/shared/src/lib/providers/entries/kimi-code-models.ts` (+ spec); MODIFY
  `libs/shared/src/lib/types/rpc/rpc-providers.types.ts`, `rpc-agents.types.ts`,
  `libs/shared/src/lib/providers/provider-registry.ts`, `providers/index.ts`,
  `entries/kimi-code-provider-entry.ts`, `entries/opencode-provider-entry.ts`,
  `entries/opencode-model-routes.ts`.

### 2. Model-list chain, persisted record and tier preferences (`ProviderModelsService`)

- Purpose: one place that answers "which models does provider X offer, and how sure are we",
  and resolves tier preferences against that answer.
- Responsibilities:
  - Result type (exported for backend callers):
    ```ts
    export interface ProviderModelList {
      models: ProviderModelInfo[];          // after toolUseOnly (unknown kept)
      totalCount: number;                   // full list
      source: ProviderModelListSource;
      savedAt?: number;                     // persisted only
      failureReason?: ModelListFailureReason; // iff source !== 'live'
      /** @deprecated always false; deleted in Component 10. Keeps rpc-handlers compiling. */
      isStatic: false;
    }
    ```
  - Typed failure: CREATE `model-list-error.ts` with `class ModelListError extends Error {
    constructor(readonly reason: ModelListFailureReason) }` and
    `classifyModelListFailure(error: unknown): ModelListFailureReason`:
    `ModelListError` -> its reason; axios response 401/403 -> `auth-rejected`, other response
    -> `http-error`; `ECONNABORTED`/`ETIMEDOUT` or a timeout error -> `timeout`;
    `ENOTFOUND`/`ECONNREFUSED`/`ECONNRESET`/`EAI_AGAIN`/`ENETUNREACH` -> `network`; anything
    else -> `unexpected`. The raw message is logged at debug only, never returned.
  - Chain for every provider (`fetchModels(providerId, apiKey, toolUseOnly?)`):
    1. Memory cache younger than `CACHE_TTL_MS` (`:110`) -> `live`.
    2. Exactly one live route: OpenCode (`isOpenCodeProviderId`) -> Component 3
       `list(id, {force: true})`; registered dynamic fetcher; `modelsEndpoint`. No route ->
       `no-live-source`. Endpoint route without key -> `no-key`.
       Success with >= 1 model -> memory cache and persist the FULL list (S6),
       `recordContextWindows`, `live`. Empty -> `empty`. Throw -> `classifyModelListFailure`.
    3. Reason in `CREDENTIAL_FAILURE_REASONS` -> step 5 (a removed, rejected or signed-out
       credential never keeps offering models; S2).
    4. `readPersistedCatalog` returns a record -> `persisted`, `savedAt`, `failureReason`.
    5. `unavailable`, `models: []`, `failureReason`.
    `toolUseOnly` keeps `m.supportsToolUse || m.toolUseUnknown === true` and is applied only to
    the returned copy. Persisted and unavailable answers are not memory-cached (Retry re-tries).
    Unknown provider still throws `SdkError('Unknown provider')` (`:402-405`).
  - Versioned record (Blocking B1): `persistCatalog` writes
    `{ schema: 2, origin: 'live', models, timestamp }` (`PERSISTED_CATALOG_SCHEMA = 2`).
    `readPersistedCatalog` returns `{ models, savedAt } | null` (M7) and returns `null` when
    `schema !== 2` or `origin !== 'live'` (debug log once per provider per process: "ignoring a
    catalog saved before live-only lists"), when the timestamp is missing or older than 30 days,
    or when no row validates. Rows validate as today plus: `upstreamProtocol` kept only when it
    is one of the three literals; `toolUseUnknown` kept only when `=== true`. No write on read;
    the next live success overwrites the old record.
  - Public store for OpenCode (Component 3): `readPersistedCatalog` exposed as
    `getPersistedCatalog(providerId)` and `persistCatalog` exposed as
    `savePersistedCatalog(providerId, models)` (same versioned writer; fire-and-forget,
    swallowing write errors with a `degradation-audit: reported` marker - the existing catch at
    `:197-204` gets the marker).
  - Tier preferences (D6, S4 basis), in `resolveEffectiveTiers` (`:810-870`): user tier wins;
    else the preference; if the provider's live catalog (memory or versioned persisted) is on
    hand and lacks the preference (bracket-suffix tolerant, as today), resolve in order
    `closestLiveModel(preference, ids)` -> `deriveTiersFromCatalog(...)[tier]` -> keep the
    preference. Each replacement logs `warn` once per provider+tier:
    `[provider-auth] tier preference not in live catalog` `{providerId, tier, preferred,
    resolved, rule: 'family' | 'derived' | 'none'}`. No catalog on hand -> the preference is
    applied unverified: it only fills an SDK env slot, it never lists or admits a model. Remove
    `opencode-zen`/`opencode-go` from `FILTERED_TIER_CATALOG_PROVIDERS` (`:98-104`); Codex and
    Copilot stay (their catalogs are filtered for other reasons, `:98`).
  - Delete in this component: the OpenCode merge branch (`:297-342`), `mergeStaticMetadata`
    (`:576-614`), the static rung (`:449-464`), the static-capability fallback in
    `applyTierMetadata` (`:1115-1116`, replaced by `getProviderLiveModelCapabilities`), the
    `getStaticModelCapabilities` / `getOpenCodeModelProtocol` imports (`:42-44`), the text
    throws at `:513-516,558-566` (replaced by `ModelListError`). Update doc comments that promise
    a static fallback (`:7-12,112-116,138-144,180-183,277-287,1090-1095`).
  - Extract `transformApiModels` + `parsePricingField` (`:1303-1348`) into pure
    `models-api-parser.ts`: `parseModelsApiRows(rows: unknown[]): ProviderModelInfo[]`. Invalid
    rows skipped; `name` from `name`, `display_name`, `id`; tool flag from
    `supported_parameters` / `supports_tool_calling`; when neither is present `supportsToolUse:
    false, toolUseUnknown: true`; `capabilities` from `getProviderLiveModelCapabilities` applied
    by the caller. `prefetchPricing` (`:1242-1251`) and `fetchDynamicModels` both call it.
  - `fetchDynamicModels` (`:480-574`): header by `provider.modelsAuthScheme`: absent or
    `'bearer'` -> `Authorization: Bearer` (unchanged for every existing and custom provider);
    `'anthropic'` -> `x-api-key` + `anthropic-version: 2023-06-01` (A1). 10 s timeout kept.
  - API lane: `anthropic-api-lane-entry.ts` gains
    `modelsEndpoint: 'https://api.anthropic.com/v1/models?limit=1000'` and
    `modelsAuthScheme: 'anthropic'` in this component (the header logic ships with it). Its
    `staticModels` line goes in Component 10.
- Verified contracts and entry points: `provider-models.service.ts:95-136,176-240,288-475,480-574,576-614,761-870,958-991,1106-1131,1212-1348`;
  `model-tier-derivation.ts:113-157`; `pricing.utils.ts:541-554`; `provider-registry.ts:859-863`.
- Dependencies: shared (Component 1); Component 3 via `openCodeLiveRoutes`; `ConfigManager`.
  Direction unchanged.
- Integration points: `provider-rpc.handlers.ts:743`, `lane-model-listing.adapter.ts:279`,
  `config-rpc.handlers.ts:538`, `ptah-cli-rpc.handlers.ts` (Component 6),
  `refreshTiersFromLiveCatalog` (`:958-991`).
- Failure behaviour: never throws for a vendor failure; throws only for an unknown provider.
- Quality requirements: one live route per call; no timer; persisted read stays synchronous.
  New catches carry a degradation-audit marker.
- Verification seam: `provider-models.service.spec.ts` (static cases rewritten as chain cases),
  `provider-models.opencode.spec.ts` (rewrite), new `models-api-parser.spec.ts`,
  `model-list-error.spec.ts`, and the chain spec `provider-models.fallback-chain.spec.ts`
  (one case per failure-table row; it ships with this component, not with the live probe).
- Files: MODIFY `libs/backend/auth-providers/src/lib/provider-models.service.ts`,
  `provider-models.service.spec.ts`, `provider-models.opencode.spec.ts`,
  `libs/shared/src/lib/providers/entries/anthropic-api-lane-entry.ts` (endpoint + scheme);
  CREATE `libs/backend/auth-providers/src/lib/{models-api-parser.ts,model-list-error.ts,provider-models.fallback-chain.spec.ts}` (+ parser and error specs).

### 3. OpenCode live catalog, request routing and the proxy base

- Purpose: OpenCode's list, aliases and per-request protocol come only from the gateway payload,
  with the versioned persisted catalog as the only fallback.
- Responsibilities (`opencode-live-routes.ts`):
  - Row schema (`:44-52`) gains `type: z.string().optional()` and
    `recommended_api: z.string().optional()`. Keep a row only when `type === 'chat'` (missing
    `type` kept) AND a protocol resolves: `ownProtocol(API_PROTOCOL, recommended_api)`, then the
    single-`api` rule (`:70-83`). Zero kept rows -> failure `bad-response`.
  - `refresh(providerId, { force? })`: `force` skips the 5-min backoff (`:122`) but joins an
    in-flight refresh (`:119-120`). On success, also write the catalog through the attached
    store (`write`), so routing alone keeps the persisted record fresh (M1).
  - `list(providerId, { force })` returns the rows or throws `ModelListError(reason)` (reason
    kept from the last failure: `timeout`, `network`, `http-error`, `bad-response`).
  - `usePersistedCatalog(store: { read(id): {models, savedAt} | null; write(id, models): void })`
    set once in `registerAuthProvidersServices`. Store exceptions are caught, logged at debug,
    treated as no catalog / no write (`degradation-audit: optional-capability` marker).
  - `modelIds(providerId): Promise<readonly string[] | null>`: live cache, else the awaited
    refresh under the existing rule, else persisted ids, else `null`.
  - `resolve(providerId, modelId)` (`:178-194`): static rung deleted. Order: live hit ->
    awaited refresh when missing/stale (existing rule) -> live hit -> persisted row's
    `upstreamProtocol` -> `{ outcome: 'not-listed' | 'catalog-unavailable' }`.
  - Row mapping: `name`, `description` `${name} via ${provider.name}`, `contextLength` from
    `limit.context` (`contextLengthSource: 'provider'` when > 0), `supportsToolUse` from
    `capabilities.tools.supported` (absent -> `toolUseUnknown: true`), `upstreamProtocol`.
- Proxy base (`translation-proxy-base.ts`):
  - `getStaticModels` (`:248`) becomes concrete `protected getListedModels(): Array<{ id:
    string }> { return []; }`; `/v1/models` (`:465-473`) calls it. Rename makes every
    remaining implementer an explicit decision under `noImplicitOverride` (S3).
  - New hook `protected async resolveRequestModelId(modelId): Promise<string>` defaulting to
    `this.normalizeModelId(modelId)`; `:535` awaits it.
  - New hook `protected getUnsupportedModelMessage(modelId, outcome?): string`; default
    `Model '<id>' is not supported by <name>.` (drops "update Ptah"). `:544-548` uses it.
- OpenCode proxy (`opencode-translation-proxy.ts`): delete `normalizeModelId` (`:60-68`),
  `resolveUpstreamProtocol` (`:70-74`) and `getStaticModels` (`:82-84`). Override
  `resolveRequestModelId`: `default`/`sonnet`/`opus`/`haiku` -> preference from
  `entry.defaultTiers`; `ids = await openCodeLiveRoutes.modelIds(providerId)`; preference in ids
  -> it; else `closestLiveModel` -> `deriveTiersFromCatalog(rows)[tier]` -> preference; warn once
  per provider+tier as in Component 2 (M2). Override `getUnsupportedModelMessage`:
  not-listed `Model '<id>' is not offered by <name> as a chat model. Choose a model from the
  list.`; catalog-unavailable `Couldn't load <name>'s model list to route '<id>'. Check your
  connection and retry.`
- Other proxies: delete `getStaticModels` from `copilot-translation-proxy.ts:69-75`,
  `kimi-code-translation-proxy.ts:103-105`, `sakana-translation-proxy.ts:111-117`,
  `openrouter-translation-proxy.ts:106-115`, `local-model-translation-proxy.ts:99-105`.
  `custom-openai-translation-proxy.ts:188-190` becomes `protected override getListedModels()`
  (user config, kept). Copilot proxy: delete `listModels()` and `staticModelsAsFull`
  (`:112-168`; no production caller) (m3).
- Specs that subclass or call the old name: `translation-proxy-base.spec.ts:11,108-123,290`,
  `auth/curator-proxy-manager.spec.ts:36` (delete the override), `custom-openai-translation-proxy.spec.ts:12,45-46,202,210`,
  `sakana-translation-proxy.spec.ts:13,40-41,124` (assert `/v1/models` empty, not fugu rows).
- Custom factory (`custom-proxy.factory.ts:47`): delete `staticModels: provider.staticModels`
  (registry field never populated for custom entries, `provider-registry.ts:550-576,657-683`).
- DI attach (`di/register.ts`, after `:66`): lazy closure resolving
  `AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS` and calling `getPersistedCatalog` /
  `savePersistedCatalog`. Nothing resolves at registration.
- Verified contracts and entry points: `opencode-live-routes.ts:10-210`;
  `opencode-translation-proxy.ts:22-108`; `translation-proxy-base.ts:202-272,456-473,530-550,694-712`;
  `register.ts:53-75`; `custom-proxy.factory.ts:34-49`; `tsconfig.lib.json:14`.
- Dependencies: shared; `model-tier-derivation.ts` (same lib); the service only through the
  attached closure (no module cycle).
- Integration points: the three proxy construction sites are unchanged
  (`register-providers.ts:228`, `provider-proxy-pool.ts:531`, `ptah-cli-registry.ts:1501`).
- Failure behaviour: gateway down at request time -> one awaited refresh (4 s) per 5-min
  window -> persisted protocol -> HTTP 400 `invalid_request_error` with the worded reason.
  Malformed rows skipped and counted at debug. Oversize (> 2 MiB) is `bad-response`.
- Quality requirements: no cross-subscription lookup; own-property lookups for remote keys.
- Verification seam: `opencode-live-routes.spec.ts` (type filter, `recommended_api` precedence,
  multi-`api` rows, `force`, write-on-refresh, persisted fallback, store throws, `modelIds`),
  `opencode-translation-proxy.spec.ts` (alias resolution: preference present, retired ->
  family, retired -> derived; both 400 texts), `translation-proxy-base.spec.ts`,
  `custom-openai-translation-proxy.spec.ts`, `sakana-translation-proxy.spec.ts`,
  `curator-proxy-manager.spec.ts`.
- Files: MODIFY `libs/backend/auth-providers/src/lib/providers/opencode/{opencode-live-routes.ts,opencode-translation-proxy.ts}` (+ specs),
  `translation/translation-proxy-base.ts` (+ spec),
  `providers/{copilot/copilot-translation-proxy.ts,kimi-code/kimi-code-translation-proxy.ts,sakana/sakana-translation-proxy.ts,openrouter/openrouter-translation-proxy.ts,local/local-model-translation-proxy.ts,custom/custom-openai-translation-proxy.ts,custom/custom-proxy.factory.ts}`,
  specs `providers/sakana/sakana-translation-proxy.spec.ts`, `providers/custom/custom-openai-translation-proxy.spec.ts`, `auth/curator-proxy-manager.spec.ts`,
  `di/register.ts`.

### 4. Ollama Cloud and local discovery

- Purpose: Ollama Cloud models from ollama.com and the local daemon only; failures typed.
- Responsibilities:
  - `OllamaCloudTag` (`ollama-cloud-metadata.service.ts:89-96`) gains
    `readonly capabilities?: readonly string[]`; `fetchCloudTags` (`:193-275`) copies it when it
    is a string array. HTTP/shape failure throws `ModelListError('http-error' | 'bad-response'
    | 'network' | 'timeout')` instead of caching `[]`; a successful empty list stays `[]`. Remove
    "bundled static catalog" wording (`:15-16,188-189,218,252,264-266`).
  - `listCloudModels` (`ollama-model-discovery.service.ts:343-435`): delete `KNOWN_CLOUD_MODELS`
    (`:99-~280`), `buildCloudDescription` (`:452`) and the known-model shortcut in
    `getModelMetadata` (`:566-579`). Body: union keyed by `toCloudId(name)` of (a) ollama.com
    tags whose `capabilities` include `completion` (rows without `capabilities` kept), and (b)
    local daemon cloud tags (`listModels('ollama-cloud', isCloudTag)`, `:407-409`); a row in
    both keeps the ollama.com fields. Tool flag: `capabilities.includes('tools')`; no
    `capabilities` -> `toolUseUnknown: true`.
  - Cloud enrichment (M5): reuse `getModelMetadata('https://ollama.com', tagName)` (existing
    method, base URL already a parameter, `httpRequest` already https-capable, 5 s timeout,
    5 concurrent, 10-min cache / 1-min failure cache). `parseShowResponse` (`:611-650`) reads
    `model_info` as well as `modelinfo`, and any own key ending `.context_length` with a positive
    safe integer. Cloud enrichment failure -> `contextLength: 0` with no `contextLengthSource`
    (unknown; skipped by `registerModelContextWindows`); the local daemon path keeps its
    current behaviour. `httpRequest` (`:717-760`) gains a 1 MiB response cap (reject as
    `bad-response`).
  - Both sources failed -> throw `ModelListError` with the ollama.com reason.
  - `listLocalModels`/`listModels` (`:329-331,469-522`): daemon unreachable -> throw
    `ModelListError('network')` (keeps the Sentry capture); a reachable daemon with zero
    models stays `[]` (`empty`).
- Verified contracts and entry points: `ollama-model-discovery.service.ts:59-125,247-249,329-522,526-607,611-650,712-760`;
  `ollama-cloud-metadata.service.ts:66,81-96,171-275,504-548`; `ollama-cloud-model-id.ts` (`isCloudTag`, `toCloudId`).
- Dependencies: unchanged.
- Integration points: fetchers `provider-rpc.handlers.ts:668-684`,
  `local-native.strategy.ts:151-157,219-221`.
- Failure behaviour: above; enrichment failures never fail the list.
- Quality requirements: enrichment cost is up to one `POST /api/show` per cloud tag per 10-min
  metadata TTL (25 tags today), 5 concurrent, 1 MiB cap per response. This is new network work
  versus today's literal table and is stated, not hidden.
- Verification seam: `ollama-model-discovery.service.spec.ts` (union and de-duplication via
  `toCloudId`, completion filter, `toolUseUnknown`, `model_info` parse, cap, both-fail throws,
  enrichment failure keeps row with 0), `ollama-cloud-metadata.service.spec.ts` (throw on
  failure, capabilities copied).
- Files: MODIFY `libs/backend/auth-providers/src/lib/providers/local/{ollama-model-discovery.service.ts,ollama-cloud-metadata.service.ts}` and their specs.

### 5. Auth-path readers of static rows (auth-providers + agent-sdk)

- Purpose: tier env, defaults and stored-model checks read live data or provider declarations.
- Responsibilities:
  - agent-sdk `sdk-model-service.ts:160-191`: ADD `buildTierCapabilityEnv(providerId, tiers)`
    reading `getProviderLiveModelCapabilities(providerId)` (same rule: write only a non-empty
    list). Export it from `helpers/index.ts:228` and `src/index.ts:513`. The old
    `buildStaticTierCapabilityEnv` and the `seedStaticModelPricing` re-export (`index.ts:527`)
    stay until Component 10 because `ptah-cli-registry.ts:50,52` imports them.
  - Callers switch: `provider-auth-resolver.ts:10,440`, `workspace-provider-profile-resolver.ts:61,856`.
  - `workspace-provider-profile-resolver.ts:884-914`: delete the `staticModels[0]` rung; ladder
    ends snapshot tiers -> requested alias.
  - `stored-model-offer.ts:36-57`: `isOfferedBy` uses `cachedModelIds` only (versioned memory or
    persisted catalog). Documented regression (M8): a provider with no catalog on this machine
    no longer claims its models, so a cross-provider saved id for a never-listed provider is
    kept and the vendor answers 400. Pinned by a spec case.
  - Strategies: remove `seedStaticModelPricing` imports and calls in
    `api-key.strategy.ts:46,443,611,657`, `cli.strategy.ts:15,68`,
    `oauth-proxy.strategy.ts:43,166,259`.
- Verified contracts and entry points: lines above; `ModelCapability`
  `libs/shared/src/lib/types/auth-env.types.ts`.
- Dependencies: shared. agent-sdk never imports auth-providers.
- Integration points: SDK launch env.
- Failure behaviour: no catalog -> stored model kept (`stored-model-offer.ts:50-57`); no
  capabilities -> env key unset.
- Verification seam: `tier-capability-env.spec.ts`, `cli.strategy.spec.ts`,
  `workspace-provider-profile-resolver.spec.ts`, `model-resolver.spec.ts`, new
  `stored-model-offer.spec.ts` (including the M8 case).
- Files: MODIFY `libs/backend/agent-sdk/src/lib/helpers/{sdk-model-service.ts,index.ts}`,
  `libs/backend/agent-sdk/src/index.ts`, `libs/backend/auth-providers/src/lib/auth/{provider-auth-resolver.ts,workspace-provider-profile-resolver.ts,stored-model-offer.ts}`,
  `auth/strategies/{api-key.strategy.ts,cli.strategy.ts,oauth-proxy.strategy.ts}` and specs;
  CREATE `libs/backend/auth-providers/src/lib/auth/stored-model-offer.spec.ts`.

### 6. RPC handlers (rpc-handlers)

- Purpose: map the typed chain result onto RPC results; remove static fallbacks from fetchers;
  resolve native aliases against the live catalog.
- Responsibilities:
  - `provider:listModels` (`provider-rpc.handlers.ts:716-802`): delete the no-key pre-check
    (`:729-742`) and the string-matching auth branch (`:769-789`). Map `ProviderModelList`:
    `live` -> `{models,totalCount,source}`; `persisted` -> `+ failureReason, savedAt,
    notice: modelListNoticeText(...)`; `unavailable` -> `{models: [], totalCount: 0, source,
    failureReason, error: modelListErrorText(...)}`. Stop setting `isStatic`. Unknown-provider
    throw keeps the Sentry capture (`:791-799`); `reapplyTiersForWarmedCatalog` when
    `totalCount > 0` (`:763-765`).
  - Copilot fetcher (`:299-377`): delete the static step (`:366-375`); none of the three live
    sources answered -> `throw new ModelListError('not-signed-in')` when the account source
    reported no session, else the classified reason of the last source.
  - Kimi fetcher (`:482-546`): `parseKimiCodeModels`; not signed in -> `not-signed-in`, HTTP
    failure -> classified, `null` parse -> `bad-response`. Shape log (`:520-535`) stays.
  - Claude-cli fetcher (`:632-650`): unchanged source; empty native list stays `[]` (`empty`,
    copy "Claude returned no models"); wording of comments only.
  - `ptahCli:listModels` (`ptah-cli-rpc.handlers.ts:301-358`): inject
    `@inject(AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS)` (pattern `provider-rpc.handlers.ts:143-144`);
    key per A5; `fetchModels`; map to `{models, source, failureReason?, error?}` (error via
    `modelListErrorText`). "Agent not found" / "Provider not found" keep their text with
    `source: 'unavailable'`.
  - `lane-model-listing.adapter.ts`: port (`:62-73`) returns `source` (plus the deprecated
    `isStatic` until Component 10); `runDiscovery` (`:270-292`) maps `unavailable` ->
    `{kind:'error', reason:'threw'}`, `persisted` -> provenance `fallback`, `live` ->
    `reported`; delete `isPurelyDynamic` (`:297-304`) and its `skipped` path.
  - `config-saved-model-option.ts:36-58`: offered only when `cachedModelIds?.includes(saved)`;
    `name: savedModel`, `description: ''`; drop the registry import.
  - `config-provider-session-models.ts` (M9): `ProviderCatalogReader` returns
    `{ models, source, failureReason? }`; `source === 'unavailable'` takes the existing
    `catalogFailed` path and calls `onCatalogFailure(new ModelListError(reason))`. Caller
    `config-rpc.handlers.ts:538` passes the result through.
  - `child-model-admission.ts` (S4): `nativeChildModelIds(catalog)` = catalog ids only.
    `resolveNativeTierAlias(model, catalogIds)`: `opus|sonnet|haiku` -> preference
    `defaultTiers[tier]` if in `catalogIds`, else `closestLiveModel(preference, catalogIds)`,
    else the newest `claude-<tier>-*` in `catalogIds` (numeric compare, as `fable` today), else
    the alias unchanged; `fable` -> newest `claude-fable-*` in `catalogIds`. A replacement logs
    `warn` with preferred and resolved ids. Caller `chat-session.service.ts:1510` passes
    `acceptedModels` (`:1498`). A retired preference therefore admits the live successor
    instead of `invalid-model`; an empty catalog keeps `model-catalog-unavailable`
    (`:1499-1507`).
  - `cli-model-list.service.ts`: comments only (`:60-62,68-71,107-117,128-130,146-149,166-169`
    describe a curated list that no longer exists).
- Verified contracts and entry points: lines above; `config-provider-session-models.ts:19-21,36-85`.
- Dependencies: auth-providers, shared. Unchanged direction.
- Integration points: renderer (Component 8); `rpc-surface.spec.ts` / `rpc-allowlist.spec.ts`
  unaffected (no new method).
- Failure behaviour: a vendor failure never becomes an RPC failure envelope.
- Verification seam: `provider-rpc.handlers.spec.ts`, `ptah-cli-rpc.handlers.spec.ts`,
  `lane-model-listing.adapter.spec.ts`, `config-rpc.handlers.spec.ts`,
  `config-provider-session-models.spec.ts` (create if absent: unavailable -> default + saved),
  `child-model-admission.spec.ts` (retired preference admitted as successor; empty catalog).
- Files: MODIFY `libs/backend/rpc-handlers/src/lib/handlers/{provider-rpc.handlers.ts,ptah-cli-rpc.handlers.ts,config-saved-model-option.ts,config-provider-session-models.ts,config-rpc.handlers.ts}`,
  `services/{lane-model-listing.adapter.ts,cli-model-list.service.ts}`,
  `chat/session/{child-model-admission.ts,chat-session.service.ts}` and their specs.

### 7. CLI runtime readers and CLI lane model lists (cli-agent-runtime, lane-routing)

- Purpose: remove the static readers outside auth-providers and the CLI lanes' literal lists,
  keeping every lane spawnable.
- Responsibilities:
  - 7a `copilot-sdk.adapter.ts:115-122,240-249`: delete `COPILOT_MODELS`; `listModels()`
    returns `[]` (doc: host LM API and account `/models` are the sources).
  - 7b Cursor (`cursor-cli.adapter.ts:309-347`): delete `FALLBACK_MODELS`. No key -> `[]` with a
    debug log (lane not configured, the same answer as an uninstalled CLI). `models.list()`
    empty -> `[]` with the existing warn (text no longer mentions a fallback). Throw -> rethrow
    a redacted `Error('Cursor models.list() failed')`; `CliDetectionService.listModelsForAll`
    (`cli-detection.service.ts:486-500`) already logs, Sentry-captures and omits the CLI. The
    lane spawns with the id the user picked; there is no id/display-name table to keep.
  - 7c agy (`antigravity-cli.adapter.ts`): delete `AGY_EFFORT_MODEL_BASES` and
    `AGY_STALE_MODEL_IDS` (`:163-179`). The adapter keeps the ids of its last successful
    `listModels()` (`{ ids: ReadonlySet<string>, at }`, process lifetime, 10-min freshness) and
    `currentModelIds()` returns them or probes once (`probeModels`, 8 s, one in-flight promise
    shared); failure -> `null`.
    - `agyModelId(value, liveIds)`: id = first tab segment (unchanged); when `liveIds` is known
      and lacks the id, compare on bases (live ids with the effort suffix
      `AGY_EFFORT_SUFFIX` removed) with `closestLiveModel`; a match logs `warn` and is used;
      otherwise the id passes unchanged (agy reports the error).
    - `agyModelWithEffort(model, effort, liveIds)`: suffix already present -> unchanged;
      `<model>-<effort>` in `liveIds` -> that id; otherwise model unchanged and the effort is
      not appended (the old rule for unknown bases; debug log). `AGY_EFFORTS` (`:157`) is the
      CLI flag enum, not a model list, and stays.
    - Both readers get the ids: `buildAntigravityArgs(options, prompt, useStreamInput, liveIds)`
      at `:1165` and the ACP options at `:839`, each after `await this.currentModelIds()`.
    - A7 decides whether bases or suffixed ids are listed; the spec pins the observed
      `agy models` output as a fixture.
  - 7d Pi, Grok, OpenCode CLI, Codex lanes: no change (live-only already; inventory D).
  - `cli-adapter.interface.ts:63-69` and `rpc-agents.types.ts:505-510` `isFallback` docs: "set
    by classification when no account source confirmed the CLI's id", not "hardcoded list".
  - `ptah-cli-registry.ts`: `modelCount` (`:344,458`) =
    `this.providerModels.getCachedModelIds(providerId)?.length ?? 0`; `resolveEffectiveTiers`
    (`:1702-1748`) uses `this.providerModels.resolveEffectiveTiers(...)` output (preference
    resolved per Component 2) instead of `defaultSonnet` from static rows; switch
    `buildStaticTierCapabilityEnv` -> `buildTierCapabilityEnv` (`:52,1568`); delete
    `seedStaticModelPricing` import and calls (`:50,616,688,890`); fix doc `:1757-1766`.
  - lane-routing `child-session/child-model-tier.ts:39-49`: `childModelWindow(model)` =
    `getDiscoveredContextWindow(model, 'claude-cli') || (/\[1m\]$/i.test(model) ? 1_000_000 :
    0)` then the existing 200k regex; `undefined` otherwise. `matrix/seed-matrix.ts:31-32`:
    comment only.
- Verified contracts and entry points: lines above; `getDiscoveredContextWindow`
  `pricing.utils.ts:556-563`; `getCachedModelIds` / `resolveEffectiveTiers`
  `provider-models.service.ts:800-870`.
- Dependencies: shared (`closestLiveModel`), agent-sdk (renamed helper), auth-providers service
  (already injected, `ptah-cli-registry.ts:1714`).
- Integration points: agent spawn, `agent:listCliModels`, lane listing, child ranking, the
  benchmark (`cli-engine` resolves the same adapters).
- Failure behaviour: no catalog -> `modelCount` 0; agy without live ids -> model passed as
  chosen, no effort suffix; Cursor failure -> reported and omitted.
- Verification seam: `copilot-sdk.adapter.spec.ts`, `cursor-cli.adapter.spec.ts` (no key ->
  `[]`, throw -> rethrown redacted, empty -> `[]`, no `isFallback` rows),
  `antigravity-cli.adapter.spec.ts` (+ `.acp.spec.ts`: suffix chosen from live ids, retired id
  -> closest base, no live ids -> unchanged, effort not appended for unknown), ptah-cli-registry
  specs (Testability list), `child-model-tier.spec.ts`, `seed-matrix.spec.ts` (drop `:28-30`).
- Files: MODIFY `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/{copilot-sdk.adapter.ts,cursor-cli.adapter.ts,antigravity-cli.adapter.ts,cli-adapter.interface.ts}` (+ specs),
  `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts` (+ specs),
  `libs/backend/lane-routing/src/lib/child-session/child-model-tier.ts` (+ spec),
  `libs/backend/lane-routing/src/lib/matrix/seed-matrix.ts` (+ spec),
  `libs/shared/src/lib/types/rpc/rpc-agents.types.ts` (doc line only; belongs to the batch that
  owns Component 7 unless Component 1's batch is still open - one owner per file per batch).

### 8. Renderer: saved-list notice and fixtures

- Purpose: show when the picker displays a saved list; keep Retry; move fixtures to `source`.
- Responsibilities:
  - `provider-model-picker.component.ts`: `_modelsNotice = signal<string | null>(null)`, cleared
    in `loadModels` beside `_modelsError` (`:767`), set from `result.notice` when
    `result.source === 'persisted'`. Template below the error row (`:324-343`), when
    `modelsNotice()` and no error: `role="status"`, `class="text-xs text-warning"`,
    `data-testid="provider-model-picker-notice"`, Retry button
    `data-testid="provider-model-picker-notice-retry"`, `(click)="refreshCatalog()"`, disabled
    when `disabled()`, `min-h-9`. Error row unchanged.
  - No change to `@ptah-extension/chat` consumers, memory-curator and skill-synthesis services:
    they read `error` (unchanged meaning) and `models`; they are in the gate because the type
    changes in Component 10.
  - Fixtures `isStatic` -> `source` (and `failureReason` where `error` is set):
    `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts:143`,
    `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts:231` (S1),
    `apps/ptah-electron-e2e/src/specs/thoth/skills.spec.ts:109-110`,
    `memory-curator-ui/.../memory-diagnostics-rpc.service.spec.ts:271,287`,
    `memory-curator-ui/.../memory-diagnostics-accordion.component.spec.ts:134`,
    `skill-synthesis-ui/.../skill-synthesis-rpc.service.spec.ts:45`,
    `ui/.../provider-model-picker.component.spec.ts:52,333`.
- Verified contracts and entry points: picker `:136-148,324-343,751-799`; loader port
  `provider-models-loader.port.ts:40`.
- Dependencies: shared types only.
- Failure behaviour: RPC envelope failure keeps the existing catch (`:783-792`).
- Quality requirements: notice `role="status"` (polite), error keeps `role="alert"`; Retry is a
  real `button`, 36 px min height; theme tokens readable in light and dark daisyUI themes.
- Verification seam: `provider-model-picker.component.spec.ts` (notice for persisted, hidden
  for live, error for unavailable, Retry re-calls the loader); `typecheck-templates`.
- Files: MODIFY the picker component and spec, and the fixture files above.

### 9. Live parser and tier-preference check (replaces the drift probe)

- Purpose: prove daily that the production parsers still read each keyless vendor catalog, and
  raise the one signal the old probe gave that still matters: a tier preference the vendor
  retired.
- Responsibilities: DELETE `model-lists.live.spec.ts`; CREATE `vendor-model-parsers.live.spec.ts`,
  gated by `PTAH_LIVE_PROBES=1` (`model-lists.live.spec.ts:31-32` precedent). Cases (real HTTP,
  production classes):
  1. OpenCode Zen and Go through `ProviderModelsService.fetchModels(id, null)` built with an
     in-memory `ConfigManager` stub and the real `openCodeLiveRoutes` path (M10 b): `source ===
     'live'`, >= 1 model, every model has `upstreamProtocol` in the three literals, the stub
     holds a `schema: 2, origin: 'live'` record afterwards.
  2. Ollama Cloud through `OllamaModelDiscoveryService.listCloudModels()` with the local daemon
     URL pointed at a closed port: >= 1 model; for up to 3 tags the enrichment yields a positive
     context length (A3).
  3. OpenRouter and Requesty keyless `/v1/models` through `parseModelsApiRows`: >= 1 row with an
     id, >= 1 with a positive `contextLength`.
  4. Tier preferences (M10 c, brief): for opencode-zen, opencode-go and ollama-cloud, each
     `defaultTiers` id must be in the live list. A missing id fails the case with
     `tier preference <id> (<provider> <tier>) is no longer listed; runtime resolves it to
     <closestLiveModel(...) ?? derived ?? 'nothing'>` - the issue then tells the maintainer to
     update the preference. This is a staleness alarm on the one literal that stays, not a list
     comparison.
  5. Optional keyed cases (A1, A2, A6), each skipped unless its env key is set:
     `PTAH_LIVE_ANTHROPIC_KEY`, `PTAH_LIVE_ZAI_KEY`, `PTAH_LIVE_SAKANA_KEY`. They call
     `fetchModels` and assert `source === 'live'` and >= 1 model. CI sets none today; keyed
     coverage stays manual (deferred, see Revision 1).
  Never asserts a specific model id or count. The old "every raw row had type chat" cross-check
  is dropped (it restated the parser's own filter, M10 d); kept and skipped row counts are
  logged.
- Workflow `.github/workflows/model-lists-probe.yml`: keep schedule, permissions and issue
  mechanics (`:3-118`); step pattern `vendor-model-parsers.live` (`:57`); issue title
  `[model-lists-probe] A live model parser or tier preference failed` (`:63`); body sentence
  (`:70`) names the new spec; `name: Live Model Parser Probe`.
- Failure behaviour: a vendor outage or a retired preference fails the probe and files/updates
  one issue (existing logic).
- Verification seam: the live command in the handoff and one `workflow_dispatch` run after merge.
- Files: DELETE `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts`; CREATE
  `libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts`; MODIFY
  `.github/workflows/model-lists-probe.yml`.

### 10. Cleanup: delete the literals and the transitional fields

- Purpose: the last step, once no reader remains.
- Responsibilities:
  - shared: delete `ProviderStaticModel`, `AnthropicProvider.staticModels`,
    `getStaticModelCapabilities` (`provider-registry.ts:896-913`), `seedStaticModelPricing`
    (`:930-953`) and imports (`:26-27`), `static-model-pricing.ts`, `kimi-code-model-merge.ts`
    (+ spec), `entries/opencode-model-routes.ts`; remove `staticModels` from z-ai
    (`provider-registry.ts:257-414`, including every Z.AI price field: D7),
    `claude-cli-provider-entry.ts:42-136`, `copilot-provider-entry.ts:13-73,113`,
    `kimi-code-provider-entry.ts:64-121,141`, `sakana-provider-entry.ts:25-46,88`,
    `local-provider-entry.ts:30-32,47-83`, `opencode-provider-entry.ts:58-102,123,148` (and the
    "reviewed routing tables" / "Excluded models" paragraphs `:20-27`),
    `anthropic-api-lane-entry.ts:18`; update entry doc comments. `index.ts`: drop
    `OPENCODE_MODEL_ROUTES`, `getOpenCodeModelProtocol`, `OpenCodeModelRoutes`,
    `mergeKimiCodeModels`, `isKimiCodeModelsPayload`, `getStaticModelCapabilities`,
    `seedStaticModelPricing`. RPC types: delete `isStatic`; make `source` required on
    `ProviderListModelsResult` and `PtahCliListModelsResult`.
  - agent-sdk: delete `buildStaticTierCapabilityEnv` and the `seedStaticModelPricing` re-export
    (`index.ts:513,527`, `helpers/index.ts:228`).
  - auth-providers / rpc-handlers: delete the deprecated `isStatic: false` from
    `ProviderModelList` and from the lane-listing port.
  - Comments that cite `seedStaticModelPricing`: `config-rpc.handlers.ts:184`,
    `libs/frontend/core/src/lib/services/model-state.service.ts:162`.
  - Specs asserting static rows: shared `provider-registry.spec.ts`, `provider-lookup.spec.ts`,
    `anthropic-api-lane-entry.spec.ts`, `entries/codex-provider-entry.spec.ts`,
    `entries/opencode-provider-entry.spec.ts`, `entries/provider-session-provider-entries.spec.ts`,
    `utils/pricing-review-regressions.spec.ts` (Z.AI cost now unknown), `utils/anthropic-spend-regressions.spec.ts`.
- Verification seam: the grep gate and the full gate (handoff).
- Files: as listed (MODIFY / DELETE).

## Integration architecture

- Data flow (picker open, Electron): renderer `loadModels` -> RPC `provider:listModels` ->
  `ProviderRpcHandlers` -> `ProviderModelsService.fetchModels` -> one live route -> on success
  memory cache + versioned persisted record (full list) + context-window registry ->
  `ProviderModelList` -> RPC result (`source`, `failureReason`, `notice` | `error`) -> picker
  list + notice/error row with Retry.
- Data flow (OpenCode request): SDK -> local OpenCode proxy `POST /v1/messages` ->
  `resolveRequestModelId` (alias -> preference -> live ids / family / derived) ->
  `openCodeLiveRoutes.resolve` -> live | awaited refresh (which also persists) | persisted
  `upstreamProtocol` -> forward, or 400 with worded reason.
- Data flow (agy lane spawn): spawn -> `currentModelIds()` (cached `agy models` ids or one 8 s
  probe) -> `agyModelId` / `agyModelWithEffort` -> argv.
- State or persistence: memory cache 5 min; persisted `provider.<id>.modelCatalog`
  `{schema: 2, origin: 'live', models, timestamp}` (ConfigManager, 30-day cap; pre-version
  records ignored on read, overwritten by the next live success); OpenCode live cache 6 h TTL /
  5-min backoff (module singleton); agy live ids per adapter instance, 10 min.
- External boundaries: every vendor and CLI payload is untrusted: envelope validated, rows one by
  one, own-property lookups, size caps (OpenCode 2 MiB, Ollama 1 MiB), explicit timeouts
  (OpenCode 4 s, endpoints 10 s, Kimi 10 s, Ollama 5 s, agy/Pi probes 8 s). Failure text is
  fixed copy keyed by a closed enum; raw errors go to debug logs only; credentials never appear.
- Failure and rollback:

| Situation | Picker / RPC | Tiers and runtime | Chain-spec case |
| --- | --- | --- | --- |
| Live success | `live`, list | preferences checked against it | yes |
| Offline, v2 persisted record < 30 days | `persisted`, list + notice (reason `network`/`timeout`) + Retry | preferences checked against the persisted ids | yes |
| Offline, persisted record exactly 30 days old / 30 days + 1 ms | kept / ignored -> `unavailable` | unverified preferences when ignored | yes (boundary) |
| Pre-version record (no `schema: 2`, e.g. Kimi/Copilot/Ollama-Cloud static rows of the current release) | ignored -> `unavailable` | not used for tiers | yes (B1) |
| Persisted record malformed or all rows invalid | ignored -> `unavailable` | same | yes |
| First run, offline, no record | `unavailable`, `error` "Couldn't load models from <name>: couldn't reach <name>." + Retry | preferences applied unverified (env slot only); child admission refuses on empty catalog; OpenCode requests 400 catalog-unavailable | yes |
| Key missing (endpoint providers) | `unavailable`, `no-key`; persisted not used | provider cannot authenticate | yes |
| Key rejected (401/403) | `unavailable`, `auth-rejected`; persisted not used (S2) | same | yes |
| Signed out (Copilot, Kimi) | `unavailable`, `not-signed-in`; persisted not used | same | yes |
| Vendor timeout / DNS or refused / HTTP 5xx | `persisted` or `unavailable` with `timeout` / `network` / `http-error` | as offline | yes (one each) |
| Malformed payload / zero valid rows / oversize | `bad-response` -> persisted or unavailable | OpenCode routing uses persisted protocol or 400 | yes |
| OpenCode: only non-chat or unroutable rows | `bad-response` | same | yes |
| OpenCode cold cache at request time, gateway down, persisted protocol present | request forwarded on the persisted protocol | - | yes (live-routes spec) |
| OpenCode cold cache, gateway down, no persisted row | 400 catalog-unavailable text | - | yes |
| Fetcher returns `[]` (claude-cli, Kimi, Ollama local with no models) | `empty` -> persisted or unavailable | derived tiers absent; preferences stay | yes |
| Fetcher throws a non-classified error | `unexpected` (text "details in the log") | - | yes |
| Tier preference absent from the live catalog | - | closest same-family live id, else derived, warn once | yes (service spec) |
| Retry | re-runs the chain; OpenCode forces past the 5-min backoff | `reapplyTiersForWarmedCatalog` on success | yes |

- Observability: `[ProviderModelsService]` logs carry `source` and `failureReason` (no key
  material); the tier-preference warn; OpenCode skipped-row debug; Ollama Sentry captures stay;
  CLI detection's reported capture for Cursor; the daily probe files an issue for a parser or
  preference failure.

## Architecture-level quality requirements

- Functional:
  - No built-in provider entry and no CLI adapter declares a model list. Grep gate in the
    handoff.
  - Every `provider:listModels` answer has `source`; `error` iff `unavailable`; `notice` and
    `savedAt` iff `persisted`; `failureReason` iff not `live`.
  - A persisted record without `schema: 2, origin: 'live'` is never served or used for tiers.
  - The persisted record always holds the unfiltered list.
  - A retired tier preference resolves to a live id of the same family (or the derived tier)
    on every path: SDK env, OpenCode aliases, native child admission.
- Performance: one live route per list call; Ollama Cloud adds bounded `/api/show` POSTs (stated
  in Component 4); agy spawn adds at most one 8 s probe when no ids are cached; no new timers or
  pollers.
- Security: closed reason enum with fixed copy; no relayed vendor/error text; own-property
  lookups; size caps; no secret in `notice`, `error` or logs.
- Maintainability: no new library, tag or DI token; dependency direction unchanged
  (shared <- agent-sdk <- auth-providers <- rpc-handlers / cli-agent-runtime); one chain owner;
  the `providerQuotaStore` attach precedent; every new swallowing catch has a
  `degradation-audit:` marker and the audit ratchet does not rise.
- Testability: each failure-table row pinned (chain spec, live-routes spec, service spec);
  parser per-row validation pinned; picker states pinned; `closestLiveModel` examples pinned;
  live probe asserts parser output and preference presence only.
  Specs to update or delete (repository grep on the removed symbols), by owning component:
  shared - Components 1/10 lists; agent-sdk - `helpers/tier-capability-env.spec.ts`;
  auth-providers - `provider-models.service.spec.ts`, `provider-models.opencode.spec.ts`,
  `model-lists.live.spec.ts` (delete), `auth/model-resolver.spec.ts`,
  `auth/strategies/cli.strategy.spec.ts`, `auth/workspace-provider-profile-resolver.spec.ts`,
  `auth/curator-proxy-manager.spec.ts`, `translation/translation-proxy-base.spec.ts`,
  `providers/custom/custom-openai-translation-proxy.spec.ts`,
  `providers/sakana/sakana-translation-proxy.spec.ts`,
  `providers/local/ollama-model-discovery.service.spec.ts`,
  `providers/opencode/opencode-live-routes.spec.ts`, `providers/opencode/opencode-translation-proxy.spec.ts`;
  cli-agent-runtime - `cli-adapters/copilot-sdk.adapter.spec.ts`, `cursor-cli.adapter.spec.ts`,
  `antigravity-cli.adapter.spec.ts`, `antigravity-cli.adapter.acp.spec.ts`,
  `ptah-cli/ptah-cli-registry-{auto-compact-argv,capabilities,harness-preflight,inbound-peer,kimi-code-signin,lmstudio-proxy,off-thread-spawn,output-style,permission-routing,plan-limits,sakana-proxy,spawn-model}.spec.ts`,
  `ptah-cli/ptah-cli-registry.proxy-lease.spec.ts`;
  lane-routing - `child-session/child-model-tier.spec.ts`, `matrix/seed-matrix.spec.ts`;
  rpc-handlers - `chat/session/child-model-admission.spec.ts`, `handlers/config-rpc.handlers.spec.ts`,
  `handlers/provider-rpc.handlers.spec.ts`, `handlers/ptah-cli-rpc.handlers.spec.ts`,
  `services/lane-model-listing.adapter.spec.ts`; frontend and e2e fixtures - Component 8 list.

## Team-leader handoff

- Recommended executors:
  - Components 1-7 and 10: backend-developer.
  - Component 8: frontend-developer (Angular signal + template in `@ptah-extension/ui`).
  - Component 9: senior-tester (live probe; the workflow edit is two strings).
- Complexity: HIGH - 9 production libs, renderer, two CLI lanes, a workflow, a persisted-data
  rule change.
- Dependencies and ordering (component level; each step is designed to commit GREEN under its
  own scoped checks because every removal happens after its last reader moved):
  1. Component 1 (additive shared). Nothing downstream changes behaviour or breaks.
  2. Components 2 + 3 (auth-providers chain, OpenCode, proxies; plus the one shared lane-entry
     line). rpc-handlers keeps compiling because `ProviderModelList` still carries
     `isStatic: false`.
  3. Components 4 + 5 (Ollama, auth readers, agent-sdk additive rename). After step 2 (same
     project, different files; do not check auth-providers while step 2 edits it).
  4. Component 6 (rpc-handlers) and Component 7 (cli-agent-runtime, lane-routing) after steps
     2-3; file- and project-disjoint from each other, so parallel-safe.
  5. Component 8 after step 1 (optional `source`); may run in parallel with steps 2-4.
  6. Component 10 after steps 2-5 (every reader moved). This is the only commit whose type change
     reaches all downstream projects; it runs the full gate.
  7. Component 9 after step 6 (final shapes; Ollama and OpenCode behaviour from steps 2-3).
     The chain spec is no longer part of it (it ships with Component 2), so Component 9 has no
     dependency on unfinished unit coverage.
  Branch-internal note: between steps 2 and 4 the Kimi/Copilot rpc-handlers fetchers still
  return merged static rows, and step 2 writes them as `schema: 2`. No release ships from the
  branch in between, so no user machine gets such a record; the team-leader must not cut a
  release mid-branch.
- Proposed batches and scoped checks (each batch commits green):

| Batch | Components | Executor | Projects touched | Inner loop | Batch gate before commit |
| --- | --- | --- | --- | --- | --- |
| B1 | 1 | backend-developer | `@ptah-extension/shared` | `npm run verify -- --related -p @ptah-extension/shared` then `npm run verify -- -t lint,typecheck -p @ptah-extension/shared` | `npm run verify -- -p @ptah-extension/shared` |
| B2 | 2, 3 | backend-developer | `@ptah-extension/auth-providers`, `@ptah-extension/shared` (lane entry only) | `npm run verify -- --related -p @ptah-extension/auth-providers,@ptah-extension/shared` then `-t lint,typecheck -p` same | `npm run verify -- -p @ptah-extension/auth-providers,@ptah-extension/shared` then `npm run verify -- -t typecheck -p @ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,ptah-electron` and `npm run verify -- -t lint -p degradation-audit` |
| B3 | 4, 5 | backend-developer | `@ptah-extension/auth-providers`, `@ptah-extension/agent-sdk` | `npm run verify -- --related -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk` then `-t lint,typecheck -p` same | `npm run verify -- -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk` then `npm run verify -- -t typecheck -p @ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime` and `npm run verify -- -t lint -p degradation-audit` |
| B4a | 6 | backend-developer | `@ptah-extension/rpc-handlers` | `npm run verify -- --related -p @ptah-extension/rpc-handlers` then `-t lint,typecheck -p @ptah-extension/rpc-handlers` | `npm run verify -- -p @ptah-extension/rpc-handlers` then `npm run verify -- -t typecheck -p ptah-electron` and `npm run verify -- -t lint -p degradation-audit` |
| B4b | 7 | backend-developer | `@ptah-extension/cli-agent-runtime`, `@ptah-extension/lane-routing`, `@ptah-extension/shared` (`rpc-agents.types.ts` doc line) | `npm run verify -- --related -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing` then `-t lint,typecheck -p` same plus `@ptah-extension/shared` | `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing,@ptah-extension/shared` then `npm run verify -- -t typecheck -p @ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron` and `npm run verify -- -t lint -p degradation-audit` |
| B5 | 8 | frontend-developer | `@ptah-extension/ui`, `@ptah-extension/memory-curator-ui`, `@ptah-extension/skill-synthesis-ui`, `@ptah-extension/webview-e2e-harness`, `ptah-electron-e2e` | `npm run verify -- --related -p @ptah-extension/ui,@ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui` then `npm run verify -- -t lint,typecheck -p @ptah-extension/ui,@ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui,@ptah-extension/webview-e2e-harness,ptah-electron-e2e` | the inner-loop pair plus `npm run verify -- -t typecheck-templates -p ptah-extension-webview` |
| B6 | 10 | backend-developer | `@ptah-extension/shared`, `@ptah-extension/agent-sdk`, `@ptah-extension/auth-providers`, `@ptah-extension/rpc-handlers` (port field, comment), `@ptah-extension/core` (comment) | `npm run verify -- --related -p` the five | the FULL gate below |
| B7 | 9 | senior-tester | `@ptah-extension/auth-providers` (new spec), workflow | `npm run verify -- --related -p @ptah-extension/auth-providers` | live run below |

  B4b's `rpc-agents.types.ts` edit is a doc line; if B1 is still open, B1 takes it instead. B2
  and B3 share a project but not a file: B2 owns `provider-models.service.ts`,
  `models-api-parser.ts`, `model-list-error.ts`, `provider-models.fallback-chain.spec.ts`,
  `providers/opencode/*`, `translation/*`, the seven proxy files and `custom-proxy.factory.ts`,
  the three spec files named in Component 3 (including `auth/curator-proxy-manager.spec.ts`),
  `di/register.ts`; B3 owns `providers/local/*` and `auth/*` except `curator-proxy-manager.spec.ts`,
  and agent-sdk files. Run B3 after B2 commits (same project; CLAUDE.md: no check of a project
  while another batch edits it).
- Files affected:
  - CREATE: `libs/shared/src/lib/providers/{closest-live-model.ts,model-list-failure.ts}` (+ specs),
    `libs/shared/src/lib/providers/entries/kimi-code-models.ts` (+ spec),
    `libs/backend/auth-providers/src/lib/{models-api-parser.ts,model-list-error.ts}` (+ specs),
    `libs/backend/auth-providers/src/lib/provider-models.fallback-chain.spec.ts`,
    `libs/backend/auth-providers/src/lib/auth/stored-model-offer.spec.ts`,
    `libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts`,
    `libs/backend/rpc-handlers/src/lib/handlers/config-provider-session-models.spec.ts` (if absent).
  - DELETE: `libs/shared/src/lib/providers/entries/opencode-model-routes.ts`,
    `libs/shared/src/lib/providers/static-model-pricing.ts`,
    `libs/shared/src/lib/providers/entries/kimi-code-model-merge.ts` (+ spec),
    `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts`.
  - MODIFY: shared - `providers/provider-registry.ts`, `providers/index.ts`, entries
    `claude-cli`, `copilot`, `kimi-code`, `sakana`, `local`, `opencode`, `anthropic-api-lane`,
    `types/rpc/rpc-providers.types.ts`, `types/rpc/rpc-agents.types.ts`;
    agent-sdk - `src/lib/helpers/sdk-model-service.ts`, `src/lib/helpers/index.ts`, `src/index.ts`;
    auth-providers - `provider-models.service.ts`, `di/register.ts`,
    `providers/opencode/{opencode-live-routes.ts,opencode-translation-proxy.ts}`,
    `translation/translation-proxy-base.ts`,
    `providers/{copilot/copilot-translation-proxy.ts,kimi-code/kimi-code-translation-proxy.ts,sakana/sakana-translation-proxy.ts,openrouter/openrouter-translation-proxy.ts,local/local-model-translation-proxy.ts,custom/custom-openai-translation-proxy.ts,custom/custom-proxy.factory.ts}`,
    `providers/local/{ollama-model-discovery.service.ts,ollama-cloud-metadata.service.ts}`,
    `auth/{stored-model-offer.ts,workspace-provider-profile-resolver.ts,provider-auth-resolver.ts}`,
    `auth/strategies/{api-key.strategy.ts,cli.strategy.ts,oauth-proxy.strategy.ts}`;
    rpc-handlers - `handlers/{provider-rpc.handlers.ts,ptah-cli-rpc.handlers.ts,config-saved-model-option.ts,config-provider-session-models.ts,config-rpc.handlers.ts}`,
    `services/{lane-model-listing.adapter.ts,cli-model-list.service.ts}`,
    `chat/session/{child-model-admission.ts,chat-session.service.ts}`;
    cli-agent-runtime - `cli-agents/cli-adapters/{copilot-sdk.adapter.ts,cursor-cli.adapter.ts,antigravity-cli.adapter.ts,cli-adapter.interface.ts}`, `ptah-cli/ptah-cli-registry.ts`;
    lane-routing - `child-session/child-model-tier.ts`, `matrix/seed-matrix.ts`;
    frontend - `ui/.../provider-model-picker.component.ts`, `core/src/lib/services/model-state.service.ts` (comment);
    fixtures - `webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`,
    `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts`,
    `apps/ptah-electron-e2e/src/specs/thoth/skills.spec.ts`;
    workflow - `.github/workflows/model-lists-probe.yml`; plus every spec in Testability.
- Verification points:
  - Grep gate before review (B6 and again before push), no match in `libs/` and `apps/` for
    `staticModels|ProviderStaticModel|OPENCODE_MODEL_ROUTES|getOpenCodeModelProtocol|STATIC_MODELS|KNOWN_CLOUD_MODELS|COPILOT_MODELS|FALLBACK_MODELS|AGY_EFFORT_MODEL_BASES|AGY_STALE_MODEL_IDS|mergeKimiCodeModels|seedStaticModelPricing|getStaticModelCapabilities|buildStaticTierCapabilityEnv|getStaticModels|isStatic|ZAI_RATE_CARD`
    except the custom proxy config field (`custom-provider.types.ts`, `custom-openai-translation-proxy.ts`)
    and C# `isStatic` in `libs/backend/workspace-intelligence`; and no `isFallback: true`
    literal under `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/` (m2).
  - `container.smoke.spec.ts` and `rpc-surface.spec.ts` still pass (no new token or method):
    `ptah-electron` is in the gate.
  - degradation-audit ratchet: `npm run verify -- -t lint -p degradation-audit` in every
    backend batch gate and in the full gate (M6). CI runs the same target (`ci.yml:91-94`).
  - Full gate (B6, then once before the first push; again before any later push that changes
    code):
    `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/auth-providers,@ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing,@ptah-extension/ui,@ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui,@ptah-extension/chat,@ptah-extension/core,@ptah-extension/webview-e2e-harness,ptah-electron-e2e,@ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron,ptah-extension-webview`
    - confirm the header says "for 17 projects" (projects without a target are reported per
    target; confirm each target's count matches the projects that define it), then
    `npm run verify -- -t typecheck-templates -p ptah-extension-webview` and
    `npm run verify -- -t lint -p degradation-audit`. Never workspace-wide; no build, serve, e2e
    or package targets.
  - Live check at the end (context.md): under the lock,
    `PTAH_LIVE_PROBES=1 node scripts/verify.mjs --exec --task live-model-parsers -- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts`
    (PowerShell: set `$env:PTAH_LIVE_PROBES = '1'` first); plus one Electron session opening the
    model picker for OpenCode Zen, Ollama Cloud and a provider with no key (expects the error row
    with Retry), and one agy lane and one Cursor lane spawn (CLI lanes keep working).
  - CLI lanes, if the team-leader uses any: lanes do not run `npm run verify` or `nx`; they run
    only `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
    `npx tsc --noEmit --project <tsconfig>` and `npx eslint <changed files>` (CLAUDE.md).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| `error` keeps "no usable list"; persisted lists use `notice` | reuse `error` / separate `notice` | 3 chat consumers mark any `error` as `status: 'error'` | yes |
| `isStatic` replaced by required `source`, introduced optional first | big-bang / additive then required | per-batch green commits (review M11) | yes |
| Credential reasons (`no-key`, `auth-rejected`, `not-signed-in`) skip the persisted rung | show saved list / refuse | a removed, revoked or signed-out credential must not keep offering models (review S2) | yes |
| Closed `ModelListFailureReason` + fixed copy | relayed message / enum | review M4; `file-settings-errors.ts` precedent | yes |
| Persisted record `schema: 2, origin: 'live'`; older records ignored, not migrated | migrate / ignore | review B1, decisions.md 9; next live success overwrites | yes |
| Persist and cache the unfiltered list | filtered / unfiltered | review S6 | yes |
| `toolUseUnknown?: true` instead of a declared tool default; `toolUseOnly` keeps unknown rows | default true / drop unknown / keep unknown | user decision on S5; 125 reads of required `supportsToolUse` | yes |
| `modelsAuthScheme` on the entry, only the API lane sets `'anthropic'` | key on `authEnvVar` / entry field | review S9; custom schema `provider-registry.ts:562-565` | yes |
| Tier preference -> `closestLiveModel` -> derived -> preference, warn once | derived only / family first | user decision D6 | yes |
| OpenCode aliases resolved in an async base hook | sync normalize / async hook | `translation-proxy-base.ts:535,541`; review M2 | yes |
| OpenCode routing refresh writes the persisted record | listing only / both | review M1 (cold cache offline, 30-day ageing) | yes |
| `getStaticModels` -> concrete `getListedModels` | keep abstract / concrete renamed | `noImplicitOverride`; rename forces each implementer to be revisited (review S3) | yes |
| Copilot proxy `listModels` deleted | rethrow / delete | no production caller (repo grep) | yes |
| Cursor: no key -> `[]`; failure -> throw to the reported detection path; no new RPC error field | fallback list / empty / new field | user D8; `cli-detection.service.ts:486-500` | yes |
| agy tables derived from live `agy models` ids | keep tables / derive | user D8; A7 | yes |
| Pi, Grok, OpenCode CLI, Codex lanes unchanged | - | live-only already (evidence table) | n/a |
| Z.AI cost unknown; no rate card | rate card / unknown | user D7 | yes |
| Live probe fails on a retired keyless tier preference | log / fail | user brief: the deleted probe's one useful signal must survive | yes |
| Chain spec ships with Component 2 | with the probe / with the chain | review M11 a | yes |
| Static readers deleted last (B6) | first / last | review M11 b, user brief | yes |

## Revision 1

Resolution of every finding in `plan-review.md` (round 1).

| Id | Resolution |
| --- | --- |
| B1 | Resolved. Versioned record `{schema: 2, origin: 'live', models, timestamp}`; read ignores anything else (Component 2). Failure-table rows "pre-version record" and "malformed record" with chain-spec cases. Tier validation reads through the same versioned reader. |
| S1 | Resolved. `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts:231` added to Component 8 and B5. Full gate now lists `@ptah-extension/chat`, `@ptah-extension/webview-e2e-harness`, `ptah-electron-e2e`, `@ptah-extension/core`, `@ptah-extension/platform-cli` (17 projects). |
| S2 | Resolved. Credential reasons bypass the persisted rung; the failure is a typed reason, not a string (Component 2, failure table rows). |
| S3 | Resolved. `getStaticModels` renamed to concrete `getListedModels`; `custom-openai-translation-proxy.ts:188` gets `override`; `curator-proxy-manager.spec.ts:36`, `sakana-translation-proxy.spec.ts:13,40,124`, `custom-openai-translation-proxy.spec.ts`, `translation-proxy-base.spec.ts` are in B2's file list. Kimi and Copilot proxy specs checked: no `getStaticModels` reference (repo grep). |
| S4 | Resolved per user D6. `resolveNativeTierAlias(model, catalogIds)`: preference if live, else `closestLiveModel`, else newest `claude-<tier>-*`, else alias (Component 6). Spec case: retired preference admits the successor. |
| S5 | Resolved per user decision. No declared tool default at all; `toolUseUnknown?: true` marks unreported capability; `toolUseOnly` keeps unknown rows, defined in Component 1 and 2. Kimi keeps only its SDK capability allowlist (`liveModelCapabilities`), which is not a tool flag. |
| S6 | Resolved. Persist and memory-cache the full list; filter only the returned copy (Component 2; quality requirement; chain-spec case). |
| S7 | Resolved. Failure table extended: 30-day boundary, malformed record, pre-version record, timeout vs network vs HTTP error, cold OpenCode cache (with and without persisted protocol), `[]` vs throw (`empty` vs classified), unclassified error; each row names its spec. claude-cli empty keeps `empty` with neutral copy "Claude returned no models" rather than claiming a login problem it cannot know. |
| S8 | Resolved per user D8. Cursor `FALLBACK_MODELS` deleted (7b); agy tables derived from live ids (7c, A7); Pi checked and has no literal (inventory D). `isFallback` stays as a classification marker only, with its doc corrected; grep gate bans the literal in adapters. |
| S9 | Resolved. `modelsAuthScheme` field, default Bearer, set only on the API lane; `customEntryToAnthropicProvider` never sets it. |
| M1 | Resolved. A successful routing refresh writes the versioned record through the attached store; table rows for cold cache offline. |
| M2 | Resolved per user D6. OpenCode aliases resolve through `resolveRequestModelId` against live/persisted ids with the same family rule (Component 3). |
| M3 | Resolved per user D7. No `ZAI_RATE_CARD`; Z.AI price fields deleted with the rows; `pricing-review-regressions.spec.ts` asserts unknown cost. `ANTHROPIC_RATE_CARD`/`CODEX_RATE_CARD` stay (pricing, not lists; not in the user's scope) - inventory D. |
| M4 | Resolved. Closed `ModelListFailureReason` enum and fixed copy in shared; raw messages only in debug logs. |
| M5 | Resolved. Enrichment reuses `getModelMetadata('https://ollama.com', ...)`; parser reads `model_info`; 1 MiB cap; union via `toCloudId`; cost stated (up to one POST per tag per 10-min TTL, not "1 h" and not "no additional request"). |
| M6 | Resolved. Markers required on new catches; `npm run verify -- -t lint -p degradation-audit` in every backend batch gate and the full gate. |
| M7 | Resolved. `getPersistedCatalog` returns `{models, savedAt} \| null`; store interface defined in Component 3 before B2. |
| M8 | Resolved as a documented regression with a pinning spec case (Component 5). Keeping static rows for this check would reintroduce the literal. |
| M9 | Resolved. `config-provider-session-models.ts` treats `unavailable` as a catalog failure (Component 6). |
| M10 | (a) Deferred: no vendor keys in CI; optional keyed cases run locally when env keys are set. (b) Resolved: OpenCode case runs `ProviderModelsService.fetchModels` with a config stub. (c) Resolved per user brief: retired keyless preferences fail the probe. (d) Resolved: restating cross-check dropped. |
| M11 | Resolved. Re-split into additive-first batches that each commit green; deletion is B6 after every reader moved; chain spec moved to B2 so the probe batch (B7) depends only on finished work; agent-sdk old names kept until cli-agent-runtime moves (`ptah-cli-registry.ts:50,52`, a reader the round-0 plan missed). |
| m1 | Resolved. Project list corrected; every command scoped. |
| m2 | Resolved. Grep gate adds `getStaticModels`, `FALLBACK_MODELS`, the agy table names, `ZAI_RATE_CARD`, and the `isFallback: true` adapter check. |
| m3 | Resolved. Copilot proxy `listModels` has no production caller and is deleted; the proxy's `/v1/models` route returns the base default `{data: []}` (no 500). |

Deferred, with reason: M10 (a) keyed live coverage (needs CI secrets the repo does not hold);
a per-CLI error field on `agent:listCliModels` (renderer contract change beyond D8; Cursor's
failure is reported through the existing detection path).

## Revision 2 (orchestrator, from plan-review-2.md)

| Finding | Resolution |
|---|---|
| S-A | B5 (renderer) also updates `libs/frontend/chat/.../cli-tier-mapping-modal.component.spec.ts:17` and `main-agent-reassign-popover.component.spec.ts:87` to carry `source`. B6's gate adds `-p @ptah-extension/chat` (it makes `source` required). |
| S-B | B4a and B4b stay file-disjoint and may be implemented in parallel, but their scoped checks run sequentially: B4b (`cli-agent-runtime`) is verified and committed first, then B4a (`rpc-handlers`) is verified on top. |
| S-C | Native child profiles: when the Claude catalog is empty or `unavailable`, admission does NOT refuse. It passes the requested model through unchanged, logs a warning once, and lets the Claude runtime validate it. `model-catalog-unavailable` stays for non-native profiles only. B4b adds a spec case for both paths. |

Minor items from plan-review-2.md are applied by the implementing batch when local.
