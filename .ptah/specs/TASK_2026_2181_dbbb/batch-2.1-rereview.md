## Verdict

APPROVE WITH FIXES. The capacity, in-flight ceiling, and shared error context fixes address their original cases. Force with an explicit key still defeats the requested bypass, and the invocation log exposes task text.

## First-review defects

| Defect | Fixed? | Evidence file:line |
| --- | --- | --- |
| 1. A settled failed lane replays for 120 seconds | Yes for a returned terminal status; status errors instead start a new lane | agent-spawn-dedupe.ts:73-85; protocol-dispatcher.ts:1290-1309; protocol-dispatcher.spec.ts:4398-4421 |
| 2. Limit block lost for auto-detect and pending named lookup | Partial: pending named lookup note restored; auto-detect still omits the block by design | protocol-dispatcher.ts:1396-1409; protocol-dispatcher.spec.ts:4510-4550 |
| 3. Capacity eviction removes an in-flight reservation | Yes until all 200 are in flight; overflow runs without a reservation | agent-spawn-dedupe.ts:89-95; agent-spawn-dedupe.spec.ts:118-165 |
| 4. Hung in-flight reservation lasts forever | Yes: next call after five minutes removes it | agent-spawn-dedupe.ts:61-69; agent-spawn-dedupe.spec.ts:167-181 |
| 5. Concurrent replay loses the first caller's limit suffix on a spawn error | Yes: both callers receive the same SpawnAttemptError gate context | protocol-dispatcher.ts:758-765,1286-1288,1326-1358; protocol-dispatcher.spec.ts:4423-4444 (same text, but no limit-suffix assertion) |

## New findings

1. Major - agent-spawn-dedupe.ts:46-50,73-87. With `{task:'x', idempotencyKey:'k'}`, a later `{task:'x', idempotencyKey:'k', force:true}` enters the same key and replays the first lane. This contradicts the specified force bypass. The force test at protocol-dispatcher.spec.ts:4446-4471 omits the key. Bypass dedupe whenever `force === true`, then add a force-plus-key test.
2. Major - protocol-dispatcher.ts:1200-1206. The existing invocation log records up to 100 characters of `task`; for a short task it records the full task, including any pasted secret. The timing-only assertion at protocol-dispatcher.spec.ts:4552-4581 does not inspect this separate log line. Remove the task preview or replace it with a safe length/count.
3. Major - protocol-dispatcher.ts:1221-1223. Callers without `_callerSessionId` all use the first workspace root as scope. Two separate external MCP sessions sending identical arguments within the window receive the same agent ID, despite having different callers. Include an authenticated caller identity in the scope where available, or avoid cross-session dedupe when none exists; test two distinct external callers.
4. Moderate - protocol-dispatcher.ts:1290-1309; agent-spawn-dedupe.ts:74-75. A settled-entry replay now awaits `agent.status` without a time bound. If status hangs, every identical retry hangs on the shared `validation` promise, so the fast retry reply is lost. Bound the status check and decide the timeout policy explicitly. The running/failed tests use immediately resolved status mocks.
5. Minor - agent-spawn-dedupe.ts:74-76. If a future `isStillValid` callback rejects, the `validation` field stays set to its rejected promise; later retries reject indefinitely instead of starting again. The current dispatcher callback catches status errors, so this is a generic dedupe API hazard. Clear validation in a `finally` and test rejection.

The recursive `run` path does not show a duplicate insertion race: after a false shared validation, one caller deletes the old entry and inserts a new reservation synchronously; other callers recurse into that reservation (agent-spawn-dedupe.ts:77-105). Rejections from the spawn promise have handlers (agent-spawn-dedupe.ts:106-119). In-flight expiry and capacity handling are bounded, though overflow is deliberately unreserved. The error wrapper preserves gate context on concurrent failures. The AsyncLocalStorage value is set before the process-manager spawn and in `finally` for earlier failures (agent-namespace.builder.ts:678-690); replay callers have their own empty store and timing line (protocol-dispatcher.ts:1179-1181,1418-1437). No post-spawn limit lookup was added; the new status await applies only to settled replays.

## Not checked

No tests, build, Nx, diagnostics, or runtime checks were run, as instructed. The fixes report claims 440 passing tests and TypeScript checks; this review did not rerun them. No context.md or implementation-plan.md exists in this task folder. Ptah code-intelligence tools were not exposed in this lane, so native read/search was used. Source files and other spec files were not edited.

REREVIEW: DONE
