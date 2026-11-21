# Code Logic Review: TASK_2026_2294_p5 (P5 "Chat foundation B")

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 3        |
| Failure modes found | 4        |

Scope read in full: `native-chat-core-composition.ts`, the `bootstrap.ts`, `codex-runtime-composition.ts` (Electron) and `register.ts`/`tokens.ts` diffs, `wiring/codex-runtime-composition.ts` (guard) and its error file, `routing-agent-adapter.ts`, the three routers, `chat-runtime-admission.ts` and the `codex-chat-host-ports.ts` diff. I did not run the specs. I relied on the implementer's evidence for the green runs.

## Five logic questions

1. Silent failure. Every catch in the diff either logs and continues (`bootstrap.ts` core bind, Codex bind, core finish) or rethrows (`bindElectronCodexChat`, history router `nativeReadFailed`). No catch returns a literal, so the degradation-audit rule holds. One misleading log: the finish catch says "continuing startup" even when Codex is already bound (see FM-1).
2. Unexpected user action. A stored `provider-session` session opened on a Codex-only host is refused with `PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE` (`routing-agent-adapter.ts:~360`), and `canSendFollowUp` answers false (`session-runtime-router.ts:81-85`). That is the intended refusal, not a defect. Nothing is selectable in P5 anyway.
3. Wrong answer from data. A stored provider-session identity whose profile is no longer listed is refused for start/change but still routes for read-only calls (`adapter()` `startsOrChangesChat` gate). This is deliberate (A9) and consistent.
4. Dependency failure. Codex bind failure: the core lookup is kept and disposed by finish (nothing bound), so Claude chat keeps the plain SDK adapter. Core bind failure: Codex skipped, same outcome as the old Codex catch. Finish failure after Codex bound: see FM-1.
5. Missing from the requirements. P8 cannot bind provider sessions without Codex until `LEGACY_SESSION_CONTROL_PORTS` and lookup disposal move to the core. The implementer flagged both, and both are out of P5 scope.

## Failure modes

### FM-1 Finish failure after a successful Codex bind (Moderate)

- Trigger: `finishElectronNativeChatCore` throws (`late-registration`, or any unexpected throw) after `registerElectronCodexBinding` already registered `CODEX_CHAT_ADAPTER_PORTS`.
- Symptom: the guard sees Codex ports without the core and throws `partial-native-binding` when the routing adapter is resolved. Agent adapter initialisation fails, and Claude chat with it. Isolation (S-1) holds only for a failed Codex bind, not for a failed finish.
- Evidence: `native-chat-core-composition.ts:116-124` (`finished=true`, then throw); `bootstrap.ts` finish catch (log says "continuing startup"); guard `wiring/codex-runtime-composition.ts:85-95`.
- Current handling: logged only. This was a partial binding before P5 too, but the finish step is a new failure window between Codex registration and core registration. It is not reachable by normal ordering and is asserted by `surface-composition.spec.ts`.
- Recommendation: on a finish failure with Codex bound, make `late-registration` detectable before Codex registers (pass a check into `bindElectronCodexChat`), or register a Claude-only fallback. At minimum correct the log text.

### FM-2 Lookup leak on the late-registration throw (Minor)

- Evidence: `native-chat-core-composition.ts:116-119`. `finished` is set and the throw happens before `core.lookup.dispose()`. When Codex failed and the throw fires, the lookup (an `onMetadataChanged` subscription) is never disposed.
- Recommendation: dispose in the `late-registration` branch when `input.codex` is undefined.
- The deviation "a failed Codex binding no longer disposes the core lookup" is otherwise leak-free. `bound` is false for every failure path, `finish` disposes when nothing bound, and after a successful bind Codex shutdown disposes the core lookup exactly once. The `{...coreLookup}` spread is safe because the lookup is an object literal of closures (`session-runtime-identity-cache.ts:111`). The registered lookup is the raw `core.lookup`, so both views share state.

### FM-3 Prepared provider-session start skips the gateway and listing checks (Moderate)

- Trigger: `config.runtime === 'provider-session'` and `servingProviderId` returns `undefined`.
- Evidence: `routing-agent-adapter.ts:~150-165`. For a prepared runtime, only the adapter-bound check runs up front. The gateway refusal and the `capabilities.providerSessions` listing live in `admit()`, which is reached only after the provider is resolved. The mismatch check is skipped when `provider === undefined`, so `startAdapter('provider-session')` runs. Codex checks `nativeEnabled` up front, so the two arms are asymmetric.
- Impact: unlikely, because admission returns `seed.providerId` for every non-Claude runtime. It is still a defence-in-depth gap against A9.
- Recommendation: refuse `provider-session` up front when `consumer === 'gateway'` or the host lists no providerSessions.

