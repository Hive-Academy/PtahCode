# Lane B status

## Behavior

- Top-level handoff successors use the existing Fix C resume operation with the Ptah recovery prompt and sender. A `provider-no-response` or legacy `no-activity-timeout` end with `zeroOutwardEvents === true` can reserve one retry. The stop cutoff is the teardown start when supplied and the end callback time otherwise. The reservation key and one-time final failure reporting are retained.
- Initial children and child successors use the same five-second reservation. Bound children use verified resume. For an unbound child, the spawner calls `startChildSession` with the stored input and prefixes its prompt with `formatWatchdogRetry()`. It checks existing chat abort timestamps when SDK teardown prevents another end callback. Explicit stops, close events and reparenting cancel scheduled replay. If ownership moves after replay starts, a second failure goes to the new parent. The advisory first-turn probe and end-grace defer while the retry owns recovery.
- Child runtime warnings use the Ptah handoff ask. At the runtime cap the spawner holds new host sends. At cap plus grace it records a live pause, sets the tool disposition for the tab and SDK IDs, and sends one notice through verified parent lineage. The child retains its session, slot, lanes and worktree. A failed successor start or exhausted succession allowance escalates to the parent.
- Child status and completion preserve action notices alongside the outcome. Lane completion results accept optional notice and receipt data.

## Files changed

- Runtime session children include `handoff-watchdog-recovery.ts`, `session-child-first-turn.watchdog.ts`, `session-child-outcome.ts`, `session-child-succession.ts`, `session-child.registry.ts`, `session-spawner.port.ts`, `session-spawner.service.ts` and their focused specs. The child host port follows the existing start and resume contracts.
- Runtime lane and wiring changes include `lane-completion-result.ts`, `agent-events.ts`, their focused specs, and the disposition seam documentation in `di/register.ts`.
- Shared additive types include `agent-messaging.types.ts` and `agent-process.types.ts`.
- The m7 wiring adds the typed method to `child-chat-session-host.port.ts` and implements it in the RPC `child-chat-session-host.adapter.ts`, with coverage in the adapter and spawner specs.

## Verification

- The final focused Jest run passed 652 tests across nine runtime suites.
- Both runtime TypeScript checks passed.
- Changed-file ESLint passed with zero errors and seven warnings. The module-boundary rule skipped because the cached project graph was unavailable.
- Logs are in `.ptah/tmp/laneB-continuation-final-*.log`.
- Ptah workspace analysis was available. Its dependents index was still building, so repository search was used for caller inspection. No matching native Codex implementation skill was discoverable. The repository session-handoff skill was consulted for handoff mechanics.

## SDK evidence

The SDK producer now checks raw tool hooks and SDK work evidence as part of its zero-event assertion. Lane B consumes that assertion and checks child turn results and pending permission.

## Review follow-up

- Parent sends to a cap-reached or paused live child resume it and restart its cap window. Explicit SDK resumes also restart the window. Both routes clear the pause notice and tool disposition for the tab and SDK IDs. The pause notice names the parent send route.
- The 120-second probe settles a child whose first turn has no evidence of starting. The end-grace timer rechecks while a replay is in flight, and cap grace defers during succession.
- Duplicate untimestamped ends during replay do not consume the final failure. Recovery logs resume, stop, active-session refusal and ownership loss. Dropped parent notices are logged because the registry only holds completion envelopes. Succession notices report counts when applicable.
- The acknowledgement path still ends its predecessor with `parent-stop`. A cap-reached child predecessor uses the existing turn and session-end retirement events after a cooperative handoff. Review item m8 remains a follow-up for the absent retirement timer on this path.
- Review item m7 uses the optional `IChildChatSessionHost.wasStoppedSince` method. The RPC child adapter reads the same injected stop history as verified resume. This cancels an unbound retry when a tab closes after SDK teardown, even when no second end callback arrives.
- Review Jest passed 550 tests across five changed runtime suites. Runtime library and spec TypeScript checks passed. Changed-file ESLint passed with zero errors and five warnings. The review logs use `.ptah/tmp/laneB-review-final-*.log`.
- The m7 Jest rerun passed 315 runtime tests and 36 child-host adapter tests. Library and spec TypeScript checks passed in both projects. Changed-file ESLint passed with zero errors and one file-length warning. The m7 logs use `.ptah/tmp/laneB-m7-*.log`.
