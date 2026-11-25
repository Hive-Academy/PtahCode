# P1 code-logic review — slice A
Reviewer family: claude (CLI lane). Implementer families of this slice: codex (G-Shared-RPC,
G-AgentSdk-Stream, G-AgentSdk-Dispatch, G-Setup-RPC-Integration electron part), antigravity
(G-Storage-Core, G-Setup-Scope-Resolver), kimi (G-Shared-SkillDoc, G-Storage-Adapters), Ollama Code
(G-AgentSdk-Port, G-Wizard-Client, G-Fixtures).

## Verdict: REVISE   Score: 7/10

Score rationale: the atomic `setMany` path, strict `resolveSetup`, SDK terminal and pre-launch
abort are correct and well tested (8 band). One Major finding on the `onProviderSubmit`
attribution contract, which the plan names as Blocking-class (Finding 26, R14/F26), keeps the
score out of the 8 band. Nothing is wrong at the foundation (not the 5-6 band).

## Findings

1. [Major] `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:504-508` —
   `onProviderSubmit` derives the submitted provider from
   `getActiveProviderId(options.env) ?? ANTHROPIC_DIRECT_PROVIDER_ID`. That helper
   (`sdk-query-options-builder.ts:224-254`) matches the base-URL hostname against the registry
   and returns the FIRST match, or `null`. Consequences for a Setup snapshot whose
   `providerId` is known (`workspace-provider-profile-resolver.ts` `buildSetupProfile`):
   - `ollama-cloud` through the local daemon has base URL `http://127.0.0.1:11434`, the same as
     `ollama` (`local-provider-entry.ts:36` and `:79`) → `pairAttempted.provider = 'ollama'`.
   - `ollama-cloud` with a cloud key uses `OLLAMA_CLOUD_DIRECT_BASE_URL` (`https://ollama.com`),
     which no registry entry has → `pairAttempted.provider = 'anthropic'`.
   - Any provider with a custom `provider.<id>.baseUrl` → `'anthropic'`.
   - Two entries on one host (`opencode-provider-entry.ts:69` and `:93`) → the first id.
   Why it matters: plan line 397 requires the "canonical provider ID actually submitted", and the
   UI shows `stage.pairAttempted ?? stage.pairConfigured` (plan line 570). The stage record then
   names a different provider than `pairConfigured` for the same dispatch, and a dedup of equal
   pairs (plan line 197) fails. No spec covers a provider other than openrouter (proxy
   placeholder token), so the tests pass. Suggested fix: carry the resolved `providerId` with the
   one-shot input (for example `OneShotAuthOverride.providerId` or `dispatch.overrideProviderId`
   from the Setup snapshot) and prefer it over the hostname heuristic. Add a spec for
   `ollama-cloud` and a custom base URL.

2. [Minor] `libs/backend/platform-core/src/file-settings-manager.ts:314-318` — `setMany` calls
   watchers inside the queued `runBatch`, after the in-memory commit. A watcher that throws makes
   `setMany` reject although disk and `this.settings` already hold the new values. Then
   `ReactiveSettingsStore.writeGlobalBatch` (`reactive-settings-store.ts:110`) never updates its
   `globalCache`, so `readSetupPair()` keeps the OLD pair while disk has the NEW pair, and
   `wizard:set-setup-model` reports `PERSISTENCE_UNAVAILABLE` for a write that succeeded. `set()`
   calls watchers outside the write and after the await, so it has a smaller version of this
   issue only. Suggested fix: call each watcher in `try/catch` (log and continue), or call the
   watchers after `await write` as `set()` does.

3. [Minor] `libs/backend/platform-core/src/file-settings-manager.ts:290-308` — order against
   `set()` on the same key: if `setMany({k})` is queued and a later `set(k, y)` runs before the
   batch step, the batch builds `nextImage` from memory (`y`), overwrites `k`, and then assigns
   its own value. The later `set()` resolves and fires its watcher with `y`, but memory and disk
   hold the older batch value (lost update). Today no caller writes `setup.*` with `set()`
   (`settings-rpc.handlers.ts:80-84` denies them), so the impact is theoretical. Record it in the
   `setMany` doc comment, or skip keys whose `writeGenerations` changed after the call was queued.

