Verdict: APPROVED
Review family: claude (implementer: codex)

Scope: `git diff -- libs/shared libs/backend` (local-command formatter, parser, renderer, writer; session-replay.service.ts; system-message.transformer.ts) read in full against the six findings in code-logic-review-codex.md. Static review only; specs not re-run.

## Finding-by-finding confirmation

1. Replay promotes hidden records: FIXED. session-replay.service.ts:274-290 rejects `isHiddenTranscriptRecord`, `sourceToolUseID`, and `isSkillOrMetaText(stdout)` (covers `<command-name>` inside stdout) before promotion, for both the user and system shapes. Tool-sourced check is now shared (`isToolSourced`, :184).
2. 50-child overflow: FIXED. format-local-command-output.ts:25-31 compiles the finished body with `compilePtahUiBlock` before fencing and falls back to raw text. usage-output.render.ts:75-100 caps the grid at 4 cards and moves the rest into a table.
3. Content-only detection: FIXED for replay, partly for live. Replay requires an immediately preceding `/usage` or `/context` echo (`localCommandName`, :189-200) and passes the command into the formatter, which skips the other parser (renderBody). Unpaired or mismatched stdout stays hidden. Live still has no command identity (see 2 below).
4. Live/replay id parity: FIXED. system-message.transformer.ts:177 and replay :309 both use `cmd_${uuid ?? generated}`. The shared lib stays host-neutral (the new import is a sibling contracts module with no host dependencies).
5. Timestamp ordering: FIXED for the cases listed. A card without a timestamp is placed after the latest emitted event plus 0.001 (:312-330). The all-untimed baseline is 0, so repeated replays are deterministic.
6. Exponent notation: FIXED. ptah-ui-writer.ts `formatPtahUiNumber` throws a RangeError at or above 1e21, and the formatter's try/catch returns raw text.

## New findings

1. Moderate — Pairing depends on an echo record that is only assumed to exist. session-replay.service.ts:285 pairs only with `effectiveMessages[msgIndex - 1]`. If a `system/local_command` stdout record is persisted without a preceding `<command-name>` echo, replay shows no card, while live does. That is a regression from the earlier replay behaviour, and the fix report asserts the ordering without citing a real transcript. The same applies when any record sits between the echo and the stdout. Recommend verifying against a real transcript, or letting the system shape fall back to the content signature (the `system/local_command` record is not a user echo and so carries less ambiguity).
2. Minor — Live path has no command identity (format-local-command-output.ts:renderBody with `command` undefined). Stdout containing a `Current week: N% used` line, or a context-shaped report, from an unrelated command is still converted live. The signature is now tight (the literal "Current week", or a window header with both counts), so the residual risk is low.
3. Minor — A card with its own finite timestamp (session-replay.service.ts:~312) skips the `afterEvents` guard. If it equals a preceding assistant's offset-extended timestamp, ordering can tie. This is unlikely with real ms timestamps.
4. Minor — `msg.uuid ?? generateId()` at :309 yields id `cmd_` for an empty-string uuid, and `||` would be safer. The live side uses the same `??`, so parity holds.
5. Minor — `precedingTimestamp` now replaces `Date.now()` for every untimed user and assistant record (:395, :461, :524). The result is deterministic but is a behavioural change outside the card scope. It is arguably an improvement. Confirm that nothing relies on a wall-clock fallback.

## Checks requested

- Hidden records stay hidden on replay: yes (:274-290).
- Interleaved pairing: only the immediately preceding record counts, so an interleaved record causes a miss and the card is dropped. It never pairs wrongly.
- `/usage` echo followed by unrelated stdout: the content parser rejects it, so it is hidden as before.
- compilePtahUiBlock failure: falls back to raw text, as intended.
- Host neutrality: preserved.
