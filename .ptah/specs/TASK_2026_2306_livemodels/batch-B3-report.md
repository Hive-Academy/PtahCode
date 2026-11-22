# Backend implementation: `TASK_2026_2306_livemodels`, batch B3 (B3.1, B3.2, B3.3)

**Verdict**: B3.1, B3.2 and B3.3 are implemented to the plan. All focused checks are green: specs,
typecheck of the lib and spec configs, eslint, and degradation-audit. Two out-of-set spec files needed
fixture or assertion fixes because they encoded the removed static rows. Those fixes are listed below.
Nothing is staged or committed.

Worktree: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`.

## Files

### B3.1: Ollama Cloud and local discovery

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\local\ollama-model-discovery.service.ts`
  - Deleted `KNOWN_CLOUD_MODELS`, `CloudModelMeta`, `buildCloudDescription` and the known-model shortcut in `getModelMetadata`.
  - `listCloudModels` fetches ollama.com tags and the local daemon's cloud tags in parallel (`Promise.allSettled`), then merges them:
    - The union is keyed by `toCloudId`. ollama.com rows come first and win over a local row with the same id.
    - ollama.com rows need `capabilities` to include `completion`. A row with no `capabilities` is kept.
    - The tool flag is `capabilities.includes('tools')`. A row with no capabilities gets `toolUseUnknown: true`.
  - Each ollama.com row is enriched with `getModelMetadata('https://ollama.com', tag.id)`. This reuses the 5-at-a-time batching (new `inBatches` helper, also used by `listModels`), the 10-min cache and the 1-min failure cache. The window counts only when `/api/show` reports it (`contextLengthSource: 'provider'`). Otherwise the row has `contextLength: 0` and no `contextLengthSource`.
  - When ollama.com fails:
    - If the daemon has cloud tags, the method lists them and logs a warning.
    - If not, it throws `ModelListError` with the ollama.com reason. Sentry still captures the failure.
  - `listModels` (local and cloud daemon path): an unreachable daemon throws `ModelListError` with the classified reason (`network` for ECONNREFUSED and similar). The Sentry capture stays. A reachable daemon with no models still returns `[]`.
  - `parseShowResponse` reads `model_info` and `modelinfo`, and any own key that ends in `.context_length` and holds a positive safe integer. `general.context_length` is checked first.
  - `httpRequest` limits the response body to 1 MiB. Failures are typed:
    - body too large: `bad-response`
    - non-JSON body: `bad-response`
    - non-2xx status: `http-error`
    - timeout: `timeout`
    - socket errors are passed through raw, and their code classifies them
  - `buildDescription` now takes `(parameterSize, contextLength, caps)`, so local and cloud rows use one formatter. The header doc no longer mentions a bundled list.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\local\ollama-model-discovery.service.spec.ts`: rewritten. It covers:
  - union and de-duplication, with ollama.com fields winning
  - the `completion` filter and `toolUseUnknown`
  - an `model_info` architecture key
  - a failed enrichment keeping the row with a window of 0
  - both sources failing throws the ollama.com reason
  - ollama.com failing while the daemon has no cloud tags throws
  - only ollama.com failing lists the local tags
  - an empty ollama.com list with the daemon down returns `[]`
  - an unreachable daemon throws `network`, and Sentry captures it
  - a reachable daemon with no models returns `[]`
  - real-HTTP transport cases: over 1 MiB is `bad-response`, 500 is `http-error`, non-JSON is `bad-response`
  - the existing local capacity cases, kept as they were
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\local\ollama-cloud-metadata.service.ts`
  - `OllamaCloudTag` gains `capabilities?: readonly string[]`. It is copied only when it is a string array.
  - A failure in `fetchCloudTags` now throws `ModelListError` and caches nothing. A missing `models` array throws `bad-response`. A successful empty list is still cached as `[]`.
  - `httpJson` failures map to closed reasons:
    - non-2xx status: `http-error`
    - empty or non-JSON body: `bad-response`
    - abort at the deadline: `timeout`
    - any other fetch rejection: `network`
  - Raw status and body snippets now go to the debug log only.
  - The "bundled static catalog" and "never throw" wording is removed, and the doc comments on `fetchAndRegisterPricing` and `refresh` now say they throw.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\providers\local\ollama-cloud-metadata.service.spec.ts`: covers:
  - id mapping, de-duplication, and copying capabilities (a mixed-type array is dropped)
  - a successful empty list is cached
  - 503, missing `models`, non-JSON, empty body and a connection failure each throw the right reason and are not cached
  - a timeout from the abort deadline
  - the Bearer header
- DELETED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\model-lists.live.spec.ts` (correction 2).

