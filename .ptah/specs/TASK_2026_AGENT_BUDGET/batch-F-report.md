# Batch F report

## Protocol evidence

- Frozen app-server protocol `libs/backend/codex-runtime/src/lib/protocol/codex-app-server-protocol.schema.json:25623-25641` defines `thread/tokenUsage/updated` with `threadId`, `turnId`, and `tokenUsage` only. It does **not** promise `parentThreadId` or `model` on this notification. The optional fields are therefore experimental; `codex-protocol-validator.spec.ts` marks them as such in its frozen-schema guard.
- `codex-protocol-schemas.ts:422-440` defines `collabAgentToolCall.tool='spawnAgent'` and `receiverThreadIds`; `codex-event-translator.ts:684-703` emits those IDs. `codex-context.ts:398-414,450-480` also correlates native child threads to parent spawn tools. `codex-protocol-schemas.ts:775-786` already accepted optional usage attribution, but `codex-protocol-methods.ts:430-437` dropped it at the validated process boundary. The method schema now preserves it.
- `codex-protocol-schemas.ts:766-786` defines cumulative thread totals and the last request counters. `codex-event-translator.ts:328-430` derives one whole-turn usage snapshot from cumulative totals and stores accepted evidence, and `:440-465` attaches that snapshot to terminal events. The recorded `__fixtures__/spike-run-6*.json` contain usage method names but no captured child-thread usage payload proving per-child delivery. No live Codex session was run.
- `codex-execution-profile.ts:20-119` contains Codex profile settings but no `agentBudget` settings; `rg agentBudget libs/backend/codex-runtime/src/lib` returned no matches. This batch cannot cite an existing Codex budget settings accessor. The tap takes validated `AgentBudgetSettings` from its future composition caller.

## Files and API

- `codex-protocol-methods.ts`: retain optional `parentThreadId`, `model`, and `counterReset` when validating token usage.
- `codex-protocol-validator.spec.ts`: test field preservation and designate optional attribution as experimental under the pinned schema.
- `codex-child-budget-tap.ts` and `.spec.ts`: `CodexChildBudgetTap(settings).observe(event)` records spawn-to-child links and accepted child usage. `completeChildTurn({ parentThreadId, childThreadId, turnId, modelId?, elapsedMs, pricing, parentDelta? })` returns `CodexChildBudgetDecision` with `AgentTurnTelemetry`, attribution provenance, and `AgentBudgetPolicy` transition. A turn is charged once using its whole-turn snapshot, never by summing `last` and `total`. Missing usage becomes `telemetry-unavailable`. `releaseChild` and `dispose` release state.
- `parentDelta` is accepted only as an explicitly isolated delta supplied by a caller; the tap never subtracts a shared parent turn on its own. Its decision provenance is `parent-delta`; the shared `AgentTurnTelemetry.source` enum has no `parent-delta` value, so telemetry uses `stream`. This is a contract limitation within this batch's hard exclusions.

## Enforcement and deferred integration

The tap computes warning, handoff, stop, cost coverage, and Ptah child attribution decisions now. No production runtime instantiates it yet; no actual child interrupt, resume refusal, or end-to-end stop acceptance is claimed. Batch B must connect host settings and pricing, call the tap after trailing child usage is drained, use its decision through the existing Codex context interrupt port, and enforce durable resume admission through the SDK gate. `codex-runtime` does not import `agent-sdk`.

## Decisions

- Preserve optional notification attribution as experimental rather than alter the frozen protocol: the pinned server schema lacks those fields. Reversible: yes.
- Require an explicitly isolated parent delta for fallback, otherwise stop with telemetry unavailable: parent usage can include concurrent child and parent work. Reversible: yes.
- Keep the decision API in `codex-runtime` without DI registration until the caller and settings access are provided: there is no current budget settings accessor here. Reversible: yes.

## Verification

- `npm run verify -- -t test -p codex-runtime -- --testPathPatterns=codex-child-budget-tap.spec.ts`: passed.
- The first protocol-validator run failed solely because its frozen-schema guard did not yet list the new experimental fields; that guard was updated. The rerun passed.
- Required `npm run verify -- -p codex-runtime,ptah-electron,cli-engine`: passed (six lint/typecheck tasks, then 13 test tasks; exit 0).
