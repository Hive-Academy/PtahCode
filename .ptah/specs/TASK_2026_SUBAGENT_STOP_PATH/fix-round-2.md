## Fixes

- **R1:** Redaction now catches snake-case and extended environment names, quoted and plain Authorization headers, bare Bearer credentials, and prior token, key, URL, and PEM forms. Normal prose remains unchanged. `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:227`; regression cases at `subagent-budget-monitor.spec.ts:310-335`.
- **R2:** Budget identities are keyed by session and identity; lookup returns the newest matching live state, and spawning a new Agent with a reused name clears that session's stopped name. The SDK guard, RPC handler, and context injector pass the session ID. `subagent-budget-monitor.ts:210,687,971`; `sdk-permission-handler.ts:522`; `subagent-rpc.handlers.ts:429`; `chat-subagent-context-injector.service.ts:387`; regression cases at `subagent-budget-monitor.spec.ts:375-396`.
- **R3:** Stops move through `none → pending → stopped`, returning to `none` after a rejected stop. Pending and stopped states refuse resume; the executor signals and records a stop only after `stopped`. `subagent-budget-monitor.ts:1180,1189,1223`; `session-query-executor.service.ts:362`; regression cases at `subagent-budget-monitor.spec.ts:404-414` and `session-query-executor.service.spec.ts:1740-1760`.
- **R4:** An existing hook transcript is accepted after real-path containment under `~/.claude/projects/`, regardless of the derived workspace slug; the derived path remains an existing-file fallback. `subagent-budget-monitor.ts:244-265`; regression case at `subagent-budget-monitor.spec.ts:337-360`.

## Verification

Commands (PowerShell output filtered to the final 40 lines):

1. `npm run verify -- -t test -p agent-sdk,rpc-handlers -- --testPathPatterns="sdk-permission-handler|session-query-executor.service.spec|subagent-resume-advice|subagent-budget-monitor.spec|subagent-rpc.handlers|chat-subagent-context-injector|subagent-hook-handler"` — final result: `NX 2 tasks: 2 succeeded`, exit code 0. Initial run failed on two test assertions, corrected before the passing rerun. Every initially FAILED suite path: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts`; `libs/backend/rpc-handlers/src/lib/chat/session/chat-subagent-context-injector.service.spec.ts`. Final run: no FAILED suites.
2. `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers` — final result: `NX 6 tasks: 6 succeeded, 3 cached`, exit code 0. Initial run failed `@ptah-extension/agent-sdk:lint` because a new spec had a newline between `it.each(...)` and its call; corrected before the passing rerun. No FAILED suites in the final run.

## Decisions

- **R5:** Kept the bounded 256-entry FIFO stopped-identity index as directed. Its oldest identity can eventually be evicted after enough stops; this was explicitly accepted by the coordinator.
- Missing or non-string SDK SendMessage `to` values remain allowed because no target can be resolved. A live agent at the warning threshold remains steerable until its stop is pending or complete.
