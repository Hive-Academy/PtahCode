VERDICT: REQUEST CHANGES

# PR #1288 permission enforcement — round 3

Reviewed HEAD `08b1a3e68`. HEAD advanced from `2d1433ed0` while this review was in progress. Antigravity rounds 1 and 2 were read from commit `a6f63e42e` because their files are absent from this worktree's task folder.

## Finding 1 / D17 — fixed in HEAD

- `libs/backend/codex-runtime/src/lib/codex-approval-bridge.ts:310-334`: recognized children force `policy = 'present'`, bypassing `codexPermissionPolicy` and reaching the parent sink. This closes the auto-grant route.
- `codex-approval-bridge.ts:348-356` exempts a recognized child from the parent plan-level decline after the sink responds. The plan case at `codex-approval-bridge.spec.ts:898-914` expects the sink's `accept`. The focused bridge suite passes 69/69.

## Finding 2 — production fix present; test gap

- `libs/backend/codex-runtime/src/lib/codex-context.ts:396-399` requires `!terminalTurns.has(turnId)` in `isChildTurn`. The native terminal path records the turn and removes the child maps at `:884-890`, so a late approval cannot pass that callback.
- `libs/backend/codex-runtime/src/lib/codex-approval-bridge.spec.ts:882-894` stubs `isChildTurn` to reject a different turn ID. It never exercises the context's terminal handling; removing the production guard would leave this spec green. Add a context-level regression that terminates a native child and then submits an approval for its same thread and turn.

## D24 — fail-closed logic present, but HEAD does not typecheck (high)

- `libs/shared/src/lib/types/cli-lane-defaults.types.ts:49-62` limits no-row candidates to `plan` and returns `unsupported` if no plan/network pair exists. This is the intended fail-closed behavior.
- The `['plan']` expression is inferred as `string[]`. The focused `cli-lane-policy-resolver.spec.ts` run fails before tests execute: TS7053 at `cli-lane-defaults.types.ts:52` and TS2322 at `:56`. Type `permissions` as `readonly LanePermissionMode[]` or preserve the literal type, then rerun the spec. The unsupported-plan assertion is at `cli-lane-policy-resolver.spec.ts:185-194`.

## Verification and logic questions

1. **Silent failure:** no silent auto-grant path found in recognized child approvals; `present` invokes the sink (`codex-approval-bridge.ts:325-334`).
2. **Unexpected user action:** a parent approval in plan mode is honored for a recognized child (`codex-approval-bridge.ts:348-362`).
3. **Wrong input:** a no-row adapter supporting only `yolo` is intended to return `unsupported` (`cli-lane-defaults.types.ts:49-62`), but compilation prevents this path from running.
4. **Dependency failure:** terminal child approvals fail the context callback (`codex-context.ts:396-399`); the CLI spec cannot run due to the type errors above.
5. **Missing coverage:** the terminal-child bridge spec does not wire up the runtime callback (`codex-approval-bridge.spec.ts:882-894`).

Focused checks against source now committed in HEAD: `codex-approval-bridge.spec.ts` passed 69/69. The CLI resolver suite did not start because of the two TypeScript errors. `ptah_get_diagnostics` reported TypeScript checking still running after 45 seconds and returned no result. No reviewed source was edited.

## Score: 6/10

The three production logic paths now match the requested behavior, putting this above 3–4. The shared resolver has a compile-blocking error and the terminal-child regression does not exercise the runtime, keeping it below 7–8. Fix the type inference, pass the focused CLI resolver spec, and add a context-level terminal-child regression before approval.