### B3.2: tier capability env from live declarations; resolver and stored-model readers

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\agent-sdk\src\lib\helpers\sdk-model-service.ts`: new `buildTierCapabilityEnv(providerId, tiers): AuthEnv`.
  - It reads `getProviderLiveModelCapabilities(providerId)`.
  - It writes the key for each tier that has a model id, and only when the declared list is non-empty.
  - `buildStaticTierCapabilityEnv` is unchanged; it stays for `ptah-cli-registry.ts` until B4b.2.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\agent-sdk\src\lib\helpers\index.ts` and `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\agent-sdk\src\index.ts`: export `buildTierCapabilityEnv` alongside the old export. I did not touch the `seedStaticModelPricing` re-export, and did not add the new name to `deleted-exports.contract.spec.ts`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\agent-sdk\src\lib\helpers\tier-capability-env.spec.ts`: new `buildTierCapabilityEnv` cases (correction 7):
  - Kimi's declared `liveModelCapabilities` reach every tier
  - a live id that no repository list knows still gets them
  - an empty tier is skipped
  - z-ai, which declares nothing, leaves the key unset
  - an unknown provider gets `{}`
  - the value is forwarded by `buildTierEnvDefaults`

  The old helper's cases stay while the helper exists.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\provider-auth-resolver.ts`: switched to `buildTierCapabilityEnv`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\workspace-provider-profile-resolver.ts`
  - Switched to `buildTierCapabilityEnv`.
  - Deleted the `staticModels[0]` rung. The ladder is now snapshot opus, then sonnet, then haiku, then the requested alias.
  - The `provider` parameter of `resolveModel` became unused, so I dropped it and updated its 5 call sites.
  - The doc block is rewritten.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\workspace-provider-profile-resolver.spec.ts`
  - The two Codex `gpt-6-luna` cases now put a saved Codex catalog in the fixture, because that id used to come from the static rows.
  - "uses the serving provider catalogue instead of a removed static list" becomes "uses only catalogues on hand". Now an id that no catalogue lists is kept.
  - I removed a now-meaningless `staticModels` assertion and updated the comment on the terminal-alias case.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\stored-model-offer.ts`: `isOfferedBy` reads only `cachedModelIds`, and the registry static lookup and its import are gone. The doc comment names the M8 regression.
- CREATED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\stored-model-offer.spec.ts`: covers:
  - Claude ids and aliases
  - an id the serving catalog lists
  - an id only another provider's catalog lists is refused, on a third-party provider and on direct Anthropic
  - no catalog at all keeps the id
  - **M8 pin**: `glm-5.3`, which used to be a z-ai static row, is kept when z-ai was never listed on this machine
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\model-resolver.spec.ts`: only a comment that named `seedStaticModelPricing` changed. No assertion encoded static rows.

### B3.3: remove static price seeding from auth strategies

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\strategies\api-key.strategy.ts`: removed the import and 3 calls.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\strategies\oauth-proxy.strategy.ts`: removed the import and 2 calls.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\strategies\cli.strategy.ts`: removed the import, the call and its comment. The parameter `context` was then unused, so I renamed it to `_context` to satisfy the repo's `no-unused-vars` arg rule.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\strategies\cli.strategy.spec.ts`: removed the `seedStaticModelPricing` mock and the seeding describe block. A new case checks that after `configure`, `findModelPricing('claude-haiku-4-5')` prices at $1 / $5 per MTok from `ANTHROPIC_RATE_CARD`, with no seeding. That is the regression the old block guarded.

## Out-of-set spec fixes (fixture or assertion only; no production file)

- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\provider-auth-resolver.spec.ts:887-892`: the old assertion expected `_SUPPORTED_CAPABILITIES` to be undefined for a live replacement id that has no static row. Capabilities are now declared at the provider level, so the assertion now expects Kimi's `liveModelCapabilities.join(',')`.
- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\auth-providers\src\lib\auth\workspace-provider-profile-resolver.provider-session.spec.ts:304`: the row `stored, no catalog yet` (`gpt-6-luna`, no catalog) used to expect `undefined`, because of the Codex static rows. Under M8 it now expects `'gpt-6-luna'`, with a comment.

## Assumption A3 (live check)

**A3 holds.** On 2026-11-22 I sent keyless requests:

| Request | Result |
| --- | --- |
| `curl https://ollama.com/api/tags` | 200, 25 models, each with a `capabilities` array, for example `["completion","tools","thinking"]`. One entry, `clef:27b`, has `["decision","vision"]` and no `completion`; the filter drops it. |
| `curl -X POST https://ollama.com/api/show -d '{"model":"gpt-oss:120b"}'` | 200. Keys: `capabilities, details, model_info, modified_at, thinking`. `model_info` has `gptoss.context_length: 131072`. |
| The same request for `gpt-oss:120b-cloud`, `kimi-k3:cloud` and `kimi-k3` | 200 each. `kimi-k3` reports a context length of 1048576. |

The service sends the cloud id (`<name>:cloud` or `<tag>-cloud`), and ollama.com accepts it. The design follows the plan as written. Response bodies are in `.ptah/tmp/b3-ollama-tags.json` and `.ptah/tmp/b3-ollama-show.json`.

