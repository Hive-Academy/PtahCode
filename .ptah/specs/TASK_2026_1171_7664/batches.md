# Batches — TASK_2026_1171_7664

Executor: codex CLI lanes (user preference, confirmed room). Lanes run in parallel in this
worktree with disjoint write sets. Lanes never commit. The orchestrator runs the scoped verify,
the review and the commits.

| Batch | Lane | Scope | Write set | State |
| --- | --- | --- | --- | --- |
| B1+B2 | L1 | Tab->thread caller resolution for session namespace + agent namespace (resolveSessionId, getParentLevel); reserve `ptah` in Codex host ports | ptah-api-builder.service.ts (+spec), codex-chat-host-ports.ts (+spec), parent-delivery-drainer.service.ts (+spec) only if needed | LANE DONE (lane-L1-report.md). No drainer change needed. Approval id = thread id confirmed (reported to parent). Frontend spec agent-monitor.store.spec.ts not run by lane (esbuild EPERM) -> run in gate. |
| B3 | L2 | Lane MCP handshake: secret-free diagnostics, probe deadline aligned to adapter startup, regression tests | http-server.handler.ts, mcp-attachment-observer.ts, agent-process-manager.service.ts (+specs), codex-lane-activation.spec.ts | LANE DONE (lane-L2-report.md). Probe deadline kept at 15 s (no evidence of lazy init). Jest did not load (worktree had no node_modules; junction added 18:6x). Specs to re-run in the orchestrator inner loop. |
| B4 | L3 | Completion read-ack dedup; verdict shows MCP/report failures; keep no-deliverable | lane-completion-notifier.service.ts (+spec), new small helper file(s) in cli-agents/, one-line hook in protocol-dispatcher.ts (+spec) | LANE DONE (lane-L3-report.md; jest 86/86 runtime, 384/384 dispatcher). FIX ROUND: read-ack compared the raw caller id with the resolved parent id -> lane 00473984 adds agent.resolveCallerParentId. Limitations: a notice restored from persistence before registration can still drain after a read; no failed-report count on agent records; lane report to this parent refused `parent-inbox-full` (report-delivery evidence). |

Projects for the gate: vscode-lm-tools, cli-agent-runtime, rpc-handlers (+ Electron app affected).
