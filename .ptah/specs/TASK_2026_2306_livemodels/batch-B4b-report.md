# Backend implementation: `TASK_2026_2306_livemodels`, batch B4b (B4b.1, B4b.2)

**Verdict**: B4b.1 and B4b.2 are implemented to the plan, including Revisions 1 and 2. All
focused checks are green for the touched projects: specs, lib and spec typecheck, eslint
(0 errors) and degradation-audit (0 unsuppressed sites). One check is not green. The
`rpc-handlers` **spec** typecheck shows 9 errors that already existed. They are in B4a-owned
specs, and none of them involves a file this batch touched (see Checks). Nothing is staged or
committed.

Worktree: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`.

## Assumption A7 (`agy models` output)

**A7 verified.** I ran `agy models` once through the PowerShell tool on 2026-11-22, with agy
`1.5.14` at `C:\Users\abdal\AppData\Local\agy\bin\agy.exe`. The command ran locally and took no
model turn.

- **stderr**: the status line `Fetching available models...`.
- **stdout**: 27 lines in the form `id<TAB>name`. Every Gemini 4, Gemini 3.8 Flash and Claude 5.5
  id is listed only **with** its effort suffix, for example `claude-sonnet-5-5-medium`. Three
  ids have no effort suffix: `gemini-pro-orchestrator`, `-neon` and `-argon`.
- **gpt-oss**: `gpt-oss-120b-medium` is the only variant.
- **Design consequence**: the bases are the live ids with the effort suffix removed.

The raw output is in `.ptah/tmp/agy-models.log`. The full stdout is pinned as `AGY_MODELS_STDOUT` in
`antigravity-cli.adapter.spec.ts`, with a parse case. A 6-line subset of it is in
`antigravity-cli.adapter.acp.spec.ts`.

## Files

### B4b.1: CLI adapters

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\copilot-sdk.adapter.ts`
  - Deleted `COPILOT_MODELS` and the `COPILOT_PROVIDER_ENTRY` import.
  - `listModels()` returns `[]`. Its doc names the host LM API and the account `/models` endpoint as the live sources.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\copilot-sdk.adapter.spec.ts`: the two static-list cases became one `[]` case.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\cursor-cli.adapter.ts`
  - Deleted `FALLBACK_MODELS`. `sdk.Cursor.models.list({ apiKey })` is now the only source.
  - No key: returns `[]` with a debug log ("lane is not configured").
  - Empty list: returns `[]` with a warn. The warn text no longer mentions a fallback.
  - Throw: logs the redacted SDK message at debug, then throws `new Error('Cursor models.list() failed')`. The error has no `cause`, so no key material can travel with it.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\cursor-cli.adapter.spec.ts`: covers:
  - no key returns `[]` and never calls the SDK (debug log, no warn)
  - an empty list returns `[]` and the warn has no "fallback" wording
  - a throw rejects with the fixed error
  - the key-redaction case now asserts the rejection plus a redacted debug log, with no secret in any logger call
  - the settings-read case now gives the list mock a value
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\cli-adapter.interface.ts`: the `isFallback` doc now says "Set by classification when no account source confirmed the CLI's id. Adapters never set it".
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.ts`
  - Deleted `AGY_EFFORT_MODEL_BASES` and `AGY_STALE_MODEL_IDS`. `AGY_EFFORTS` is kept, and I added `export type AgyEffort` and `isAgyEffort`.
  - `agyModelId(value, liveIds, logger?)`:
    - The id is the first tab segment.
    - If the id is live, or no ids are known, it is returned unchanged.
    - Otherwise it is mapped with `closestLiveModel` against the live bases (effort suffix removed). A match is logged at `warn` and used.
    - With no match, the id passes unchanged.
  - `agyModelWithEffort(model, effort, liveIds, logger?)`:
    - An id that already has an effort suffix is unchanged.
    - `<model>-<effort>` is used when that id is live.
    - Otherwise the model is unchanged and no effort is appended. If live ids are known, this logs at `warn` (review minor 2); if none are known, at `debug`.
  - `buildAntigravityArgs(options, prompt, useStreamInput, liveIds, logger?)`.
  - The adapter keeps `lastModelIds { ids, at }` (process lifetime) and `modelIdsInFlight`:
    - `listModels()` goes through `readModels(binary)`, which records the ids when the read is non-empty.
    - `currentModelIds(binary)` returns the ids while they are under 10 minutes old (by the adapter's `now()` seam). Otherwise it starts one shared 8 s `agy models` probe.
    - A probe that lists nothing gives `null`. A probe that throws gives `null` with a warn and a `degradation-audit: reported` marker.
  - Both readers await it: the stream-json lane at the `buildAntigravityArgs` call, and the ACP lane where it builds the `model` option. The stream-json lane probes **only when a model is chosen**.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.spec.ts`
  - Spec harness:
    - The A7 fixture is pinned in `AGY_MODELS_STDOUT`.
    - `servedModels` makes the runSdk specs' `agy models` spawn print the fixture and close. The listModels specs keep driving `currentChild`.
    - `runSpawnCalls()` and `modelProbeCount()` helpers were added. The run-argument assertions read the lane spawn, not the probe.
  - New cases:
    - the pinned output parses
    - a retired `id<TAB>name` resolves to the closest base, `claude-sonnet-5-5`, with a warn
    - a retired id with an effort resolves to `claude-opus-5-5-high`
    - with no live ids, the model is unchanged and no effort is added
    - for an unknown base (`gemini-pro-orchestrator` + `high`), no suffix is added and a warn is logged
    - two concurrent spawns share one probe, and a third spawn uses the cache
    - the cache refreshes after 10 minutes (9:59.999 still cached, 10:00 probes again)
    - no model means no probe
  - Two role-delivery assertions now ignore the probe spawn ("no lane spawn", "MCP write before the lane spawn").
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.acp.spec.ts`
  - The ACP lane's `beforeEach` serves the `agy models` probe from the fixture subset. Any other spawn throws.
  - The legacy-id case now expects the closest base `claude-sonnet-5-5`. agy's ACP `model` option accepts a base, and the effort travels as `thought_level` (`antigravity-acp-profile.ts:28-32`).
  - New case: with no live ids, the saved id is sent unchanged.

### B4b.2: Ptah CLI registry and lane-routing readers

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry.ts`
  - Removed the `seedStaticModelPricing` import and its 3 calls. Switched `buildStaticTierCapabilityEnv` to `buildTierCapabilityEnv`.
  - Both `modelCount` sites use `this.providerModels.getCachedModelIds(providerId)?.length ?? 0`.
  - `resolveEffectiveTiers(agentConfig)` works per tier:
    - It merges `agentConfig.tierMappings` first, then the `cliAgent` scope.
    - It hands the result to `this.providerModels.resolveEffectiveTiers(providerId, merged)`. That call applies the live-checked preference, then the closest live id, then the live-derived tier.
    - The `staticModels[0]` / `defaultSonnet` rung is gone, and so is the unused `provider` parameter (4 call sites updated).
  - The `buildDefaultTierMappings` doc (old `:1757-1766`) is rewritten.
