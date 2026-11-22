# Code Logic Review (final, pre-push) - `TASK_2026_2306_livemodels`

Scope: `git diff main...HEAD` at 381e8bfdf. Depth on 0909a93e0 (fix round), 102b9424a (B5 renderer), e6351064b (B6 + SDK catalog), 381e8bfdf (B7 probe). Re-verified the P1P2 Serious fixes. No code edited, no checks run (read-only review; evidence is source reading plus the batch reports).

## Summary

| Metric | Value |
| --- | --- |
| Score | 6/10 |
| Verdict | REVISE |
| Blocking | 0 |
| Serious | 2 |
| Moderate | 6 |
| Minor | 4 |

Separating evidence: no data loss or security issue (7+ band needs the two Serious items closed). Two credential-handling holes remain where the user rule ("credential failures never fall back to a saved list / are never shown as live") is not met in production, and three renderer surfaces show saved lists with no notice (5-6 band).

## P1P2 Serious fixes: do they hold?

| P1P2 item | Holds? | Evidence |
| --- | --- | --- |
| Codex / provider-session / LM Studio return `[]` on failure | YES | `provider-rpc.handlers.ts:432-470` (Codex throws `not-signed-in` or last reason), `:493-535` (provider-session throws), `local-model-translation-proxy.ts:162-210` (classified throw, 401/403 -> `auth-rejected`). The only other LM Studio caller of `listModels()` is the fetcher (`local-proxy.strategy.ts:99`, `provider-rpc.handlers.ts:803`), so no unhandled throw. |
| Partial Ollama Cloud list persisted as full | YES | `ollama-model-discovery.service.ts:~255-268` throws the remote reason even when local cloud tags exist. |
| Cache/persisted not credential-scoped | YES for `/v1/models` route | `provider-models.service.ts` fingerprint (sha-256, 16 hex) on cache and record; a record saved without a credential is only served to a no-key call. Key deleted -> `no-key`. |
| agy retired-id / effort | not re-traced in depth; fix commit adds specs (`antigravity-cli.adapter.spec.ts`) |
| OpenCode multi-api rows | YES | `opencode-live-routes.ts` `MULTI_API_PREFERENCE`, candidates limited to the row's own declared keys. |
| Anthropic direct 401 swallowed into SDK list | NO (see S1) | The new `CREDENTIAL_FAILURE_REASONS` branch can never fire in production. |
| `listModelsForAll` never retried | PARTLY | See M1: retry now happens on every call. |
| ptahCli:listModels drops savedAt/notice for persisted | NO (see M3) | `ptah-cli-rpc.handlers.ts:375-380`. |

## Five logic questions

### 1. Silent failure
- Revoked or invalid Anthropic API key: the list comes back `live` (S1).
- claude-cli signed out: SDK bridge answers `[]`, the fetcher throws `unexpected` (`provider-rpc.handlers.ts:753-761`), which is not a credential reason, so the previous account's saved list is shown under a generic "unexpected error" notice (M2).
- `source:'unavailable'` with no `failureReason` returns `{models:[], source}` with no `error` (`ptah-cli-rpc.handlers.ts:372-374`, `provider-rpc.handlers.ts:906`): the picker shows an empty list with no row at all. Contract says this cannot happen; no guard.

### 2. Unexpected user action
- Tier-mapping modal, main-agent reassign popover and decision-model suggestions treat `source:'persisted'` as `ready` (S2): the user picks from a possibly 30-day-old list with no indication.
- Clicking Retry in the new notice row while `disabled()` is guarded; fine. Retry re-runs `loadModels`, generation-guarded against stale loads (`provider-model-picker.component.ts:~796-835`), OK.

### 3. Wrong answer from input data
- SDK `supportedModels()` tier aliases (`default`, `sonnet`...) are returned for an API-key identity whose `/v1/models` call failed; the SDK's own guard (`sdk-model-service.ts` `isDegradedApiKeyFallback`) refuses to cache them, but `ProviderModelsService` caches and persists whatever the fetcher returns as `schema:2, origin:'live'` (S1).

### 4. Dependency failure
- `getLive*` returns `[]` for every SDK failure (no CLI path, timeout, bad auth). The bridge keeps no reason, so every claude-cli failure is `unexpected`.
- `fetchModelsViaApi` swallows all errors to `[]` (`sdk-model-service.ts:~1461-1518`) so the adapter's `getApiModels()` never throws.
- Cursor `models.list()` failure throws (`cursor-cli.adapter.ts:~319-331`) and is now retried and Sentry-reported on every `listModelsForAll` call (M1).

