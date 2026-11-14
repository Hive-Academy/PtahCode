# Decisions — TASK_2026_1171_7664

- D1 (evidence): Fix attribution by resolving the transport-bound caller id with the existing
  `CodexChatAdapter.resolveLiveSessionId` (tab id -> unique live thread id). Input stays the
  authenticated URL-bound id, so no identity spoof. Fallback to the raw id for non-Codex callers
  keeps the Claude path unchanged (smallest blast radius).
- D2 (evidence): Reserve the MCP server name `ptah` for the host in Codex main chat, same as
  Claude `mergeMcpOverride`.
- D3 (evidence): Do not change `parentLanePermission` semantics. Only its argument changes.
- D4 (parent): This session owns ptah-api-builder.service.ts ~770-790 and
  codex-chat-host-ports.ts. Phase A (session 50245322) owns parentLanePermission semantics
  (incl. `ask`) and the adapter mapping. Notes for Phase A go through the parent.
- D5 (evidence): Three parallel codex lanes with disjoint write sets (batches.md). protocol-
  dispatcher.ts is a god file: new logic goes into helper files, the dispatcher gets a minimal hook.
- D6b (parent, overlap): Phase A fixes the tab-vs-thread lookup inside parent-lane-permission.ts
  (covers getParentLevel and the resume path in register-agent-messaging.ts). B1 does NOT change
  the getParentLevel argument and does not edit parent-lane-permission.ts or
  register-agent-messaging.ts. B1 keeps guardStart (via the session namespace caller id),
  agent namespace resolveSessionId and the drainer. L1 steered at 18:4x (message 53c61049).
- D7 (evidence, preliminary): The lane parent id for a Codex tab is the thread id. The UI
  filters agents and approvals by the tab's claudeSessionId with strict equality
  (tab-manager.service.ts:519, agent-monitor.store.ts:1227, session-scope.ts:37-43). Codex
  host events carry the native session id (codex-chat-event-callbacks.ts:57). L1 confirms the
  claudeSessionId of a Codex tab and adds a backend spec and a frontend spec (message adb34bdb).
  The answer is sent to the parent for Phase A.
- D9 (parent): Phase A (fix/lane-permission-routing) also edits agent-process-manager.service.ts
  (spawn result) and protocol-dispatcher.spec.ts. Keep edits small and in separate regions. The PR
  that merges second rebases onto main and resolves conflicts. Current state: this branch edits
  agent-process-manager.service.ts only at 1428-1487 (MCP warning, +13/-3) and adds one import
  line plus one block at ~195 in protocol-dispatcher.spec.ts. Fix lane 00473984 told to stay in
  that block.
- D6 (parent): Check D: free space before each heavy check; report if below 5 GB.
- D10 (evidence): Final code-logic review by antigravity (Gemini family; codex wrote all code).
  Glm, kimi and grok are at limit. Review family: antigravity (different family). Lane
  9444ab05, deliverable code-logic-review.md. Review runs on the uncommitted diff while the
  verify gate waits in the machine-wide lock queue.
