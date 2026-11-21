# Batch report: P5 "Chat foundation B" (TASK_2026_2294_p5, program TASK_2026_2288_acp1)

Worktree `D:/projects/PtahCode/.claude-worktrees/provider-session-p5`, branch `feat/provider-session-p5`,
base HEAD `0100191c0` (P4). Nothing staged or committed.

No provider becomes selectable. The registry still has no `providerSession` entry, bootstrap
passes `providerSessionProfiles: []`, and the four new provider-session tokens default to
`null`. The new arms are reachable only from specs.

## Delivered, mapped to Component 6 (A13, A14, S-1)

| Plan item | Delivered |
|---|---|
| `bindElectronNativeChatCore` / `finishElectronNativeChatCore` | New `apps/ptah-electron/src/di/native-chat-core-composition.ts`. The bind step creates the identity lookup (`initializeSessionRuntimeIdentityLookup`, moved out of `bindElectronCodexChat`) and resolves the admission inputs, but registers nothing. The finish step registers `SESSION_RUNTIME_IDENTITY_LOOKUP`, `RUNTIME_HOST_CAPABILITIES` and `RUNTIME_ADMISSION_PORT` exactly once, and only when Codex bound or at least one provider-session profile bound. The capabilities are `{ nativeCodex: codexBound, nativeCodexGateway: codexBound && <Codex routing gate>, providerSessions? }`, frozen, and `providerSessions` is omitted when empty, so a Codex-only host gets the same `{ nativeCodex:true, nativeCodexGateway:true }` value as before. When nothing bound, finish registers nothing, disposes the lookup and returns `undefined`, so the Claude-only defaults stay. Finish throws `ElectronNativeChatCoreError` with code `late-registration` when `ROUTING_AGENT_ADAPTER` was already resolved, and with code `already-finished` on a second call. |
| `bootstrap.ts` order | The order is core bind, then Codex binding (existing try/catch, now given the core lookup), then the provider-session slot (`[]` in P5, commented for P8), then core finish (its own try/catch). If the core bind fails, it is logged and Codex is skipped (Codex needs the lookup), which is the same outcome as the old Codex catch. Everything runs before `startAgentAdapterInitialization`, and `surface-composition.spec.ts` asserts the order. |
| Codex composition stops registering the three neutral tokens | `registerElectronCodexBinding` now registers only `CODEX_CHAT_ADAPTER_PORTS`, `CODEX_SESSION_OWNER`, `NATIVE_SESSION_CONTROLS`, `LEGACY_SESSION_CONTROL_PORTS` and `NATIVE_SESSION_HISTORY_PORT`. `bindElectronCodexChat(container, input, coreLookup)` takes the lookup as an input and returns the binding (its routing) only on success. Bootstrap passes that value to finish as `codex`. The gateway capability source is unchanged (`createElectronCodexRouting`). |
| `createChatRuntimeAdmission` replaces `createCodexRuntimeAdmission` | New `RH/chat/session/chat-runtime-admission.ts` holds `ChatRuntimeAdmissionDeps`, `createChatRuntimeProfileService` and `createChatRuntimeAdmission`, with the same body as before. `createCodexRuntimeAdmission` and `CodexRuntimeAdmissionDeps` are deleted. `CodexChatHostPortsDeps` extends `ChatRuntimeAdmissionDeps`. The barrel is updated, and the only caller (Electron) now calls the new function from the core finish. |
| Guard regroup (`agent-sdk/wiring/codex-runtime-composition.ts`) | The guarded groups are: the core (identity, admission, capabilities, where the SDK's default provider still counts as unbound); runtime ports (`CODEX_CHAT_ADAPTER_PORTS`, `PROVIDER_SESSION_CHAT_PORTS`); and adapters (`CODEX_CHAT_ADAPTER`, `PROVIDER_SESSION_CHAT_ADAPTER`). The rule: the core is all-or-nothing, any runtime's ports require the core, and a bound core requires at least one runtime's ports. All seven tokens are covered by the stability (`unstable-binding`) check. Missing names keep their old order (identity, ports, admission, capabilities), and the ports slot reads `CODEX_CHAT_ADAPTER_PORTS or PROVIDER_SESSION_CHAT_PORTS` when neither is bound. |
| Tokens with null defaults | `tokens.ts` adds `PROVIDER_SESSION_CHAT_PORTS`, `PROVIDER_SESSION_CHAT_ADAPTER`, `PROVIDER_SESSION_CONTROLS` and `PROVIDER_SESSION_HISTORY_PORT`. `registerCodexChatServices` registers them as `null` unless a host already registered them. |
| `register.ts` requirements | `ROUTING_AGENT_ADAPTER` requires identities + admission + (the Codex adapter or the provider-session adapter). `SESSION_RUNTIME_ROUTER` requires identities + legacy + (`NATIVE_SESSION_CONTROLS` or `PROVIDER_SESSION_CONTROLS`). `SESSION_HISTORY_ROUTER` gets a fourth getter for `PROVIDER_SESSION_HISTORY_PORT`. |
| `RoutingAgentAdapter` | `native: NativeChatAdapter \| null`, plus a new sixth constructor argument `providerSessions: NativeChatAdapter \| null = null`. Admission uses `getProviderSessionProfile(provider)`. A provider-session provider is admitted only when the adapter is bound, the host lists its profile in `capabilities.providerSessions`, and the consumer is not `gateway` (A9). Otherwise it throws `ChatRuntimeAdmissionError(PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE)`. A prepared runtime that disagrees with admission throws the existing mismatch error. `adapter()` has the real third arm: owned sessions go to `providerSessions`; a stored `provider-session` identity routes there, and is refused when the adapter is null, or, for a start or change, when the host does not list the profile. P4's interim refusal is removed. Fan-out of `dispose`, `reset`, `setSessionIdResolvedCallback`, `setResultStatsCallback`, `onQueuedFollowUpState` and `resolveLiveSessionId` skips null adapters. `listSessionModels` covers both native arms. The Codex paths are logically unchanged. |
| `SessionRuntimeRouter` | Nullable Codex controls and nullable provider-session controls. A native session whose controls are not bound is refused with `ChatRuntimeAdmissionError` for controls, answers `false` for `canSendFollowUp` / `acceptsFollowUpWithoutStream`, and `releaseSession` is a no-op for it. Claude and Codex routing are unchanged. |
| `SessionHistoryRouter` | `nativeSession` recognises `providerSessionExecution` (a mismatched `sessionId` gives `invalidNativeIdentity`). Reads go through the optional `ProviderSessionHistoryPort { read(sessionId, signal?) }`, which returns an already projected `ProviderSessionHistory = Pick<SessionHistoryReadResult,'events'\|'stats'>`. A null or absent port gives `nativePortUnavailable`. A port failure collapses to `nativeReadFailed`, and the host message is never exposed. |
| `SessionApprovalRouter` | Owner `{ kind:'provider-session'; sink: ProviderSessionApprovalOwnerSink }` and a reply kind carrying `ProviderSessionApprovalReply`. It gets the same session, thread, request and context checks as Codex (one shared `correlates` helper), the same session-mismatch check at registration, and cancellation settles the sink. |
| `expected-resolvable.ts` | New `ELECTRON_NATIVE_CHAT_CORE_TOKENS` (3 tokens). `ELECTRON_CODEX_BOUND_TOKENS` drops those three (8 down to 5). The four provider-session tokens are added to `EXPECTED_NULL_RUNTIME_TOKENS`. |

### Specs (P5 verification row)

| Required | File |
|---|---|
| `native-chat-core-composition.spec.ts`: "Codex failed, provider sessions bound", "both failed -> defaults", "late registration throws" | `apps/ptah-electron/src/di/native-chat-core-composition.spec.ts` (6 cases): the three named cases, a second "late registration" case at guard level (a core bound after resolution gives `unstable-binding`), "Codex bound: capabilities match the Codex binding exactly", and "registers the core once". |
| Guard spec | `libs/backend/agent-sdk/src/lib/wiring/codex-runtime-composition.spec.ts`. The existing cases are kept; the expected missing name for the Codex ports slot is now the "or" label, and the stability list has the two new tokens. A new `provider-session runtime group` block covers: core + provider-session ports only, both runtimes, provider ports without the core, a core without ports, and late provider-session binding. |
| Router third-arm specs, with the Claude and Codex cases unchanged | New `session-runtime-router.provider-session.spec.ts`, `session-history-router.provider-session.spec.ts` and `session-approval-router.provider-session.spec.ts`. `routing-agent-adapter.provider-session.spec.ts` is rewritten from P4's "refuses" cases to the real arm. The existing `routing-agent-adapter.spec.ts`, `session-runtime-router.spec.ts`, `session-history-router.spec.ts` and `session-approval-router.spec.ts` are unmodified and green. |
| `codex-runtime-composition.spec.ts` updated for the moved tokens only | The Electron `codex-runtime-composition.spec.ts` asserts none of the moved tokens, so it needed no change. The moved-token assertions live in `surface-composition.spec.ts` (the literal-registration check is now split: core file vs Codex file, and the Codex file must not register the three) and in `rpc-surface.spec.ts` (census sizes 5 + 3). |
| `container.smoke.spec.ts` + `expected-resolvable.ts` | The smoke spec is unchanged in source. Its "SDK runtime defaults" test now also asserts that the four new tokens resolve to `null` (via `EXPECTED_NULL_RUNTIME_TOKENS`). |
| Admission spec | `libs/backend/rpc-handlers/src/lib/chat/session/chat-runtime-admission.spec.ts`. The Codex host spec's "uses the same provider resolver for admission" now calls `createChatRuntimeAdmission`. |

## Files

Created:
- `apps/ptah-electron/src/di/native-chat-core-composition.ts` (+ `.spec.ts`)
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-runtime-admission.ts` (+ `.spec.ts`)
- `libs/backend/agent-sdk/src/lib/codex-app-server/session-runtime-router.provider-session.spec.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/session-history-router.provider-session.spec.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/session-approval-router.provider-session.spec.ts`

Modified:
- Electron: `src/activation/bootstrap.ts`, `src/di/codex-runtime-composition.ts`, `src/di/expected-resolvable.ts`, `src/di/rpc-surface.spec.ts`, `src/di/surface-composition.spec.ts`
- agent-sdk: `src/index.ts`, `src/lib/di/{tokens,register}.ts`, `src/lib/wiring/codex-runtime-composition.ts` (+ spec), `src/lib/wiring/codex-runtime-composition-error.ts`, `src/lib/codex-app-server/{routing-agent-adapter,session-runtime-router,session-history-router,session-approval-router}.ts`, `routing-agent-adapter.provider-session.spec.ts`
- rpc-handlers: `src/index.ts`, `src/lib/chat/codex-host/codex-chat-host-ports.ts` (+ spec)
- shared: `src/lib/types/agent-adapter.types.ts`

## Deviations, each with its reason

1. **Two extra tokens: `PROVIDER_SESSION_CONTROLS` and `PROVIDER_SESSION_HISTORY_PORT`.** The plan names only the ports and adapter tokens. But it also requires `SESSION_RUNTIME_ROUTER` to take "at least one native controls" and the history router to read through an optional provider-session port. Both need a binding point, so both follow the existing `NATIVE_SESSION_CONTROLS` / `NATIVE_SESSION_HISTORY_PORT` pattern, with null defaults. P7/P8 bind them.
2. **`AgentSessionStartConfig.runtime` widened** (shared) to include `'provider-session'`. Without it, the router's prepared-runtime third arm cannot be typed. This is an additive union widening, and the libs, the Electron app, cli-engine and platform-cli all typecheck.
3. **`ProviderSessionHistory` defined in agent-sdk** as `Pick<SessionHistoryReadResult,'events'|'stats'>`. The plan names the type but no lib declares it, and "already projected" matches the router's own result. `read`'s `signal` is optional because the router's public read methods carry none today.
4. **A provider-session carry-over read is refused** with `nativePortUnavailable` before any read. The port has no bounded tail yet, so this follows the router's existing rule ("a caller without a bound is refused for a native session").
5. **Approval reply/sink types are defined locally in `session-approval-router.ts`** (`ProviderSessionApprovalReply`, `ProviderSessionApprovalOwnerSink`). agent-sdk does not depend on `provider-session-contracts` yet (P7 adds that edge). P7 can map `ProviderApprovalDecision` onto them. The router's cancel callback still fans out to Codex presentation only; the plan assigns the provider-session fan-out to P7.
6. **Lookup ownership.** The core creates the lookup. A failed Codex binding no longer disposes it: Codex gets a view whose `dispose` is a no-op until the binding succeeds. Core finish disposes the lookup when nothing bound. After a successful Codex binding, Codex shutdown still disposes it, as before, so shutdown order is unchanged. **P8 must move this disposal to a core shutdown step** once provider sessions can bind without Codex, or alongside it.
7. **Admission inputs are resolved at core bind, not finish**, so the finish step cannot fail after a runtime already registered its ports. A failure there would leave a partial binding, which the guard turns into a resolution failure of the agent adapter.
8. **The router's gateway refusal for provider-session providers** (A9) is enforced in `RoutingAgentAdapter.admit` as defence in depth. The resolver already refuses the gateway consumer.
9. **The partial-binding error text** changed from "requires all four host bindings" to "requires the chat core bindings and at least one runtime ports binding". The guard no longer has four peer bindings. No spec asserts the old text.

## Decisions

- Capabilities omit `providerSessions` when the list is empty, so a Codex-only host registers the same capability object shape as before (Codex behaviour identical). Reversible.
- `ElectronNativeChatCoreError` codes are `late-registration` and `already-finished`, rather than reusing `CodexRuntimeCompositionError`. The core is not Codex, and P12 renames the Codex-named neutral types. Reversible.

## Checks (lane-focused; no `npm run verify`, no nx)

Typecheck (`npx tsc --noEmit --project …`). Spec tsconfigs ran under `node scripts/verify.mjs --exec` with `NODE_OPTIONS=--max-old-space-size=4096`. All exited 0:
- `libs/shared/tsconfig.lib.json`, `libs/shared/tsconfig.spec.json`
- `libs/backend/agent-sdk/tsconfig.lib.json`, `libs/backend/agent-sdk/tsconfig.spec.json`
- `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/rpc-handlers/tsconfig.spec.json`
- `apps/ptah-electron/tsconfig.app.json`, `apps/ptah-electron/tsconfig.spec.json`
- `libs/backend/cli-engine/tsconfig.lib.json`, `libs/backend/platform-cli/tsconfig.lib.json`, `libs/backend/gateway-chat-bridge/tsconfig.lib.json`

Jest (`--runInBand --coverage=false --runTestsByPath`):
- agent-sdk, 12 suites (guard spec, `register.codex-runtime.spec`, routing adapter spec + its provider-session spec, runtime/history/approval router specs + their provider-session specs, `codex-chat-turn-lifecycle.spec`, `codex-chat-adapter.spec`): `Test Suites: 12 passed, 12 total; Tests: 347 passed, 347 total`. After two later spec-only edits (non-null assertion removed; exhaustive default without a cast), the reruns were history provider-session `Tests: 8 passed, 8 total` and routing (both suites) `Tests: 56 passed, 56 total`.
- rpc-handlers, 9 suites (`chat-runtime-admission.spec`, `codex-chat-host-ports.spec`, `session-native-history.spec`, `chat-runtime-profile.provider-session.spec`, `chat-runtime-profile.service.spec`, `chat-history-read.service.spec`, `codex-chat-native-contract.spec`, `codex-chat-host-ports.resume-permission.spec`, `codex-chat-approval-presentation.spec`): `Test Suites: 9 passed, 9 total; Tests: 164 passed, 164 total`
- cli-engine (`jest.config.cjs`), `codex-runtime-composition.spec`: `Tests: 3 passed, 3 total`
- ptah-electron, under the verify lock with a 4 GB heap (`native-chat-core-composition.spec`, `codex-runtime-composition.spec`, `surface-composition.spec`, `rpc-surface.spec`): `Test Suites: 4 passed, 4 total; Tests: 53 passed, 53 total`. The first attempt without the lock and heap flag hit a heap OOM and a spec compile error; both were fixed before this run.
- ptah-electron `container.smoke.spec.ts`, run alone (`node scripts/verify.mjs --exec --task p5-smoke`, 4 GB heap): `Test Suites: 1 passed, 1 total; Tests: 67 passed, 67 total`, but **the process exit code is 1**. After the suite, a `ReferenceError: You are trying to require a file after the Jest environment has been torn down` comes from `persistence-sqlite` `SessionStatsRepository.reconcileFinalizations` (`better-sqlite3` require). **This is pre-existing:** the same spec in the P4 worktree (`provider-session-p4`, HEAD `c05bb3d3b`) gives the same `67 passed`, the same ReferenceError and exit 1.

ESLint (`npx eslint <every changed and new .ts file>`): exit 0, 0 errors, 4 warnings, all pre-existing in files I touched:
- `codex-runtime-composition.ts`: `preserve-caught-error` at :413, `max-lines` (1011 > 700; the file shrank in this batch), unused `verifyBinary` at :827.
- `register.ts`: `max-lines`.

`@nx/enforce-module-boundaries` was skipped ("No cached ProjectGraph"), so the coordinator's lint target must cover it. The new import edges are existing ones: Electron to agent-sdk / rpc-handlers / auth-providers / platform-core / shared; rpc-handlers to agent-sdk / auth-providers / platform-core / shared.

Not run (by rule or scope): `npm run verify`, nx targets, full project suites, di-lint, the degradation audit, and the live Electron boot. The plan's "Live here" row (Codex chat start/resume unchanged; a forced Codex-binding failure leaves Claude chat working) is the coordinator's. No catch in this batch swallows an error into a literal: bootstrap catches log, and the router and finish errors rethrow or throw.

## Out-of-scope observations

- `LEGACY_SESSION_CONTROL_PORTS` is still bound only by the Codex binding. With provider sessions and no Codex (P8), `SESSION_RUNTIME_ROUTER` stays null until a non-Codex binding supplies legacy ports. P8 should move or duplicate that binding into the core.
- The Codex host ports' own `ChatRuntimeProfileService` keeps Codex's routing capabilities (`{nativeCodex,nativeCodexGateway}`), not the final core capabilities. That is the same as before in P5. Once provider sessions bind beside Codex (P8), decide whether the Codex ports should see the final capabilities.

## Fix round 1 (code-logic-review.md: APPROVED, FM-1 to FM-4)

Same worktree. Nothing staged or committed.

| Finding | Fix |
|---|---|
| **FM-1** A finish failure after Codex registered its ports | Codex registration moved into the finish step. `bindElectronCodexChat` now builds the binding and returns an `ElectronCodexPendingBinding` with `register()`, but registers nothing. `finishElectronNativeChatCore` refuses first (already finished, late registration), and only then calls `codex.register()` and registers the core, in one synchronous step. A refusal therefore leaves the consistent Claude-only defaults, so the partial-binding guard cannot fire. On a finish failure, bootstrap disposes the unregistered Codex binding (a cleanup failure is logged) and now logs "continuing Claude-only". The Codex `bound` flag (lookup ownership) is set inside `register()`. |
| **FM-2** Lookup leak on `late-registration` | The `late-registration` branch disposes the core lookup before throwing. |
| **FM-3** A prepared provider-session start skipped the gateway and listing checks | The prepared-runtime path now refuses `provider-session` up front, mirroring the Codex `nativeEnabled` gate. It refuses when the adapter is null, when `consumer === 'gateway'`, or when the host lists no `providerSessions`, even when `servingProviderId` is undefined. |
| **FM-4** History validation and signal | `nativeSession(sessionId, workspacePath)` checks the caller's workspace for a provider session. The caller path is normalized with `normalizeCodexWorkspaceKey` (the key P4 stores); a mismatch, or a path that cannot be normalized, gives `invalidNativeIdentity` before any read. `readSessionHistory` options and a new optional `readSessionEvents` options argument carry `signal`, which is forwarded to `port.read(sessionId, signal)`. The legacy reader receives its options unchanged (only a `signal` key is stripped). The Codex path is unchanged. |
| P8 note | `TODO(P8)` added in `finishElectronNativeChatCore` where the core is registered for a non-empty profile list: P8 must pass only the profiles whose binding succeeded. |

New or changed specs:
- `native-chat-core-composition.spec.ts`:
  - Codex bound: `register` is called once, the routing adapter resolves and the lookup is kept.
  - Late registration disposes the lookup (FM-2).
  - New "late registration with Codex built registers no Codex ports (Claude-only stays)" (FM-1).
- `routing-agent-adapter.provider-session.spec.ts`: a prepared provider-session start is refused before admission for a gateway turn, and for a host that lists no profile, with an undefined serving provider (FM-3).
- `session-history-router.provider-session.spec.ts` (FM-4):
  - The abort signal reaches the port.
  - Another workspace or a relative workspace is rejected before any read.
  - Legacy options are unchanged and only the signal is stripped.
  - The stored key now comes from `normalizeCodexWorkspaceKey`.

### Checks (focused; jest runs one or two suites at a time, `--runInBand`)

- agent-sdk jest (`session-history-router.provider-session`, `session-history-router`, `routing-agent-adapter.provider-session`, `routing-agent-adapter`): `Test Suites: 4 passed, 4 total; Tests: 97 passed, 97 total`
- ptah-electron jest, under the verify lock with a 4 GB heap:
  - `native-chat-core-composition` + `surface-composition`: `Test Suites: 2 passed, 2 total; Tests: 21 passed, 21 total`
  - `codex-runtime-composition` + `rpc-surface`: `Test Suites: 2 passed, 2 total; Tests: 33 passed, 33 total`
- rpc-handlers jest (`session-native-history`, `chat-history-read.service`, the history-router callers): `Test Suites: 2 passed, 2 total; Tests: 27 passed, 27 total`
- tsc `--noEmit`, all exit 0: `libs/backend/agent-sdk/tsconfig.lib.json`, `apps/ptah-electron/tsconfig.app.json`, `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/agent-sdk/tsconfig.spec.json`, `apps/ptah-electron/tsconfig.spec.json`
- eslint (the 9 files changed in this round): exit 0, 0 errors, 3 warnings. All three are the pre-existing `codex-runtime-composition.ts` warnings (`preserve-caught-error`, `max-lines`, unused `verifyBinary`).
- Not rerun this round: `container.smoke.spec.ts` (memory is low; this round changes no token list or default registration), and the guard, runtime-router and approval-router specs (their sources are unchanged this round).
