# Context — stop the usage transcript scan from blocking the main process

## Problem

The Electron main process freezes for seconds at a time, also with one session open. Typing
in the chat input stops while the main process is blocked.

## Evidence (local release build, 2026-11-17)

- `ptah-hang.log` shows repeated `hang` entries from the main-loop watchdog.
- Four CPU profiles from `PTAH_HANG_PROFILE=1` show one hot path:
  `SqliteUsageCursorRepository.commit` → `SessionStatsRepository.writeEventInTransaction` →
  native `better-sqlite3` code. Self time: 17.2 s of 25.0 s, 9.2 s of 15.9 s, 10.4 s of 10.9 s,
  12.6 s of 15.4 s. No other function used more than 2 %.
- Hang entries per day rose from 5 (Nov 15) to 838 (Nov 16), after `337ea4cb8`
  "feat(electron,cli-engine,dashboard): wire usage reconciliation" (2026-11-14).

## Cause

`UsageReconciliationService` (`libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts`)
scans Claude JSONL and Codex rollout transcripts from all roots on the computer, not only
Ptah sessions. `apps/ptah-electron/src/di/container.ts` calls `usageReconciliationService.start()`
at each application start. A pass that is not complete schedules the next pass after 2,001 ms.
Each chunk (up to 1 MiB of transcript) is written by
`libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts` `commit()` in
one synchronous `BEGIN IMMEDIATE` transaction on the main process, with 4 to 6 statements per
event.

## Decision (user, 2026-11-17)

- Usage accounting is for Ptah sessions, through the reactive path: each provider passes usage
  in the complete-turn message, and `SessionStatsRepository.recordUsage` / `recordEvent` writes
  one small transaction per event.
- The automatic transcript scan must not run on the main process. Import of old transcripts is
  a later, separate story (onboarding or first initialization). It is out of scope here.
- The result must be a predictable workflow: one path for usage, no hidden scan.

## Not confirmed before the task started

- Which production code calls `recordUsage` / `recordEvent`, and for which providers.
- Which production code calls `UsageReconciliationTrigger.enqueue`, and if live usage for any
  provider depends on the scan.
- If the `afterPass` hook (repository identity backfill) must run without the scan.
