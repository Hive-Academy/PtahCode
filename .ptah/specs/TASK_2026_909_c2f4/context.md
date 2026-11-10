# Context — TASK_2026_909_c2f4

## User report

The user feels a small lag in the Electron app and supplied the renderer console log of a
session of about 25 minutes (2026-11-09 21:45 to 22:10 UTC).

## Symptoms in the log

| Symptom | Count | Log line |
| --- | --- | --- |
| Long animation frames, 207-737 ms | ~25 | `[WARN] RendererFrame: long frame {"durationMs":…}` |
| Git read on a removed worktree | ~14 | `[SessionGitStatsStore] Git read failed. This worktree folder no longer exists on disk.` |
| RPC timeout | 4 | `boot:getReadiness` |
| RPC timeout | 1 | `file:pick` |
| RPC timeout | 1 | `attention:getSnapshot` (then `Attention snapshot unavailable`) |
| RPC timeout | 2 | `git:info` (SessionGitStatsStore read, ChangeSetStore reconcile) |
| Watch lease failure | 1 | `[GitRootWatchLeaseService] git:watchRoots failed` |
| Advisory | 1 | `[ChatStore] PostCompact advisory fallback applying one targeted reload without boundary metrics` |

## Investigation lanes (read-only)

| Lane | Family | Scope | Deliverable |
| --- | --- | --- | --- |
| codex | codex | Host side: RPC timeouts, git handlers, main-process blocking | `host-investigation.md` |
| Glm | ollama-cloud | Renderer side: repeated Git reads, long frames | `renderer-investigation.md` |

## Host evidence (coordinator, from `%APPDATA%/Ptah/logs`)

`ptah-hang.log` (main-loop-watchdog) shows the Electron main event loop blocked for 5-30 s,
each time with the MCP tool `ptah_task_create` in flight:

| UTC time | Tool in flight | Blocks | Renderer symptom |
| --- | --- | --- | --- |
| 21:46:18 | (start-up, `boot:getReadiness` pending) | 13.7 s | `boot:getReadiness` timeouts (5 s pull timeout) |
| 22:05:04 | `ptah_agent_list`, `ptah_task_get`, `ptah_workspace_analyze` | 17.1 s | — |
| 22:05:30 | `ptah_task_create` | 8.8 s, 10.3 s, 7.9 s | `attention:getSnapshot` timeout 22:05:58 |
| 22:08:24 | `ptah_task_create` | 30.6 s, 21.3 s | `git:info` timeouts, `git:watchRoots` failed ~22:09 |
| 22:26:56 | `ptah_task_create` | 6.7 s, 15.6 s, 17.3 s | — |
| 22:29:05 | `ptah_task_create` (this task) | 6.3 s, 19.5 s, 14.3 s | host log: slow tool 49215 ms |

Scale: 38 worktrees, about 430 task folders in `.ptah/specs` of the main checkout.
The renderer `git:info` budget is 75 s (`session-git-stats.store.ts:31`), not the 30 s default,
so the Git queue mismatch in `host-investigation.md` finding 4 does not apply to these stores.

## Implementation lanes

| Lane | Family | Scope | Deliverable |
| --- | --- | --- | --- |
| codex (resumed) | codex | Host: remove the main-thread block in the `ptah_task_create` path | `host-fix-report.md` |
| Glm | ollama-cloud | Renderer: root-flip loop, snapshot identity, `file:pick` timeout, frame attribution | `renderer-fix-report.md` |

Review plan: cross-family. Glm reviews the host change, codex reviews the renderer change.

## Workflow

BUGFIX, Partial depth: investigate → implement → scoped verify → independent review → PR.
