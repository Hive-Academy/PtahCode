# Fix report 2: TASK_2026_2254_b94b

User: `<user>`
Home path: `<user>`
Branch: `fix/usage-scan-main-thread`
Base commit: `3d83cc708`

## Change

In `repository-identity-backfill.service.ts`, `runScheduled` now catches a failure from the previous pass in a separate catch block. It logs the failure at debug level. It then checks the generation and starts the current lifecycle pass immediately.

The service still uses one shared in-flight promise. Generation checks, the hourly schedule in `finally`, and the unref timer remain in place. The public API and host wiring did not change. This keeps the same service contract for Electron, platform-cli, and cli-engine.

In `repository-identity-backfill.spec.ts`, the deferred helper can now reject. The new test stops and restarts the service while the old repository read is pending. It rejects that read after the restarted lifecycle begins to wait. It checks that a second read and all three updates complete without a clock advance. It also checks the debug log, one remaining timer, and timer removal on stop.

## Checks and results

Commands ran from the task worktree. Heavy checks ran one at a time.

- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`
  - Before the service fix: exit 1; 10 tests passed and the new test failed. It expected two repository reads but received one. This confirms that the test detects the defect.
  - After the service fix: exit 0; all 11 tests passed.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json`: exit 0, no diagnostics.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.spec.json`: exit 0, no diagnostics.
- `npx eslint libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`: exit 0, no diagnostics.

## Limits and tool notes

Ptah source analysis completed. Its dependent graph included Electron and CLI consumers, but graph coverage was partial. The Ptah diagnostics request did not return a completed check within 45 seconds. The explicit library and spec TypeScript commands above are the fallback evidence.

The CLI did not expose a native skill discovery or loading tool. Local skill files were inspected. No matching skill for this small TypeScript lifecycle fix was found. No design or UI work was required.

Only the two permitted TypeScript files and this report were changed. No Electron or CLI runtime check was run. No Nx, verification script, build, serve, dev, e2e, or package target was run. No commit, push, stash, or pull request was made. There are no known unmet code or test requirements.
