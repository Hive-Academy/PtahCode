# Independent review

Verdict: **changes-required**.

Reviewed the uncommitted diff against `main`, the untracked composition spec, context.md and lane-report.md. Paths below are relative to the worktree. No source files were changed.

## Findings, ordered by severity

### Major — CLI shutdown does not reach the new backfill stop

- Evidence: `libs/backend/cli-engine/src/lib/container.ts:423` stops backfill only inside `CliDIContainer.disposeHostRuntime()`. Repository-wide search found no callers of that method. The actual command teardown calls `shutdownHostRuntime(ctx.container)` at `libs/backend/cli-engine/src/lib/bootstrap/with-engine.ts:457` (also on the initialization-failure path at :358).
- `libs/backend/cli-engine/src/lib/bootstrap/shutdown-host-runtime.ts:175-202` drains agents, proxies, outcomes, usage and the watcher, but never stops backfill. It then returns to persistence disposal at `with-engine.ts:461`.
- Defect: the newly autonomous service remains started after normal CLI teardown. Its unref timer does not keep Node alive, but survives while another resource keeps the process alive; pending work can continue during teardown and future hourly passes remain armed. The source-text guard sees a stop string in an unused method and misses this.
- Fix: stop backfill in the common `shutdownHostRuntime` path, before persistence teardown, with the same guarded error isolation as other subsystems. Test normal, initialization-failure and repeated shutdown paths; coordinate with the in-flight handling below.

### Major — existing CLI tests still require the removed behavior

- Evidence: `libs/backend/cli-engine/src/lib/surface-composition.spec.ts:52` compares lane-outcome startup against the now-absent `usageReconciliationService.start()` (index -1); :53 still requires `usageReconciliationService.setAfterPass`. At :78 and :82 the runtime test expects a second root listing after enqueue plus 2 seconds.
- Defect: these assertions deterministically contradict the production diff. The source-order assertion fails, and enqueue is now a no-op, leaving only one root listing before the hourly idle timeout. The new Electron-owned guard does not replace these existing CLI assertions.
- Fix: update this CLI suite to assert the new contract, retaining singleton-token resolution coverage. Assert enqueue schedules no scan, and exercise the real CLI backfill shutdown route. Run the focused CLI spec when its module-loading dependencies are available.

### Minor — stop/restart can overlap passes and orphan a timer

- Evidence: `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts:22-51` tracks only `started` and one timer handle; :61-92 has no running guard or lifecycle cancellation check.
- Reproduction by control flow: hold a resolver promise during pass A; call stop(), then start(); the zero-delay callback starts pass B while A is still active. When both finish, both see `started === true` and schedule hourly timers. The second assignment overwrites the first handle, so stop() can clear only one. The orphan callback also calls runOnce without checking `started`.
- Additionally, stop() during a pass prevents rescheduling only if no restart occurs; it does not prevent subsequent page writes in that pass. Even direct concurrent public runOnce calls are unguarded.
- Fix: serialize passes, associate scheduled work with a lifecycle generation, and reject stale callbacks/finalizers. Check cancellation between pages and before writes, or provide a bounded async drain for shutdown. Add deferred-resolver stop/restart and stop-during-pass tests, checking concurrency and remaining timers.

### Note — dashboard refresh still scans transcripts

- Evidence: `libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts:123` calls `analytics:spendSummary`; `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:102` calls summarize. `libs/backend/usage-analytics/src/lib/usage-summary.service.ts:35-37` always includes external sources, and :186 calls their read methods. `sources/codex.source.ts:19-34` walks Codex session date folders and reads rollout JSONL files, up to 10,000 files per request. These files are under the same usage-analytics `src/lib` directory.
- Without a stats repository, the summary also includes ClaudeLedgerSource (`usage-summary.service.ts:36`), whose `sources/claude-ledger.source.ts:147` calls `reader.scanDatedUsage` over transcript roots.
- This is existing, read-only behavior, not the removed synchronous cursor-commit scan. It does mean an absolute claim that no production transcript scan remains is false. No new regression is alleged here.
- Follow-up: describe the fix specifically as disabling automatic ledger reconciliation. If the decision also requires dashboard accounting to use only reactive rows, remove/gate these transcript sources and test dashboard requests separately.

## Verified behavior and evidence

