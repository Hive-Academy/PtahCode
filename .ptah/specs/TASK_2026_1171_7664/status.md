# Status — TASK_2026_1171_7664 (Phase B)

2026-11-13: PAUSED by parent — drive D: full (12 MB free). No new lanes, checks or commits.

- Done: task created, context.md written (initial trace + lead H-B1).
- H-B1 (code-backed, not runtime-confirmed): codex-chat-host-ports.ts:392 lets a user MCP
  server named `ptah` replace the per-tab `/session/{tabId}` URL -> no caller session id ->
  session-spawner.service.ts:349 refuses `unattributed-caller`.
- Running: codex research lane e4223b79-e958-444e-93c2-2a12fd669896, deliverable
  research-report.md (its write may fail while the disk is full).
- Next after disk space returns: read research-report.md, plan fix batches, codex lanes.

2026-11-13: research batch COMPLETE (research-report.md, lane e4223b79, verdict delivered).
- Root cause: Codex tab id used where the native adapter needs the live thread id
  (guardStart, agent-namespace resolveSessionId/getParentLevel, drainer). Second defect:
  user `ptah` MCP entry overrides the host session URL (codex-chat-host-ports.ts:392).
- Batch report sent to parent with ptah_agent_report: Delivered yes (child-session report
  path receipt evidence #1).
- Planned: B1 resolver, B2 reserve `ptah`, B3 handshake diagnostics, B4 completion read-ack.
- Still PAUSED: wait for the parent's disk-space clearance before lanes, checks, commits.

2026-11-13 18:39: pause cleared by parent (D: 15.7 GB free). D4 ownership recorded.
Lanes running (codex, parallel, disjoint write sets): L1 512c89ab (B1+B2), L2 1eb38520 (B3),
L3 08c4ebec (B4). Waiting for completion signals. No checks run while lanes edit.

2026-11-14 07:35: PR #1265 head 4759d6007. CI: all pass except electron-e2e shard 2
(conflict-and-history-axe.spec.ts:55 contrast, pre-existing, accepted by parent).
Parent: Electron UI evidence is REQUIRED before ready-for-review: (a) Codex-tab parent starts
a child session, (b) lane report arrives at the real parent, (c) Codex-tab approval routing.
Free memory 3.1 GB (< 5 GB). Codex lane ed84e86d writes the opt-in evidence spec
apps/ptah-electron-e2e/src/specs/chat/caller-attribution-evidence.spec.ts and
.ptah/tmp/caller-evidence-chain.sh. The coordinator runs the chain under the verify lock.

2026-11-14 10:15 (report to parent not delivered: parent-session-not-active).
Evidence runs 2-5 failed on test setup only; no Phase B defect found so far.
- a run 2: Codex called ptah_session_start; the approval prompt on its own rail card was not
  clicked and timed out (60 s). Not "MCP 0". a run 4: caller check passed (guardStart), then
  the worktree provisioner refused: temp workspace had no commit at HEAD.
- b run 4: false pass on the completion notice (it repeats the task text); the lane stopped
  after 2 s with no report. b run 5: parent said ptah_agent_spawn was not available.
- a/c run 5: model catalog empty when the boot CLI probe missed Codex (5/8 CLIs).
- Test-only fixes: 513761fae, 1b2b5c02b (workspace must be outside the repo), fb3c8a41b,
  40fb98519, c087d1eb9, 286918a23, 96e2b7939, 7d829dec0, 57c6ab31c.
- git status after every run: only untracked HANDOFF.md. Run 6 (a, b, c) started.
- Not pushed; origin head 4759d6007 had no foreign commits at 09:08. PR #1265 stays draft.

2026-11-14 12:45: evidence runs 6-7.
- b PASS (run 6): `<agent-report>E2E-REPORT-MARKER` in the Codex parent tab, inside the
  completion notice (report-delivery 1-sent, held-for-completion).
- c PASS (run 6): `node --version` prompt only on the parent's own rail card; Deny closed it.
- a run 6 FAIL: other Ptah instances held MCP ports 51820-51822, the app had no MCP server
  ("MCP 0"). Test fix f3eb68915 writes a free `ptah.mcpPort` to the temp profile config.json.
- a run 7 PARTIAL: child "child-ready" started for the Codex parent thread id (no
  unattributed-caller), ran to Done. No rail parent/child link: spawner never logged
  `bound to SDK session` for the Codex child, so recordOrganization stored no parentSessionId;
  sdkIdOf(guard.caller) looks up a tab id but the Codex caller is a thread id. Production gap,
  also on main (branch does not touch session-spawner.service.ts). Needs parent decision.
- git status after every run: only status.md and untracked HANDOFF.md.
- Fetch 12:44: origin 4759d6007, no foreign commits. Test-only commits pushed; PR stays draft.

2026-11-14 12:50: pushed 4759d6007..085f486a8 (no force), PR body test plan updated, CI watch
started. Report to parent NOT delivered (parent-session-not-active). Decision needed from the
parent: fix the Codex child rail link (session-spawner recordOrganization / sdkIdOf) in
PR #1265, or record it as a follow-up and accept item (a) as partial. PR stays draft until then.

2026-11-14 (successor session): fetch showed no foreign commits; pushed 085f486a8..1ebd6ed85
(no force). CI at that time: 6 pass, 10 pending, 3 skipping, no failure. Report to parent sent
again (same text as 12:45/12:50 plus CI state): NOT delivered (parent-session-not-active).
Decision on item (a) still open. Assumption: no production change to session-spawner without
the parent's decision; PR #1265 stays draft.
