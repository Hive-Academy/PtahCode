# Coordinator diff review — TASK_2026_908_2835

Findings from the coordinator's read of each batch diff. Status: `open`,
`in-fix` (a lane has it), `fixed`, `accepted` (no change, with reason).

## B1 backend (`sdk-model-service.ts`, `config-rpc.handlers.ts`, `model-picker-groups.ts`)

| ID | Severity | Finding | Status |
| -- | -------- | ------- | ------ |
| C1 | high | `persistedCatalogSchema` drops `resolvedModel` (Zod strips unknown keys). A catalog restored at boot has no alias rows for `modelPickerGroups`, so the picker is flat until the refresh ends. | fixed (verified) |
| C2 | medium | `revalidateCatalog` compares schema-shaped restored rows with raw SDK rows. Always "changed": one useless write and a wrong info log per boot. | fixed (verified) |
| C3 | low | Several new lines are not Prettier-formatted. | fixed (verified) |

B7 lane result for C1 to C3 (diff read by the coordinator): `resolvedModel`
is in the schema; the comparison uses the persistable shape of both sides;
both files are formatted. Coordinator run `npm run verify -- -p @ptah-extension/agent-sdk`:
lint and typecheck 2 of 2, test 1 of 1, exit code 0 (lock released 2026-11-10T00:10:50Z).

## B7 dead keys (`sdk-model-service.ts`)

| ID | Severity | Finding | Status |
| -- | -------- | ------- | ------ |
| C11 | info | `isPersistableCatalogKey` treats a loopback base URL that is not a registered provider URL as dead. A user-run local endpoint on a custom port (custom Anthropic-type provider, Ollama on a non-default port) is then never persisted: one fetch per boot, never a wrong list. | accepted |
| C12 | info | `subagent-budget-monitor.spec.ts:3087` failed once in the B7 run (timer count 2, expected 0). The suite does not use `SdkModelService`, and it passed in the B1 run after B1 added the timers. Passed in the coordinator's run: load-dependent, not this task. | accepted |

## B4 OpenCode (`opencode-live-routes.ts`, `provider-models.service.ts`, proxy)

| ID | Severity | Finding | Status |
| -- | -------- | ------- | ------ |
| C4 | medium | Settings list freshness regressed: the removed `fetchOpenCodeLiveIds` cached live ids for 5 minutes; `OpenCodeLiveRoutes.list()` now serves a 6-hour cache. A retired id stays 6 h; a new id needs up to 6 h. `list()` must refresh when the cache is older than 5 minutes (the `OPENCODE_LIVE_RETRY_MS` value), and keep the last good map when that refresh fails. | fixed (verified) |
| C5 | medium | `resolve()` does not refresh for an unknown id while the cache is younger than 6 h, so a model published in that window gets HTTP 400. Refresh when the id is not in the cache and the cache is older than 5 minutes (bounded: at most one fetch per 5 minutes per provider). | fixed (verified) |
| C6 | low | The gateway URL is hardcoded twice in `endpoint()`. The removed code derived it from the provider entry `baseUrl` (`${base}/models`). Derive it from `getAnthropicProvider(providerId)?.baseUrl` so the entry stays the single source. | fixed (verified) |
| C7 | low | The `catch` in `refresh()` logs nothing, but its comment says `degradation-audit: reported`. The removed code logged at debug. Either log through a `Logger` passed by the caller, or use the correct audit category for a silent optional capability. | fixed (verified) |
| C8 | low | `User-Agent: 'Ptah model catalog'` differs from the repo value `'Ptah-Extension/1.0'` used by the other public fetches in this lib. Use the repo value. | fixed (verified) |
| C9 | info | A gateway model with more than one `api` key gets no live route (safe default, matches the "no guess" decision). | accepted |
| C10 | info | `supportsToolUse` for a live-only id falls back to "all static siblings of the same protocol support tools" when the gateway gives no capability. Not a name guess. | accepted |

## B3 Kimi Code (`provider-rpc.handlers.ts`, `kimi-code-model-merge.ts`)

The lane found `GET https://api.kimi.ai/coding/v1/models` (HTTP 401 without a
credential). No successful payload was observed: no request ran with a
credential.