## Checks (focused only; logs in `.ptah/tmp/`)

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 15 specs: every changed or created spec, plus every spec importing a changed source (discovery, cloud metadata, stored-model-offer, both resolvers, the 4 strategies, `local-native`, `register.spec`, `auth-manager`-adjacent refusal spec) (`b3-jest-auth.log`) | 14 suites passed and the provider-session spec failed 1 test. After the out-of-set fix, that spec passes: 35 of 35 (`b3-jest-ps.log`). The cli spec re-run after the `_context` rename: 9 of 9. |
| `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand ... tier-capability-env.spec.ts sdk-model-service.spec.ts sdk-model-service.accounts.spec.ts deleted-exports.contract.spec.ts` (`b3-jest-sdk.log`) | 72 of 73 passed. One test in `sdk-model-service.spec.ts`, "does not let one auth identity answer for another", hit the 5 s timeout. Re-running only that spec passed 49 of 49 (`b3-jest-sdk2.log`), so I judge it flaky under load. B3 adds only a new pure function to that file. |
| `npx tsc --noEmit --project` for `libs/backend/auth-providers/tsconfig.lib.json`, `tsconfig.spec.json`, `libs/backend/agent-sdk/tsconfig.lib.json`, `tsconfig.spec.json` | rc 0 for all 4 |
| `npx tsc --noEmit --project` for `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/cli-agent-runtime/tsconfig.lib.json`, `libs/backend/cli-engine/tsconfig.lib.json`, `apps/ptah-electron/tsconfig.app.json` | rc 0 for all 4 |
| `npx eslint <every changed file>` (`b3-eslint.log`) | rc 0, 0 errors. 4 warnings were already there in `sdk-model-service.ts`: `max-lines` (1097 lines), 2 `no-empty-function` and 1 `no-useless-assignment`. The `cli.strategy.ts` unused-arg warning is fixed. |
| `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` (`b3-degradation.log`) | rc 0, `TOTAL 0 unsuppressed site(s)` |
| Greps | `KNOWN_CLOUD_MODELS` in `libs/`: none. `seedStaticModelPricing` in `libs/backend/auth-providers`: none. `buildStaticTierCapabilityEnv` outside agent-sdk: only `ptah-cli-registry.ts:52,1568`, which is expected until B4b.2. |
| `npx prettier --write` on the changed files | Clean, except `workspace-provider-profile-resolver.provider-session.spec.ts`. That file was already not Prettier-clean at HEAD, so I left its formatting alone. |
| `npm run verify`, `nx`, container smoke spec | Not run, as the brief requires. The coordinator's B3 gate still has to run. |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| When ollama.com fails and the daemon is reachable but has no cloud tags, the method throws the ollama.com reason rather than returning `[]` | return `[]` (`empty`) / throw | Returning `[]` would report "the vendor listed none" when the main source actually failed. The plan has a successful empty list stay `[]` and a failure throw. | yes |
| An ollama.com row with a successful `/api/show` that reports no window also gets `contextLength: 0` | 0 only on failure / 0 whenever no window is reported | The plan treats an unknown window as 0 with no `contextLengthSource`. The local daemon path keeps its 8192 default. | yes |
| The `/api/show` request for ollama.com sends the cloud id | base name / cloud id | Live check: both forms return 200, so `OllamaCloudTag` keeps its current shape | yes |
| Socket errors in `httpRequest` pass through raw; the other failures are typed | type every failure / classify the code | `classifyModelListFailure` maps ECONNREFUSED and similar codes to `network`. Raw errors keep the Sentry detail. | yes |
| `buildTierCapabilityEnv` writes the provider's list for every tier that has an id, even an id unknown to the repo | per model / per provider | `getProviderLiveModelCapabilities` is provider-level, and the plan's rule is to write only a non-empty list | yes |
| Dropped the `provider` parameter of `resolveModel` | keep it unused / drop it | Its only use was the deleted rung (5 private call sites) | yes |

## Plan deviations

None in behaviour.

## Out-of-scope observations

- `libs/backend/auth-providers/src/lib/auth/strategies/local-native.strategy.ts:184`: a debug log still says "using static catalog + zero-cost pricing fallback". The file is outside the B3 write sets.
- `.github/workflows/model-lists-probe.yml:69` still names the deleted `model-lists.live.spec.ts`. B7 (Component 9) owns that file.
- `libs/shared/src/lib/providers/entries/copilot-provider-entry.ts:36`: a comment still names the deleted spec.
- `OllamaCloudMetadataService.fetchAndRegisterPricing` has no caller in `libs/` or `apps/`. I left it in place and corrected its doc comment.
- Each failed ollama.com `/api/show` enrichment sends a Sentry event, which is the existing behaviour of `getModelMetadata`. If ollama.com `/api/show` goes down, that is up to 25 events per minute, limited by the 1-min failure cache.
