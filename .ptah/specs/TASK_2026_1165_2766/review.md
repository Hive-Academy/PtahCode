# Review: TASK_2026_1165 — child session false `user-stop`

Reviewer: independent read-only review of the uncommitted diff on
`fix/child-session-false-user-stop`. No tests were run (the coordinator runs
`npm run verify`). Findings below come from static reading.

## Verdict

**Changes needed.**

The design is correct: a source on `chat:abort`, one mapping function, new
`tab-close` and `internal-abort` causes, and the updated outcome words. But
at least 6 unchanged spec files assert the old exact `chat:abort` params or
the old `user-stop` cause. They will fail. Also, the command-center Stop is a
real user Stop, but the fix records it as `internal-abort`.

Note: `implementation-notes.md` says `npm run verify` failed with EPERM before
any lint, typecheck or test ran. So no check of this diff has passed yet.

---

## Findings

### B1 (blocker) — unchanged specs still expect the old `chat:abort` params

These specs use exact equality on the params. The callers now add `source`,
so each assertion fails.

| Spec | Line | Old expectation | New value |
|---|---|---|---|
| `libs/frontend/chat/src/lib/services/provider-carry-over.service.spec.ts` | 442, 864, 884, 936, 962, 985, 1017, 1048 | `[{ sessionId: NEW }]` | `source: 'carry-over'` |
| `libs/frontend/chat/src/lib/services/provider-carry-over.relink.integration.spec.ts` | 506, 589 | `{ sessionId: NEW }` / `{ sessionId: STRAY }` | `source: 'carry-over'` |
| `libs/frontend/chat/src/lib/services/message-sender.service.spec.ts` | 1325, 1335 | `{ sessionId: tabId }`, `{ sessionId: 'sess-X' }` | `source: 'tab-close'` |
| `libs/backend/worker-runtime/src/lib/session-driver.spec.ts` | 200, 232 | `params: { sessionId: 's1' }` (nested exact match inside `objectContaining`) | `source: 'worker'` |
| `libs/frontend/mcp-apps-page/src/lib/services/apps-session.service.spec.ts` | 784 | `toEqual({ sessionId: 'session-1' })` | `source: 'apps-stop'` or `'apps-reset'` |

Fix: add the expected `source` to each assertion. This also gives the missing
per-caller coverage (see M2).

### B2 (blocker) — Ptah CLI abort spec still expects `user-stop`

`libs/backend/rpc-handlers/src/lib/chat/ptah-cli/chat-ptah-cli.service.spec.ts:505-509`
calls `handleAbort({ sessionId })` with no source and expects
`endSession(SESSION_UUID, 'user-stop')`. The new code
(`chat-ptah-cli.service.ts:297-300`) sends `internal-abort` for a missing
source. The spec fails.

Fix: pass `source: 'stop-button'` in this test, and add one case with no source
that expects `internal-abort`.

### M1 (major) — the command-center Stop is a user Stop, but it records `internal-abort`

- `libs/frontend/command-center/src/lib/components/command-center-page.component.html:177`
  binds the `(stop)` button to `page.stopVoice()`.
- `command-center-page.controller.ts:366-372` → `voice.stop()` →
  `command-voice-loop.ts:676-678` → `coordinator.stop()` →
  `session-coordinator.ts:298` sends `chat:abort` with `source: 'command-center'`.
- `coordinator.stop()` has no other caller. So every `command-center` abort
  comes from a user click.
- `abort-end-cause.ts` maps `command-center` to `internal-abort`. The child
  outcome text then says "this was not a user stop"
  (`session-child-outcome.ts:42-43`). That is false. It also moves a child that
  delivered its turn from `completed` to `interrupted` (`kindOf`, line 104-108).

Fix (choose one):
1. Map `command-center` to `user-stop` in `endCauseForAbortSource` and update
   `abort-end-cause.spec.ts:11`.
2. Or rename the source to show intent (for example `command-center-stop`) and
   map it to `user-stop`.

`abort-callers.md:7` marked this caller as "Maybe". The trace above settles it.

### M2 (major) — no spec for several new source values at the caller

The specs that fail in B1 are also the only place to prove each caller sends
the correct source. After the B1 fix, confirm or add:

- `message-sender.service.spec.ts`: one test for `tab-reset`. Abort the
  controller with `ABORT_REASON_TAB_RESET` and expect `source: 'tab-reset'`.
  No current test covers the new branch at `message-sender.service.ts:451-455`.
- `tab-manager.service` spec: `resetTabToFresh` aborts with
  `ABORT_REASON_TAB_RESET` (`tab-manager.service.ts:1692`), and `closeTab`
  aborts with no reason (line 1554).