### FM-4 Provider-session history read is less validated than Codex (Moderate)

- Evidence: `session-history-router.ts` `nativeSession` and `providerSessionHistory`. Codex validates the workspace key and the stored thread. Provider sessions validate only `sessionId`. `options.signal` and the caller's workspace are not passed to `port.read`, so a cancelled read still runs.
- Recommendation: forward an abort signal when the router gains one, and check the stored workspace against the caller before P7 binds a port.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

- FM-1, FM-3 and FM-4 above (moderate); FM-2 (minor).
- `ProviderSessionApprovalReply` and the sink are local types (deviation 5), so P7 must map `ProviderApprovalDecision` onto them. A drift risk, not a defect.
- `finish` registers the core for any non-empty `providerSessionProfiles` without checking that provider-session ports are registered. If P8 passes a profile whose ports are not registered, the guard throws `partial-native-binding` and takes Claude down. P8 should pass only profiles whose binding returned success.

## Data flow

1. Bootstrap `core.bind`: resolves the admission inputs, creates the lookup, registers nothing. OK; core bind failure skips Codex and Claude continues.
2. Codex bind with the core lookup: registers only the five Codex tokens. `bound=true` is set after the last register, so a failure never disposes the core lookup. OK.
3. Provider-session slot (`[]`). OK.
4. `core.finish`: registers identity, capabilities and admission once, only when something bound. See FM-1 and FM-2.
5. Agent-adapter init, which runs the guard and resolves `ROUTING_AGENT_ADAPTER`. OK; the `afterResolution` flag plus the guard catch a late resolution.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Codex-only host registers the same capabilities, admission and lookup | COMPLETE | `{nativeCodex:true, nativeCodexGateway:true}` frozen; `createElectronCodexRouting` still yields true/true (`codex-runtime-composition.ts:87-95`). Admission deps are the same four resolves as the old host deps. |
| DI order and tokens, nothing resolves `ROUTING_AGENT_ADAPTER` before finish | COMPLETE | Interceptor plus the guard. |
| Shutdown and dispose order unchanged | COMPLETE | Codex binding disposes the lookup after a successful bind, as before. |
| S-1 Codex failure leaves Claude working; both failed leaves the defaults | COMPLETE for a Codex failure, PARTIAL for a finish failure (FM-1) | |
| Three-way guard rule and the stability check | COMPLETE | Core all-or-nothing, ports need the core, a core needs ports. Seven tokens are in the stability list. The default capabilities provider exemption is preserved. |
| `RoutingAgentAdapter` third arm, null-safe fan-out | COMPLETE | `dispose`, `reset`, both callbacks, `onQueuedFollowUpState` and `resolveLiveSessionId` cover Codex, provider sessions and legacy. Diff against HEAD shows no lost Codex call. FM-3 is the only gap. |
| Approval correlation at least as strict as Codex | COMPLETE | One shared `correlates` helper for session, thread, request and context. The registration session-mismatch check is extended to provider sessions. Cancel settles the sink. |
| Degradation-audit rule | COMPLETE | No literal-returning catch added. |

## Container smoke error

Confirmed pre-existing and unrelated. The error comes from a timer-driven `SessionStatsRepository.reconcileFinalizations` (`persistence-sqlite/.../session-stats-repository.ts:557`, called from `sqlite-session-usage-sink.ts:176,209`). The P5 diff touches nothing in `persistence-sqlite`, and the implementer reproduced the same result on P4.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Codex bind fails, nothing else | YES | finish disposes the lookup; defaults stay | none |
| Core bind fails | YES | Codex skipped, logged | none |
| Both fail | YES | nothing registered | none |
| Finish called twice or after routing resolved | YES | typed error | FM-1, FM-2 |
| Null provider-session adapter | YES | refusal error | none |
| Fan-out with null adapters | YES | optional chaining | none |
| Provider-session gateway turn | PARTIAL | `admit()` refuses | FM-3 |

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH on Codex parity, MEDIUM on the provider-session arms (only specs exercise them).
- Top risk: a finish failure after a successful Codex bind leaves a partial binding that breaks Claude chat (FM-1).
- What a robust implementation would add: a Codex-bind pre-check for late registration or a Claude-only fallback; dispose in the `late-registration` branch; up-front gateway and listing refusal for a prepared provider-session runtime; abort-signal and workspace validation on the provider-session history read; P8 passing only profiles whose binding succeeded.
