# HANDOFF — TASK_2026_1164_216b (usage ledger coverage)

## Goal

Make every lane and provider report usage per turn into the usage ledger. Replay historical
Claude and Codex transcripts. Aggregate usage by repository, then show it in the existing
dashboard. The full plan is in `implementation-plan.md` and the batches in `batches.md`
(order: B0, B1, B2, B6a, B7, B3, B4, B5, B6, B7a, B7b, B8, B10, B9, B11). Decisions made so
far are logged in `decisions.md`.

Worktree: `D:\projects\ptah-extension\.claude-worktrees\usage-ledger-coverage`
Branch: `feat/usage-ledger-coverage`. Not pushed, no PR yet.

## Done (committed on the branch, checked with `git log main..HEAD`)

- e57d960af feat(auth-providers,auth-providers-tokens): add usage profile roots port (B7)
- ee9471b4e feat(platform-core,platform-electron,platform-cli): add file range read (B6a)
- 9c8759694 feat(platform-core,persistence-sqlite,agent-sdk): add usage event identity (B0/B1)
- 70af9a6b5 feat(cli-agent-runtime,lane-outcomes): normalize lane usage scopes (B2)
- 2a4aff45d feat(agent-sdk): add claude transcript usage collector (B7a)
- ff04e5d62 feat(persistence-sqlite,agent-sdk): add usage cursor repository (B6)
- 666a9a0f3 feat(cli-agent-runtime): add codex rollout usage collector (B7b)
- 1fea4e841 feat(cli-agent-runtime): capture antigravity, opencode, copilot usage (B3)
- 84d47cd21 feat(cli-agent-runtime): declare cursor, pi and acp usage scopes (B4).
  Lint and typecheck passed. Tests: 677 of 679 passed. The 2 failing Cursor tests were fixed,
  and the Cursor-only rerun passed.
- 62e62a440 feat(cli-agent-runtime): capture ptah-cli and claude lane usage (B5).
  The `claude-sdk-lane-runner|ptah-cli-stream-loop` tests passed after the
  getObservedNativeThreadId test was rewritten to use `runnerFixture`.

## In progress (uncommitted in the worktree): B8 + B10

B8 and B10 both edit `usage-analytics/src/index.ts`, so they go in one commit.

- B8: `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts` and its `.spec.ts`,
  `di/registration.ts`, `src/index.ts`. Its tests passed earlier: verify test for
  usage-analytics, 1 succeeded.
- B10: `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`,
  `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts`,
  `repository-identity-backfill.spec.ts`, `repository-usage.spec.ts`,
  `usage-summary.service.ts`, `libs/backend/task-end-hook/src/index.ts`.
- Lint and typecheck for persistence-sqlite, usage-analytics and task-end-hook passed
  (6 of 6 tasks).
- The targeted test run was killed when the session ended, so the B8+B10 **tests are NOT
  verified**. Note: this worktree's `scripts/verify.mjs` predates `--related` ("Unknown option"),
  so use `--testPathPatterns`.
- Coordinator review of B10: no blockers. Logged in decisions.md: `knownCostMicroUsd` sums only
  priced rows, so B11 must label it as partial.

## Open problems and decisions

- B11 cannot read repository totals through the shared RPC `UsageSummary` response. It needs a
  contract extension in `libs/shared/src/lib/types/rpc.types.ts` to add repository totals and
  worktree paths. The B10 report flags this.
- B9 must bind `REPOSITORY_IDENTITY_BACKFILL_TOKENS.resolver` to an adapter around
  task-end-hook `RepositoryIdentityResolver.resolve(path)`: `kind:'ok'` →
  `{repositoryId: identity.repoId, worktreePath: path}`; anything else → null. It must also
  register `RepositoryIdentityBackfillService` and call
  `usageReconciliationService.setAfterPass(() => backfill.runOnce().then(() => undefined))`.
  It does this in the Electron and CLI composition roots and updates the DI guard specs
  (container.smoke, expected-resolvable).
- The `.ptah/specs/TASK_2026_1164_216b/` folder is untracked; commit it with the task.

## Key files

- `...\usage-ledger-coverage\.ptah\specs\TASK_2026_1164_216b\batches.md`: batch write sets,
  acceptance criteria and verify commands. Sections B9 (line ~2461) and B11 (line ~2653).
- `...\TASK_2026_1164_216b\reports\B8-report.md` and `B10-report.md`: what B9 must bind.
- `...\TASK_2026_1164_216b\decisions.md`: decision log.
- `...\TASK_2026_1164_216b\context.md`: Gate 0.1 lane preference and approval mode.

## Background work

None. All child sessions have finished (B4 and B5 children stopped). No CLI lanes are running.

## Next steps

1. Run the B8+B10 tests from the worktree:
   `npm run verify -- -t test -p @ptah-extension/persistence-sqlite,@ptah-extension/usage-analytics -- --testPathPatterns='session-stats|repository-usage|repository-identity|usage-summary|usage-reconciliation' > .ptah/tmp/b10-test.log 2>&1`
   Then grep the log for `NX |FAIL|●`.
2. If the tests pass, commit B8 and B10 with explicit paths, e.g.
   `feat(usage-analytics,persistence-sqlite,task-end-hook): reconcile and backfill usage`.
3. Run B9 (composition wiring) as a CLI lane. Prefer a non-Claude vendor. Brief it from the
   batches.md B9 entry and the bindings above. Lanes run only focused jest/tsc/eslint checks;
   the coordinator runs `npm run verify`.
4. Extend the RPC contract, then run B11 (dashboard read and guards). It touches the
   webview, so run `typecheck-templates` after it.
5. Full gate: `npm run verify -- -p <all changed projects>`. Then run an independent final
   review of `git diff main...HEAD` by a non-Claude family, then push, open the PR, set
   task.md to `in_review`, and watch CI.
