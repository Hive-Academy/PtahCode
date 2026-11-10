# Batch 2 report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts`: succession state machine, warning and grace timers, lane adoption, failure safety net, end-cause routing, old-id forwarding, and stop-cause info log.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts`: public `succeed`, `session-ended` cause, and successor id in completion subject.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-child-succession.ts` and `.spec.ts`: recovery wording and pure stop/succeed routing for all nine end causes.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: reusable harness, lane adoption mock, cause payloads, and adjusted cap/grace assertions.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.succession.spec.ts`: new succession and end-cause cases.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts` and `.spec.ts`: handed-off maps to unverified and names successor.

## Behavior by section

1. Runtime state stores settings, model, permission, new timers and succession flags; resource release clears them.
2. Runtime warning queues a peer message. The cap starts succession when idle, waits for a busy turn, and interrupts only after handoff grace. Running CLI lanes can be adopted at turn end.
3. One private succession path creates a fresh child id in the existing worktree, registers its policy and MCP root, adopts lanes provisionally, starts the host session with the successor prompt, then settles adoption. Failure reverts the registry link and adoption without worktree rollback.
4. Host succession retires immediately. Tool succession retires on turn end/failure or at 60 seconds. Disposal clears fallback timers.
5. Runtime safety net marks timed-out, moves running lanes to the parent, preserves the worktree, and reports the failure detail.
6. Public `succeed` accepts a live child caller and returns a closed refusal otherwise.
7. Owned old ids forward to the latest successor; snapshots expose registry lineage fields.
8. End causes route explicit stops to ended and other causes to recovery succession. Stop causes emit an info log with child id, worktree and branch. Unknown cause logs a warning line. Recovery failure or limit ends the child and moves lanes to the parent.

## Spec cases added

- Warning timing; idle and busy cap; turn-boundary and grace-expiry succession; lane adoption; start failure without worktree rollback; zero and chain succession limits; tool-driven succession, refusal and retirement; parent signal; old-id forwarding; all stop and recovery end causes; unknown cause log; recovery start failure; notifier verdict and successor text; pure routing cases for all end causes.
- Existing re-registration grace case remains in `session-spawner.service.spec.ts` and now supplies the cause payload.

## Extra files read

- `batch-2-brief.md`, `batch-1-report.md`.
- `session-child.registry.ts` (registry behavior and findByCwd), `session-child-settings.ts`, `child-chat-session-host.port.ts`.
- `agent-sdk/src/lib/helpers/session-end-callback-registry.ts` (exact cause contract) and `sdk-adapter-events.service.ts` (failed-turn event shape).
- `session-handoff.service.ts` Logger injection lines, read only.

## Decisions

- The failed-turn event has no background task list; it succeeds at the cap on that event. Evidence: `SdkAdapterTurnFailedEvent` fields. Reversible: yes.
- A session-ended predecessor is released without another interrupt because its session is already gone. Evidence: end-cause path and active-session check. Reversible: yes.
- `findByCwd` prefers a live record, so a successor wins for the shared worktree. Evidence: registry loop returns first nonterminal record. Reversible: yes.
- Reused the service spec harness from the new succession spec to avoid a second large test fixture. Reversible: yes.

## Not done

- Test, lint, typecheck, build and package commands were prohibited. Scoped Ptah diagnostics were requested repeatedly, but the TypeScript compiler reported unavailable after 45 seconds; the edited TypeScript remains unverified by compiler or Jest. The orchestrator should run its prescribed project verification.
- Git status and diff were not run because the backend role prohibits git commands. No other lane's files were edited.
- Status usages in other projects from B1 were left untouched, including cron-scheduler, shared, gateway-chat-bridge, frontend, rpc-handlers, vscode-lm-tools, agent-sdk and agent-generation.
