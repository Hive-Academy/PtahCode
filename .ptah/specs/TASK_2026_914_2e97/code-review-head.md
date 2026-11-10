# Code review

Reviewer family: ollama-cloud (Glm)
Implementer family: codex

Reviewed code head: 0eb425a0e (final code commit). Later commits on the
branch change only `.ptah/specs` files.

The full review below examined the working tree before three corrections for
its MINOR findings. The delta review in `./code-review-delta.md` examined those
corrections at head 0eb425a0e. Its verdict is APPROVED, with one accepted MINOR
finding (no dirty parked-tab test in `chat-state`).

## Verdict

APPROVED

No BLOCKER and no MAJOR finding. Three MINOR findings remain. I traced all six
required behaviors through the host, the closer, the renderer and the tab
manager, not only through the tests. The code keeps every required behavior.
The findings are a stale tool description, a missing host log line and missing
negative tests for the bypass guards.

## Findings

1. **MINOR — the MCP tool description does not cover `refused`.**
   `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-handoff-ack.tool.ts:13`
   says only: "Retry when the result is retryable-failure."
   This change makes `refused` the normal result for close causes that need
   user action. The description gives no rule for it. A successor that reads
   only the tool description gets no "do not retry" instruction and must rely
   on the reason text alone. Both skill texts cover the rule, but a plain MCP
   client without the skill does not see them.
   Correction: add one sentence, for example "Do not retry a `refused` result;
   report its reason to the user." Update the pinned description length in
   `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-contract.sweep.spec.ts:2548`
   together with it.

2. **MINOR — the host log still cannot answer why a close was blocked.**
   `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts:46-53`:
   `complete()` records the outcome and the blocker code but logs nothing.
   `finish()` logs only the stale-request warn
   (`session-handoff-closer.ts:58`). The investigation records that the host
   log held no blocker line during the incident
   (`.ptah/specs/handoff-ack-tab-close/investigation.md`, "Open points").
   After this fix the cause reaches the successor through the ack result, so
   the diagnosis gap is closed at the tool level. But if the same incident
   recurs, the host log stays silent again, because the renderer info line
   does not reach it.
   Correction: log the finished kind and the blocker code at debug or info
   level in `finish()`.

3. **MINOR — no test pins the user-state guards while the bypass is active.**
   `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.spec.ts:148-165`:
   the blocker table runs with `predecessorStopped` unset, so it is false.
   Only the positive case `auto-handoff-source-closer.service.spec.ts:166-171`
   uses `predecessorStopped: true`. No test proves that a stopped predecessor
   with unsent input, a queued message, an open permission prompt, or a live
   `streaming` status still blocks. Requirement 3 (real user state is never
   discarded) rests on the check order in `closeBlocker`
   (`auto-handoff-source-closer.service.ts:74-80`). A later edit that extends
   the bypass to `isDirty` would discard user input with no failing test.
   Correction: add stopped=true rows for unsent input, queued message,
   permission prompt and streaming to the table, and one dirty parked-tab case
   to `libs/frontend/chat-state/src/lib/tab-manager.cross-workspace.spec.ts`.

## Checked and correct

Scope: the working-tree diff against `main` (without `jest.preset.js`), the new
file `session-handoff-close-result.ts`, and the callers of both. I read whole
files, not only the changed lines.

- Requirement 5, bypass after a confirmed stop only.
  `acknowledgeRecord` reaches `closer.close` only through
  `this.stopped.has(record.predecessorTabId)`
  (`session-handoff.service.ts:265`) or after `withDeadline(stop, 30_000)`
  resolves `true` (`session-handoff.service.ts:271-273`). The service writes
  `this.stopped` at one place only: `session-handoff.service.ts:777`, after
  `lifecycle.endSession` returns success. Every stop failure, stop timeout or
  missing flush returns before the close. Only the Electron host registers
  `HANDOFF_PREDECESSOR_CLOSER`
  (`apps/ptah-electron/src/di/phase-4-handlers.ts:110`); a host without the
  closer refuses at `session-handoff.service.ts:257`. So the unconditional
  `predecessorStopped: true` in the closer
  (`session-handoff-closer.ts:34`) is justified.
- Requirement 6, multi-window. An `absent` reply only sets a flag and never
  resolves the promise (`session-handoff-closer.ts:48-51`). The deadline then
  picks `absent` when every window reported absent, and `timeout` when no
  window answered (`session-handoff-closer.ts:26`). A `blocked` or `closed`
  reply from the owning window finishes at once, also after an earlier
  `absent` (spec covers the absent-then-closed order). A non-owning window
  cannot send `blocked`, because its lookup finds no tab and it answers
  `absent`.
- Closer races. Duplicate or late replies find no pending entry, so
  `finish()` logs the stale warn and returns false. The timer is cleared
  inside the finish callback before the resolve. The timer cannot fire before
  `pending.set`, because the promise executor runs synchronously. The sync and
  the async broadcast failure both finish with `broadcast-failed` and a
  cleared timer (`session-handoff-closer.ts:32-42`).
