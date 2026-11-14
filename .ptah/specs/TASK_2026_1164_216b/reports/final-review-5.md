# Final review 5

**Verdict: REJECT**

Scope: uncommitted working-tree changes and untracked code/specs only. No source or test files were edited.

## Findings

1. **Major — correction never reaches databases that already applied S0005.** `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:133-167` changes the body of version 5, but `migration-runner.ts:117-120` skips every recorded version. Existing version-5/6 databases retain the producer-colliding rows or stale aggregates from the previous migration, so the fix works only for databases upgrading from version 4. Add a new forward migration that repairs existing rows and recomputes aggregates in one transaction; keep version 5 immutable. Test a database seeded with the old version-5 result and recorded migration versions.

2. **Major — pending-file completion still stalls discovery.** `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts:182-202` returns immediately when a pending file finishes, without setting `passIncomplete`. `runPass()` at lines 162-165 consequently schedules the 15-minute active idle timer (or the quiet timer), delaying every later file even though the scan stopped mid-discovery. Set `passIncomplete` on this return or continue scanning with the remaining pass budget. Add a fake-timer test with a pending file followed by another file.

The version-5 SQL itself is transactional via `migration-runner.ts:308-329`; producer selection is consistent across models of one event. The two deferred Codex backward-read threads are reasonable: a hard cap without durable cumulative baseline state could misprice later deltas. They remain unresolved and should be tracked separately.

## Thread confirmation

| Thread ID | Fixed? | Review result |
| --- | --- | --- |
| PRRT_kwDOPngTds63Z5Ol | No | Pending-file path still waits for idle timer (finding 2). |
| PRRT_kwDOPngTds63Z5Om | Yes | Date directories and rollout files require real directory/file entries. |
| PRRT_kwDOPngTds63Z5Oo | No | Corrected migration skips already-migrated databases (finding 1). |
| PRRT_kwDOPngTds63azHL | No | Deferred; durable checkpoint baseline needed. |
| PRRT_kwDOPngTds63a4ZP | Yes | Backfill resolution guarded by SQLite registration. |
| PRRT_kwDOPngTds63a4ZW | Yes | Discovery sorts directory names with separator. |
| PRRT_kwDOPngTds63a4ZZ | Yes | Aborted provisional contribution is estimated and nonbillable. |
| PRRT_kwDOPngTds63a4Zh | Yes | Default Claude root honors `CLAUDE_CONFIG_DIR`. |
| PRRT_kwDOPngTds63a4Zl | Yes | Absolute transcript cwd supplies workspace identity. |
| PRRT_kwDOPngTds63a4Zo | Yes | Codex uncached input subtracts cache input. |
| PRRT_kwDOPngTds63a4Zr | No | Deferred duplicate of azHL. |
| PRRT_kwDOPngTds63a4Zt | Yes | Copilot intermediate usage feeds final total only. |
| PRRT_kwDOPngTds63a4Zw | Yes | OpenCode intermediate usage removed; final aggregate remains. |
| PRRT_kwDOPngTds63a4Z0 | Yes | Incomplete Pi assistant completion invalidates total. |
| PRRT_kwDOPngTds63a4Z2 | Yes | Model rows retained; aggregate cost separately attributed by sink. |
| PRRT_kwDOPngTds63a4Z6 | Yes | Current turn start passed as coverage start. |
| PRRT_kwDOPngTds63a4Z9 | Yes | CLI discovery ordering matches full-path cursor order. |
| PRRT_kwDOPngTds63a4aD | Yes | Repository discovery uses effective workspace identity. |
| PRRT_kwDOPngTds63a4aE | Yes | Live bounds compare replay occurrence time. |
| PRRT_kwDOPngTds63a4aI | No | New migration SQL selects one event owner, but existing DBs skip it (finding 1). |
| PRRT_kwDOPngTds63a4aL | No | Aggregate recomputation skips existing DBs (finding 1). |
| PRRT_kwDOPngTds63a4aO | Yes | Repository worktree paths capped at 1,000. |

Verification: static review of changed files, migration runner, ownership persistence, focused specs, and thread claims. No commands that execute tests or build were run. Ptah workspace analysis did not return; native git and file reads were used. No matching review skill invocation mechanism was available in this lane.

## Coordinator resolution

- Finding 1 (S0005 body changed): DISPUTED. S0005 and S0006 are new in this PR; `main` stops at S0004
  (`git show main:.../session-store-migrations.ts`). No released database applied the old S0005, so
  editing the unreleased migration is correct. A repair migration would only serve local dev databases.
- Finding 2 (pending completion waits for the idle timer): FIXED. `scan()` now sets `passIncomplete`
  after a pending file completes. Regression test "continues discovery soon after a pending file
  completes" added; usage-reconciliation.spec.ts passes 13/13.
