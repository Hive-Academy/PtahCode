# Code Logic Review — `TASK_2026_2292_p4` (P4 "Chat foundation A", program TASK_2026_2288_acp1)

Base `61cec87d9`, uncommitted worktree `provider-session-p4`. Read in full: the whole `git diff` (26 files) and the new
`provider-session-runtime-refusal.ts`. Spec files read by title and spot-checked for assertions. Read against plan Component 5, the P4
phase row, `plan-review-round-2.md` R2-2 and M-4. I did not run jest: the worktree has no `node_modules`. The implementer's reported
runs were not re-executed.

## Summary

| Metric              | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Overall score       | 7/10                                                                   |
| Assessment          | APPROVED (moderate follow-ups; fix M-1 before P9 persists any session) |
| Blocking issues     | 0                                                                      |
| Serious issues      | 0                                                                      |
| Moderate issues     | 5                                                                      |
| Failure modes found | 7                                                                      |

Score basis: every reachable behaviour is unchanged (no registry entry exists, so no provider id selects the new arm), the Codex and
Claude guards are untouched in order and text, and every S-2/R2-2 site refuses with a spec. It is not 8+ because the workspace key
(M-1) is a one-way decision that is cheap now and expensive after P9, and because a few forward sites still treat a provider session
as "not Codex, so Claude".

## Five logic questions

### 1. How does this fail silently?

- The only catch that returns a value is `providerSessionCallerPath` (`session-metadata-store.ts:~232-246`). It returns the proposed
  caller path when the stored path cannot be normalised. It is annotated `degradation-audit: optional-capability`. It returns a
  validated path (same key as the execution), not a literal, and it only changes the display spelling of the detail row. The identity
  key is unaffected. Acceptable.
- Every other new `catch` rethrows a typed, fixed-text error and drops the cause: `session-metadata-store.ts` (`invalid-identity`) and
  `workspace-provider-profile-resolver.ts` (`workspaceId is invalid`). No path, secret or setting value reaches the text. Compliant
  with the degradation-audit rule: no catch swallows an error and returns a literal.
- Resume of a provider-session record on the chat-continue path is not refused up front. It reaches the routing adapter and is
  refused there (see FM-4). That is a refusal, not a silent success.

### 2. What user action produces unexpected behaviour?

- Reopening the same Windows folder with a different path-segment case (`D:\Proj` vs `d:\proj`) gives "Cannot resume … workspaceId
  changed" (M-1). It cannot happen today (nothing persists a provider session), but the key shape is frozen by P9.
- The carry-over "new session ready" probe (`chat-carry-over.service.ts:448`) answers `true` for a provider-session execution, so a
  carry-over offer could be made and then refused at launch (M-2). Unreachable until a registry entry exists.

### 3. What input data produces a wrong answer rather than an error?

- `normalizeProviderSessionWorkspaceKey` on win32 with a drive-less rooted path (`\foo`, `/foo`): `isAbsolute` is true, `path.resolve`
  then attaches the process cwd's drive, so the key depends on the process cwd (M-1c). Codex rejects this shape explicitly
  (`codex-home-path.ts:34`).
- A stored or requested concrete Claude model id (`claude-sonnet-4-5`, `opus[1m]`, anything that is not exactly `default`, `opus`,
  `sonnet` or `haiku`) is passed to the provider as `seed.model`; `requestedModelIsStored` is ignored (M-3). The tier names themselves
  correctly map to "provider default".

### 4. What happens when a dependency fails?

- Metadata storage failing mid-write: `persistMetadata` and `flush` run inside the queued write and reject to the caller. `emitChange`
  fires only on success, because the throw skips it. Same as Codex.
- `store.get` failing in the identity cache refresh: logged and the old binding is retained (unchanged Codex behaviour). A provider-
  session write has no write-through wrapper, so the cache converges only through that event refresh (FM-5).
- A foreign workspace refuses the write (`unavailable-storage`), mirroring Codex.

### 5. What is missing that the requirements never mentioned?

- A cross-runtime spec: `updateProviderSessionExecution` on an existing Codex row, and `updateCodexExecution` on an existing
  provider-session row. The code refuses both (`session-metadata-store.ts:1532` and `:1725`) but no spec pins it.
