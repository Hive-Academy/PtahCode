## Changes

- Resume advice selects a fresh agent at or above the monitor warning ratio (85% by default).
- Interrupted-agent injection joins budget state by agent ID, then spawning tool call ID. Stopped agents receive Ptah attribution, token counts, stop reason, and handoff record guidance. Unknown usage is labeled unknown.
- Direct `subagent:send-message` refuses stopped or near-limit agents before dispatch. Unknown usage is allowed.
- Added threshold, stopped, unknown, RPC, and injector lookup tests. The injector already had monitor DI; the RPC handler now receives it through the existing optional SDK token.
- Skill discovery/loading was unavailable in this lane; no skill instructions were applied.

## Messages

- Refusal: `Ptah's budget monitor stopped this agent (current: <tokens or unknown> tokens; limit: <limit> tokens[; handoff record: <path>]). Start a new agent with a short brief from the handoff record.` For a near-limit active agent, the first clause is `Ptah's budget monitor refuses this resume at the 85% budget warning`.
- New stopped-agent advice: `Ptah's budget monitor stopped this agent (not the user; reason: <handoff|safety|unknown>; context: <tokens or unknown> tokens; handoff limit: <limit> tokens); start a new agent from the handoff record <path or (path unavailable)>`.
- Unknown usage advice: `cache warm, context usage unknown`. Measured warm usage below warning: `cache warm, context within budget`. Near-limit advice: `context at or above 85% of handoff limit (<current> / <limit> tokens)`.

## Verification

- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- --testPathPatterns="subagent-resume-advice|chat-subagent-context-injector|subagent-rpc.handlers" | Select-Object -Last 40`: final run `NX 2 tasks: 2 succeeded`, exit 0.
- `npm run verify -- -t lint,typecheck -p rpc-handlers | Select-Object -Last 20`: `NX 2 tasks: 2 succeeded`, exit 0.
- Earlier test runs failed while tests were being updated. FAILED suite paths: `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.spec.ts` and `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.spec.ts`. Final focused run passed both.
- Scoped Ptah diagnostics were requested after edits; first unscoped attempt timed out with TypeScript still running. Scoped Ptah diagnostics remained unavailable after 45s; the final targeted Nx typecheck passed.

## Decisions

- Use the monitor's warning ratio when available, with 0.85 as the helper's default; this matches the approved threshold and is reversible.
- Keep unknown usage permissive in direct RPC, as requested; this is reversible.
- Resolve budget state by agent ID and tool call ID in the injector, covering rekeyed sessions without relying on a session snapshot; this is reversible.
- Use the existing optional SDK monitor token in RPC DI; no new registration was needed. This is reversible.

## Open risks

- The SDK's built-in SendMessage tool permission path remains for batch D.
- The monitor lookup is in-memory; after a full process restart, a durable record/index must repopulate state for stopped attribution.
- The final warningRatio adjustment passed a repeat focused test run and a repeat rpc-handlers lint/typecheck run.


