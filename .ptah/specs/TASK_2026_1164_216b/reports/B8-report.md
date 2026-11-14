# B8 report
## Files changed
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts`: scheduler, bounded scans, trigger debounce, idle backoff, realpath dedupe, commit recovery, after-pass hook, shutdown cleanup.
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`: synthetic scheduler tests.
- `libs/backend/usage-analytics/src/lib/di/registration.ts`: singleton registration.
- `libs/backend/usage-analytics/src/index.ts`: public exports.

## New exported names (with signatures)
- `UsageReconciliationService implements UsageReconciliationTrigger`: `start(): void`, `stop(): void`, `enqueue(event): void`, `setAfterPass(fn: () => Promise<void>): void`.
- `ReconciliationCollector`: `collect(path, cursor, budgetBytes): Promise<{ events; next; more }>`.
- `ReconciliationCursorStore`: `load(sourceId, sourcePath): Promise<ReconciliationCursor | null>`, `commit(cursor, events): Promise<void>`.
- `ReconciliationSources`: `listClaudeRoots()`, `listCodexRoots()`, `listClaudeFiles(root)`, `listCodexFiles(root)`, `realpath(path)`.
- `ReconciliationCursor`, `USAGE_RECONCILIATION_TOKENS`.

## What B9 must bind/start
Bind `CLAUDE_COLLECTOR` to `ClaudeJsonlUsageCollector`; `CODEX_COLLECTOR` to `CodexRolloutUsageCollector`; `CURSOR_STORE` to `SqliteUsageCursorRepository`; `SOURCES` to a provider delegating Claude roots to `ClaudeUsageSourceRegistry.listRoots()`, Codex roots to `selectedCodexUsageRoots()`, Codex files to `listCodexRolloutFiles(root)`, Claude files to bounded project-file enumeration, and `realpath` to canonical filesystem paths. Inject `TOKENS.LOGGER`. Bind `PLATFORM_TOKENS.USAGE_RECONCILIATION_TRIGGER` to the singleton. Call `start()` after composition and `stop()` on shutdown. B10 uses `setAfterPass`.

## Verification
- `npm run verify -- -t lint,typecheck -p @ptah-extension/usage-analytics`: lint succeeded; typecheck failed on two `unknown` arguments to `logger.error`, corrected after the run.
- `npm run verify -- -t test -p @ptah-extension/usage-analytics -- --testPathPatterns=usage-reconciliation`: failed before tests ran because the spec omitted `reflect-metadata`; import added after the run.
- `ptah_get_diagnostics` on changed files: unavailable after 45-second compiler timeout (three attempts).

## Tests added
Startup deferral and producer debounce, quiet idle backoff and shutdown release, poison event rollback, changed-file retry and after-pass hook.

## Out-of-set edits
None.

## Extra reads
Nx typecheck terminal-output cache file outside the declared read set, required to identify the compiler errors. Existing usage-summary service, logger API, and package tsconfig were also read to verify signatures and conventions.

## Decisions
- Inject small contracts instead of importing cli-agent-runtime. Usage-analytics already imports agent-sdk and persistence-sqlite; cli-agent-runtime would add a new dependency. Reversible: yes.
- Define tokens alongside the service because the write set excludes `di/tokens.ts`. Reversible: yes.
- On Zod batch rejection, commit each event with a stationary cursor and then advance it in an empty commit, logging only the dropped count. Repository transactions roll back on validation errors. Reversible: yes.

## Open problems
- The required one-time test invocation failed before tests ran; a passing test result has not been observed after the fixture import correction.
- The required one-time lint/typecheck invocation failed before the logger argument correction; a passing typecheck has not been observed. Diagnostics also timed out.
