# Decisions (P1 coordinator)

| Decision | Evidence | Reversible |
| --- | --- | --- |
| Gate 0.1: lanes enabled, approval mode lane-review. Implement with Claude subagents (family claude); review with a Codex lane (family codex, role code-logic-reviewer). | `ptah_agent_list`: codex installed, confirmed room; kimi and Ollama at limit. | Yes |
| Batch 2 adds `assessAdmission` and keeps `assess`/`evaluate` unchanged because CLI lanes still use them (P4 migrates). Raw dimension skipped for lane accounting. | Plan "preserve existing callable policy contracts while consumers migrate". | Yes |
| `laneRepeatCallStopAt` label text lives in `libs/frontend/chat/.../lane-guards-settings.logic.ts`; left to P4/P5 (lane and UI phases). | Out of P1 scope. | Yes |
| Batches 3+4 run as one subagent because `checkNotesTool` and the gate share the monitor. Monitor and batch2 specs are rewritten by a second subagent after the source lands. | Spec files are 3600+ lines with 139 stopSubagent references. | Yes |
| `canUseTool` pause deny calls a new `checkPausedTool` monitor method; batch 6 declares it optional so the two lanes compile independently. | Disjoint write sets. | Yes |
| `ptah_session_handoff_ack` and `subagent-rpc.handlers.ts` user stop are untouched. | context.md "User decisions on the plan". | No |
| P1 review finding 2: include the full handoff instruction in the tool ceiling denial. Defer live parent pause and overdue notices to P3/P5. | The existing queue drains on the next parent tool result and cannot reach a blocked foreground parent. P3 owns report routing and P5 owns live UI notices. | Yes |
| P1 round-two finding 2: defer parent-scoped gate keys. | SDK agent IDs are unique per run. A collision across live parent runs is rare, and changing gate ownership is outside this fix round. | Yes |