| ID | Severity | Finding | Status |
| -- | -------- | ------- | ------ |
| C13 | medium | `mergeKimiCodeModels` removes each static model that the live payload does not name. The payload shape and its id namespace are not observed, so a different id form removes every reviewed row. Required: union. Keep all static rows in their order, then add each live id that equals no static id (also after removal of a trailing `[...]` suffix). | fixed (verified) |
| C14 | low | The URL `https://api.kimi.ai/coding/v1/models` is hardcoded in the handler. Derive it from `getAnthropicProvider('kimi-code')?.baseUrl` (`https://api.kimi.ai/coding/`) + `v1/models`. | fixed (verified) |
| C15 | low | The `catch` and the `!response.ok` branch log nothing. The other fetchers in this handler log at debug through `this.logger`. Log the status or `error.message` only, never a header. | fixed (verified) |
| C16 | info | A live-only row gets `supportsToolUse: true`, the shared Kimi capability list and `contextLength: 0`. All Kimi Code models use one runtime, and `0` is the repository convention for an unknown window. | accepted |
| C17 | info | Lane open item: a live-only Kimi id used as a tier gets no `..._SUPPORTED_CAPABILITIES` env, because `getStaticModelCapabilities` reads static entries only. Not in the scope of this task. Report in the pull request. | accepted |
| C18 | info | Header shape (OAuth: `Authorization: Bearer` and `x-api-key`; stored key: `x-api-key`) equals `kimi-code-translation-proxy.ts:145-151`. | accepted |

## Test failures seen in the B4 verification run (auth-providers)

- `provider-models.opencode.spec.ts` (2 tests): stale mock of the removed
  axios path; the lane fixed the spec after its run. Needs a new run.
