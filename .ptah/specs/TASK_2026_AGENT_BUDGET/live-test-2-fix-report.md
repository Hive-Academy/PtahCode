# Live test round 2 fix report

## Defect 1: late warning

Root cause: `AgentBudgetPolicy.evaluate` warned only when the current total reached `warnRatio` (`libs/shared/src/lib/utils/agent-budget-policy.ts:113`). The live totals jumped from 242,052 to 305,692 against 300,000, so the warning and stop occurred together. The policy now warns when another turn with the latest accepted turn's weighted delta would cross the stop (`agent-budget-policy.ts:112-113`). The warned snapshot still permits only one warning. `agent-budget-policy.spec.ts` covers a predictive warning before the stop and no repeat warning on the stopping turn. The existing one-turn jump stop-envelope warning remains at `lane-completion-envelope.ts:34`.

## Defect 2: unsupported Codex warning

Root cause: the manager requested explicit `steer` at `agent-process-manager.service.ts:462-466`, but this callback runs after a completed turn. The Codex handle rejects steer without an active receipt (`cli-adapters/codex/codex-app-server-lane.adapter.ts:841-846`); the message router maps that rejection to `unsupported` (`agent-message-router.service.ts:181-191`). The manager now attempts steer, then routes through the handle's real continuation queue when steer is unavailable (`agent-process-manager.service.ts:462-468`). The Codex adapter exposes continuation (`codex-app-server-lane.adapter.ts:840`), and the router parks a queued message for a running lane (`agent-message-router.service.ts:207-211`). True unsupported delivery is logged once for the one warning decision with its reason (`lane-budget-telemetry.ts:54-60`); the completion stop message retains the warning. The warning's predictive timing gives the queue a subsequent turn in which to deliver.

## Defect 3: missing progress pointer

Root cause: the notifier always supplied the generic `ptah_agent_read` command (`lane-completion-notifier.service.ts:859` before this change). A budget completion now points to an existing deliverable path when present; otherwise it names the last recorded turn ID and true CLI Session ID (`lane-completion-notifier.service.ts:859-860`). The envelope emits that pointer and the session separately (`lane-completion-envelope.ts:103-108`). `lane-completion-envelope.spec.ts` checks a concrete file pointer and true session ID.

## Defect 4: native Codex child linkage

Root cause: the admission path linked children from `thread/started.parentThreadId` or a translated `collabAgentToolCall.receiverThreadIds` (`codex-context.ts:399-411,493-499`; `codex-event-translator.ts:684-704`). The protocol schema also defines `subAgentActivity.agentThreadId` and keyed `collabAgentToolCall.agentsStates` (`codex-protocol-schemas.ts:438-463`), but those IDs were not used. The runtime now links activity IDs to the one pending spawn for its parent thread (`codex-context.ts:427-434`), and the translator merges receiver IDs with agent-state keys for spawn events (`codex-event-translator.ts:692,703`). `linkChild` releases buffered child events (`codex-context.ts:503-520`). `codex-context.spec.ts` covers spawn start, an early child event, an activity linkage, and a later spawn completion carrying the same ID; it asserts the child event is admitted once. `codex-event-translator.spec.ts` covers a spawn with an empty receiver list and a populated agent-state map. The sanitized live log records overflow but no wire frames, so it cannot prove which of these linkage events the app server emitted. A new live run must confirm an observer decision and one charge per child turn.

## Decisions

- Use the Codex continuation queue after a rejected steer. The adapter has both operations, and the rejected steer occurs after turn completion. Reversible: yes.
- Accept `subAgentActivity.agentThreadId` only with exactly one pending spawn on the same parent thread. This avoids assigning unrelated child events by timing alone. Reversible: yes.

## Verification

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with no FAIL and no baseline change. The first full scoped `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli` pass found a TypeScript narrowing error in `codex-context.ts:431-432`; it was corrected by checking `agentThreadId` before access. The final-code rerun passed all 14 lint and typecheck tasks. Its Jest phase passed every project except platform-core, which failed only the two permitted known specs, `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts` (57 suites and 1047 tests passed in that project on the first pass; the second run reused the same platform-core test output). The command exited 1 solely for those two known failures. The manager contains 3,675 nonblank lines, meeting its limit.

## Remaining gaps

The round 2 log contains no raw app-server notification frames. Native child attribution and warning delivery need another live test. No Ptah Dev launch was performed in this lane.