### 5. Missing, never specified
- No reason is kept by the SDK bridge, so "signed out of Claude" is indistinguishable from "CLI missing" (needs an SDK-side classified failure).
- No notice or age shown to the three non-picker renderer consumers.

## Failure modes

### S1 (Serious). Anthropic direct: invalid/revoked API key is shown as a live list and saved as live
- Trigger: API-key auth with a revoked or mistyped key; `provider:listModels` for `anthropic`.
- Symptom: `getApiModels()` returns `[]` (error swallowed), so the fetcher falls to `getLiveSupportedModels()` -> `fetchModelsForApiKey` -> `/v1/models` again (second doomed call) -> `fetchModelsViaSdk()` tier slots. The fetcher returns them; `fetchModels` reports `source:'live'`, caches them for 5 min and persists them as `{schema:2, origin:'live'}`. The user sees alias rows instead of `auth-rejected`, and a later real outage shows these as the "saved live catalog".
- Evidence: `provider-rpc.handlers.ts:667-690` (the `CREDENTIAL_FAILURE_REASONS` catch at `:698-705` only runs if something throws; nothing does); `sdk-model-service.ts:1176-1185`, `:1128-1150` (degraded guard protects only the SDK's own cache/persist), `sdk-agent-adapter.ts:918-920`. The fix-round spec mocks `getApiModels` to throw, which the real service never does, so the test does not exercise the production path.
- Current handling: none beyond the SDK-local guard.
- Fix: make the API read distinguish failure from empty (return/throw a classified reason on 401/403, `bad-response`, network) and have the fetcher throw `ModelListError`; when `hasApiKey` and `/v1/models` failed, do not fall through to the SDK alias list (or discard results whose ids are all non-`claude-`, as the SDK guard does). Add a spec where the adapter mock resolves `[]` and the SDK mock resolves alias rows.

### S2 (Serious). Saved lists shown silently outside the picker
- Trigger: `provider:listModels` returns `source:'persisted'` (vendor down, 30-day window).
- Symptom: three consumers set `status: result.error ? 'error' : 'ready'` and ignore `source`/`notice`: `cli-tier-mapping-modal.component.ts:222-225`, `decision-model-suggestions.ts:114-116`, `main-agent-reassign-popover.component.ts:452-455`. A user maps tiers or reassigns an agent from a stale list as if it were live; the picker (B5) is the only surface with the notice.
- Fix: carry `source`/`notice` into their load state and render the same status row, or at least a one-line "saved list" hint.

### M1 (Moderate). A single failing CLI disables the model cache for all CLIs
- `cli-detection.service.ts:480-508`: `failed` prevents `modelCache` being set, so while Cursor (expired key) or agy (8 s probe timeout) keeps failing, every `agent:listCliModels` call re-detects and re-runs every adapter's `listModels` (process spawns, Cursor SDK call) and sends a Sentry event per call. Persistent failure = retry storm per UI open. Fix: cache successes per CLI and retry only failed CLIs, or negative-cache failures for a short TTL; dedupe Sentry.

### M2 (Moderate). claude-cli signed-out falls back to a saved list
- `provider-rpc.handlers.ts:753-761` throws `unexpected`; not in `CREDENTIAL_FAILURE_REASONS` (`model-list-failure.ts:16`), so the saved list of the previous login is offered. Acknowledged in code, but it conflicts with the stated user rule for the one provider where sign-out is the common failure. Fix: have the SDK bridge keep a classified reason (`not-signed-in` for an auth failure) or probe `claude auth status`.

### M3 (Moderate). `ptahCli:listModels` drops `savedAt` and `notice` for persisted
- `ptah-cli-rpc.handlers.ts:375-380` returns `{models, source, failureReason}`; the picker then shows the generic fixed notice without the saved date. Also unfixed from P1P2. Fix: add `savedAt` and `notice` like `provider-rpc.handlers.ts:905-921`.

### M4 (Moderate). First `provider:listModels` per boot for anthropic/claude-cli costs one SDK probe
- `sdk-model-service.ts:1071-1090` never answers from a restored entry, so the first list waits for a spawn of the CLI bridge (seconds; Windows scan of the large binary noted in-file at `:1214-1238`) unless the 10 s revalidation or an earlier live fetch landed. Documented trade-off in B6 deviation 1; no boot-path call, so no startup regression, but the first picker open can be slow and shows loading with no progress. API-key path also does `/v1/models` twice on failure (S1).

### M5 (Moderate). Native child model passes through unchecked on an empty/failed catalog
- `chat-session.service.ts:1504-1506`, `:1533-1537`, `:1562-1584`: by design (revision 2 S-C), the requested id reaches the runtime unvalidated, warn once. A typo'd child model fails at launch instead of at admission. Accepted trade-off; flagging only because the user rule says tier ids are preferences, and here a user-supplied id is admitted without a live check.

### M6 (Moderate). Stable catalog ages out without revalidation refresh
- `sdk-model-service.ts:~876-884`: an unchanged revalidation does not rewrite `savedAt`, so a catalog confirmed live daily is dropped from the restore after 30 days, and `config:models-list`/pre-flight lose their fallback until the next change. One probe then repopulates; low impact.

### Minor
- Workflow header comment still says "retired fallback ID" (`model-lists-probe.yml:5`), no fallback IDs exist.
- The keyed probe cases (`anthropic-api`, `z-ai`, `sakana`) skip silently in CI because no `PTAH_LIVE_*_KEY` secrets are wired; the green run overstates coverage of those parsers (`vendor-model-parsers.live.spec.ts:218-231`).
- `--passWithNoTests=false` does not fail a fully skipped suite; the guard is `PTAH_LIVE_PROBES: 1` at workflow level (present, `model-lists-probe.yml:18`). If that env is ever dropped the job goes green silently; consider asserting the env in the spec.
- Probe flake on a transient network error files an issue (acceptable, noted).

## Checks requested

- Callers of deleted/changed exports outside the diff: grep over `apps`, `libs`, `tools`, `.github` for `isStatic`, `mergeKimiCodeModels`, `isKimiCodeModelsPayload`, `OPENCODE_MODEL_ROUTES`, `getOpenCodeModelProtocol`, `seedStaticModelPricing`, `getStaticModelCapabilities`, `buildStaticTierCapabilityEnv`, `ProviderStaticModel`, `staticModelPricing` finds only workspace-intelligence AST `isStatic` (unrelated), `tools/mcp-bench` question fixtures and a `model-panel.ts` match unrelated to model lists (no hit on `isStatic` in the three tools/e2e files when grepped per-file), and the e2e fixtures the diff already updated. No `platform-cli`, `cli-engine`, `platform-electron`, `apps/ptah-electron` consumer remains. `ptah_lsp_references` was not used (grep only).
- New throw paths: all new `ModelListError` throws are inside registered fetchers, which `ProviderModelsService.fetchLive` classifies; `LocalModelTranslationProxy.listModels` has no other caller. `listModelsForAll` catches per adapter. Nothing throws at startup.
- SDK live reads: no boot call site (grep: only `provider-rpc.handlers.ts:687,715,753`). Cost is per first list (M4).
- Renderer: picker notice/error states are correct and mutually exclusive (`@if error / @else if notice`), long text falls back to fixed copy (`visibleNotice`); gaps are S2 and the no-reason `unavailable` case.
- B7 probe: calls production `ProviderModelsService.fetchModels`, `OpenCodeLiveRoutes` store wiring, `OllamaModelDiscoveryService.listCloudModels`, `parseModelsApiRows`; asserts `source:'live'`, a schema 2 record, protocols in the closed set, and tier preferences listed. The workflow still files/updates an issue on failure (`if: failure() && steps.probe.outcome == 'failure'`, retitled).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Live -> saved live (<=30 d, fingerprinted) -> explicit unavailable | PARTIAL | S1 persists a degraded list as live; fingerprint only on the `/v1/models` route |
| Credential failures never show a saved list | PARTIAL | Anthropic API key (S1), claude-cli (M2) |
| No repo-literal model lists | COMPLETE | Grep of added production lines finds no model-id literals except a doc `@example`; custom `staticModels` kept as allowed |
| Renderer shows saved/unavailable explicitly | PARTIAL | Picker only (S2) |
| Probe exercises app code and files an issue | COMPLETE | keyed providers skipped in CI |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH (S1's SDK alias behaviour is inferred from the in-code degraded-fallback guard, not run)
- Top risk: S1, a refused Anthropic API key is presented and saved as a live model list.
- Fix list before push: S1 (classify API failure, no SDK alias fall-through, real-shape spec), S2 (notice in the three consumers), M3 (cheap). M1 and M2 can follow in the PR if accepted explicitly.