- Requirement 3, a truthful `closed` and kept user state. The renderer sends
  `closed` only after `closeBackgroundTab` removed the tab
  (`tab-cross-partition-close.ts:57-68`) or after the active-workspace branch
  re-verified removal (`tab-manager.service.ts:1646-1648`). `streaming`,
  `resuming` and `switching` always block, also with `predecessorStopped`
  (`auto-handoff-source-closer.service.ts:74`). Unsent input, queued messages,
  open permission prompts and Command Center origin always block
  (`auto-handoff-source-closer.service.ts:76-80`). `closeBackgroundTab` keeps
  its own `isDirty` guard behind the bypass (`tab-cross-partition-close.ts:51`).
  `closeTab(tabId, true)` has no await before the removal, so no user event
  can interleave between the blocker check and the removal.
- Bypass scope. The bypass covers only `awaiting-background`, `sleeping` and
  stale `pendingBackgroundTasks`. Both status stamps die with the SDK session
  that `endSession` ended, because the turn-state events that would clear them
  come from that session. The adopted children were re-parented to the
  successor, so the close discards no live work.
- Requirement 4, old renderers. `blockerCode` is optional in the RPC schema
  (`session-rpc.handlers.ts:481`) and in `closeRequestSchema`
  (`auto-handoff-source-closer.service.ts:10-15`). `predecessorStopped` is
  optional in the payload (`session-handoff.ts:30-35`). A code-less `blocked`
  maps to `unknown` and returns a `refused` with an actionable reason. For an
  old renderer this ends the endless retryable loop, so it is strictly better
  than the old behavior.
- Mapping table. The `reasons` Record is keyed on the blocked variant's code
  union, so TypeScript forces all 16 entries: the 15 `HandoffCloseBlockerCode`
  values plus `unknown`. The switch over `kind` is exhaustive
  (`session-handoff-close-result.ts:24-32`). Class check: every terminal code
  (unsent input, queued message, permission prompt, command center, sdk
  mismatch, close rejected, invalid request, unknown) needs a user or host
  action, and every retryable code (streaming, resuming, switching,
  background, sleeping, other status, pending background tasks, close error,
  timeout, broadcast failed) settles by itself. `absent` is `refused` because
  a retry returns absent again; the reason names the exact situation.
  `close-rejected` occurs only on an internal close inconsistency, because
  the blocker check and the close run in one synchronous block; the "inspect
  and close manually" reason is the right instruction for it.
- No useful log line was removed. The renderer info line for a blocked tab
  remains and now prints the code
  (`auto-handoff-source-closer.service.ts:55`). The close-failure warn remains
  (`auto-handoff-source-closer.service.ts:64`).
- Type safety in the changed files. No `any`, no `@ts-ignore`, no
  `as unknown as X`. Loggers are injected. Zod validates the RPC method and
  the broadcast payload. Imports use public aliases only. `HandoffCloseResult`
  is exported through the cli-agent-runtime barrel. The
  `as Pick<Logger, ...> as Logger` casts appear only in the closer spec and
  copy the existing idiom of that file.
- Consumers. `SessionHandoffCloser` is the only `HandoffPredecessorCloser`
  implementation. One renderer dispatch site exists for the broadcast
  (`chat-message-handler.service.ts:273-279`). No other code constructs the
  `SESSION_HANDOFF_CLOSE_PREDECESSOR` payload. `platform-cli` and `cli-engine`
  do not implement the port. The repo-local skill
  `.claude/skills/session-handoff/SKILL.md:79-83` already separates `refused`
  from `retryable-failure`, so it needs no change. The bundled plugin skill
  was updated and matches the new statuses.
- Existing verification. `investigation.md` records `npm run verify` exit 0
  for the five touched projects: lint and typecheck 10 of 10 tasks, 954 suites,
  21,243 tests passed. I did not re-run it, per the review scope.

## Test coverage

The new tests fail without the fix, for each changed behavior:

- `session-handoff-closer.spec.ts:56-63`: the old `complete()` ignored a
  blocked reply, so the promise never resolved and the test would time out.
- `session-handoff-ack.service.spec.ts:160-177`: the old service treated a
  truthy close value as success, so the expected statuses and reasons fail.
  The table also asserts that the generic text is gone.
- `auto-handoff-source-closer.service.spec.ts:60,80,86,92,145,164`: the old
  renderer sent no `blockerCode`, so each updated expectation fails.
- `tab-manager.cross-workspace.spec.ts:62-72`: the old
  `closeHandoffPredecessor` had no third parameter, so a parked sleeping tab
  stayed blocked and the `toBe(true)` assertion fails.
- The invalid-code test `session-rpc.handlers.spec.ts:537-540` passes under
  the old schema too, because `.strict()` rejected the unknown key. It pins
  the boundary, but it does not discriminate old from new code.

Missing regression coverage:

- No stopped=true negative tests. Unsent input, a queued message, an open
  permission prompt and a live streaming status must still block when
  `predecessorStopped` is true (finding 3).
- No dirty parked-tab case behind the bypass in
  `tab-manager.cross-workspace.spec.ts`, for the `isDirty` guard in
  `closeBackgroundTab`.
- Closer: no `absent` then `blocked` sequence, where the owning window answers
  after another window said absent. No duplicate reply after finish; only the
  unknown-requestId stale path is covered.
- Mapping: `blocked` without a code (`unknown`, the old-renderer path) and
  `broadcast-failed` are not in the ack spec result table. The `unknown` to
  `refused` mapping is untested anywhere.
