# Batch 5 report: Claude steer dormant fixes and wiring (Component 7)

## Files (W = `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups`)

All Batch 5 files are its own; no other batch touches them.
- W/libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:
  - (a) `reconcileSteers(undefined)` clears the pending steers and counts them as folded in: no info segment and no placeholder.
  - (b) `steer` deletes its uuid from the pending map when `named.enqueue` rejects or `mailbox.push` throws, then rethrows.
  - (c) `pendingSteers` is now a `Map<uuid, anchor>`. The anchor is the last `inFlight` entry when the steer was pushed. On a miss, one placeholder goes right after the earliest missed steer's anchor. If that anchor is gone, the placeholder goes at index 1, right after the head that is about to shift. The fixed `splice(1, 0, …)` is removed. `finish()` still clears the map.
- W/libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts: five new cases.
  - a result without uuids;
  - a failed mailbox push;
  - a named enqueue that rejects;
  - a missed steer after a continue queued before it;
  - a missed steer before a turn queued after it.
  - The describe title no longer names Batch 30.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.ts (+ `.spec.ts`): passes `manifestSteer: this.capabilities().messaging.steer` into `runner.run`. The spec asserts it is passed and is `unsupported`.
- W/libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts: passes `manifestSteer: potentialCapabilities.messaging.steer` next to `imageInput`.
- W/libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-spawn-model.spec.ts: a spy on `ClaudeSdkLaneRunner.prototype.run` asserts that `manifestSteer` is passed and is `unsupported`.
- Neither manifest changes. `messaging.steer` stays `unsupported` in both, so steer stays dormant until Batch 6 and live test L4.

## Checks
- Focused jest, run through the scratchpad config that maps `marked`:
  - `claude-sdk-lane-runner.spec.ts`: 101 tests, all passing.
  - `claude-cli.adapter.spec.ts` + `ptah-cli-registry-spawn-model.spec.ts`: 85 tests, all passing.
- `npx eslint` on the changed files: 0 errors. The warnings are old: `no-non-null-assertion` on old spec lines, and `max-lines` in `ptah-cli-registry.ts`.
- `check-degradation.ts`: TOTAL 0 unsuppressed sites. The new catch rethrows.
- No `tsc` run, as the brief says for Batch 5. ts-jest type-checks the specs it compiles.

## Regression value
Tested by reasoning, not by reverting the code:
- the no-uuids case and the queued-before case would hang on the old code, because the placeholder takes the next real turn's frame;
- the failed-push cases would emit the missed-steer info on the old code.

## Open
- Batch 6 (the manifest flip) is still gated on L4. Assumption A4 (Ctrl+Enter defaults to "Interrupt & send") is checked there.
