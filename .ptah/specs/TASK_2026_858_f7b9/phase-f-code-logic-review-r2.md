# Phase F code logic and security review — Round 2

Review family: codex (implementer: claude)

Score: 6/10  
Verdict: REVISE

## Scope and evidence

Read the round-1 report, task context, the two requested commit diffs, and the affected cursor, permission, reducer, transcript, markdown and view paths. The four changed projects (remote-machines, worker-host, worker-runtime, machines-ui) reportedly passed scoped lint, typecheck and tests before this review. I did not rerun `npm run verify`; passing checks do not cover the races and browser context-menu path below. `ptah_get_diagnostics` was requested for three changed files but returned unavailable: its TypeScript worker was terminated after another run timed out. No source was edited. No matching skill catalogue or skill-loading tool was available to this lane.

## Reassessment

1. **L1 — FIXED.** `machine-connection.ts:522-531` compares the returned epoch to the current cursor and takes `result.fromSeq` when it changed; `:219-229` accepts a frame from a different epoch. `remote-sessions.ts:383-391` tells the worker to replay the new log when the supplied epoch differs. The reconnect and explicit attach cases are exercised at `machine-connection.regressions.spec.ts:443-507`. The new-epoch sequence regression from round 1 is covered.
2. **L2 — FIXED.** `remote-sessions.ts:495-509` starts the deadline at capture through `pending.hold` and denies requests beyond the hold limit immediately. `pending-permissions.ts:143-149,212-219,231-240` installs and enforces the timer even without a session ID; `:160-177` binds or denies held requests. A start ending without a session calls `denyHeld` at `remote-sessions.ts:416-421`.
3. **L3 — PARTLY.** `transcript-events.ts:123-158` cleans nested event strings on baseline and chunk ingestion through `session-event-reducer.ts:323-332,383-389`; permission fields pass through `displayBlockText`/`displayBlockValue` at `:411-445`. `remote-transcript.ts:87-100,107-131` handles text, thinking and markdown-file content, and `remote-transcript.component.ts:179-193` intercepts click and auxclick. The rendered anchors still retain real `href` destinations, so the browser's context-menu “open link” action bypasses those handlers; see new defect 2.
4. **L4 — PARTLY.** For an already tracked session, `machine-connection.ts:478-481` keeps a cursor marked as observed when an explicit attach rejects; `:225-229` marks cursors advanced by events. But the `!previous` branch deletes the cursor unconditionally, even if an event advanced it while that first attach was in flight; see new defect 1.

## New defects

1. **Moderate — First attach failure discards a concurrently observed cursor.** `libs/backend/remote-machines/src/lib/machine-connection.ts:463-480`. On an initial explicit attach, `previous` is absent. A frame arriving before the RPC rejects advances the tracked cursor via `:225-229`, but the catch always deletes it at `:479`. The frame was delivered yet the next reconnect no longer reattaches that session, leaving subsequent events unseen. **Fix:** delete only if the map still contains this attach attempt; preserve an observed replacement. Add a failing-first-attach test with an event before rejection.
2. **Serious — Remote links can be followed through the browser context menu.** `libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-transcript.component.ts:179-193`. The component prevents `click` and `auxclick` at `:59-60`, but rendered anchors keep their real `href`. “Open link in new tab” from the context menu navigates directly without invoking either handler, so a worker-controlled link can open despite the S6 inert-link contract. `remote-session-view.component.ts:546-554` only handles emitted activations. **Fix:** render remote URL links without navigable `href` (or replace destinations with a safe inert value while retaining the original in data for the notice), including links in tool content. Verify mouse, keyboard and context-menu behavior in Electron.

## Five logic questions

1. **Silent failure:** An initial attach can deliver a frame and then lose tracking when the RPC fails (`machine-connection.ts:463-480`); no later event is requested.
2. **Unexpected user action:** A context-menu open follows a remote URL despite ordinary clicks being intercepted (`remote-transcript.component.ts:59-60,179-193`).
3. **Wrong-answer input:** A first attach that fails after delivering a frame leaves no cursor to resume from (`machine-connection.ts:463-480`).
4. **Dependency failure or timeout:** A stalled start now denies held permissions at the timer (`pending-permissions.ts:143-149,212-240`), but a rejected first attach can erase a live cursor (`machine-connection.ts:473-480`).
5. **Unstated requirement:** Inert remote links must include browser navigation paths outside component click events (`remote-transcript.component.ts:179-193`); browser context menus are currently uncovered.

## Decisions

- **Decision:** Mark L1 and L2 fixed. **Options:** fixed or partly fixed. **Evidence:** epoch-aware cursor and timed held-request paths cited above cover the round-1 triggers; the old-sequence/new-epoch path is now covered. **Reversible:** yes.
- **Decision:** Mark L3 and L4 partly fixed and require revision. **Options:** approve with residual risk or revise. **Evidence:** context-menu navigation violates the remote-link rule, while failed first attach still loses event tracking. **Reversible:** yes.
- **Decision:** Score 6/10. **Options:** 5–6 (real gaps) or 7–8 (sound). **Evidence:** the two original serious backend failures are addressed, putting this above the prior 5/10 assessment; a serious security route and the remaining first-attach race prevent the 7–8 band. **Reversible:** yes.

## Verdict

REVISE. Address the two numbered defects and add targeted regression coverage before another approval decision. Confidence: medium-high from source tracing; no Electron context-menu check or new scoped test run was performed here.