- A Windows-casing spec for the new key.
- A frontend mapping for `PROVIDER_SESSION_*` codes (`message-sender.service.ts:~133,380` handle `CODEX_*` only). That is P9 scope; noted
  only so it is not lost.

## Focus 1: Codex and Claude byte-identical

- Metadata store `_saveInternal` (`session-metadata-store.ts:~1952-2050`): the Codex guard block is untouched and runs first. The new
  provider-session block follows it and only fires on provider fields. The merge spreads existing provider fields after the Codex
  spreads. For an existing Codex row neither new spread is active, so the merged object is key-for-key identical. For a provider-session
  row, ordinary saves keep `providerSessionExecution`, `providerSessionThread` and the stored `workspaceId`. A direct write of either
  field, a provider change and an `accountBinding` are all refused. A first write with `providerSessionExecution` set on a row with no
  existing execution also throws, because `JSON.stringify(x) !== JSON.stringify(undefined)`.
- `updateCodexExecution` now reads through `readRuntimeWriteDetail`. The extracted body is line-for-line the old inline block (strays,
  then records with `gate.whenReady`, then async storage, then `getAll`), so the behaviour is identical.
- Cross-runtime isolation holds in code. `updateCodexExecution` refuses an existing provider-session row (`existing && !existing.codexExecution`,
  `:1532`). `updateProviderSessionExecution` refuses an existing Codex or Claude row (`:1725`). `updateCodexUsageCheckpoint` and
  `incrementCodexMessageCount` require `codexExecution`.
- Schema (`session-runtime.schemas.ts`): the Claude and Codex variants are untouched and remain `.strict()`. Old persisted records carry
  no `providerSession` key and still parse. The new variant is additive. `index.zod-free.spec` is reported green.
- `sessionRuntimeIdentityMismatch` (`session-runtime.types.ts`): the order is providerId, workspaceId, runtime, profile, normalizedHome.
  Codex-vs-Codex still reaches `normalizedHome` because `profile` is `undefined` on both sides. `(a.codex ?? a.providerSession)?.normalizedHome`
  is equivalent to the old expression for Claude and Codex.
- Identity cache (`session-runtime-identity-cache.ts`): `nativeExecutionOf(metadata) ?? claude-fallback` equals the old
  `metadata.codexExecution ?? …` for every row that has no provider fields. A row holding both would resolve to Codex, which the store
  guards make impossible. `releaseSession` retains provider-session bindings exactly as it retains Codex. `workspacePaths` is still fed
  only from `codexThread` (FM-5).
- `createCodexRuntimeAdmission.servingProviderId` and `assertCarryOverProvider` were inverted to `runtime === 'claude-sdk' ? … : seed.providerId`.
  For Codex the value is the same `seed.providerId`.

## Focus 2: S-2 / R2-2 sites

| Site                                                                                        | Refusal                                                                                                                                   | Spec (`provider-session-runtime-refusal.spec.ts` unless noted) |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `provider-auth-resolver.ts:165` (`resolve`) and `:556` (`buildDraftOverride`)               | `providerSessionNativeRuntimeRequired`, placed next to the Codex check                                                                    | yes: pinned, inherited and draft                                |
| `curator-proxy-manager.ts:73`                                                               | same                                                                                                                                      | yes                                                             |
| `provider-proxy-pool.ts:233` (M-4 confirmed)                                                | same                                                                                                                                      | yes                                                             |
| `workspace-llm-resolver.ts:~100-108`                                                        | rethrow for a provider-session id, as for Codex                                                                                           | yes                                                             |
| `sdk-internal-query.curator-llm.ts` (3 catches, widened type)                               | `isNativeRuntimeRefusal` (exact message plus provider-session id); `skipUnsupportedProvider` now logs the real provider id                | `sdk-internal-query.curator-llm.provider-session.spec.ts`; the runner is never reached |
| `draft-verification.service.ts` (classifier rule 3 and `preFlightDetail`)                   | `credential-rejected` and a detail rebuilt from the provider id, never quoted                                                             | yes (classifier and verify)                                     |
| `oauth-proxy.strategy.ts:73` (R2-2)                                                         | unconfigured and native-owned result before the Kimi, Codex and Copilot branches                                                          | yes                                                             |
| `auth-manager.ts:170,256` (R2-2)                                                            | `isNativeRuntimeAuthIntent(providerId, ctx)`: provider-session ids always get the native-owned return, tear down the old strategy, and start none | yes: "does not start a Copilot flow" and "tears down the previous strategy" |
| `workspace-provider-profile-resolver.ts:626` (`buildProfile`)                               | throws, like `rejectLegacyCodexProfile`                                                                                                   | `…provider-session.spec` ("strategy rejection")                 |
| `gateway-turn-preparation.ts` (defence in depth) and resolver `consumer !== 'chat'`          | `AuthRequiredError` with providerId                                                                                                       | `gateway-turn-preparation.provider-session.spec`                |