4. [Minor] `libs/shared/src/lib/utils/skill-document.ts:30-33` — `serializeSkillDocument`
   escapes `"` but not `\` in `name` and `description`, and not newlines in `name`. A name or
   description that ends in `\` gives `"...\"`, an unterminated YAML string. This is byte-parity
   with the escaping on `main` (`harness-fs.service.ts:103`), so it is not a regression, but
   `wizard:generate-skill-draft` now sends AI-derived text through it. Escape `\` first (both
   writers stay identical because they share this function now), and pin it with a spec.

5. [Minor] `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:642`
   — `buildSetupProfile` calls `proxyPool.acquire` for proxy providers. `resolveSetup` runs on
   every `wizard:get-setup-model` and again after each `wizard:set-setup-model`
   (`setup-rpc.handlers.ts:379`, `:409`), so a state read can start a proxy process. I did not
   confirm whether the pool reuses one instance per (workspace, provider). If it does not, this
   leaks proxies. Confirm the reuse, or add a check-only mode for state reads.

## Write-path trace

| Write | Key / scope | Value format | Runtime reader | Side effects | Result |
| --- | --- | --- | --- | --- | --- |
| `WorkspaceScopeResolver.commitSetupPair` → `ReactiveSettingsStore.writeGlobalBatch` → `FileSettingsStore.writeGlobalBatch` → `PtahFileSettingsManager.setMany` | `setup.provider`, `setup.model`, global only (no app or workspace prefix; `rpc-auth.types.ts:693-694` global-only) | trimmed string; `''` for clear (stored as `''`, not deleted) | `readSetupPair()` → `readGlobalMany` (reactive cache, else backend `getMany`) → `normalizeSetupKey` (`''` → `null`) → `WorkspaceLlmResolver.resolveSetup` | one temp-file + rename; `writeGenerations` +1 per key; no routing generation bump (not routing keys); per-key watchers; reactive cache and emitter after commit in FIFO order | intended. Partial stored values stay partial (`provider-missing` / `model-missing`), no silent fallback |
| defaults | `FILE_BASED_SETTINGS_DEFAULTS` `setup.provider: ''`, `setup.model: ''` (`file-settings-keys.ts:455-456`) | `''` | same reader → `null`/`null` → unset path | none | intended (unset = workspace effective pair, strict) |
| generic `settings:set` | same keys | — | — | denied (`settings-rpc.handlers.ts:80-84`) | intended, keeps the pair atomic |

## Checked and OK

- C1 compliance: `set()` is unchanged from `main` (optimistic update, queued `persist()`, rollback
  by write generation and reload epoch). `setMany` chains on `writePromise` with both handlers,
  persists only `nextImage` through the shared `persistImage` (temp file + rename), and mutates
  memory, generations and watchers only after the rename. On failure memory is unchanged and the
  queue keeps accepting writes. The test `set() behavior is unchanged ...` exists
  (`file-settings-manager.spec.ts:1260`). The removed test is absent.
- `ReactiveSettingsStore.writeGlobalBatch`: the backend promise gets a catch handler at once (no
  unhandled rejection), publication is FIFO and survives an earlier rejection, and the cache is
  updated only from the committed slice. `readGlobalMany` falls back to `readGlobal` per key for
  non-batch backends.
- `commitSetupPair`: rejects non-string and half pairs before I/O, needs a batch store, and builds
  the receipt only from the committed slice (not a later read).
- `resolveSetup` (auth-providers): set path maps `claudeCli`/`apiKey`/`anthropic`/registry ids,
  refuses `openai-codex` and provider-session ids, rejects tier aliases (`model-stale`), checks the
  cached catalogue, disambiguates `anthropic` by credential probe, and builds an isolated auth env
  (empty `ANTHROPIC_*` where not used). The unset path never reads chat-tab override or picker.
  `buildSetupProfile` rejects a model that the dispatch-time resolver would rewrite. Proxy
  credentials are checked before `acquire` (`not-signed-in` vs `provider-unavailable`). Logs carry
  provider id, workspace path and error name only, no secret. `resolveDirectApiKey` matches
  `createAuthCredentialProbe` (stored key, then env).
- SDK stream terminal (`sdk-stream-processor.ts`): success carries `resultText` and
  `terminal: success` on all success returns. Error result returns `terminal: provider-error`
  and logs only `subtype` and `errorCount` (raw provider errors no longer logged).
- Pre-launch abort: `SdkQueryRunner.runOneShot` checks the signal after `buildOneShotOptions` and
  before `launch`. `InternalQueryService.execute` checks it after the slot grant and releases the
  slot in its `catch`. `onProviderSubmit` is not called on build failure, abort or queue timeout
  (`InternalQueryQueueTimeoutError` path is unchanged from main and now asserted).
- Merge resolution beac0b1b8 (agent-sdk): `OneShotRunInput` and `InternalQueryConfig` have both
  `onProviderSubmit` and `includeConnectors`, `InternalQueryService.execute` forwards both, and
  `buildOneShotOptions` still uses `includeConnectors`.
- `wizard-rpc.service.ts` no longer sends the chat-tab or picker model (D6).
- Electron DI: `SKILL_JUDGE_SERVICE` and `SKILL_DRAFT_GENERATION_SERVICE` replace
  `SKILL_RANKING_SERVICE` in `expected-resolvable.ts`. The new methods are in the RPC surface spec.
- Focused tests run in this lane (all pass): platform-core `file-settings-manager.spec.ts` (60),
  settings-core `settings-core.spec.ts` + `workspace-scope-resolver.spec.ts` (110), auth-providers
  `workspace-llm-resolver.spec.ts` + `workspace-provider-profile-resolver.spec.ts` (141),
  agent-sdk `sdk-query-runner.service.spec.ts` + `internal-query.service.spec.ts` +
  `sdk-stream-processor.spec.ts` (113).

## Not checked

- platform-vscode: it is not in the slice. If its settings store has no `writeGlobalBatch`,
  `wizard:set-setup-model` fails with `PERSISTENCE_UNAVAILABLE` on VS Code (Electron first, so
  probably acceptable).
- Cross-process staleness: `ReactiveSettingsStore.invalidateCache` has no caller, so a Setup pair
  written by another process is not seen until restart. This is the same for every key on `main`.
- `settings:import` path for `setup.*` keys (rpc-handlers, slice B).
- Proxy-pool reuse semantics (Finding 5).
- Spec files of webview-e2e-harness fixtures, platform-electron/platform-cli adapter specs and
  cron-scheduler (read the diffs only, did not run).
- No `tsc` run (only jest).

## Re-review round 1

Scope: `git show 13fcde258 ac0edd9d7`, `batch-fix-r1-F1-report.md`, `batch-fix-r1-F3-report.md`,
plus the callers and the reactive store around the changed lines.

| ID | Status | Evidence |
| --- | --- | --- |
| A1 (Major, provider attribution) | Closed | `OneShotAuthOverride.providerId` added (`sdk-query-runner.service.ts:174-176`). `onProviderSubmit` now uses `input.auth?.providerId` first (`:506-510`). `HarnessLlmRunner` attaches the snapshot `providerId` to the auth override (`harness-llm-runner.service.ts:173`). `resolveSetup` always returns `auth` through `toSetupSnapshot` (`workspace-llm-resolver.ts:501-511`), so every Setup run reports the canonical id. New `it.each` covers `ollama-cloud` local and cloud URL and a custom base URL (`sdk-query-runner.service.spec.ts:1334`). `providerId` is not read by `buildOneShotOptions` (`:688-699`, `:764-765` use only `env`/`baseUrl`), so it does not change the launch env. Residual (Nit): the non-isolated `resolveForPath` fallback returns no `auth` (`workspace-llm-resolver.ts:129-137`), so it keeps the hostname guess. That path rides the process-wide auth, and the Setup flow does not use it. |
| C3 (pre-submit abort label) | Closed | `harness-llm-runner.service.ts:216` gives `timed-out` only when `submitted && aborted`. A deadline before submission is now `pre-dispatch-error`, and the spec pins both cases (`harness-llm-runner.service.spec.ts:275-278`). |
| A2 (Minor, throwing watcher rejects a committed `setMany`) | Closed | Each batch watcher runs in `try/catch` after the commit (`file-settings-manager.ts:317-327`). `setMany` resolves with `committedSlice`, so `ReactiveSettingsStore.writeGlobalBatch` updates its cache (`reactive-settings-store.ts:111-114`). Spec at `file-settings-manager.spec.ts:1260` asserts the value in memory, after reopen, and delivery to later watchers. The log carries the key only, no value. Residual (Nit, latent): `globalEmitter` is a Node `EventEmitter` (`reactive-settings-store.ts:30`), and `emit` at `:116-118` runs after the cache update without isolation. A throwing `watchGlobal` listener would still reject a committed batch. No listener of `setup.*` exists today (grep found none outside fixtures), and the single-key `writeGlobal` path has the same behaviour on `main`. |
| A3 (Minor, `setMany` can overwrite a later `set()`) | Closed (as triaged: doc comment) | `file-settings-manager.ts:279-281` documents the order rule. `set()` stays unchanged (C1). No caller writes `setup.*` with `set()` (`settings:set` denies these keys). |
| A4 (Minor, backslash not escaped) | Closed | `escapeFrontmatterValue` escapes `\` first, then `"`, `\r` and `\n` (`skill-document.ts:22-28`), and both fields use it (`:37-38`). The order is correct (backslash before the other escapes, so no double escape). Spec `skill-document.spec.ts:95` pins `C:\path`, CRLF and a trailing backslash. |
| A5 (Minor, proxy start on each Setup read) | Closed (no change needed) | `provider-proxy-pool.ts:278-292` reuses a live entry by provider and credential key and replaces only a dead one. `:336-349` shares an in-flight start for the same key. The existing spec `provider-proxy-pool.spec.ts:384` asserts one instance for two acquires. Only the first read, or a read after a credential change, starts a proxy. |

New defects introduced by the fixes: none found. The `auth` spread in `HarnessLlmRunner` creates a
new object, so tests that compared by identity were updated to `toEqual` (`harness-llm-runner.service.spec.ts:113`, `:193`, `skill-judge.service.spec.ts:275-281`).

Focused tests run in this round (all pass): platform-core `file-settings-manager.spec.ts` (61),
shared `skill-document.spec.ts` (17), agent-sdk `sdk-query-runner.service.spec.ts` (65),
rpc-handlers `harness-llm-runner.service.spec.ts` + `skill-judge.service.spec.ts` (31).
Not run: `tsc` (as in round 0).

**Verdict: APPROVED, score 8/10.** All five findings and C3 are closed. Two latent Nits remain:
the hostname fallback on the non-isolated path and the unisolated `globalEmitter.emit` in
`writeGlobalBatch`. Neither affects the current Setup flow. The score is not 9 because of these
two Nits and because `tsc` did not run.
