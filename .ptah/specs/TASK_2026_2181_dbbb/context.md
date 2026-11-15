# Context: slow MCP tool calls and lost lane completion signals

## User request (2026-11-15)

The user sees that spawned processes use most of the memory and processor, and that lane
reports do not arrive. The user asked to focus on the performance fixes. This task is the
first one: it removes a fault that causes duplicate lanes and duplicate tasks in all sessions.

## Faults (evidence from 2026-11-15, Electron host, Windows 11)

1. **MCP tool calls exceed the client timeout although the host completes the work.**
   - `ptah_agent_spawn` returned "The operation timed out" 3 times in one session. Lanes
     `ee1fad02` and `7b0084bb` started anyway. A retry can start a duplicate lane.
   - `ptah_task_create` returned "The operation timed out" 2 times. Both calls created a task
     (`TASK_2026_2181_dbbb` at 12:50:41Z and `TASK_2026_2182_123e` at 12:50:53Z, 12 s apart).
     The duplicate was removed by hand.
   - Session `checking performance bottlenecks` (TASK_2026_2180_f8b5) measured 61-73 s host
     time for `ptah_agent_spawn`, and got one duplicate lane.
   - The tool description says HTTP calls wait at most 45 s.
   - `ptah_git_worktree_add`, `ptah_agent_status` and `ptah_agent_list` returned in time in
     the same minutes, so the delay is not in every tool.
2. **`<agent-lane-completed>` signals do not arrive in the parent session.**
   - Codex lanes `ee1fad02` and `7b0084bb` completed with exit code 0 and wrote their
     deliverables. No signal arrived in the spawning session (a Claude Code CLI session
     that uses the Ptah MCP server; it is not a Ptah chat tab).
   - Session `checking performance bottlenecks` lost the signals of three completed lanes.

## Machine state at the time

5.2 GB free, later 4.4 GB. 14 Claude sessions open. One Ptah process tree of 97 processes
with 9.7 GB. Host load can be a cause of fault 1.

## Related work (do not duplicate)

- TASK_2026_2180_f8b5, branch `fix/rpc-timeouts-session-switch`: host RPC and watcher load
  (task-spec watcher rebuild storm, git:info, chat:resume). In gate and review. A slow host
  event loop from those causes can explain a part of fault 1.
- Session `fix-mcp-handshake-race`: asked for overlap, reply pending.
- Commit da6e82cb4 `fix(vscode-lm-tools,rpc-handlers,gateway-chat-bridge,chat): cap MCP wait`.

## Out of scope (separate tasks, not started)

- Process tree stop on Windows (4 tree-unsafe stop paths, no Job Object).
- Nx daemon and plugin workers for each worktree.
- A concurrency limit for lanes and sessions that depends on free memory.

Source report for those: `D:\projects\ptah-extension\.ptah\tmp\orphaned-processes-investigation.md`.
