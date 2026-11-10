# Next exact step (PR #1040 review fixes)

State: the fixes for the 4 review threads are in the worktree
`.claude-worktrees/feat-review-findings-interactive-2-56b1620c572f` (branch `feat/review-findings-interactive-2`).

1. `npm run verify -- -p review-github,review-core,review-contracts,rpc-handlers,review-runs-ui`, then `-p ptah-electron,cli-engine`.
2. Read `review-fixes-lane-review.md` (Glm lane) and fix confirmed defects.
3. `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`.
4. Commit in the foreground, then `git push origin HEAD:feat/review-findings-interactive` (fast-forward only).
5. Reply on the 4 threads with the fix commit and resolve them:
   PRRT_kwDOPngTds61mQkZ (1), PRRT_kwDOPngTds61mQkc (2), PRRT_kwDOPngTds61mQkh (3), PRRT_kwDOPngTds61mQkk (4).
6. Update the PR body test plan with the real results. Watch CI. Send the final `ptah_agent_report`.
