# TASK_2026_1171_7664 — Phase B: caller attribution, lane MCP handshake, report delivery, completion dedup

Program: TASK_2026_1168_7335 (phase B, child session "caller-attribution").
Parent session: 3540da80-9f60-4a01-9634-406eb4563c7f.
Worktree: `.claude-worktrees/fix-caller-attribution-reports-6b5bb5ea603f`, branch
`fix/caller-attribution-reports`.

## Source evidence (read-only, nx-video)

- Brief: `D:/projects/nx-video/.ptah/specs/TASK_2026_015_1698/PTAH_PERMISSIONS_FIX_PROMPT.md`
- `ptah_session_start refused (unattributed-caller): ptah_session_start must be called from a
  live chat session; this caller has no live session id` from a Codex app-server main tab.
- Codex lane 3e4ede99-01ec-41c5-b551-a7d7cda3b3ef (CLI session
  01a1d4bc-6bb5-7612-acf9-7b4243e17078): `Ptah MCP did not connect for this lane
  (handshake-timeout); report in your final message.`
- Report counts zero for both lanes. Completion notices arrived late, some after the parent had
  already read the result. Verdict `no-deliverable` correct.

## Scope (phase B)

1. Caller attribution for `ptah_session_start` from a Codex app-server tab.
2. Whether the unattributed caller also makes lane spawns resolve the parent permission
   fail-closed to `plan` (report to Phase A; do not edit permission mapping).
3. Codex lane Ptah MCP handshake timeout + dedicated regression test.
4. Report delivery from lanes / child sessions to the real parent + tests.
5. Completion-notice dedup and reconciliation; exit 0 must not mask failures.

Out of scope: permission mapping / approval routing (Phase A, child perm-propagation), native
Codex subagent UI (Phase C, child codex-native-subagents).

## Pre-flight

- Type BUGFIX, depth Full (from parent). Flow: research -> batch -> implement -> review ->
  tests -> completion.
- Gate 0.1: lanes enabled; codex has confirmed room (weekly 69%). Glm and kimi at limit.
  User preference: lanes first, codex first. Approval mode: lane-review.

## Initial trace (orchestrator, before the research lane)

- Refusal: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:349`
  `SessionId.safeParse(callerSessionId)` + `adapter.isSessionActive(caller)`.
- Caller id is transport-derived: `/session/{id}` in the MCP URL, parsed in
  `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:281,527`.
- Codex main chat builds the URL in
  `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:330-410`
  (`ptahMcpSessionUrl`, routing id = tab id). Lead H-B1: line 392 lets a user MCP server named
  `ptah` (e.g. a workspace `.mcp.json` entry written by the file-writer twin `ptahMcpUrl`, which
  has no `/session/` segment) replace the session URL. Then the Codex tab calls Ptah MCP without
  a session id and every session-scoped tool is unattributed.
- `TOKENS.AGENT_ADAPTER` is `RoutingAgentAdapter` (agent-sdk `di/register.ts:1081`), which routes
  `isSessionActive` to the Codex native adapter when it owns the tab id.
- Lane MCP warning: `agent-process-manager.service.ts:1422-1486` (attachment probe,
  `MCP_ATTACHMENT_TIMEOUT_MS`).
