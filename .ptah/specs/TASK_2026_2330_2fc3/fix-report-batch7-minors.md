# Batch 7 minor fixes

## Review items

| Item | Fix | Regression test |
| --- | --- | --- |
| 1 | Catch a rejection from the store-owned retry join and let the hand-off settle in `manual-recovery`. The catch records the recovery path with a `degradation-audit:` comment. [generation-handoff.store.ts:184](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:184) | Offers manual recovery when a joined guidance retry rejects. [generation-handoff.store.spec.ts:225](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.spec.ts:225) |
| 2 | Manual Continue captures the pending hand-off before reset and passes the parent record for the selected workspace. The guidance run receives the parent's run ID and analysis identity. Manual Continue in an active workspace with no matching pending hand-off starts independently. [generation-handoff.store.ts:84](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:84) | Keeps the pending parent chain on manual Continue. [generation-handoff.store.spec.ts:239](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.spec.ts:239) |
| 3 | Call the public `SetupRunStore.isCancelling()` method during parent validation. The countdown skips the hand-off while the parent awaits backend confirmation, even while its status is `running`. [generation-handoff.store.ts:127](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:127) | Skips the countdown while the parent awaits cancellation confirmation. [generation-handoff.store.spec.ts:166](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.spec.ts:166) |
| 5 | Add a `degradation-audit:` comment explaining that manual recovery preserves the workflow's non-running status, such as `needs-input`. [generation-handoff.store.ts:250](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:250) | Related existing test: “reports a safe failure when the start rejects.” [generation-handoff.store.spec.ts:288](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.spec.ts:288) |

## Checks

- Jest passed 14 of 14 tests in 1 suite, including all 3 new regressions. [Jest log](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/.ptah/tmp/fix-batch7-minors-jest.log)
- TypeScript passed for `tsconfig.lib.json` with 0 errors. [TypeScript log](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/.ptah/tmp/fix-batch7-minors-tsc.log)
- ESLint passed for both edited files with 0 errors and 0 warnings. [ESLint log](/home/amun/ptah-extension/.claude-worktrees/setup-background-runs/.ptah/tmp/fix-batch7-minors-eslint.log)
- Ptah diagnostics showed 0 diagnostics in the edited files and 8 BigInt target errors in dependency files. The requested setup-wizard project type check passed.
- The Ptah dependency graph lacked the store file. A scoped text search confirmed the setup-wizard references.