Grep for missed sites. Every non-test backend branch on `openai-codex` or `isNativeCodex*` was read:

- `sdk-query-runner.service.ts:380` and `sdk-query-options-builder.ts:227` key on the Codex proxy token placeholder. No provider-session
  provider ever gets a proxy token, because the resolver and the strategy refuse first. Plan: "unchanged". OK.
- `gateway-native-resume-policy.ts:28-31` and `gateway-chat-bridge.ts:805,955`: `isNativeCodexBinding` is false for a provider-session
  identity, so a gateway turn bound to one flows to `prepare`, where the resolver refuses it (`consumer !== 'chat'`). OK.
- `provider-models.service.ts:100`, `provider-rpc.handlers.ts:384`, `connection-check.ts:70-82`, `auth-command-runner.ts`,
  `translation-proxy-base.ts`, `provider-quota.store.ts`, plan-limit and owner files: provider-id-specific branches. No provider-session
  entry exists, so unreachable. They belong to P8/P9 (status probe, connection check, rows). No P4 gap.
- No missed S-2 site.

## Focus 3: Resolver branch

`workspace-provider-profile-resolver.ts:~275-440`:

- It sits after the Codex branch and before the Claude path. A stored Codex or Claude identity returns `undefined` from
  `providerSessionTarget` and keeps its runtime. Only a stored provider-session identity, or a new session whose active provider has a
  profile, enters it. The Codex branch is not reordered.
- Gateway and lane consumers throw `AuthRequiredError` with `providerId` (A9). A host that does not list the profile in
  `providerSessions` throws. Order: consumer, then capability, then workspace, then resume, then model.
- Resume mismatch: the profile is recomputed from the stored `providerId` through the registry. A provider that is no longer a provider
  session gives `profile changed`. A different stored profile gives `profile changed`. A stored home with no current home gives
  `normalizedHome changed` (documented, deviation 8). The compared `providerId` is copied from the stored identity on both sides, so
  `providerId` can never mismatch. That is intentional, since a stored session keeps its provider.
- Tiers: `default`, `opus`, `sonnet`, `haiku` and blank give `model` absent. See M-3 for concrete Claude ids.
- `AuthRequiredError("… workspaceId is invalid")` carries `providerId`, so the UI may render it as a sign-in problem (M-5).

## Focus 4: interim compile fixes (five files)

- `routing-agent-adapter.ts:122,150,335`: both start paths refuse when the serving provider is a provider-session id. The identity switch
  throws `ChatRuntimeAdmissionError` for a stored provider-session identity, so a provider session is never served by the legacy SDK
  adapter. The refusal precedes the Codex checks. Codex and Claude flows are untouched.
- `chat-session.service.ts:1840` (`launchSdkSession`, the single start funnel): `refuseProviderSessionExecution` runs after the carry-over
  pin and before `onCarryOverAdmitted`, the lineage entry and the adapter call. It throws a coded `RpcUserError('PROVIDER_SESSION_UNAVAILABLE')`.
  The resume path (`:3169-3260`) has no up-front refusal. A provider-session identity falls into the non-Claude `resumeConfig`
  branch, and `resumeSession` is refused by the router (FM-4). Safe, but with a different error shape.
