# Context

## Objective

Find and fix why the Electron main process event loop is starved for about 27 s at app
startup (`apps/ptah-electron`). The renderer side is handled by TASK_2026_921_fde0 on branch
`fix/renderer-startup-freeze` (not edited here).

## Evidence (release logs, UTC 2026-11-10)

- Last main log line before the stall: 15:57:47.482. `[event-loop] lag` 8007 ms at
  15:57:55.482, 17259 ms at 15:58:14.740, 2990 ms at 15:58:21.701.
- `openAndMigrate` on `ptah.sqlite` (1563 MB, freelist 47920 pages) with a pre-migration
  backup of 1.64 GB in 16755 ms that ended at the same millisecond as the 17 s lag.
- Slow handlers: `ptahCli:list` 27184 ms, `auth:getAuthStatus` 19247 ms,
  `analytics:spendSummary` 31573 ms.
- Two earlier silent periods in main (29 s, 46.7 s).

## Lanes

| Lane | Family | Work | Deliverable |
| --- | --- | --- | --- |
| codex (forced past limit gate, user-stated) | codex | Q1-Q3 backup and activation path | `investigation-backup-activation.md` |
| Claude Api (sonnet) | anthropic-api | Q4-Q5 database size and analytics | `investigation-dbsize-analytics.md` |

## User-reserved decisions

Any change to data safety (skip or change the backup, automatic vacuum, deletion of old
data) needs the user's answer before implementation.
