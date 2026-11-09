# TASK_2026_MCP_AUTH_REJECT — Ptah MCP rejects a running session

status: in-review
type: BUGFIX (investigation first, read-only until the root cause is known)

## Symptom

One Claude session in Ptah lost its `ptah` MCP server mid-session. Other sessions keep working.

- Affected session id: `7e549dc0-62fd-4ba6-a6e0-53c11c85c570` (task TASK_2026_SUBAGENT_FOLLOWUPS).
- Error on every `ptah_*` call, verbatim:
  `MCP server "ptah" rejected the Authorization header in its config (update it, then run /mcp to reconnect)`
- Then the session got: "The following MCP servers require authentication: ptah, sentry"
  and "The following MCP servers have disconnected: ptah".
- The MCP popover in the Ptah UI shows `ptah` and `sentry` as "Needs authorization".
  sonarqube, hyperframes and claude.ai Claude Docs show "Connected".
- The **Authorize** button opens the marketplace, and the marketplace says Ptah is connected.
  So the button does not fix the state.

## Timeline (UTC)

- 22:17:21 `ptah_agent_spawn` (codex) succeeded in this session. The lane ran 7m 28s.
- ~22:25 the lane completed. Its `<agent-lane-completed>` signal still reached the session
  later, after the failure (push from Ptah to the session still works).
- 23:16:48 `D:\projects\ptah-extension\.mcp.json` was rewritten (file mtime). It holds
  `ptah` as `type: http` with the token in the URL path:
  `http://localhost:51820/auth/<token>/workspace/D%3A%5Cprojects%5Cptah-extension`.
- After that, every `ptah_*` call from the session failed with the error above
  (`ptah_agent_spawn` twice, after a fresh ToolSearch load).

## Evidence already collected

- A plain `curl` POST of `tools/list` to the URL now in `.mcp.json` returns HTTP 200.
  The server runs and that token is valid.
- That reply lists only 30 read-only tools (workspace_analyze, search_files, agent_status,
  agent_read, agent_list, session_status, ...). Write tools such as `ptah_agent_spawn`,
  `ptah_session_start` and `ptah_session_handoff` are absent. So write tools depend on
  some session binding that the bare config URL does not carry.
- Hypothesis (not proven): the session-bound credential of this session was rotated,
  expired or revoked (Ptah restart, `.mcp.json` rewrite, or a per-session token TTL),
  and Claude Code then treated the 401/403 as an OAuth requirement.

## Questions to answer

1. How does a Ptah Claude session authenticate to the MCP HTTP server, and how does it get
   the session-bound tools? Where is that credential minted, stored and checked?
2. What rewrote `.mcp.json` at 23:16:48 UTC, and does that rotate a token that running
   sessions still use? Why did other sessions survive?
3. Which status code and headers does the server return for a stale token, and why does
   Claude Code start an OAuth flow (the Authorize button to the marketplace) for it?
4. Is `sentry` "Needs authorization" related, or a separate expected state?
5. How can a running session recover without a restart? What fix prevents it
   (stable token across rewrites, grace period, clear error, reconnect hint)?

## Rules

- Follow `D:\projects\ptah-extension\CLAUDE.md`: memory-safe verify only, Electron first,
  worktree before any file change, delegate to non-Claude CLI lanes.
- Read-only investigation first. Write findings to `investigation.md` in this folder.
- Do not touch `.claude-worktrees/subagent-followups` or the usage-burn files.
