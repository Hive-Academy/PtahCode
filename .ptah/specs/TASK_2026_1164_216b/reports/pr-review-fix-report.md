# PR review thread triage

No PR thread was resolved or replied to. Two duplicate performance findings are deferred because a safe bounded baseline lookup requires durable cursor state.

| Thread | File:line | Verdict | Reason or change |
|---|---|---|---|
| PRRT_kwDOPngTds63Z5Ol | usage-reconciliation.service.ts:213 | FIX | Budget exits now schedule continuation after about two seconds; regression test passes. |
| PRRT_kwDOPngTds63Z5Om | usage-reconciliation.service.ts:220 | FIX | Codex discovery now excludes symlink date directories and rollout files before canonicalization; regression test passes. |
| PRRT_kwDOPngTds63Z5Oo | session-store-migrations.ts:133 | FIX | Migration now deterministically selects one owner per event and recomputes session totals; regression test passes. |
| PRRT_kwDOPngTds63azHL | codex-rollout-usage.reader.ts:203 | DISPUTE/DEFER | Claim confirmed; safe bound requires persisting cumulative totals or scan continuation. Current cursor has no such state (`usage-collector.interface.ts:3-10`; `usage-cursor-repository.ts:128-150`). A simple cap would corrupt token deltas. |
| PRRT_kwDOPngTds63a4ZP | apps/ptah-electron/src/di/container.ts:53 | FIX | Backfill resolution now checks for registered SQLite connection; focused DI guard spec added. |
| PRRT_kwDOPngTds63a4ZW | apps/ptah-electron/src/di/phase-2-libraries.ts:85 | FIX | Discovery extracted; directory sorting now uses its path separator to match full-path cursor order; focused spec added. |
| PRRT_kwDOPngTds63a4ZZ | session-stats-owner.service.ts:875 | FIX | Interrupted checkpoint now uses `estimated` source and is nonbillable; regression test passes. |
| PRRT_kwDOPngTds63a4Zh | usage-source-registry.ts:12 | FIX | Ambient `CLAUDE_CONFIG_DIR` now selects default replay root; focused test added. |
| PRRT_kwDOPngTds63a4Zl | codex-rollout-usage.reader.ts:164 | FIX | Replay now carries normalized workspace key and absolute worktree path from Codex session metadata or Claude event cwd; collector specs pass. |
| PRRT_kwDOPngTds63a4Zo | codex-rollout-usage.reader.ts:169 | FIX | Uncached input now subtracts cache delta; stream test updated. |
| PRRT_kwDOPngTds63a4Zr | codex-rollout-usage.reader.ts:203 | DISPUTE/DEFER | Duplicate of azHL; durable baseline state is absent from cursor contract and SQLite cursor rows (`usage-collector.interface.ts:3-10`; `usage-cursor-repository.ts:128-150`). |
| PRRT_kwDOPngTds63a4Zt | copilot-sdk.adapter.ts:537 | FIX | Intermediate message usage no longer enters turn-total capture; final aggregate remains authoritative; tests pass. |
| PRRT_kwDOPngTds63a4Zw | opencode-cli.adapter.ts:811 | FIX | Intermediate step display omits turn-total usage; terminal aggregate still reports it; tests pass. |
| PRRT_kwDOPngTds63a4Z0 | pi-cli.adapter.ts:651 | FIX | Incomplete assistant completion now invalidates the terminal total; regression test passes. |
| PRRT_kwDOPngTds63a4Z2 | lane-completion-outcome.ts:169 | FIX | Reported model rows now survive into the contribution; aggregate cost stays separate; focused test added. |
| PRRT_kwDOPngTds63a4Z6 | lane-completion-outcome.ts:186 | FIX | Manager now tracks current turn start and passes it as coverage start; focused test added. |
| PRRT_kwDOPngTds63a4Z9 | cli-engine/src/lib/container.ts:326 | FIX | Discovery extracted; directory sorting now matches full-path cursor order; focused spec added. |
| PRRT_kwDOPngTds63a4aD | session-stats-repository.ts:215 | FIX | Repository discovery now uses effective workspace identity; regression test passes. |
| PRRT_kwDOPngTds63a4aE | session-stats-repository.ts:400 | FIX | Live bounds now compare only with replay occurrence time; regression test passes. |
| PRRT_kwDOPngTds63a4aI | session-store-migrations.ts:133 | FIX | Owner selection now applies to all models of one event; regression test passes. |
| PRRT_kwDOPngTds63a4aL | session-store-migrations.ts:144 | FIX | Session aggregates now recomputed from retained rows; regression test passes. |
| PRRT_kwDOPngTds63a4aO | usage-summary.service.ts:139 | FIX | Optional repository paths capped at 1000 without changing totals; focused test added. |

