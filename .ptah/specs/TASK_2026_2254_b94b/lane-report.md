# Usage reconciliation main-thread fix

## Result

Automatic transcript reconciliation is disconnected in Electron and CLI. Live `enqueue()` is an unconditional, allocation-free no-op; it cannot schedule a pass, even if the reconciler was explicitly started elsewhere. The reactive sink is unchanged. Repository identity enrichment now has its own deferred startup/hourly lifecycle, with the existing 200-row pages and event-loop yield between pages. No import, worker, migration, commit, branch change, or task.md edit was made.

All paths below are relative to this worktree. References describe the final tree unless explicitly marked ?before?.

## Investigation: reactive recording and providers

The complete production call graph for the repository entry points is:

- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:261-262`: `recordUsage` delegates to `this.recordEvent([value])`. There are **no external production callers of this repository's recordUsage method**.
- `libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:84,98`: the sole external production caller of repository `recordEvent`; it validates a contribution, queues it, converts its model rows, then writes one event transaction. Multiple model rows can belong to that one event.
- `session-stats-repository.ts:265-281`: `recordEvent` opens the small event transaction and calls `writeEventInTransaction`.
- Separate historical path: `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts:137-162` bypasses both public entry points, opening `BEGIN IMMEDIATE` and calling `stats.writeEventInTransaction` repeatedly for the collected chunk. This is the profiled blocking path; it is preserved but no longer reached by application startup/completion.

All production producers calling the usage sink (rather than the repository directly):

| Producer | Location | Evidence and coverage |
| --- | --- | --- |
| Accepted SDK turn | `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:634,694,738,769` | `replaceRun` accepts the cumulative result and captures its delta once. Claude Agent SDK result processing reaches it from `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts:1055-1064`. |
| Provisional SDK checkpoint | `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:838,888` | `publishLive` captures provisional evidence; accepted turns supersede it through the existing event semantics. |
| Native Codex checkpoint | `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:1570,1615,1628,1651` | `updateCodexUsageCheckpoint` commits validated metadata, then captures the accepted delta. `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-turn-stream.ts:244` persists the terminal checkpoint; wiring is `libs/backend/agent-sdk/src/lib/wiring/codex-chat-metadata-port.ts:20` and `codex-chat-adapter.ts:932-937`. |
| CLI lane ending | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:112,212` | Records the lane's last-turn total, or an explicit missing-usage contribution. Manager capture is `agent-process-manager.service.ts:1824-1825`, dispatched at `:4071-4074`; continuation resets the cached turn usage at `:3033`. |

CLI adapters advertising the required per-turn total contract are Claude SDK (`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:226`), Codex app server (`cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:845`), Cursor (`cli-agents/cli-adapters/cursor-cli.adapter.ts:607`), Copilot SDK (`cli-agents/cli-adapters/copilot-sdk.adapter.ts:542`), OpenCode (`cli-agents/cli-adapters/opencode-cli.adapter.ts:821`), Pi (`cli-agents/cli-adapters/pi-cli.adapter.ts:658`), Antigravity (`cli-agents/cli-adapters/antigravity-cli.adapter.ts:1328`), and ACP sessions (`cli-agents/cli-adapters/acp/acp-session-handle.ts:972`). These adapter paths share the `libs/backend/cli-agent-runtime/src/lib/` prefix. Provider support for actual counters still depends on the underlying runtime emitting them; the existing missing/partial-usage reasons remain intact.

**No provider was found whose sole production recording path is this reconciliation scan.** Both Claude and Codex have reactive recording. Standalone external sessions and historical transcripts cease entering the SQLite ledger, by decision. Claude/Codex usage absent from live evidence will no longer be repaired by reconciliation; this includes prior process crashes or missing/incomplete provider results. Other providers were never covered by the two reconciliation collectors. No provider wiring change is necessary.

`live-session-stats-publisher.ts:326` has a private method also named recordUsage; it updates live state and is not another direct repository caller.

## Investigation: trigger and lifecycle callers (both hosts)

There are exactly two production `enqueue` call sites:

1. `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:490`: optional trigger injected at `:466`; notifications originate from accepted turns (`:703`) and session close/finalization (`:471`).
2. `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:214`: after the sink write resolves. The manager injects the trigger at `agent-process-manager.service.ts:485-486` and passes it at `:4073`.

