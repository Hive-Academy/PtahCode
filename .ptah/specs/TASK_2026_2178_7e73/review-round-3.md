VERDICT: NEEDS_REVISION

# Review Round 3 — PR #1288 (HEAD 2d1433ed)

## Finding 1 (D17): child approvals reach parent sink — PASS (code), weak-ish tests
- `codex-approval-bridge.ts` ~L307-335: `isChild()` is split out. When it is true, `policy = 'present'` and the plan/permission policy is skipped, so the request goes to the sink via `interact`.
- Specs cover plan, ask, auto-edit and yolo via `it.each`, plus parent denial. 66/66 pass in `codex-approval-bridge.spec.ts`.
- Residual: `isChild()` is evaluated before the parent check. A parent-thread request (`threadId === identity.threadId`) that also passes the `isChildTurn` callback is not an issue in practice, since the child thread id differs from the parent's. Parent plan-mode no longer auto-declines child requests. This is intended by D17, but it relies entirely on the sink to enforce plan restrictions. No spec asserts that the sink receives the plan context.

## Finding 2: terminal children reject approvals — PASS (code), spec does not exercise the fix
- `codex-context.ts` L396-399: `isChildTurn` now includes `!this.terminalTurns.has(turnId)`. Correct, and `terminalTurns` is populated at L888/892/902.
- The new spec ("fails closed when isChildTurn detects a terminal turn") supplies its own `isChildTurn` stub that returns false for `terminal-turn`. It never touches `RuntimeContext`, so it passes with or without the `codex-context.ts` change.
  - **Medium:** a regression that removes the `terminalTurns` check would not fail any test. Add a codex-context spec that completes a child turn and then sends an approval request.

## D24: fail-closed default — FAIL
- `cli-lane-defaults.types.ts` L62-63: the new guard sits after the search loop, which has already returned the first supported permission. When `plan` is unsupported but `auto-edit` or `yolo` is supported, the loop returns `auto-edit` or `yolo` as a built-in default. That is exactly the fail-open case D24 meant to close.
- The guard is only reached when no pair is supported at all. `!saved.permission` is also redundant, because `saved.permission` returned a few lines earlier.
- **High:** the new spec "fails closed when adapter does not support plan" FAILS. I ran `cli-lane-policy-resolver.spec.ts`: 20 passed, 1 failed with "Expected a lane policy refusal" (spec L192). The commit therefore ships a red test.
- Fix: when `!saved.permission`, only the `plan` candidate should be tried (`permissions = saved.permission ? [saved.permission] : ['plan']`). If plan is unsupported, return `unsupported`. Check that existing callers and tests, such as the unverified-adapter and Ptah CLI paths, still pass.

## Verification run
- `jest` on `codex-approval-bridge.spec.ts`: 66/66 pass.
- `jest` on `cli-lane-policy-resolver.spec.ts`: 1 failure (D24).
- I did not run `ptah_get_diagnostics` or any workspace-wide checks.

## Score: 4/10
Finding 1 is sound. The Finding 2 production fix is correct but its test does not exercise it. D24 is not implemented, and its own spec fails. Another pass is needed. It does not drop to 1-2 because 2 of the 3 production fixes are right and the D24 fix is small.
