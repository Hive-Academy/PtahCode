# Independent second review

- **RESOLVED — Major: CLI shutdown missed backfill.** `libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.ts:184` stops it through the guarded helper; `:84-108` tolerates missing registration, resolution failure and a synchronous stop exception. Both initialization-failure and normal teardown call this helper (`bootstrap/with-engine.ts:358`, `:457`), before persistence teardown (`:461`).
- **RESOLVED — Major: CLI specs required scanning.** `libs/backend/cli-engine/src/lib/surface-composition.spec.ts:50-87` now checks backfill startup, singleton trigger resolution and zero scans/timers after enqueue. The focused suite passes.
- **RESOLVED — Minor: overlapping passes and orphan timers.** `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts:30-64` invalidates old generations, rejects stale callbacks/finalizers and owns one unref timer; `:73-79` shares one in-flight promise. Restart waits for that promise. Cancellation checks after reads, between rows and before both writes (`:87-115`) prevent cancelled resolution work from continuing database operations. Deferred-resolver, stale-callback, restart, concurrency and timer-count tests exercise the real service (`repository-identity-backfill.spec.ts:104-187`).

The prior dashboard note remains accurate: existing read-only summary transcript sources are unchanged; the fix disables automatic ledger reconciliation.

## New findings

None confirmed.

Both hosts start only backfill (`apps/ptah-electron/src/di/container.ts:51-55`; `libs/backend/cli-engine/src/lib/container.ts:941-944`). Electron stops it (`container.ts:65-66`) before entering quit disposal (`apps/ptah-electron/src/main.ts:533-534`; SQLite close is in `activation/shutdown.ts:454`). Production call-site searches found no remaining automatic reconciler start or after-pass hookup. `usage-reconciliation.service.ts:115-118` makes enqueue inert; callers retain independent reactive recording (`session-stats-owner.service.ts:769`, `:888`; `lane-completion-outcome.ts:212-218`). Scheduled pass failures are caught and logged before hourly rescheduling (`repository-identity-backfill.service.ts:58-64`).

## Evidence and limits

Independently ran the six requested focused Jest suites across usage-analytics, cli-engine and Electron: **77 tests passed**. No source files edited; no verify, Nx, build or other prohibited target ran.

Backfill tests execute real service control flow with repository/resolver doubles, including 401-row paging and setImmediate calls (`repository-identity-backfill.spec.ts:190-204`). Enqueue tests execute the real reconciler (`usage-reconciliation.spec.ts:77-99`). Host composition guards inspect source strings; shutdown tests execute the helper against doubles (`shutdown-host-runtime.spec.ts:401-428`). They do not establish full host teardown integration. Pending repository read/write cancellation, throwing stop, and unref lack dedicated behavioral assertions; source inspection supplements those gaps. Stop does not drain an already invoked repository operation. No live Electron profiling or SQLite shutdown integration was performed.

CLI-native skill discovery/loading was unavailable. Ptah AST inspection was available and used; native PowerShell/rg/git supplied remaining source and diff evidence.

APPROVE