- MODIFIED the 13 registry specs in the set:
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-auto-compact-argv.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-capabilities.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-harness-preflight.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-inbound-peer.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-kimi-code-signin.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-lmstudio-proxy.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-off-thread-spawn.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-output-style.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-permission-routing.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-plan-limits.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-sakana-proxy.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-spawn-model.spec.ts`
  - `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry.proxy-lease.spec.ts`

  The edit is the same in each file, and only the mock surface changed:
  - The `staticModels` rows and the `seedStaticModelPricing: jest.fn()` mocks are dropped.
  - The `providerModels` mock gains `resolveEffectiveTiers: jest.fn(specTierPreferences)` and `getCachedModelIds: jest.fn(() => null)`.
  - `specTierPreferences` stands in for the service with no catalogue: it returns the caller's tier, else the `defaultTiers` of the provider lookup that the spec already mocks. Each spec therefore keeps its original tier assertions.

  `buildTierCapabilityEnv` comes from the `requireActual` spread, so no extra mock was needed.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\lane-routing\src\lib\child-session\child-model-tier.ts`: `childModelWindow` reads `getDiscoveredContextWindow(model, 'claude-cli')`, then `[1m]` gives 1M, then the existing 200k regex, else `undefined`. The `getAnthropicProvider` / `staticModels` read is gone.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\lane-routing\src\lib\child-session\child-model-tier.spec.ts`
  - The `jest.mock` of shared is removed. Windows are now registered with `replaceProviderContextWindows('claude-cli', …)`, set in `beforeEach` and cleared in `afterEach`.
  - Added `[1m]` cases and an unknown-id case.
  - The 1M Haiku fixture now uses discovery.
  - New case: a window that another provider reports is not read.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\lane-routing\src\lib\matrix\seed-matrix.ts`: comment only. The z-ai row no longer claims membership in `staticModels`, and the two "shipped list" sentences are now past tense.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\lane-routing\src\lib\matrix\seed-matrix.spec.ts`: the static-membership assertion is dropped (old `:28-30` helper and the `toContain(row.model)` check). The lane-family check stays.

## Out-of-set spec fixes (fixture, mock or assertion only; no production file)

- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-tiers.spec.ts`
  - The mock gains `resolveEffectiveTiers`. It returns the caller's tier, else `getPtahCliLaneProvider(id).defaultTiers`.
  - The private-call type and the calls drop the removed `provider` argument.
  - The defaultTiers case also asserts the delegation, with the merged null tiers.
- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-opencode-proxy.spec.ts`: the same `resolveEffectiveTiers` / `getCachedModelIds` mock, plus a `getPtahCliLaneProvider` import. Its assertions that tiers equal the registry `defaultTiers` are unchanged.
- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\cli-agent-runtime\src\lib\ptah-cli\ptah-cli-registry-anthropic-api.spec.ts`: the same mock additions on its inline `providerModels` object.
- `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\lane-routing\src\lib\child-session\child-setting-router.service.spec.ts` (1 case) and `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\backend\lane-routing\src\lib\child-session\child-setting-rule.spec.ts` (1 case): both relied on `claude-sonnet-5-5` being 1M because of the static `claude-cli` rows. Each case now registers that window through `replaceProviderContextWindows('claude-cli', …)` and clears it in `finally`.

## Checks (focused; logs under `.ptah/tmp/`)

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` copilot, cursor, antigravity, acp and mcp adapter specs (`b4b1-jest.log`, `b4b1-jest2.log`) | 5 suites pass, after the fixes |
| same config, `ptah-cli/` directory, all 17 registry specs (`b4b2-jest.log`) | 25 suites / 268 tests pass (the runner lists some suites twice) |
| same config: `cli-detection.service`, `agent-process-manager.account-binding`, `codex-native-selection`, `limit-reader-manifest`, `antigravity-sign-in`, `usage-scope-adapters`, `antigravity-result-diagnostics` (`b4b1-jest3.log`) | 7 / 136 pass |
| same config: `ptah-cli-lane-resumer`, cursor and copilot again after the final edit (`b4b-jest-final.log`) | 3 / 105 pass |
| `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false` (whole lib, 47 specs; `b4b2-lane-jest.log`), then the 4 changed specs (`b4b2-lane-jest2.log`) | First run: 2 failures, fixed above. Rerun: 4 / 126 pass |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` and `tsconfig.spec.json` | exit 0, exit 0 |
| `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` and `tsconfig.spec.json` | exit 0, exit 0 |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` | exit 0 (compiles cli-agent-runtime source) |
| `rpc-handlers/tsconfig.spec.json` (default heap ran out of memory, rerun with `node --max-old-space-size=8192`; `b4b-tsc-rpc-handlers-spec.log`) | **9 errors that already existed**, all in `config-rpc.handlers.spec.ts:1123` and `provider-rpc.handlers.spec.ts:1417-1638`. They come from the B1/B2 `ProviderModelList` / `isStatic` contract, and the fix belongs to B4a. None involves a B4b file. |
| `npx eslint` on all 31 changed files (`b4b-eslint.log`) | 0 errors, 55 warnings |
| `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` (`b4b-degradation.log`) | TOTAL 0 unsuppressed sites |

The eslint warnings were already there (non-null assertions and empty functions in specs, `max-lines`), except one. `cursor-cli.adapter.ts:334` warns `preserve-caught-error`. That is on purpose, and a comment explains it: a `cause` could carry the key.

Grep gates, all empty:
- `COPILOT_MODELS`, `FALLBACK_MODELS`, `AGY_EFFORT_MODEL_BASES` and `AGY_STALE_MODEL_IDS` across `libs` and `apps`
- `isFallback: true` in `cli-adapters/`
- `staticModels`, `seedStaticModelPricing` and `buildStaticTierCapabilityEnv` in `ptah-cli/` (production and specs)
- `staticModels` in `lane-routing/src` and `cli-agent-runtime/src`

Removed-symbol spec sweep: I grepped for every spec in `libs/backend` that references the Cursor, Copilot or agy adapters or the registry, and ran each one. They are all in the rows above.

Not run, as the brief says: `npm run verify`, `nx`, build, serve, e2e and container smoke specs. I also did not typecheck `cli-engine` or `platform-cli`; the gate runs them. No exported adapter signature they use changed. `agyModelId`, `agyModelWithEffort` and `AgyEffort` have no reader outside this file.

## Decisions

- **Closest-base result.** `agyModelId` returns the bare live base (for example `claude-sonnet-5-5`), not one suffixed id picked by a literal effort.
  - Options: the bare base, or `<base>-medium`.
  - Evidence: the plan says "retired id -> closest base". `antigravity-acp-profile.ts:28-32` says agy's `model` option takes the base. The stream-json lane then lets `agyModelWithEffort` add the requested effort when `<base>-<effort>` is live.
  - Reversible.
- **Logging hook.** I added an optional trailing `logger` parameter to `agyModelId`, `agyModelWithEffort` and `buildAntigravityArgs`. The plan wants these functions to log at warn or debug, and they are module functions with no logger of their own. The change is additive to the contract's 3- and 4-argument shapes. Reversible.
- **Probe only when needed.** The stream-json lane probes `agy models` only when `options.model` is set. Without a model, no id needs deriving, and this keeps the plan's "at most one 8 s probe per spawn" budget. The ACP lane probes only under the same condition.
- **Freshness.** Freshness uses the adapter's existing `now()` seam (`acp.now`), so specs control the clock.
- **Cursor empty-list check.** The empty-list check filters out rows with an empty id, so `[{ id: '' }]` counts as empty.

## Plan deviations

- **Registry cascade inputs.** The registry's own cascade no longer reads `provider.defaultTiers`. The service reads the preference from `getPtahCliLaneProvider(providerId)`. For built-in and custom providers that is the same entry `resolveLaneProvider` returns, so behaviour holds. The registry specs mock `getAnthropicProvider`, so their `specTierPreferences` stand-in reads that mock.
- **Registry signature.** `resolveEffectiveTiers` lost its unused `provider` parameter. This is private, so the only knock-on was the out-of-set tiers spec.

## Out-of-scope observations

- `cursor-cli.adapter.ts:149` `DEFAULT_CURSOR_MODEL = 'composer-2.5'` is a spawn default when the caller picks no model. It is not a list, but it is a repo literal model id. It is not in the plan.
- The `rpc-handlers` copilot fetcher keeps its static step until B4a.1 (validation note). Until then the Copilot lane shows no models through `agent:listCliModels` (adapter `[]`).
- The `rpc-handlers` spec typecheck errors listed above are expected to clear in B4a.
- `copilot-sdk.adapter.ts` and `ptah-cli-registry.ts` already exceeded `max-lines` before this batch (warning only).
