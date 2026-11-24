# Batch 25 report: B6a Claude steer fold-in, dormant

## Changes

- MODIFIED `claude/claude-sdk-lane-runner.ts`:
  - `ClaudeSdkLaneRunContext.manifestSteer?: LaneCapabilitySupport` (the lane manifest's
    `messaging.steer`). `steer` and `supportsSteer` are put on the handle only when it is
    `supported`. Neither the Claude adapter nor the Ptah CLI registry passes it yet, so steer is
    dormant; Batch 30 passes its manifest value together with the flip.
  - `supportsSteer()`: true only while a main-thread tool call is in flight and a turn runs.
  - `steer(message, content?)`: refuses outside a tool boundary ("Claude takes a message
    mid-turn only while one of its tools runs."); builds the content like `continue`; pushes a
    `randomUUID()`-tagged turn into the mailbox (or the named gate) without enqueuing a turn;
    logs counts only.
  - On each result frame, steer uuids pushed since the last result are compared with
    `user_message_uuids`. A miss emits the info segment "A message may start the next turn." and
    queues one resolver for the turn the CLI runs for it, so the next real turn's `done` is not
    settled by that turn's result.
- MODIFIED `ptah-cli/helpers/ptah-cli-stream-loop.service.ts`: new `onToolInFlightChange(inFlight)`
  config. Main-thread `tool_use` ids (stream `content_block_start` and assistant blocks) are
  tracked until their `tool_result`; the result frame and the end of the stream clear them.
  Subagent tool calls (`parent_tool_use_id` set) are ignored.
- Specs: runner +5 (dormant manifest keeps effective steer unsupported while a tool runs; steer
  offered only while a tool is in flight, checked through `resolveEffectiveLaneCapabilities`;
  push with uuid and no new turn, result listing both uuids; missed uuid -> info segment and the
  next turn stays aligned; refusal without a tool in flight). Stream loop +2 (in-flight signal;
  subagent tools ignored, result clears).

## Verification

- Focused jest: runner, stream loop and claude-cli adapter specs: 3 suites, 214 passed.
- `npx eslint` on the 4 files: 0 errors; `max-lines` warnings on the runner and the stream loop
  (both already over 700 counted lines after Batches 23-24).

## Decisions

- Steer exposure is gated by the manifest value passed in the run context instead of a constant
  in the runner, so the manifest stays the one source (steer-exposure risk HIGH). Reversible.
- A missed steer is assumed to run as one extra turn (queued sends may coalesce). L4 should check
  `queued_turn_count` / `user_message_uuids` on the following result.

## Open items for Batch 30

- Pass `manifestSteer: <manifest>.messaging.steer` from `claude-cli.adapter.ts` and
  `ptah-cli-registry.ts` into the runner context when steer flips to supported.
