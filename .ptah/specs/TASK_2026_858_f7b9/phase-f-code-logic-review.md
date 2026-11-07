# Phase F code logic and security review

Score: 5/10
Verdict: REVISE
Review family: codex (implementer: claude)

## Findings

1. **Serious — A new log epoch can lose its first events.** `libs/backend/remote-machines/src/lib/machine-connection.ts:469-473` stores `Math.max(afterSeq, current?.seq)` even when `result.epoch` differs from the previous epoch. If the old log ended at sequence 100 and the new log starts at 1, a reconnect attaches with `afterSeq=100`, receives the new epoch, then rejects its events 1–100 at `:219-226`. The renderer cannot recover data it never receives. **Fix:** compare epochs before choosing a cursor; set the cursor to the new attach's `fromSeq - 1` (or zero) on epoch change, and retain the old cursor only for the same epoch. Test a reconnect across an epoch reset with an old sequence greater than the new head.

2. **Serious — An unresolved session ID bypasses the 60-second deny.** `libs/backend/worker-host/src/lib/commands/remote-sessions.ts:485-501` puts permission requests in `heldPermissions` when a start is still awaiting `session:id-resolved`; `pending.add`, which installs the timer, runs only at `:513-517`. A session start that stalls before ID resolution leaves the SDK permission unanswered indefinitely. `pending-permissions.ts:124-132` cannot enforce the deadline for requests it never receives. **Fix:** start a deadline for held requests immediately, keyed by tab/request ID, deny on expiry, and cancel it when the request is bound or automatically resolved. Cover a start that never emits `session:id-resolved`.

3. **Serious — Remote transcript strings bypass the required S6 display boundary.** `libs/frontend/machines-ui/src/lib/services/session-event-reducer.ts:320-329` and `:380-385` retain worker event content; `libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-transcript.component.ts:91-109` sends text and tool nodes directly to markdown/chat-ui renderers. `displayText`/`displayBlockText` never process these strings. The markdown renderer sanitizes HTML, but S6 also requires removal of bidi/control characters and interpolation-only display; a worker can still present deceptive text or links through these components. **Fix:** normalize every worker-originated transcript string at a single typed ingestion boundary, and render remote content through components whose output satisfies S6. Keep the remote `FILE_LINK_OPENER` override; its `remote-session-view.component.ts:608-614` correctly refuses local path opening. Add malicious bidi, HTML, markdown-link and tool-output cases.

4. **Moderate — A failed explicit attach can roll back a newer event cursor.** `libs/backend/remote-machines/src/lib/machine-connection.ts:460-480` snapshots `previous`, changes the tracked cursor to `afterSeq`, awaits the RPC, then restores `previous` on failure. Events can arrive during that await and advance `sessions` through `:216-226`; the catch overwrites those advances. The next reconnect replays from a stale cursor, and the application can show a false gap or duplicate work. **Fix:** on failure restore only if the current entry still belongs to this attach attempt, or merge the same-epoch cursor with any events observed while it was in flight. Test an event arriving between the attach call and its rejection.

## Five logic questions

1. **Silent failure:** the new-epoch cursor drops replayed events at `machine-connection.ts:219-226`; the connection remains connected.
2. **Unexpected user action:** Refresh during live delivery can fail and restore an older cursor at `machine-connection.ts:475-480`.
3. **Wrong-answer input:** a valid new epoch with a lower sequence than the prior epoch is treated as already seen at `machine-connection.ts:469-473`.
4. **Dependency failure or timeout:** an SDK start that never resolves a session ID leaves a held permission without a timer at `remote-sessions.ts:496-501`.
5. **Unstated requirement:** S6's text normalization needs a defined boundary for nested transcript event payloads, not only machine labels and approval arguments (`remote-transcript.component.ts:91-109`).

## Decisions

- **Decision:** Treat `heldPermissions` as remote permission requests from their first capture. **Options:** start the 60-second clock at capture, or wait for session ID resolution. **Evidence:** user decision 27 says every unanswered remote request is denied after 60 seconds; `remote-sessions.ts:496-517` waits to install the timer. **Reversible:** yes.
- **Decision:** Score 5/10 and require revision. **Options:** approve with risks, or revise. **Evidence:** the first two findings break event completeness and permission safety; the S6 gap is security relevant. The working route guard, watch-only refusal in `machines-store.ts:568-579`, countdown cleanup in `remote-approval-block.component.ts:309-346`, and remote file opener keep this above the 3–4 band. Three serious defects keep it below the 7–8 band. **Reversible:** yes.

## Scope and verification

Reviewed the Phase F code paths in `git diff main..HEAD`, the worker permission lifecycle, machine attach/cursor tracking, reducer and transcript path, approval block, Machines store, Electron route and services entry, plus task context, decisions and relevant design clauses. The Machines route is guarded at `app.routes.ts:190-203`; `services.ts:17-28` exports services only. `ptah_get_diagnostics` was requested for four changed files but reported TypeScript checking still running after 45 seconds, so it supplied no result. No builds or tests were run; the findings are source-traced failure paths.