## Changed files

- `apps/ptah-electron/src/di/container.ts`
- `apps/ptah-electron/src/di/claude-project-discovery.ts`
- `apps/ptah-electron/src/di/claude-project-discovery.spec.ts`
- `apps/ptah-electron/src/di/repository-backfill-availability.ts`
- `apps/ptah-electron/src/di/repository-backfill-availability.spec.ts`
- `apps/ptah-electron/src/di/phase-2-libraries.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.spec.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.stream.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/tracked-agent.ts`
- `libs/backend/cli-engine/src/lib/container.ts`
- `libs/backend/cli-engine/src/lib/claude-project-discovery.ts`
- `libs/backend/cli-engine/src/lib/claude-project-discovery.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts`
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`
- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts`
- `libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts`
- `libs/shared/src/lib/types/agent-process.types.ts`
- `.ptah/specs/TASK_2026_1164_216b/reports/pr-review-fix-report.md`

## Focused checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.stream.spec.ts` — PASS, final run 9 tests (initial run 7).
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts` — PASS, final run 40 tests (also earlier runs at 39 tests).
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — PASS after correcting initial type errors.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.spec.ts libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.spec.ts` — PASS, 8 tests.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.spec.ts` — PASS, 8 tests after provenance test.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.spec.ts` — PASS, 111 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.spec.ts` — PASS, 7 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.spec.ts` — PASS, 180 tests.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts` — interrupted after >2 minutes without output; followed by separate focused runs.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts` — PASS, 20 tests.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — PASS, 12 tests after adjusting continuation timing (initial run showed four fake-timer failures; intermediate run showed one test setup failure).
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/claude-project-discovery.spec.ts` — interrupted during a slow phase composition import; rerun below after extraction.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/repository-backfill-availability.spec.ts apps/ptah-electron/src/di/claude-project-discovery.spec.ts` — PASS, 2 tests.
- `npx jest --config libs/backend/cli-engine/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/claude-project-discovery.spec.ts` — FAIL, config file is `.cjs`.
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/claude-project-discovery.spec.ts` — PASS, 1 test after extraction; an earlier import-heavy run was interrupted.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.spec.json` — PASS.
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.spec.json` — PASS.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.spec.json` — PASS.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json` — PASS.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` — PASS.
- `$changedTsFiles = @(git diff --name-only -- '*.ts') + @(git ls-files --others --exclude-standard -- '*.ts'); npx eslint $changedTsFiles` — PASS, 0 errors and 40 warnings.
- `git diff --check` — PASS.
- `npx tsx tools/degradation-audit/check-degradation.ts` — could not launch: npm cache EPERM while fetching `tsx`.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — PASS after final edits; agent-sdk 4/4 and cli-agent-runtime 1/1 against baseline. No baseline edit.

## Remaining risks

- The two deferred duplicate Codex baseline findings remain real: backward recovery can exceed the pass byte budget. Changing the cursor contract and SQLite rows is needed to carry a trustworthy cumulative checkpoint; a fixed read cap would misprice later deltas.
- Replay workspace attribution requires an absolute `cwd` in transcript metadata. Historical records without it still lack a workspace key and may be absent from workspace summaries.
- The continuation preserves the pass budget of 16 files, 4 MiB, 64 paths, and four pending passes.
- Ptah workspace analysis and skill discovery did not return usable results in this lane, so local reads were used as the fallback.