- **Automatic reconciliation:** whole-repository searches for the service, trigger token, collectors, discovery helpers, scan calls and afterPass found no remaining production call to reconciliation start() or setAfterPass(). Electron `apps/ptah-electron/src/di/container.ts:48-54` and CLI `libs/backend/cli-engine/src/lib/container.ts:940-945` start backfill instead. `usage-reconciliation.service.ts:115-118` is an unconditional no-op. Its explicit public start and private scan implementation remain, but no current production caller was found. No reconciliation RPC/cron hook was found. Dashboard exceptions are described above.
- **Claude SDK reactive path:** `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts:1055` calls replaceRun; `session-stats/session-stats-owner.service.ts:694` captures the accepted turn and :769 calls sink.recordUsage, before the separate notification at :703. Provisional capture remains at :888. Enqueue is not the write path.
- **Native Codex reactive path:** `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-turn-stream.ts:244` persists usage through `wiring/codex-chat-metadata-port.ts:20`; `session-metadata-store.ts:1615-1628` persists/flushes metadata then captures the checkpoint; :1651 calls the sink.
- **CLI lane reactive path:** `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1824` accepts adapter turn totals; :4066-4074 calls recordLaneUsageOutcome. `lane-completion-outcome.ts:212` calls sink.recordUsage before enqueue. Claude SDK and Codex adapters advertise turn totals at `claude/claude-sdk-lane-runner.ts:226` and `cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:845`; other adapters also advertise the contract. Missing usage remains explicit missing evidence, not fabricated counts. No inspected provider relies solely on enqueue for recording; transcript repair/historical capture is intentionally lost.
- **Durable sink:** `libs/backend/persistence-sqlite/src/lib/session-store/register-session-store.ts:50-63` binds SqliteSessionUsageSink. Both hosts register this store (`apps/ptah-electron/src/di/phase-1-infra.ts:167`; CLI container :535). Sink :84-98 validates and queues recordEvent; `session-stats-repository.ts:265-281` owns the event transaction. The disabled bulk cursor commit remains separate.
- **Backfill blocking/error bounds:** `repository-identity-backfill.service.ts:13,67` requests 200 rows; :89-90 writes resolved/unresolved subsets, then :92 yields with setImmediate for a full page. `session-stats-repository.ts:178-220` performs at most 200 unresolved UPDATEs or 200 pairs of identity UPDATEs per page transaction. This still executes synchronous SQLite on the main thread; page size bounds statement count, not lock/fsync latency. It does not eliminate every possible pause. Scheduled pass failures are caught/logged at backfill :46-49; resolver failures at :79-81. Timers are unref'd at :39; ordinary completed-pass scheduling is serial and repeated start without stop is idempotent. Lifecycle exceptions are the findings above.
- **Electron shutdown:** `apps/ptah-electron/src/main.ts:533` calls stopUsageReconciliation; container :64-70 stops both services. It cancels scheduled timers, but does not drain an already-running backfill pass.
- **DI, static inspection:** registrations and constructor dependencies remain in Electron phase-2 :263-281 and resolver :707, CLI container :749-767, and usage-analytics registration :12. Constructors do not start scans. `expected-resolvable.ts:136-138` still names the trigger, service and backfill; `container.smoke.spec.ts:149` expects those names. No new/removed token or affected di-lint-specific expectation was found. Actual whole-container resolution was not executed, so runtime resolution is not certified.

## Test quality and limits

- Changed `usage-reconciliation.spec.ts:77-100` behaviorally tests enqueue with fake timers, root/collector/store spies and an explicitly started service; these are useful tests, not just text guards.
- New `apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts:5-17` and modified `surface-composition.spec.ts:15-26` inspect strings only. A renamed alias, helper-based start or an unreachable stop passes them. They prove neither actual DI resolution nor actual shutdown behavior.
- Added backfill test (`repository-identity-backfill.spec.ts:61-83`) covers deferred startup, repeated start, hourly execution and stopping after a completed pass. Its fake repository returns three rows; it does not prove a 200-row bound or inter-page yielding.
- Missing meaningful cases: stop before the startup callback, stop during a blocked resolver/page, stop/restart, concurrent runOnce, rejected repository read/write with rescheduling and no unhandled rejection, unref behavior, >200-row paging/yielding, and real host teardown invoking stop. Existing small repository integration coverage does not establish these lifecycle guarantees.
- I ran no tests, typecheck, lint, build, Nx or verify commands, to avoid duplicating the coordinator's running gate. Conclusions above are independent source/control-flow review; lane-report check results were read but not independently reproduced. No live-provider sessions, rendered UI, performance profile, SQLite lock timing or shutdown integration was exercised.

## Standards and tooling

- Added production code uses catch(error: unknown), Error checks and injected Logger; no added any/as-any, empty catch or console usage was found. New/changed usage services and specs remain below 700 physical lines. CLI container remains 1,162 physical lines (unchanged total: four additions/four deletions); existing untyped catches remain outside this diff. Electron container shrank. The existing oversized CLI file was edited but not grown.
- Ptah workspace analysis succeeded. Ptah AST inspection initially rejected the filePath argument; retried with file. Native rg/Get-Content/git supplied text searches and line evidence. CLI-native skill discovery was unavailable; local skill catalog inspection found no matching standalone review skill applied. No UI work was involved.
- The progress report to the parent was refused with `parent-inbox-full`; this deliverable contains the actionable findings.
