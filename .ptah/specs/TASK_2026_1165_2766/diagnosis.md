# Diagnosis: false `user-stop` end of child sessions

Source: installed Electron app log `<appdata>/Ptah/logs/Ptah Electron-2026-11-13.log` (read only).
Times are UTC. Static caller map: `abort-callers.md` (same folder).

## Prior work

- TASK_2026_965_4895 (PR 1110, merged 2026-11-12 00:00 UTC) fixed one path only: the
  180 s no-activity watchdog abort was classified as `user-stop` by the stream broadcaster.
  It added the cause `no-activity-timeout`. It did not touch `chat:abort`, which still
  records `user-stop` for every caller. So the earlier fix is incomplete.

## Timeline of child `0c86a118` ("Card family PR 1157 CI watch")

| Time | Log line | Meaning |
| --- | --- | --- |
| 22:11:45 | `agent child session - session config` tabId 0c86a118 | Child starts as successor of `4fe7342f` (handoff). |
| 22:12:02 | tab 0c86a118 bound to SDK `bb72ca6f` | Session id resolved. |
| 22:12:05 | turn 1 settled (unverified) | Child waits (CI watch). |
| 22:46:14 | parent `5a52b53a` handed off to `8301b476`, adopted 4 child sessions | Parent succession. |
| 22:55:44.526 | `Interrupting session: 5a52b53a` -> "already ended" | A `chat:abort` for the old parent session (its tab closed, most probably). |
| 22:55:45.336 | GitRootWatcherPool stopped watching the child worktree root | Active tab changed. |
| 22:55:58.747 | `Interrupting session: bb72ca6f` | `chat:abort` for the child. No other trigger line. |
| 22:55:58.773 | `session ended (user-stop); 30s grace armed` | Cause recorded from `chat:abort`. |
| 22:55:59.674 | `aborted by user after 59 events`, "already ended" | Broadcaster text, misleading. |
| 22:56:00.177 | GitRootWatcherPool stopped watching the child worktree root again | Consistent with the child tab closing. |
| 22:56:30.619 | ended outside spawner (grace expired) | Outcome "stopped by the user". |

A second occurrence today: child `5ee5ecde` at 23:14:35 (same pattern, direct interrupt,
11 s after a workspace switch). Its turn had delivered, so its outcome showed as completed.

## Stop paths and recorded cause (before the fix)

| Path | Recorded cause | User action needed? |
| --- | --- | --- |
| `chat:abort` -> `ChatSessionService.abortSession` (all 7 renderer callers, worker driver) | always `user-stop` | No for: closed-tab ender on a program close, tab reset, provider carry-over, workspace remove, apps reset, worker driver |
| `/clear` (slash router) | `user-stop` | Yes (user types /clear) |
| Stream broadcaster catch, any error text with abort/cancel | `user-stop` | No |
| No-activity watchdog | `no-activity-timeout` (PR 1110) | No |
| Compaction dwell | `compaction-abort` | No |
| `ptah_session_stop` | `parent-stop` | No (parent) |
| Dead-record cleanup before resume / slash | `stream-exit` | No |
| Host exit, workspace close, config reinit | own causes | No |
| Ptah CLI abort | `user-stop` (hard-coded) | Same as chat:abort |

## Root cause

- PROVEN: `abortSession` and the broadcaster record `user-stop` as a fallback for any
  abort. The cause does not depend on the trigger. Several triggers need no user action.
  This makes the recorded cause dishonest.
- PROVEN: the child end at 22:55:58 came through `chat:abort` (interrupt with `user-stop`,
  no `/clear` log, no watchdog, no `parent-stop`, no handoff close request at that time).
- MOST PROBABLE (hypothesis): the renderer closed the child tab (closed-tab ender or the
  streaming abort listener). The watcher root change 1.5 s later fits a tab close. The old
  parent tab also closed 14 s earlier. A user close, a keyboard shortcut on the active tab,
  a session-row action, or a program close can all produce this. The log cannot tell them apart.
- UNKNOWN: which renderer caller sent the `chat:abort`. `chat:abort` logged only at debug.

## Fix

1. `chat:abort` gets an optional `source` (Zod-validated). Each caller names its source.
2. The host maps the source to a cause: `stop-button`/`apps-stop` -> `user-stop`,
   `tab-close` -> new `tab-close`, `workspace-remove` -> `workspace-close`, everything else and
   a missing source -> new `internal-abort`. A missing source is never `user-stop`.
3. An info log `[RPC] chat:abort` with source and cause, so the next case names its trigger.
4. The broadcaster records `internal-abort` for a generic abort error and stops writing
   "aborted by user".
5. The child outcome words no longer claim the user for `tab-close` or `internal-abort`.
