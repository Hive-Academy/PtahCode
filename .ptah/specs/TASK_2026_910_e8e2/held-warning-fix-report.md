## Changes

- lane-budget-telemetry.ts:8-18 - Claim a held warning for one later message; lines 95-100 persist held outcomes and remove the unreachable unsupported branch.
- tracked-agent.ts:16 - Store the held warning on the live lane record.
- agent-process-manager.service.ts:2474-2489 - Prepend the warning to the next parent message, restore it on refusal or error, and log successful delivery; line 3640 passes held state to completion.
- lane-completion-notifier.service.ts:299,908 - Carry held state from completion context into the signal.
- agent-process.types.ts:741 - Add one optional heldBudgetWarning field to LaneCompletionSignal.
- lane-completion-envelope.ts:86-87 - Tell the parent that the lane passed the warning threshold and its next accounted turn stops it when the warning was still held.
- lane-budget-telemetry.spec.ts:83-111 - Check held state, one-time prepend, and no held state after steer.
- agent-process-manager.service.spec.ts:3610-3629 - Check one-time delivery through sendToAgent and its info log.
- lane-completion-notifier.service.spec.ts:401-408 and lane-completion-envelope.spec.ts:13-21 - Check held warning propagation and no extra line after delivery.

## Decisions

- Prepend through sendToAgent for every delivery mode, then clear on accepted routing. Restore on unsupported routing or an exception so a later parent message can carry it.
- Used an optional completion context/signal field rather than overloading the unrelated MCP warning. The parent approved the notifier, shared type, and manager spec additions outside the original write set.

## Not done

- Tests, Jest, Nx, build, serve, e2e, package, and npm verify were not run as directed. Scoped ptah diagnostics timed out after 45 seconds without a result; coordinator verification is pending.
- Did not touch agent-budget-policy.ts, agent-budget-coordinator.ts, or their specs.