- `chat-slash-command-router.service.ts:345`: refused right after `prepare`, before manual-compact admission. OK.
- `codex-chat-host-ports.ts:264`: admission now reports `seed.providerId` for any non-Claude arm. It is the same for Codex. The router
  then refuses. `:372` (`!== 'codex-app-server'` throws) is safe.
- `gateway-turn-preparation.ts`: the arm throws `AuthRequiredError`. The resolver has already refused, so it is unreachable.
- `chat-carry-over.service.ts:448` was not touched (M-2).

No path mis-routes a provider session to the Claude SDK.

## Focus 5: `normalizeProviderSessionWorkspaceKey`

- Write/read consistency: the writer (`updateProviderSessionExecution`), the resolver seed and the resume compare all use this one
  function. It is idempotent for ordinary paths (`d:\proj` stays `d:\proj`). The drive-letter case difference is handled: `normalizeWorkspaceRoot`
  lower-cases the drive letter, so `D:\Proj` and `d:\Proj` give the same key.
- Where it is not safe: M-1 (segment case, root idempotence, rooted-without-drive).

## Failure modes

### FM-1 Windows folder case splits one workspace

- Trigger: the same folder is opened as `D:\Proj` and `d:\proj`.
- Symptom: "Cannot resume <provider> session: workspaceId changed."
- Evidence: `session-metadata-store.ts:~226-238` (drive letter only) vs `codex-home-path.ts:43` (whole path lower-cased on win32).
- Current handling: refused, not corrupted. No session is persisted before P9.
- Recommendation: see M-1.

### FM-2 Root workspace key is not a fixed point