- `electron-layout.service.spec.ts`: expects `source: 'workspace-remove'`
  (the current assertion at line 2171 reads only `sessionId`).
- `apps-session-rpc` / `apps-session.service.spec.ts`: one test each for
  `apps-stop` and `apps-reset`.

### m1 (minor) — Stop and stream error can race and write two causes

`interruptSession` → `SessionControl.endSession` → `endRecord` keeps the record
registered while it awaits `rec.query.interrupt()` (up to 5 s,
`session-control.service.ts:356-382`). If the stream throws an abort-like error
in that window, the broadcaster calls `endSessionIfTokenMatches(..., 'internal-abort')`
(`chat-stream-broadcaster.service.ts:366-371`). The token still matches, so a
second `endRecord` runs and `notifyAll` can send `internal-abort` before
`user-stop`. Before this fix both values were `user-stop`, so the race was
invisible. Now a real Stop can show as `internal-abort`.

The window is small: `abortController.abort()` and `registry.remove()` run in
the same tick inside `deregister`, and `interrupt()` normally does not throw.
Fix: in `endRecord`, mark the record as "ending" with its cause before the
first `await`, and make `endSessionIfTokenMatches` return `false` for a record
that is already ending. Or keep the first cause per session in
`SessionEndCallbackRegistry`. A follow-up task is acceptable.

### m2 (minor) — stale schema comment

`libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.schema.ts:262-267` says
"`ChatAbortParams` shape only carries `sessionId`". It now also carries
`source`. Fix: update the comment.

### m3 (minor) — large formatting-only churn

About 2/3 of the diff is Prettier reflow with no behavior change, for example
`chat-session.service.ts` (model catalog, follow-up queue blocks),
`session-child-succession.ts:24-110`, `conversation.service.spec.ts`,
`chat-stream-broadcaster.service.spec.ts`, `rpc-chat.types.ts`. This makes the
task diff hard to review. Fix: commit the formatting change separately
(`style:` commit), or revert the reflow in files that the fix does not touch.

### m4 (minor) — internal aborts also withdraw queued follow-ups

`chat-session.service.ts:2681-2693` runs `advanceStopGeneration` and
`withdrawAllForStop` for every source, including `carry-over`,
`command-center` and `worker`. This is old behavior and not in scope. Record
it as a follow-up if only a user Stop must return queued text to the composer.

---

## Answers to the review questions

1. **Callers without a source or with a wrong source.** All non-spec callers
   of `chat:abort` send a source: conversation (`stop-button`), closed tab
   ender (`tab-close`), message sender (`tab-reset` / `tab-close`), carry-over,
   command center, Electron layout (`workspace-remove`), apps (`apps-stop` /
   `apps-reset`), worker session driver (`worker`). The backend slash `/clear`
   path calls `interruptSession(..., 'user-stop')` directly
   (`chat-slash-command-router.service.ts:239,244`). That matches the new text
   "Stop button or /clear". The later renderer `tab-reset` abort normally finds
   no live record. Wrong source: `command-center` (M1). The message sender also
   labels `closeTabAcrossWorkspaces` and `closeHandoffPredecessor` aborts as
   `tab-close` (`tab-manager.service.ts:1639,1671`). That is acceptable,
   because the `tab-close` text says "by the user or by the app".
2. **Exhaustive maps over `SessionEndCause`.** The only exhaustive `Record` is
   `session-child-outcome.ts:38`, and it has both new values. The validation
   list in `session-end-callback-registry.ts:20-35` has both. `kindOf` and
   `routeSessionEndCause` handle both. No frontend UI text keys on
   `user-stop`. No other `switch` misses the values.
3. **`internal-abort` and succession.** The premise in the brief is not
   correct for this diff. `routeSessionEndCause`
   (`session-child-succession.ts:128-136`) returns `'stop'` for both
   `tab-close` and `internal-abort`. So no automatic successor starts for a
   tab-reset, carry-over or command-center abort. This keeps the old
   `user-stop` → `'stop'` behavior and is correct. The spec
   `session-child-succession.spec.ts:88-98` covers both values.
4. **Zod and type safety.** `z.enum(CHAT_ABORT_SOURCES).optional()` uses the
   shared `as const` tuple, so type and schema cannot drift. The schema spec
   rejects an unknown source. No new `any`. No new `console` in backend libs.
   The new `console.warn` lines in frontend are reflow of existing code.
5. **Spec coverage before and after.** `abort-end-cause.spec.ts`, the
   `chat-session-abort-resume-state.spec.ts` cases `tab-close` and
   `undefined`, the broadcaster `internal-abort` cases, the schema
   unknown-source case and the outcome text cases fail on the old code and
   pass on the new code. Good. But B1 and B2 make the suite red, and M2 lists
   the caller branches that have no spec.
