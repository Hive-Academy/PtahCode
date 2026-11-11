# A1/A2 implementation report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts` — records handoffs and delays predecessor stop until acknowledgement.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts` — defines acknowledgement and closer contracts.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts` — persists pair and close state through platform storage.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — covers acknowledgement identity, exact path, and stop timing before and after flush.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts` — covers restart persistence and compare-and-set behavior.
- `libs/backend/cli-agent-runtime/src/lib/di/tokens.ts` — declares store and closer tokens.
- `libs/backend/cli-agent-runtime/src/lib/di/register.ts` — registers the acknowledgement store.
- `libs/backend/cli-agent-runtime/src/lib/di/register.ptah-cli-registry.smoke.spec.ts` — checks store resolution.
- `libs/backend/cli-agent-runtime/src/lib/session-children/index.ts` — exports acknowledgement contracts and store.

## A1

Implemented durable handoff pairs with predecessor and successor tab/SDK IDs, canonical workspace root and handoff path, and compare-and-set close state. Handoff does not stop its predecessor. Acknowledgement validates the pair and exact path, arms stop for the flush or stops immediately if flush already occurred, and uses an awaitable closer. Stop or closer failure retains `closePending` for retry. Tests now assert no stop before acknowledgement, stop at flush after mid-turn acknowledgement, and immediate stop when acknowledgement follows flush.

## A2

Registered and exported the acknowledgement store and host closer token. A3/A4 must provide the host closer.

## Verification

- Requested command: `npm run verify -- -p @ptah-extension/cli-agent-runtime 2>&1 | tail -60`. First invocation exited before verification because PowerShell has no `tail`. A temporary shell `tail` function backed by `Select-Object -Last 60` allowed the same pipeline to run in the foreground.
- Final result: lint/typecheck **2 succeeded, 0 failed**; Jest **172 suites passed, 1 failed**; **3506 tests passed, 1 failed, 1 skipped**. The sole failure is `session-spawner.service.spec.ts:1622`: its direct `new SessionHandoffService(...)` fixture supplies no acknowledgement store, so durable recording refuses the otherwise successful handoff. That file is outside A1/A2 write scope. Full Jest log: `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\10013771810265298371`.
- Scoped `ptah_get_diagnostics` after the spec edit: 0 errors, 0 warnings.

## Decisions

- Use the existing `WORKSPACE_STATE_STORAGE` port for durable records. The handoff chain store already uses it. Reversible by replacing the store adapter.
- Retain `closePending` after stop or closer failure to allow retry. Reversible.
- Keep the mandatory durable store requirement in production despite the out-of-scope old test fixture; relaxing it would report success without a restart-safe acknowledgement record. The fixture should inject a store in its owning batch. Reversible.

## Open risks for A3

- A3/A4 must register an awaitable exact-binding closer. Until then acknowledgement returns `retryable-failure` and does not close a tab.
- The `session-spawner.service.spec.ts` fixture needs an acknowledgement store to restore the full project test pass; it is outside A1/A2 file ownership.
- The in-memory flushed-turn marker is lost on restart. A pending acknowledgement after restart may need host reconciliation to determine whether the predecessor turn already flushed.