The token remains bound to the reconciler at `apps/ptah-electron/src/di/phase-2-libraries.ts:280` and `libs/backend/cli-engine/src/lib/container.ts:765`. Making enqueue a cheap no-op is smaller than changing optional constructor injection, completion signatures, and associated producer tests. It also protects every caller centrally.

Before this change, Electron `apps/ptah-electron/src/di/container.ts:53-60` resolved the reconciler, attached afterPass, and deferred `start()` until after phase 4. CLI `libs/backend/cli-engine/src/lib/container.ts:942-945` resolved it, attached afterPass, and called start during library composition. Those were the only production start call sites; neither remains. Comments at both removed calls cite TASK_2026_2254_b94b, the main-process hang, and the off-main-thread requirement for any later import.

The remaining production stop callers are Electron `container.ts:69` (called through `ElectronDIContainer.stopUsageReconciliation()` from main shutdown) and CLI `container.ts:424` (`disposeHostRuntime`). They are harmless compatibility cleanup. Both cleanup paths now also stop the independent backfill (`:66` and `:423`). The preserved scanner's explicit start/stop and scan algorithms remain available for the future story; there is no production start caller.

## Investigation: afterPass, scan readers, and backfill

Only the two composition roots attached `setAfterPass`; no dashboard or handler directly subscribes to that hook. Both attachments are removed.

Backfill is required for **reactive** rows: owner/checkpoint/lane contributions can lack repositoryId, and the sink maps missing repositoryId/worktreePath to null (`libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:255-256,287-288,324-325`). `SessionStatsRepository.getUnresolvedRepositoryUsagePage` (`session-stats-repository.ts:164-175`) selects unresolved usage turns without restricting producer, deriving paths from the turn or joined session. Repository totals require these identities (`:220,252`). Leaving it unwired would lose repository grouping for live usage.

`libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts:22-52` now starts with an unref'd zero-delay timer, runs without overlapping scheduled passes, catches/logs failure, and schedules its next pass one hour after completion. `runOnce` retains its row-id cursor, 200-row page limit (`:13,67`), small per-page update/mark operations, and setImmediate yield (`:92`). It neither opens transcripts nor writes usage events. The initial pass is deferred in both hosts (`apps/ptah-electron/src/di/container.ts:54`, CLI `container.ts:945`). New rows can wait up to an hour for repository grouping, consistent with the previous quiet-pass cadence. Shutdown cancels future timers; a pass already in flight can finish.

Scan result consumers:

