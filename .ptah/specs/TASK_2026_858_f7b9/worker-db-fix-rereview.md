# Re-review of ffbc0b745: worker main database

**Verdict: APPROVED — 8/10.** The change resolves both blocking findings in the review of 99f9901c7. The worker now checks the real main SQLite connection during startup and refuses to listen when it is unavailable. The serve spec verifies that the connection opens before the worker reports its endpoint and closes after shutdown.

## Findings

1. **Low — No end-to-end startup test for a failed main database open.** The new readiness spec supplies a closed database port directly (`libs/backend/worker-runtime/src/lib/readiness.spec.ts:38-63`), while the serve spec supplies a successful `openAndMigrate` mock and overrides readiness with an always-ready result (`libs/backend/worker-host/src/lib/commands/serve.spec.ts:124-133,163-172`). These verify the components separately, but would not catch a future wiring regression between `activateThoth` and `WorkerService.start`. **Suggested change:** add a focused serve case whose connection reports `migration_failed` after `openAndMigrate` rejects; use the real readiness path with the other checks stubbed, then assert that `onReady` is not called and the command rejects with the `database` check. This is useful follow-up coverage, not a blocker for this fix.

## Evidence

- `serveCommand` selects `thoth: 'oneshot'` (`libs/backend/worker-host/src/lib/commands/serve.ts:150-162`). `activateThoth` awaits `openAndMigrate` and catches failures (`libs/backend/cli-engine/src/lib/bootstrap/thoth-runtime.ts:116-130`). The new `mainDatabaseState` reads the same registered connection's `unavailable` state and exposes only its reason (`serve.ts:74-101,237`). `SqliteConnectionService.unavailable` returns a reason whenever the database is closed (`libs/backend/persistence-sqlite/src/lib/sqlite-connection.service.ts:374-387`), including after a migration failure (`sqlite-connection.service.ts:253-286`). A parent-directory failure still yields `not_initialized`, which also fails readiness.
- `checkWorkerReadiness` marks the database check failed on a closed state or a thrown state check (`libs/backend/worker-runtime/src/lib/readiness.ts:149-166`). `WorkerService.start` awaits readiness and throws before creating the listener if any check fails (`libs/backend/worker-runtime/src/lib/worker-service.ts:87-95`). This closes the original false-ready path. The optional port preserves callers without a main database.
- The serve spec's token mock now returns a connection, records `openAndMigrate` and `close`, and checks the order around listener startup and shutdown (`libs/backend/worker-host/src/lib/commands/serve.spec.ts:122-140,193-214`). The readiness spec covers open, closed, and thrown states and checks that a thrown path is not exposed (`libs/backend/worker-runtime/src/lib/readiness.spec.ts:38-63`).
- The shared profile database and lost account-refusal code remain documented follow-ups (`.ptah/specs/TASK_2026_858_f7b9/future-enhancements.md:87-93`). They are pre-existing scope limits, not regressions in this commit.

**Verification:** source and commit review only. No tests, builds, or workspace-wide checks were run.
