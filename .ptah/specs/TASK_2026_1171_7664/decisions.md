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
- D11 (resume session, evidence): Lane 9444ab05 has no host record and wrote no review.
  Antigravity lanes 44dc6f70 and 56df3836 both stopped with no deliverable: headless mode
  auto-denies `run_command`, even when the brief forbids it. Full auto-approve (yolo) is not
  used (hard rule). Grok, Glm and kimi are at limit; copilot and opencode are disabled.
  Fallback reviewer: a fresh codex lane b9b8d639 (same family as the implementers).
  Review family label: codex, same-family, WEAKER EVIDENCE. Both antigravity lanes also
  printed `handshake-timeout` (Ptah MCP not connected within 15 s): live evidence that the
  lane MCP handshake failure from B3 still occurs for antigravity lanes. B3 adds diagnostics
  only; it does not claim a root-cause fix.
- D12 (parent): Fix all 5 review findings in one round (lane 90d818e4). The final PR review
  before push must use a family other than codex. If no non-Claude lane can run, use one
  Claude reviewer (a `cli: "claude"` lane or a code-logic-reviewer subagent) on
  `git diff main...HEAD`, scoped to the fix round plus the identity mapping. No yolo.
- D13 (parent + evidence): Keep the two antigravity `handshake-timeout` lines (sanitized) as
  PR evidence. Assessment: the running host is built from main, without B3, so the warning
  has no reason detail. B3 adds the reason (no-request-seen / rejected:<reason> /
  seen-but-not-initialize) but changes no handshake behavior. So B3 does not explain or fix
  these lines. The antigravity handshake timeout stays a REMAINING LIMITATION (separate
  adapter-side issue, root cause not confirmed) and is listed in the PR.
- D14 (D12 applied): Fix round committed as 7942e1de6 (lane 90d818e4, codex). Lane Jest gave
  no verdict (runner hung), so the coordinator runs the related tests. Final PR review: a
  `cli: "claude"` lane 23b53efd (opus tier), Review family: claude (different from codex).
  Reason: antigravity cannot run headless without yolo (D11); grok, Glm, kimi at limit;
  copilot and opencode disabled.
- D15 (final review 23b53efd, claude family): REVISE 6/10. S1, S3, M1, M2 fixed; S2 partly.
  New Serious S-NEW-1: a stale pending-cancellation callback cancels an already delivered
  envelope when the parent reads after the push. Caller identity B1/B2 judged sound. Fix
  round 2 (last one inside the revise cap): S-NEW-1 plus local Minors m1 (per-entry try in
  wait loop), m2 (wording "N report attempts failed"), m3 (JSDoc placement, indent), m4
  (per-map expiry in observer), m5 (single consume path). Starts after the related tests end
  (no lane edits during a check). Then one short re-review scoped to fix round 2.