- Dashboard store: `libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts:123` requests `analytics:spendSummary`.
- RPC: `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:55-61` delegates to UsageAnalyticsService. Its SQLite branch reads workspace coverage/groups/session counts/top sessions (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts:61-127`) and repository totals (`:137-145`). These reads now continue from reactive writes and existing persisted rows; old scanned rows are not deleted.
- `libs/backend/rpc-handlers/src/lib/handlers/usage-rpc.handlers.ts:45` reads session dimension totals from the repository; `handlers/session-rpc.handlers.ts:1608-1613` uses `session-stats-ledger-reader.ts` for range summaries. None requires a reconciliation pass/cursor to succeed.
- `usage_source_cursor` SQL readers/writers are confined to `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts:93-162`; its migration is `session-store-migrations.ts:177-183`. The reconciler consumes the cursor/discovery methods. No dashboard/RPC reader consults the cursor table.

Existing analytics also has independent **read-only, on-demand** external usage sources (`usage-summary.service.ts:35-37,160-186`), including `sources/codex.source.ts:18-42` reading rollout files and OpenCode/Grok/CLI sources. The Claude transcript fallback is excluded when the SQLite repository exists (`:36`). These are separate from automatic reconciliation, do not call cursor.commit, and were left unchanged to keep this fix scoped. Thus this change disables automatic transcript-to-ledger import, not every existing analytics transcript reader. A product-wide Ptah-only dashboard source policy would need a separate decision/change.

## Changed files and rationale

- `apps/ptah-electron/src/di/container.ts`: remove scanner startup/hook and its startup-race state; start/stop only the paged identity backfill, retain compatibility scanner stop.
- `libs/backend/cli-engine/src/lib/container.ts`: remove scanner startup/hook; start/stop backfill independently.
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts`: unconditional no-op enqueue, remove unused debounce timer/constant; preserve explicit import machinery.
- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts`: independent deferred/hourly scheduler and cleanup, logged scheduled failures.
- `apps/ptah-electron/src/di/surface-composition.spec.ts`: replace obsolete start-order expectation with no-start/no-hook expectation and independent backfill expectation.
- `apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts`: isolated source composition guard for both hosts that runs without loading the entire DI/native-module graph.
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`: verify no-op enqueue both unstarted and explicitly started; retained scanner tests use continuation/idle timers instead of live notifications.
- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`: verify deferred start, idempotent start, live-row enrichment, hourly repeat and stop cleanup.
- This `lane-report.md`: investigation and verification evidence.

`phase-2-libraries.ts`, `expected-resolvable.ts`, and `container.smoke.spec.ts` need no edits: all registrations remain. The smoke guard at `container.smoke.spec.ts:149` still correctly requires trigger/service/backfill tokens; expected tokens at `expected-resolvable.ts:136-138` remain valid. The cursor and stats repositories, collectors, reactive producer code and renderer are unchanged.

## Exact focused checks and results

1. `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/surface-composition.spec.ts apps/ptah-electron/src/di/container.smoke.spec.ts`
   - Attempted twice; both suites fail during module loading before assertions because the shared mapper points to missing worktree `node_modules/marked/lib/marked.umd.js`. No dependency or shared Jest configuration change was made.
2. `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`
   - Initial run: 14 passed / 5 failed; retained scanner tests still expected enqueue to force passes. Second: 18 passed / 1 failed; final growing-file revisit still expected debounce instead of idle. Updated those expectations to the preserved continuation/idle behavior. Final run: **2 suites, 19 tests passed**.
3. `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts`
   - **1 suite, 1 test passed**; guards Electron and CLI source composition.
4. `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`
   - **Passed**, exit 0.
5. `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`
   - **Passed**, exit 0.
6. `npx eslint apps/ptah-electron/src/di/container.ts apps/ptah-electron/src/di/surface-composition.spec.ts libs/backend/cli-engine/src/lib/container.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`
   - Passed, exit 0, zero errors; existing CLI container max-lines warning. Module-boundary rule skipped because no cached Nx project graph exists.
7. `npx eslint apps/ptah-electron/src/di/container.ts apps/ptah-electron/src/di/surface-composition.spec.ts apps/ptah-electron/src/di/usage-reconciliation-composition.spec.ts libs/backend/cli-engine/src/lib/container.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`
   - Final pass after test updates/new composition guard: **zero errors**, same existing warning and graph limitation.
8. `git diff --check`
   - Passed (only Git line-ending normalization notices).

Read-only rg/Get-Content searches and git status/diff were also used for investigation. No npm verify, Nx targets, build/serve/dev/e2e/package commands, or workspace-wide checks ran.

## Limitations and remaining work

- Full DI smoke/surface execution remains blocked by the missing marked mapper target. The coordinating agent should run those with the complete dependency environment, plus its normal DI/full gates. Actual live-provider integration and CPU profiling were not run in this lane.
- Existing CLI container exceeds 700 lines (ESLint reports 864 counted lines). This edit does not increase its line count; splitting that composition root is outside this minimal fix. Every new file and the changed usage services are below 700 lines.
- Deliberately retained explicit scanner start is not safe to call in the main process; future import work must relocate execution off-thread before wiring it anywhere. All current production startup callers are removed and enqueue cannot reactivate it.
- Historical/external ledger capture and transcript-based repair stop by decision; no provider is exclusively lost. Existing dashboard external read-only sources remain, as described above.
- Ptah tools were discovered. Workspace analysis failed with a localhost transport error; dependent inspection returned no usable result; diagnostics did not return within the bounded wait and was cancelled. Native rg/Get-Content and scoped tsc/eslint were the fallbacks. CLI-native skill discovery was unavailable; local skill files were inspected for relevance, with no matching lifecycle-fix skill applied. No UI work was performed.