- Trigger: workspace `C:\` gives key `c:` (`normalizeWorkspaceRoot` strips the trailing separator). POSIX `/` gives `""`.
- Symptom: re-normalising `c:` throws (`isAbsolute('c:')` is false), which gives "workspaceId is invalid" on resume or a rewrite. `""` fails the `min(1)` schema.
- Evidence: `normalize-workspace-root.ts:34-39`, `session-metadata-store.ts:~226-238`.
- Current handling: a safe refusal. A drive-root or `/` workspace can never host a provider session.
- Recommendation: preserve the root (as `normalizeCodexWorkspaceKey` does with `path.parse(...).root`) or refuse roots explicitly with a clear message.

### FM-3 Drive-less rooted path depends on process cwd

- Trigger: win32 `\foo` or `/foo`.
- Symptom: the key becomes `<cwd drive>:\foo`, so the same input can key differently across processes.
- Evidence: `isAbsolute` true on win32 for rooted paths, then `path.resolve`.
- Recommendation: on win32 also reject `/^[\\/](?![\\/])/` as Codex does.

### FM-4 Resume of a provider session is refused late and uncoded

- Trigger: `chat:continue` for a stored provider-session session.
- Symptom: `{ error: message }` with the text "Provider-session chat is not available on this host." and no `PROVIDER_SESSION_UNAVAILABLE` code. The start path returns the coded error.
- Evidence: `chat-session.service.ts:3169-3260` and `:3297-3306`; the refusal comes from `routing-agent-adapter.ts:335` (`ChatRuntimeAdmissionError`).
- Current handling: safe. No state is mutated (`nativeId` is Codex-only) and `assertDriveHeld` has been taken.
- Recommendation: call `refuseProviderSessionExecution(execution)` before `assertDriveHeld` in the resume path, or accept it until P6, which owns this site (plan B-1).

### FM-5 Identity cache lags a provider-session write

- Trigger: `updateProviderSessionExecution` followed immediately by `lookup`.
- Symptom: the cache converges only on the metadata-changed refresh. There is no write-through wrapper like `updateCodexExecution`, and `workspacePaths` is fed only from `codexThread` (`session-runtime-identity-cache.ts:50-53`).
- Current handling: nothing consumes it in P4.
- Recommendation: P6/P7 must add the wrapper or the workspace path source before any adapter relies on `lookup().workspacePath`.

### FM-6 Provider session served by Claude controls (forward)

- `session-runtime-router.ts:103-108` sends every non-Codex identity to the legacy Claude controls. P5 owns the third arm. The plan lists it, so it is correct for P4.
- Similarly `session-history-reader.service.ts:398` and `session-rpc.handlers.ts:601,657,1368` still key on `codexExecution` only. These are P6 per plan lines 108-111.

### FM-7 Carry-over probe treats a provider session as ready

- Trigger: `newSessionReady` for an active provider-session provider.
- Symptom: the carry-over offer appears, then the launch is refused (coded `PROVIDER_SESSION_UNAVAILABLE`).
- Evidence: `chat-carry-over.service.ts:448` (`!== 'codex-app-server'` gives `true`).
- Current handling: unreachable, and launch refuses.
- Recommendation: return `false` for `provider-session` until P6/P9.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

- **M-1 (Moderate): the workspace key shape is not final.** It is `session-metadata-store.ts:~226-238`, FM-1, FM-2 and FM-3 above.
  Segment case is preserved while Windows is case-insensitive, roots are not fixed points, and drive-less rooted paths depend on cwd.
  The shape becomes a migration problem once P9 persists records. Fix now (cheap, and the implementer notes it is reversible until P9):
  on win32 lower-case the whole key the way `normalizeCodexWorkspaceKey` does, or compare case-insensitively on win32 in the resolver
  and the store; reject drive-less rooted paths; preserve the root. Add specs for `D:\Foo` vs `d:\foo`, `C:\` and `\foo`.
- **M-2 (Moderate, forward):** `chat-carry-over.service.ts:448` (FM-7).
- **M-3 (Moderate, forward):** `workspace-provider-profile-resolver.ts:~420-435`. `resolveProviderSessionModel` passes any concrete
  string as `seed.model`, and `requestedModelIsStored` is ignored, so a stale stored Claude id reaches the provider. Treat a stored
  model that is not in the provider's catalog as "default" once the catalog exists (P7/P8), or drop stored models now.
- **M-4 (Moderate):** gate risk. `auth-providers` now calls `agent-sdk` functions at runtime (`normalizeProviderSessionWorkspaceKey`,
  `providerSessionNativeRuntimeRequiredMessage`, `isNativeRuntimeRefusal`). Specs that `jest.mock('@ptah-extension/agent-sdk')` wholesale
  and exercise those modules would fail at call time. 35 spec files do this (agent-generation, cli-agent-runtime registry specs,
  rpc-handlers, `plugin-activation.spec`). Only the suites listed in the report were run. The coordinator's full scoped gate must
  cover agent-generation, cli-agent-runtime, rpc-handlers and the Electron app. The `rpc-handlers` spec tsconfig typecheck did not
  complete (heap).
- **M-5 (Moderate/minor):** `workspace-provider-profile-resolver.ts` throws `AuthRequiredError(..., { providerId })` for "workspaceId is
  invalid". That is not an auth failure, and `providerId` may route the UI to a sign-in banner. The Codex equivalent carries no providerId.
  Drop `providerId` for the workspace and mismatch messages, or use a coded user error.
- Minor: `draft-verification.service.ts:775-790` classifies any `AuthRequiredError` for a provider-session id as the refusal. It is
  name plus providerId only, whereas `isProviderSessionNativeRuntimeRefusal` also checks the exact message. Harmless today; keep the
  two consistent.
- Minor: `isProviderSessionProviderId` is a type predicate onto a closed 3-id union but answers from the registry. A fourth registry entry
  would make the narrowing wrong. Tighten the type, or add a registry-vs-union spec (`provider-session-registry.entries.spec` could carry it).
- Minor: spec gaps (question 5): the cross-runtime refusals, Windows casing, and an `existing Codex row survives provider-fields save` case.
- Minor (out of scope, reported by the implementer): `memory-contracts/curator-llm.port.ts:48` comment is stale.
- Environment note for the coordinator: the worktree lacks `node_modules`, and the `marked` mapping in `jest.preset.js` fails without a junction.

## Data flow

1. Resolver (`resolveExecutionProfile`): Codex branch first (unchanged), then `providerSessionTarget`. OK. Gateway, lane and capability refused. Model: M-3.
2. Chat runtime profile `prepare`: the third arm carries workspacePath, cwd and config. OK.
3. Start funnel `launchSdkSession`: refuses after the provider pin, before side effects. OK.
4. Resume (`chat:continue`): reaches the router and is refused there. FM-4.
5. Slash router: refused after `prepare`. OK.
6. Metadata `updateProviderSessionExecution`: validates runtime, sessionId, binding immutability, foreign workspace and thread, then persists and flushes, then emits. OK. Key shape: M-1.
7. `_saveInternal`: preserves the binding and refuses direct writes. OK.
8. Identity cache: reads through `nativeExecutionOf`. OK. Write-through and workspace path: FM-5.
9. Non-chat consumers (auth resolver, proxy pool, curator, LLM resolver, AuthManager, OAuth strategy, draft probe): refuse. OK.

## Requirements fulfilment

| Requirement                                                           | Status   | Gap                                                                          |
| --------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Kind, identity variant, `profile` mismatch field, capabilities, seed  | COMPLETE |                                                                              |
| Strict schema variant, old records parse                              | COMPLETE |                                                                              |
| `PROVIDER_SESSION_*` codes, `providerSessionStatus?` type             | COMPLETE | frontend mapping is P9                                                       |
| Registry field and `providerRuntimeFor`, no entries                   | COMPLETE | closed-union type predicate (minor)                                          |
| Metadata fields, writer, guards, `nativeExecutionOf`                  | COMPLETE | key shape (M-1)                                                              |
| Identity cache reads the field                                        | COMPLETE | FM-5 for later phases                                                        |
| Resolver branch (hosts, gateway/lane, profile mismatch, tiers)        | COMPLETE | M-3, M-5                                                                     |
| Chat runtime profile third arm and `storedChatRuntimeIdentity`        | COMPLETE |                                                                              |
| S-2 sites, R2-2 (AuthManager, OAuth strategy, draft), M-4             | COMPLETE | all with specs                                                               |
| Gateway ends the turn with `auth-required`                            | COMPLETE | spec present                                                                 |
| Exhaustive-switch compile fixes refuse safely                         | COMPLETE | FM-4, FM-7                                                                   |

Implicit requirements not addressed: a frozen, platform-correct workspace key; a cross-runtime store spec.

## Edge cases

| Case                                        | Handled | How                                       | Concern                                   |
| ------------------------------------------- | ------- | ----------------------------------------- | ----------------------------------------- |
| Relative, empty or NUL workspace            | YES     | normaliser throws, typed refusal          | -                                         |
| Drive-letter case differs                   | YES     | `normalizeWorkspaceRoot`                  | -                                         |
| Segment case differs (win32)                | NO      | key preserves case                        | M-1                                       |
| Workspace is a drive or fs root             | NO      | key not a fixed point                     | FM-2 (safe refusal)                       |
| Existing Codex row with provider update     | YES     | `legacy-conversion`                       | no spec                                   |
| Ordinary save of provider-session row       | YES     | binding preserved, direct write refused   | -                                         |
| Concurrent writers                          | YES     | `enqueueWrite`                            | same as Codex                             |
| Host lacks profile                          | YES     | `AuthRequiredError`                       | -                                         |
| Gateway or lane consumer                    | YES     | `AuthRequiredError`                       | -                                         |
| Old Claude and Codex records                | YES     | schema variants untouched                 | -                                         |
| Stored home with no current home            | YES     | `normalizedHome changed`                  | by design (D10)                           |

## Verdict

- Recommendation: APPROVE (with M-1 fixed before P9; M-4 verified by the coordinator's gate).
- Confidence: HIGH on Codex and Claude identity and on the refusal sites; MEDIUM on gate-level interactions (not run here).
- Top risk: the Windows workspace-key shape is a one-way door that P9 persists, and the "same folder, different case" resume refusal would
  surface there.
- What a robust implementation would add: a win32 key matching the Codex key's semantics; root preservation or explicit root refusal;
  rooted-path refusal; a model passthrough guard; cross-runtime store specs; a provider-session write-through wrapper in the identity
  cache; an up-front refusal on the chat-continue path.
