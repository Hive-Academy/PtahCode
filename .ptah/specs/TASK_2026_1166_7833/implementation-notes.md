# Implementation notes

## Changed files (5)

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts`: uses one idle/no-queued-follow-up/no-running-lane predicate for runtime warning and cap. An idle child keeps `capReached` without succession. A later parent message invokes runtime-cap succession and enters the successor continuation prompt, preserving the message. Busy turns retain the existing grace path.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.succession.spec.ts`: covers skipped idle warning, sent busy warning, deferred idle cap, and delivery of the next message to the successor.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-child-contract.ts`: calls the handoff mechanism “the session-handoff skill” without embedding its slash command.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-child-contract.spec.ts`: updates the contract snapshot text.
- `.ptah/specs/TASK_2026_1166_7833/implementation-notes.md`: records the implementation, verification, and deferred item.

## Changed assertion

The old succession spec asserted that an idle child was immediately `handed-off` when the wall-clock cap fired. It now asserts that `capReached` is set, the child remains live without a successor or parent signal, and the next parent message starts a successor with cause `runtime-cap` and the message in its prompt. Idle alone does not establish that the child's work is complete.

## Cap timers per successor

Each successor gets a new `ChildRuntime` with `capReached: false` (`session-spawner.service.ts:2300-2309`), and `armRuntimeCap(nextRuntime, successorId, settings.maxRuntimeMinutes)` arms a fresh timer after it starts (`session-spawner.service.ts:2393`). `armRuntimeCap` schedules relative wall-clock timers (`session-spawner.service.ts:2080-2095`). The lineage retains `startedAt` (`session-spawner.service.ts:2294`), but the cap does not use that field. Thus a lineage age of 553 or 663 minutes is possible with a 120-minute cap, 15-minute busy grace, and up to 8 successions. The age alone does not identify the trigger of any specific succession.

## Decisions

- Defer succession for an idle child with no pending work. Immediate succession and marking it completed were alternatives; the diagnosis shows neither is justified by idle state. This is reversible.
- Carry a post-cap parent message in the existing successor continuation prompt. The succession path already accepts `prompt` and renders it (`session-spawner.service.ts:2359-2370`). This is reversible.

## Deferred item and risk

- Budget auto-handoff reason text is deferred under the six-file limit. `session-handoff-prompts.ts` and three frontend specs pin the command text, which would bring the total to nine changed files including this note. Add `Reason: session usage budget reached 100%.` in a follow-up.
- A child with no new message can remain live past the cap. A direct message in its tab starts a turn and existing turn-end cap handling hands it off; parent messages are carried directly to the successor.

## Verification

- `npm run verify -- -p @ptah-extension/cli-agent-runtime`: lint and typecheck PASSED (Nx cache hit).
- The local test phase did not complete. It ran under memory pressure and was stopped by the coordinator decision. CI test shards are the judge.
