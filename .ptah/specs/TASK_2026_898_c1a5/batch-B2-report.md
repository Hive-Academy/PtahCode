# Batch B2 report

## Files changed

- `libs/backend/task-end-hook/src/lib/persistence/task-end-store.interface.ts`: close-out identity, run, step, and store contracts.
- `libs/backend/task-end-hook/src/lib/persistence/sqlite-task-end.store.ts`: atomic task/PR run creation, step checkpoints, and status reads.
- `libs/backend/task-end-hook/src/lib/persistence/sqlite-task-end.store.spec.ts`: persisted identity and independent retry coverage.
- `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts`: task close-out orchestration through curation, harvest, and guarded Git cleanup ports.
- `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.spec.ts`: opt-in, successful retry, and dirty-worktree refusal coverage.
- `libs/backend/persistence-sqlite/src/lib/migrations/0073_task_close_out.ts`: separate durable run and step tables.

## Design

A run is unique by `(repo_id, task_id, pr_number)`. The store creates its four steps in one SQLite transaction. The service checkpoints each step before calling a port and records a closed state afterward. `ok` and `skipped` steps are not repeated; `failed` and `refused` steps can retry. Concurrent calls to one service instance join an in-flight promise. The service requires a merged-PR request and validates it with Zod; the later PR reconciler must supply the verified PR state. Cleanup requires the opt-in, clean worktree, exact branch/path, and merge-into-main inspection; the worktree is inspected again immediately before removal. Branch deletion requires a persisted successful worktree step. Git operations use GitCleanupPort only, without force. Error strings from Git ports are not persisted.

## Decisions

- Separate close-out tables rather than reusing `task_end_runs`/`task_end_steps`. Those tables require a terminal transition and restrict step names, so they cannot guarantee one independent run per task/PR. Reversible through a later data migration.
- A missing or dirty worktree is recorded as `refused` with a reason; disabled opt-in records `refused/pending-user-approval`. Memory and learning still proceed. Reversible.
- Keep the store contract separate from `ITaskEndStore` so existing fakes and the current task-end worker remain compatible. Reversible when consumers migrate.

## Verification

- `ptah_get_diagnostics` after edits: 0 errors, 0 warnings in changed task-end-hook files.
- Ran exactly once: `npm run verify -- -p @ptah-extension/task-end-hook 2>&1 | Select-Object -Last 70`.
- Nx lint/typecheck: 2 succeeded. Jest: 8 failed, 12 passed suites; 42 failed, 562 passed tests (604 total). The two new suites and three new tests passed. No new failures relative to the reported main baseline (8 suites, 42 tests); failures remain Windows symlink EPERM and path-case/path-resolution expectations.

## Not done

- Migration 0073 is not registered in `libs/backend/persistence-sqlite/src/lib/migrations/index.ts`, because the user explicitly limited B2 writes to the named files plus a migration file. Production databases therefore do not yet receive these tables. The integration owner must register 0073 and update persistence migration-version specs before using the service. The store spec creates equivalent tables locally for B2 coverage.
- Service export, DI registration, Electron wiring, and verified PR lookup belong to later batches. This service is not yet reachable from a host.
- Per-session curation is one aggregate memory step; if one of several sessions fails after earlier sessions succeed, that step can revisit earlier sessions. The curation engine's own idempotency remains necessary until subject-level memory checkpoints are added.
