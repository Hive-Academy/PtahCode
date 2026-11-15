Verdict: REQUEST CHANGES

Reviewed the full diff from `29836a88a` to `dd8812559`, including the runtime code, specs, and task documents.

## High findings

1. **D24 still permits a no-policy spawn when `plan` is unsupported.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:84-102` receives `{ unsupported: ... }` from `resolveCliLaneDefaultPair`, then keeps `selectedPermission` and `selectedNetwork` (both `undefined`) and passes that empty policy to `validateResolvedPolicy`. `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:64-94` accepts both fields absent, and `:109-125` translates them to no native permission or sandbox setting. An adapter without a supported `plan` pair therefore starts with its native default instead of refusing. The new assertion in `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts:185-196` catches this: the focused suite fails at line 192 with `Expected a lane policy refusal` (20 passed, 1 failed). Propagate the unsupported result as a `LaneSpawnPolicyError` before translation.

## Other review notes

- D17: `libs/backend/codex-runtime/src/lib/codex-approval-bridge.ts:310-335` recognizes a child only through the live callback and forces its actionable approval through the parent sink. A recognized child skips reusable-rule auto-approval; an unknown foreign thread cancels.
- Finding 2: `libs/backend/codex-runtime/src/lib/codex-context.ts:396-399,884-897` excludes terminal child turns and records terminal state before the next approval can pass. The bridge rechecks liveness after the sink resolves (`codex-approval-bridge.ts:346-361`).
- The new terminal specs partly duplicate the guard expression in test code instead of driving a late request through `RuntimeContext`; that is a coverage limitation, not a separate High finding.
- Focused check: `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts --coverage=false --maxWorkers=2` failed 1/21 as above. The initial root Jest invocation could not resolve an unrelated workspace config; the project config supplied the usable result.
- Ptah MCP tools were unavailable in this lane's exposed tool list, so inspection used local `git`, `rg`, and source reads. No matching single-review skill was available; the repository's Tribunal skill is for multi-vendor panels, not this assigned review lane.
