# Code Logic Review — `TASK_2026_1171_7664`

## Summary

| Metric | Value |
| --- | --- |
| Score | 5/10 |
| Verdict | REVISE |
| Blocking / Serious / Moderate / Minor | 0 / 3 / 2 / 0 |

The transport URL remains the source of caller identity, and the Codex adapter refuses ambiguous tab mappings. The completion acknowledgment path has failure and replay gaps. The score is above the foundationally wrong band because the core identity mapping is sound; it is below the sound band because a read can fail and a delayed push can reappear after acknowledgment.

## Five logic questions

1. **How does this fail silently?** An acknowledged completion can leave a durable outbox entry behind (`lane-completion-notifier.service.ts:550-552,665-669`); a later restart loses the in-memory acknowledgment (`completion-read-ack.ts:4`) and can replay that entry.
2. **What user action produces unexpected behaviour?** `ptah_agent_read` can return an error after output was fetched if the added status lookup or cancellation fails (`protocol-dispatcher.ts:1451-1458`). `ptah_agent_wait` has the same dependency on acknowledgment (`protocol-dispatcher.ts:1724-1733`).
3. **What input data produces a wrong answer?** An exit-zero lane with a fresh deliverable and a failed report remains `delivered`: `reportsDelivered` is ignored by `verdictOf` (`lane-completion-notifier.service.ts:1159-1179`), and the envelope states failed report count is unavailable (`:1189`).
4. **What happens when a dependency fails?** `parentDelivery.cancel` may reject in `settleEnqueue` (`lane-completion-notifier.service.ts:847-850`), which rejects the signal operation; the callback in `:570-579` catches cancellation errors but treats a refused cancellation result as success.
5. **What is missing that requirements never mentioned?** A durable record that a parent consumed a completion. The 256-entry memory set (`completion-read-ack.ts:3-5,20-25`) cannot protect delayed/replayed notices after eviction or restart.

## Blocking

None.

## Serious

### Read and wait hooks are not best effort

- Evidence: `protocol-dispatcher.ts:1451-1458,1724-1733`; `completion-read-ack.ts:26-28`.
- Scenario: `agent.status`, `resolveCallerParentId`, or pending cancellation throws after a successful read or wait. The tool returns an error instead of the result; for wait, a failed acknowledgment prevents `runAgentWait` from processing the entries.
- Fix: Catch and log status, resolution, and acknowledgment errors locally. Return the original read/wait result. Add throwing dependency cases to both dispatcher specs.

### Durable outbox can resurrect an acknowledged completion

- Evidence: `lane-completion-notifier.service.ts:550-552,665-669,704-706,717-725`; `completion-read-ack.ts:3-5,20-25`.
- Scenario: A parent reads during checkpoint or before a restored outbox entry replays. The new skip returns without settling/removing the checkpoint. After process restart or 256 newer acknowledgments, the memory key is absent and replay enqueues the old notice. This violates the promised no-push-after-read behavior and can retain outbox entries indefinitely.
- Fix: Persist a consumed transition or atomically settle/remove its outbox entry when acknowledging, including the checkpoint race. Have replay treat a consumed entry as settled. Test read-during-checkpoint, restart, and eviction.

### Report-delivery failure is masked by success verdict

- Evidence: `lane-completion-notifier.service.ts:1159-1179,1186-1194`; test expectation `lane-completion-notifier.service.spec.ts:1152-1161`.
- Scenario: A lane exits zero, writes its deliverable, but `ptah_agent_report` fails. The completion still says `verdict="delivered"` and `failed: unavailable`, so the parent cannot distinguish report failure from no report attempt.
- Fix: Record attempted/failed report delivery on the lane, carry it into the completion signal, and surface an explicit failed-report state. Keep `no-deliverable` for missing files.

## Moderate

- **Cancellation result ignored:** `lane-completion-notifier.service.ts:570-579` catches thrown errors but ignores a `{ refused: ... }` return from `parentDelivery.cancel` (`parent-delivery-drainer.service.ts:117-120`). Log and retry a refused cancellation or retain it as pending reconciliation.
- **Unauthenticated diagnostics can be overwritten:** `http-server.handler.ts:379-388,391-405,419-425` records an agent ID from an untrusted URL before authentication; `mcp-attachment-observer.ts:48-52` overwrites the last attempt. A local caller can replace the real handshake reason for a known agent ID with `forbidden` or `auth-required`. Keep rejected attempts separate from authenticated lane observations, or verify credential binding before attributing them to a lane.

## Data flow and requirements

| Requirement | Trace and assessment |
| --- | --- |
| B1 caller attribution | URL stamps `_callerSessionId` (`http-server.handler.ts:527-549`); `resolveCodexCallerId` maps the raw ID (`ptah-api-builder.service.ts:1209-1216`); adapter returns only a live, unique tab thread (`codex-chat-adapter.ts:216-228`). No tool argument supplies the identity. Ambiguous/stale tabs fall back to raw and should fail closed. |
| B2 reserved host MCP | Host server is inserted first and a user `ptah` entry is skipped when a session URL exists (`codex-chat-host-ports.ts:373-404`). |
| B3 handshake diagnostics | Attempt map is capped at 512 (`mcp-attachment-observer.ts:48-52`), and the warning includes reason/method only (`agent-process-manager.service.ts:1456-1467`). Attribution of pre-auth failures remains unreliable. |
| B4 read acknowledgment | Key includes `agentId:completedAt` (`completion-read-ack.ts:7-10`), so a later transition with a different timestamp is separate. Read/wait hooks and durable replay are partial, as above. |
| Missing deliverables | `verdictOf` returns `no-deliverable` for declared missing/empty/stale files (`lane-completion-notifier.service.ts:1169-1179`); the existing regression covers exit zero (`lane-completion-notifier.service.spec.ts:1143-1150`). |

## Decisions

- Keep raw transport ID when the Codex lookup is ambiguous or unavailable; the adapter returns no thread in those cases (`codex-chat-adapter.ts:216-228`), and the existing guard remains responsible for rejecting an inactive raw ID. This is reversible.
- Treat report-delivery status as distinct from file deliverability, while requiring it to be explicit. The current `delivered` verdict tests file output only (`lane-completion-notifier.service.ts:1169-1179`). This is reversible.

## Verification and verdict

Reviewed the changed logic, surrounding store behavior, relevant specs, task context/decisions, and cross-repository usages of the changed exports. Ptah symbol search returned zero hits; native `rg` was used once as fallback. No checks were run under the review's memory-safe verification rules. The focused specs do not exercise throwing acknowledgment hooks, checkpoint races, restarts, or report failure with a fresh deliverable.

**Recommendation: REVISE.** Confidence: high on the read/wait failure and durable replay paths; medium on the report-status contract because failures are not yet represented in lane state.