- `codex-account-usage.service.spec.ts` (2 tests): expected path
  `D:\...\synthetic-codex-home`, received `d:\...` (drive-letter case of the
  lane's shell working directory). Environment, not this task.
- `plan-usage.service.spec.ts` (1 test): 5000 ms timeout while three heavy
  checks ran on the machine. To confirm in the coordinator's final run.

## B5 tier defaults (`provider-auth-resolver.ts`)

Rule in the diff: override first. Then the static default, unless a known
live catalog does not name it and a derived tier exists. Codex, Copilot and
both OpenCode providers are exempt, because their lists hide models for
reasons other than availability.

| ID | Severity | Finding | Status |
| -- | -------- | ------- | ------ |
| C19 | medium | `draft-verification.service.spec.ts` (4 tests) failed in the B5 run: its `ProviderModelsService` mock had no `getCachedModelIds`, so the real resolver threw before the probe. Not a product defect: the real service has the method (`provider-models.service.ts:786`). The coordinator added `getCachedModelIds: jest.fn(() => null)` to the mock. No other spec constructs the real resolver with a partial mock. | fixed (verified) |
| C20 | info | An empty-string override now falls to the static default. Before, it won the `??` chain and then set no tier. `getModelTiers` returns `null` for an unset tier, so no stored value changes behavior. | accepted |
| C21 | low | The exempt provider ids are a literal list in the resolver. A registry flag on the provider entry would keep the knowledge with the entry. For the independent reviewer to weigh. | open (reviewer) |
| C22 | info | Kimi Code interplay: with the C13 union, every static Kimi id is always in the fetched list, so a Kimi static tier default is never replaced. With the current filter merge, an unobserved payload could replace all three. C13 is thus required before delivery. | linked to C13 |

## Test failures seen in the B5 verification run (auth-providers)

- `draft-verification.service.spec.ts` (4 tests): C19.
- `codex-account-usage.service.spec.ts` (2 tests): owner key hash and home
  path differ only by the drive-letter case (`d:` in the lane shell). Seen
  in the B4 run also. To classify in the coordinator's final run.
- `plan-usage.service.spec.ts`: did not fail in this run (load-dependent).

## Coordinator run of `auth-providers` (final state of B4, B5, C19)

`npm run verify -- -p @ptah-extension/auth-providers`, lock released
2026-11-10T00:51:35Z, exit code 1.

- Lint and typecheck: 2 of 2 passed.
- Test: 90 suites passed, 1 failed, 1 skipped. 2668 tests passed, 2 failed,
  10 skipped.
- All suites of this task passed: `opencode-live-routes`,
  `provider-models.opencode`, `provider-models.service`,
  `provider-auth-resolver`, `draft-verification.service`. `plan-usage`
  passed also (the earlier timeout was load-dependent).
- Failed suite: `codex-account-usage.service.spec.ts`, 2 tests ("keeps live
  updates for two homes and owners separate", "delivers fresh evidence from
  the first read on a cold cache"). The spec builds the expected home with
  `resolve('synthetic-codex-home')` (drive `D:`), and the service returns
  the same path with drive `d:`. The owner key hash differs for the same
  reason. `git status -- libs/backend/auth-providers/src/lib/providers/codex/`
  shows no change by this task. Classified: environment (drive-letter case
  of the shell on Windows), not this task. Not confirmed on `main` by a
  separate run. The CI result of the pull request is the reference.

## Coordinator run of `shared` and `rpc-handlers` (final state of B1, B3)

`npm run verify -- -p @ptah-extension/shared,@ptah-extension/rpc-handlers`,
lock released 2026-11-10T00:59:13Z, exit code 0. Lint and typecheck 4 of 4,
test 2 of 2. No source file under `apps/` or `libs/` reads the removed
`isRecommended` field (one spec asserts that it is absent).

## B3 fix lane notes

- The lane moved the `getAnthropicProvider` import of the handler from
  `@ptah-extension/agent-sdk` to `@ptah-extension/shared` (its source). No
  spec of this handler mocks one of the two modules. Accepted.
- `SDK_KIMI_CODE_AUTH` is registered in
  `auth-providers/src/lib/providers/register-providers.ts:122`, and
  `auth-rpc.handlers.ts:133` injects it without the optional flag. The
  coordinator added `{ isOptional: true }` to the new injection so that it
  agrees with the optional parameter type.

## Independent review of B2 by `codex` (`code-logic-review-b2.md`, verdict REVISE)

| ID | Severity | Finding | Decision |
| -- | -------- | ------- | -------- |
| B2-1 | medium | A session model that is not in the list has no selected row. | Disputed, no change: behavior from before this task (`effectiveModel` is not changed), and the trigger shows the model that the session really uses. Reported in the pull request. |
| B2-2 | medium | DOM ids of the toggle, the section and the option rows repeat across picker instances. | fixed (B2 fix lane: per-instance id suffix + spec; verified) |
| B2-3 | low | The refresh-on-open spec proved only the call count. | fixed (B2 fix lane: pending and rejected refresh specs; verified) |

## Coordinator run of `chat` (final state of B2 and the B2 fix)

`npm run verify -- -p @ptah-extension/chat`, lock released
2026-11-10T01:02:06Z, exit code 0. Lint and typecheck 2 of 2, test 1 of 1.

## Coordinator runs of `cli-agent-runtime`, Electron and the renderer

- `npm run verify -- -p @ptah-extension/cli-agent-runtime`, lock released
  2026-11-10T01:08:36Z, exit code 0. Lint and typecheck 2 of 2, test 1 of 1.
- `npm run verify -- -t typecheck -p ptah-electron,ptah-extension-webview`,
  lock released 2026-11-10T01:10:20Z, exit code 0. Typecheck 2 of 2.

## Cause of the `codex-account-usage.service.spec.ts` failure (not this task)

`normalizeCodexHomeKey` (`libs/backend/codex-runtime/src/lib/codex-home-path.ts:20`)
changes the full home key to lower case on `win32`. The spec compares that
key with `resolve('synthetic-codex-home')`, which keeps the drive letter
of the shell (`D:`). All other path segments are lower case already, so the
two values differ only by the drive letter. The spec passes on Linux and
in a Windows shell whose working directory has drive `d:`. This task
changed no file in `codex-runtime` or in `providers/codex`.

## Independent review of the backend batches by `Glm` (`code-logic-review-backend.md`, verdict REVISE)

Scope: `sdk-model-service.ts`, `opencode-live-routes.ts`, the OpenCode
proxy hook, `provider-models.service.ts`, `provider-auth-resolver.ts`.
R2 to R6 met. Round 1 of at most 2.

| ID | Severity | Finding | Decision |
| -- | -------- | ------- | -------- |
| RB-1 | medium | A catalog restored through `hasCachedModels()` (model pre-flight of a chat query) did not schedule the revalidation, so a saved catalog of a third-party provider stayed stale. | Confirmed (`sdk-model-service.ts`: only two of three restore paths scheduled). Fixed by the coordinator: `restorePersistedCatalog` schedules the revalidation itself; new spec "schedules the probe when hasCachedModels() restores the rows". Test run pending. |
| RB-2 | medium | The B5 tier rule was only in `ProviderAuthResolver.buildTierValues`. `ProviderModelsService.applyPersistedTiers` (chat path) and `WorkspaceProviderProfileResolver.applyProviderTiers` kept the old chain, so one tier alias gave different models per surface. | Confirmed by a read of the three sites. In fix: `codex` lane moves the rule into one method of `ProviderModelsService` used by the three sites (`rb2-fix-report.md`). No test run by the lane. |
| C21 | low | Reviewer opinion: acceptable as a follow-up (a registry flag is new vocabulary; the literal fails in the safe direction). | accepted (follow-up; the RB-2 fix keeps one named constant beside the rule) |

## Independent review of the RPC and shared batches by `Glm`

Source: `code-logic-review-rpc-shared.md`. Verdict: REVISE with two low findings.
The review found no medium or high defect.

| ID | Severity | Decision | Change |
| --- | --- | --- | --- |
| RS-1 | low | Fixed by the coordinator (comment only) | `model-picker-groups.ts`: the doc comment of `modelPickerGroups` now states that a catalog with fewer than two alias rows stays flat, and why. The behavior and its spec (`one alias -> flat`) did not change. |
| RS-2 | low | Fixed by the coordinator | `kimi-code-model-merge.ts` exports `isKimiCodeModelsPayload`. `registerKimiCodeDynamicFetcher` logs one debug line (`Kimi Code model catalog has an unknown shape`) with the payload type and the top-level keys only when a 2xx payload fails the schema. The merge result did not change. Specs added in `kimi-code-model-merge.spec.ts` and `provider-rpc.handlers.spec.ts`. |

## Invalid verification run (not a code defect)

The `agent-sdk` run that ended at 02:11:52Z had exit code 1. Each failed suite showed
`TS2305: ... has no exported member 'isKimiCodeModelsPayload'`. The coordinator wrote the
RS-2 files while that run compiled, so the run saw `providers/index.ts` after the edit and
`kimi-code-model-merge.ts` before it. The export exists. The run is repeated after the
RB-2 lane completes, with no file write during the run.

## RB-2 correction (`codex` lane, read by the coordinator)

Source: `rb2-fix-report.md`. The tier rule is now one method,
`ProviderModelsService.resolveEffectiveTiers(providerId, userTiers)`. The exempt
providers are one constant, `FILTERED_TIER_CATALOG_PROVIDERS`. Three sites call the
method: `applyPersistedTiers` (chat path), `ProviderAuthResolver.buildTierValues` (lane
path) and `WorkspaceProviderProfileResolver.applyProviderTiers` (workspace profile path).
No other production caller holds a copy of the old chain. The coordinator read the full
diff of the three sites and the two changed partial mocks, and found no defect. The lane
ran no tests. The coordinator run and the round 2 review by `Glm` follow.

## Review round 2 by `Glm` and the final coordinator runs

Source: `code-logic-review-round2.md`. Round 2 confirmed the corrections for RB-1, RB-2,
RS-1 and RS-2 (each "Fixed: yes") and gave one new low finding.

| ID | Severity | Decision | Change |
| --- | --- | --- | --- |
| R2-1 | low | Fixed by the coordinator | `clearModelTier` held a copy of the old chain (`static ?? derived`). It now reads `resolveEffectiveTiers(providerId, {})[tier]`. One spec added: the cleared tier falls back to the live tier when the known catalog lacks the registry default. |

Coordinator run at 02:14:40Z-02:21:51Z for `auth-providers`, `agent-sdk`, `shared`,
`rpc-handlers`: lint and typecheck passed for the four projects (8 tasks). Tests passed for
`agent-sdk`, `shared` and `rpc-handlers`. `auth-providers:test` failed: two spec files of
the RB-2 lane did not compile (`TS1361`, `ProviderModelsService` imported with
`import type` but used as a value), plus the two `codex-account-usage` tests. The
coordinator changed the two imports to value imports and made the R2-1 correction.

Coordinator run at 02:22:25Z-02:23:38Z for `auth-providers`: lint and typecheck passed.
Tests: 90 suites passed, 1 failed, 1 skipped (2677 tests passed, 2 failed, 10 skipped). The
2 failed tests are the `codex-account-usage.service.spec.ts` tests (Windows drive-letter
case, files not changed by this task).

No round 3 review ran (the limit is two rounds). R2-1 is a one-line change that uses the
method that round 2 examined.

## CI finding on head 14bd38192: degradation-audit ratchet

- Job `checks` failed in `degradation-audit:lint`. All other jobs passed (test shards 1-4,
  typecheck, electron-e2e, webview-e2e, git-real-git, docs-build).
- Cause 1: the Kimi Code fetcher catch in `provider-rpc.handlers.ts` used the suppression kind
  `fallback`. The audit accepts only `optional-capability` and `reported`. Result:
  `libs/backend/rpc-handlers: 2 FAIL (baseline 1)`.
- Cause 2 (found in the local full audit): the two `new URL` catches in
  `isPersistableCatalogKey` (`sdk-model-service.ts`) had no suppression comment. Result:
  `libs/backend/agent-sdk: 6 FAIL (baseline 4)`.
- Correction: comment-only. Each of the three catches now has a
  `// degradation-audit: optional-capability - <reason>` comment. No baseline changed.
- Local full audit after the correction: exit code 0, `agent-sdk: 4 ok (baseline 4)`,
  `rpc-handlers: 1 ok (baseline 1)`, `auth-providers: 23 ok (baseline 24)`, TOTAL 214.
- The local `codex-account-usage.service.spec.ts` failure did not occur in CI (test shards
  1-4 passed). It is specific to the local Windows machine.
