# Boot index race follow-up

## Race and evidence

`apps/ptah-electron-e2e/src/specs/git/hunk-apply-real-rpc.spec.ts:279` writes `Invoice.cs`; line 301 sends forced `indexing:start`. `libs/backend/memory-curator/src/lib/control/indexing-control.service.ts:583` calls `runSymbolsIndexWithProgress`, and `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts:488` bridges that to `CodeSymbolIndexer.indexWorkspace`. The indexer joins the active root census at `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:576`; its file list may have been taken before the write. The previous result then lacked `Invoice.cs`.

## Decisions

The follow-up belongs in `IndexingRpcHandlers`: it sees the RPC `force` flag, while the indexer receives only `userInitiated`. The indexer marks its returned promise at the actual active-census lookup. The handler keeps one pending forced start per workspace root. If its `runSymbols` call joins the background census, it makes one fresh indexer call after that join settles, passing the same abort signal and progress callback. The fresh call's `IndexingStats` become the result consumed by `IndexingControlService.start`, and the control service settles after the fresh census. Forced starts coalesce only for covered pipelines before fresh discovery; otherwise they receive `already-running`. An aborted joiner does not schedule the follow-up. Non-forced starts retain their prior join behavior. The `indexing:start` RPC itself remains an immediate accepted/status response because `IndexingControlService.start` returns `Promise<void>`, not `IndexingStats`.

The indexer comments describe the handler-owned follow-up rule. The e2e test's stale watcher-dependent explanation was updated.

## Specs and logs

`indexing-rpc.handlers.spec.ts` adds a deferred joined run proving the fresh indexer call starts only after the first ends, three forced requests produce exactly two indexer calls, and the consumed stats are those of the fresh call. A second spec proves an aborted joiner produces no follow-up. The non-forced background-join spec now proves one indexer call.

`attach-app-logs.ts` reads Electron's logs path for failed tests only and attaches existing `.log` files through `testInfo.attach`. Capture has a three-second limit; missing logs, an exited app or a timeout produces a Playwright annotation and cannot prevent fixture teardown. Both ordinary and real-RPC fixtures attach before closing the app.

## Files changed

- `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.spec.ts`
- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts`
- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.spec.ts`
- `apps/ptah-electron-e2e/src/support/attach-app-logs.ts`
- `apps/ptah-electron-e2e/src/support/fixtures.ts`
- `apps/ptah-electron-e2e/src/support/real-rpc-fixtures.ts`
- `apps/ptah-electron-e2e/src/specs/git/hunk-apply-real-rpc.spec.ts`

## Verification

With `PTAH_VERIFY_SLOTS=1` and `PTAH_VERIFY_MIN_FREE_GB=8`: `npm run verify -- -t lint,typecheck -p ptah-electron-e2e`: PASS, 2 tasks succeeded, exit 0 (2026-11-07 16:17 UTC). `npm run verify -- -p workspace-intelligence`: lint/typecheck PASS (2 tasks); test FAIL in unrelated `go-vet-hostile.integration.spec.ts` (6 failures, 75 suites and 2302 tests passed). `npm run verify -- -p rpc-handlers -- --testPathPatterns=indexing-rpc`: final indexing Jest target PASS (1 task, uncached, 2026-11-07 16:55 UTC); the overall wrapper exits 1 because it forwards the Jest-only flag to TypeScript and ESLint, where both reject the option. `npm run verify -- -t lint,typecheck -p rpc-handlers`: PASS, 2 tasks succeeded, uncached, exit 0 (2026-11-07 16:56 UTC). No e2e tests run as instructed.

## Anything not done

The existing RPC API cannot return `IndexingStats` from forced `indexing:start`: the control service's `start` contract returns `void`, and the allowed scope excludes changing that contract or its bridge. Its internal run consumes the fresh stats before settling.

## Revision 1

The join decision now uses `IndexingCensusPromise.joinedActiveCensus`, set synchronously by `CodeSymbolIndexer.indexWorkspace` at the active-census lookup. The existing bridge returns that promise without wrapping it. The handler inspects the marker before awaiting the result, so a boot census starting during control setup is detected, while a closed symbols phase does not trigger a duplicate run.

