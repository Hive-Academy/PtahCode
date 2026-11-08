# Live test round 1 fix report

## Answers and evidence

1. The `budget` stop came from the new agent budget path. `LaneBudgetGuard.observe` emits only `repeat-call` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-guard.ts:76-88`); the Codex lane budget settings in `codex-lane-budgets.ts:21-26` are compaction/tool-output settings. The new `AgentBudgetPolicy` compares accumulated weighted tokens to `stopWeightedTokens` (`libs/shared/src/lib/utils/agent-budget-policy.ts:106-115`), and `LaneBudgetTelemetry` dispatches its stop (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-telemetry.ts:24-47`). Both paths formerly used `stopLaneForGuard`, explaining the ambiguous live log. Its log now names either `Agent budget` or `Lane repeat guard` (`agent-process-manager.service.ts:1611-1616`). The live log's zero tool calls also rules out the repeat guard.
2. The real Codex app-server mapper emits a `turnTelemetry` segment at terminal (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts:224-254`), or `finishPendingUsage` after the 2 s drain (`codex-app-server-lane.adapter.ts:680-694`). The handle exposes `onSegment` (`codex-app-server-lane.adapter.ts:822-838`), and the manager forwards it to `LaneBudgetTelemetry.accept` (`agent-process-manager.service.ts:1462-1477`). Thus the Electron lane path is wired; the sanitized log lacks figures because no per-turn figure was logged. The policy also suppressed warning whenever a single turn crossed the stop limit. The policy now emits the warning at that crossing (`agent-budget-policy.ts:110-115`); rebind does likewise (`agent-budget-coordinator.ts:66-75`). Because the async steer may be canceled by the immediate stop, the budget completion message explicitly includes the warning (`lane-completion-envelope.ts:30-35`). The warning and stop therefore remain visible together even if steer cannot finish.
3. Each newly accepted reported turn now writes one info log with agent ID, turn ID, observed model, input/output/cache tokens, cumulative weighted tokens, ratio, and cost authority (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-telemetry.ts:24-40`). An unavailable turn writes one info log with its reason (`lane-budget-telemetry.ts:41-45`). The cost authority comes from the policy result (`agent-budget-coordinator.ts:86-108`). No prompt or secret is logged.
4. Electron creates a Codex chat scope in `apps/ptah-electron/src/di/codex-runtime-composition.ts:410-417`, and that scope registers `childBudget` with the real workspace provider at `:229-250`. `CodexRuntime` attaches the observer when a context opens (`libs/backend/codex-runtime/src/lib/codex-runtime.ts:361,470-481`). The observer consumes context events and logs child decisions (`codex-child-budget-observer.ts:95-122`). This is reachable for native Codex-provider chats; its current behavior is advisory logging, not child interruption (`codex-child-budget-observer.ts:61-81,95-122`). Batch E supersedes Batch F on host wiring.

## Fixes and specs

- Changed policy and late-session rebind warning conditions for a one-turn jump across both thresholds; asserted policy warning plus stop in `libs/shared/src/lib/utils/agent-budget-policy.spec.ts`.
- Distinguished the shared stop log by source and added the warning to the budget completion envelope; asserted the envelope in `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-envelope.spec.ts`.
- Added safe turn and unavailable telemetry logs; asserted their fields and a simultaneous warning/stop in `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-telemetry.spec.ts`.

## Next Ptah Dev live test

**A — Codex CLI lane:** In a Claude-provider chat, ask the parent to call `ptah_agent_list`, then `ptah_agent_spawn` with `cli: "codex"` for a bounded coding task in the scratch workspace. Set Dev-only `ptah.agentBudget.warnRatio=0.85`, `stopWeightedTokens` low enough for one completed turn to cross the limit, and `handoffContextTokens` for the intended handoff. Confirm the returned true CLI session ID and observed model, an `Accepted lane turn` info line with numeric counters/ratio/cost authority, a warning or the warning in `<agent-lane-completed>`, an `Agent budget tripped` stop with reason `budget`, a progress pointer, and a fresh-session result when trying to resume the exhausted ID. Repeat with missing turn totals to see `Lane turn telemetry unavailable` and `telemetry-unavailable` stop.

**B — Codex-provider child:** In Ptah Dev, open a **new native Codex-provider chat** (select Codex/OpenAI Codex as the chat provider, rather than choosing `cli: codex` inside a Claude-provider chat). Ask: “Delegate a small, independent repository inspection to a child agent using your native child-agent tool; have the child report its findings, then summarize them.” Confirm the Codex parent actually starts a child thread. Check `[Codex budget] Child budget decision` with child thread ID and warning/handoff/stop fields. A CLI lane spawned with `ptah_agent_spawn` is check A and does not establish check B.

## Verification

- Requested scoped `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: first lint/typecheck pass had 11/14 tasks pass; three dependent typechecks found one narrowing error in the new telemetry log. That error was corrected before the test phase finished. Tests had 16/17 tasks pass; platform-core had exactly its two known failures (`control-endpoint.spec.ts`, `kernel-session-driver-lock.spec.ts`), with 57 suites and 1047 tests passing. Corrected subset `npm run verify -- -p cli-agent-runtime,cli-engine,ptah-electron` passed all 6 lint/typechecks and all 7 test tasks (exit 0).
- `ptah_get_diagnostics` on changed files: TypeScript check remained unavailable after timeout; the scoped verifier supplied concrete errors and prompted the correction.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; no FAIL, no baseline change.
- Manager nonblank lines: 3,675, meeting the 3,675 limit.

## Decisions

- For a turn that crosses warning and stop together, set the warning flag and include the warning in the completion message. Alternative: await async steer before stopping. Evidence: plan requires warning delivery or inclusion in stop message, while immediate stop preserves the hard limit. Reversible.
- Use the policy's reported provider/catalog/unavailable source for cost authority. Alternative: infer it from the presence of a provider cost field, which would mislabel catalog fallback. Reversible.

## Remaining gaps

- A real Ptah Dev run is still needed to prove the numeric turn logs and child observer against live Codex events. This lane did not launch Ptah Dev, per task constraint.
- Codex child observer currently logs decisions only; it does not interrupt a child. The earlier Batch E report records this as unfinished enforcement.
