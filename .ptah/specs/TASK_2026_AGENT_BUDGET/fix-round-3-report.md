# Fix round 3 report

## Findings

| Finding | Status | Evidence |
| --- | --- | --- |
| Logic 1, late ID merge enforcement | Fixed | `agent-budget-coordinator.ts:53-78` evaluates merged counters and elapsed duration; `agent-process-manager.service.ts:1364-1367` dispatches warning or stop immediately. Coordinator specs cover stop and warning. |
| Logic 2, mixed-model weighting | Fixed | `agent-turn-usage.types.ts:33-39` carries billed model deltas; `ptah-cli-stream-loop.service.ts:821-852` emits full-input deltas; `agent-budget-policy.ts` prices each model and uses the sum for catalog cost when provider cost is absent. The coordinator excludes the aggregate sentinel from catalog lookup. Policy spec uses two differently priced models. |
| S1, deadline module responsibility | Fixed | Lookups moved to `lane-restore.ts:13-31`; `lane-budget-deadline.ts:5-29` holds construction and deadline only. |
| S2, telemetry side effects | Fixed | `lane-budget-telemetry.ts:12-46` owns dispatch with injected logger/warn/stop; manager uses one collaborator at `agent-process-manager.service.ts:437` and `:1478`. Direct spec covers warning, one cost warning and stop. |
| S3, ACP drain release | Fixed | `acp-session-handle.ts:801-816` handles abort, unrefs the timer and releases it and the listener in `finally`. |
| S4, turn cost | Partly fixed | `ptah-cli-stream-loop.service.ts:653-664` publishes the same per-turn delta in UI usage and telemetry, and removes cumulative cost from `turnUsage`. A restored cumulative cost base is not wired into the loop; see gaps. |
| M1, stop reason type | Fixed | `lane-budget-telemetry.ts:1,7` uses `AgentBudgetStopReason`. |
| M2, tracked shape | Fixed | `lane-budget-deadline.ts:19` uses `TrackedAgent`. |
| M3, workspace naming | Fixed | `codex-runtime-composition.ts:240`, `codex-lane-runtime-composition.ts:323`, and `codex-lane-composition.ts:118` use `workspace` / `getWorkspace`. |
| M4, scope cleanup | Fixed | Both eager provider resolutions are inside their scope `try` blocks. |
| M5, previous cost name | Fixed | `ptah-cli-stream-loop.service.ts:275-276` names and documents cumulative result cost. |
| M6, sessionModel | Fixed | Removed write-only field and assignment from stream loop. |
| M7, mixed sentinel | Fixed | `ptah-cli-stream-loop.service.ts:238-239` declares and documents `MULTI_MODEL_ID`. |
| M8, predicate docs | Fixed | `agent-process.types.ts:315-342` attaches the stop-reason JSDoc to the exported list and documents the predicate. |
| M9, manager spacing and size | Fixed | Session ID binding moved to `lane-session-binding.ts:5-24` with a direct spec, deadline arming moved to `lane-budget-telemetry.ts`, and 23 top-level separators were restored in the manager. |
| M10, rebind docs/arithmetic | Partly fixed | `agent-budget-coordinator.ts:53-83` updates the stale comment, but the merge arithmetic is still inline. |
| M11, turn count default | Fixed | `agent-budget-coordinator.ts:12` provides `turnCountOf`, reused by restore and rebind. |
| M12, timer release | Fixed | `codex-app-server-lane.adapter.ts:694` calls `unref()` directly. |

## Verification

- `ptah_get_diagnostics` on changed production files: 0 errors, 0 warnings.
- `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: lint/typecheck 14/14 passed; test phase 16/17 tasks passed. The sole failing task was platform-core, with exactly the two known failures in `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts` (57 other platform-core suites passed).
- Final-file rerun: shared and cli-agent-runtime lint/typecheck 4/4 passed; shared tests passed; cli-agent-runtime had 171 passing suites and one new spec with a TypeScript fixture cast error. After correcting the fixture, its targeted Jest run passed, and cli-agent-runtime lint/typecheck passed 2/2. The attempted filtered `verify` also passed its test target but sent the Jest filter to tsc/eslint, so those two targets failed on the unsupported flag; the unfiltered lint/typecheck rerun passed.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exited 0, no FAIL; baseline count did not rise.
- Manager: 3,849 physical and 3,673 nonblank lines, versus origin/main 3,849 physical and 3,675 nonblank lines (review's main reference).

## Remaining gaps

- Restoring the cumulative SDK cost base on resume needs a persisted session cost passed to `PtahCliStreamLoop`; current first-turn delta starts at zero.