| Finding | Fix | Spec |
| --- | --- | --- |
| 1 | Join marker replaces the pre-start status snapshot. | `detects boot joining after the forced start begins`; `after the census settles, a new call starts a new census` checks marker values. |
| 2 | Pipeline coverage and `setup/joined/fresh` phases gate coalescing; mismatches and arrivals during fresh discovery receive `already-running`. | `refuses pipeline mismatch and starts arriving during fresh discovery`; concurrent calls in `runs one forced follow-up after a background join`. |
| 3 | A rejected joined census starts the fresh census unless the forced caller's signal aborted. | `runs fresh after a rejected boot join and clears pending after rejection`; `does not schedule a follow-up when the forced joiner aborts`. |
| 4 | Specs cover cleanup after success and failure, concurrency, real `AbortError`, late boot, rejected boot, pipeline mismatch and fresh-phase arrival. | The indexing RPC specs above. |
| 5 | Log capture races a three-second timeout; capture errors add `app-log-capture-failed` to Playwright annotations. The app closes from fixture teardown. The Electron logs path is used directly so macOS logs are included. | E2e project lint/typecheck; e2e tests intentionally not run. |
| 11 | The pending map clears in the control run's `finally`. | `runs fresh after a rejected boot join and clears pending after rejection` and success path in `runs one forced follow-up after a background join`. |

Revision verification with `PTAH_VERIFY_SLOTS=1` and `PTAH_VERIFY_MIN_FREE_GB=8`: `npm run verify -- -t test -p rpc-handlers -- --testPathPatterns=indexing-rpc` PASS, 1 task succeeded, uncached (2026-11-07 17:26 UTC). `npm run verify -- -t test -p workspace-intelligence -- --testPathPatterns=code-symbol-indexer` PASS, 1 task succeeded, uncached (final rerun 17:29 UTC). `npm run verify -- -t lint,typecheck -p rpc-handlers,ptah-electron-e2e,workspace-intelligence` PASS, 6 tasks succeeded, uncached (final rerun 17:38 UTC). No e2e test was run.

## Revision 2

| Finding | Fix | Spec |
| --- | --- | --- |
| N1 | `IndexingRunDeps.runSymbols` now declares the optional synchronous `joinedActiveCensus` promise marker; the handler reads the typed property. The bridge returns the indexer promise directly. | `passes the joined census marker through the RPC runSymbols bridge` in `boot-thoth-runtime.spec.ts`. |
| N2 | A joined census `AbortError`, or an aborted caller signal, propagates without starting fresh work. | `does not start fresh when the joined boot census rejects with AbortError` and existing `does not schedule a follow-up when the forced joiner aborts` in `indexing-rpc.handlers.spec.ts`. |
| N3 | A real joined boot failure logs a warning with the original `Error` before the fresh census starts. | `runs fresh after a rejected boot join and clears pending after rejection` asserts the warning and error identity. |
| N4 | Log capture resolves the userData, logs directory, and each candidate file path, and attaches only contained files. The three-second bound and failure annotation remain. | No unit spec for the Playwright attachment helper; the `ptah-electron-e2e` lint and typecheck targets cover it. |

Files changed in Revision 2: `libs/backend/memory-curator/src/lib/control/indexing-control.service.ts`, `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.ts`, `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.spec.ts`, `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.spec.ts`, `apps/ptah-electron-e2e/src/support/attach-app-logs.ts`, and this report.

Revision 2 verification with `PTAH_VERIFY_SLOTS=1` and `PTAH_VERIFY_MIN_FREE_GB=8`: `npm run verify -- -t lint,test,typecheck -p rpc-handlers,workspace-intelligence,memory-curator,thoth-runtime,ptah-electron-e2e` exited 0 (2026-11-07 18:05 UTC). The header named all five requested projects. Lint/typecheck: 10 tasks succeeded, 2 cached. Test: 4 tasks succeeded, 1 cached. Nx reported that `ptah-electron-e2e` has no `test` target, so no e2e test ran.



