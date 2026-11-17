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

## Program phases

| Phase | Task ID | Pull request | State |
| --- | --- | --- | --- |
| B1: measurement and first fixes | TASK_2026_2181_dbbb | see `batch-1-report.md` | done |
| B2.1: retry-safe `ptah_agent_spawn` | TASK_2026_2181_dbbb | #1329 | merged |
| B2.2: bounded CLI detection on spawn | TASK_2026_2181_dbbb | #1343 | merged |
| B2.3a: `starting` status in all readers | TASK_2026_2181_dbbb | #1354 | merged |
| B2.3b: synchronous admission and reply deadline | TASK_2026_2181_dbbb | #1367 | merged |
| B2.4 to B2.6: status, wait and read polish, renderer, agent text | TASK_2026_2181_dbbb | #1375 | merged |
| B3 PR 1: external owner key and completion outbox (runtime) | TASK_2026_2181_dbbb | #1377 | merged |
| B3 PR 2: HTTP binding and piggyback on the next tool result | TASK_2026_2181_dbbb | #1389 | merged |
| B3 PR 3: stdio owner, `ptah_agent_wait` envelope, agent text | TASK_2026_2181_dbbb | #1394 | in review |
| P2: Nx daemon and worktree cost (PR 1: verify without the daemon in worktrees) | TASK_2026_2242_f87b | #1379 | merged |
| P2: Nx daemon and worktree cost (PR 2: pre-push hook without the daemon in worktrees) | TASK_2026_2242_f87b | #1381 | merged |
| P2: Nx daemon and worktree cost (PR 3: dry-run cleanup command for stale Nx data) | TASK_2026_2242_f87b | #1383 | merged |
| P3: process tree stop on Windows (batch 1: review runner and probes) | TASK_2026_2231_816c | #1378 | merged |
| P3: process tree stop on Windows (batch 2: descendants after root exit) | TASK_2026_2231_816c | #1386 | merged |
| P3: process tree stop on Windows (batch 3: SDK spawner and Codex app server) | TASK_2026_2231_816c | #1390 | merged |
| P3: process tree stop on Windows (batch 4: verify script, watcher and auth command) | TASK_2026_2231_816c | #1391 | in review |
| P4a: extract shared memory gate | TASK_2026_2181_dbbb | #1382 | merged |
| P4b: session memory queue admission | TASK_2026_2181_dbbb | #1388 | merged |
| P5: host load (PR 1: measure task index rebuilds and plan limits load) | TASK_2026_2241_c297 | #1380 | merged |
| P5: host load (PR 2: rebuild only changed task folders) | TASK_2026_2245_49ac | #1385 | merged |
| P5: host load (PR 3: 30 s cache for plan limits snapshots) | TASK_2026_2246_6c85 | #1384 | merged |
| P5: host load (PR 4: writer joins the watcher debounce) | TASK_2026_2247_6f98 | #1387 | merged |

P4 baseline (recommendation of the coordinator, 2026-11-16, the user can change it): queue a
lane, do not refuse it. A queued lane shows `starting` with the reason "waiting for memory".
Start a lane only when 3 GB is free. Always start when no lane runs. After 5 minutes in the
queue the lane becomes `failed` with one completion signal. `force: true` skips the memory
condition. The fixed lane cap stays.

P5 order: measurement first, then merge or debounce the rebuild triggers and cache the plan
limits for a short time. It comes after B2.3b and B3.
