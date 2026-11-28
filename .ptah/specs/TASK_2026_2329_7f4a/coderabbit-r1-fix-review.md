# CodeRabbit R1 Fix Review

**Verdict: CHANGES**

## Findings

1. **Medium — a toggle during replacement attach can leave the old permission active.**
   `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts:397-399`
   and `libs/backend/agent-sdk/src/lib/provider-session/provider-session-session-controls.ts:209-214`.
   `attach` snapshots the effective permission, then awaits `live.setPermission`.
   During that await, a toggle can run while `session.live` is still absent. The toggle stores the explicit choice but cannot update the replacement process. `attach` then finishes with its stale snapshot and prompts.
   An explicit `ask` can therefore leave the process at inherited `yolo`, while readback returns `ask`. Later resumes skip the refresh and reuse that process through `provider-session-chat-adapter.ts:381-383`, so the mismatch can persist.
   Serialize attach permission application with `changePermission`, and settle any queued toggle before the prompt. Add a deferred-`setPermission` race test. The current explicit-choice test toggles before resume at `provider-session-chat-adapter.spec.ts:862-867`, so it misses this interleaving.

2. **Low — the new host open-policy override has no direct regression test.**
   `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.ts:263-265`.
   The adapter test checks the acquire request, but no test proves that `input.permission` wins and suppresses a second saved-settings read. Add that case to `provider-session-open-request.spec.ts`.

## Verified behavior

- An explicit choice completed before resume remains authoritative, and the saved-level reader is skipped.
- Stable explicit and inherited readback is correct at `provider-session-chat-adapter.ts:223-227`. `RoutingAgentAdapter.getPermissionLevel` and `SessionSpawnerService.callerPermissionLevel` consume that value.
- A retained resume refreshes inherited permission before the prompt. A read exception selects `ask`.
- Replacement opens receive the refreshed level through `provider-session-chat-host-ports.ts:166` and `provider-session-open-request.ts:263-265`. Attach reapplies it, subject to finding 1.
- Focused Jest passed: 1 suite, 57 tests. Node emitted the existing ES module configuration warning.

## Five logic checks

- **Silent failure:** finding 1 is a silent live/readback divergence.
- **Unexpected user action:** a toggle during attach triggers finding 1.
- **Wrong answer instead of error:** readback can report the new explicit level while the runtime keeps the old level.
- **Dependency failure:** saved-level read failures select `ask`; failed permission application rejects the turn.
- **Missing coverage:** the attach/toggle race and direct host override case are absent.
