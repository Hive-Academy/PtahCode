# Context

## Defect

In the Electron app, a message sent while a session runs a turn failed with
`A queued message was not sent (the session changed). It is back in the composer.`
The same message sent after the turn ended was accepted.

## Evidence

`Ptah Electron-2026-11-11.log`:

- `RPC: chat:continue returned user error (SESSION_NOT_FOUND): This conversation is not open
  in this tab.` for session `714dc536` at 16:48:19 and 16:59:13.
- The session was live under tab `6f05ce46` from 11:09.
- The UI called `chat:resume` for that session each time the user changed to it.
- About 26 `chat:queued-list` calls were refused with the same message that day.

## Root cause

`SessionLoaderService.switchSession` calls `tabManager.openSessionTab`. That function makes a
new tab ID when no tab of the active workspace has the session. `chat:resume` without
`activate` loads history only. It does not rebind the live registration. Thus the backend
registration keeps the first tab ID, and `ChatFollowUpQueueService.assertTabOwnsSession`
refuses the queued follow-up of the new tab. An idle send does not use that check.

## Fix

- A user-started `chat:resume` sends `adoptFollowUps: true`.
- `ChatFollowUpQueueService.adoptTab` moves follow-up ownership to that tab.
- The adoption stays for the life of the current live registration.
- Codex sessions (`codexOwner`) are not changed.

## Not proven

The log does not show why the first tab was not used again (closed tab or a different
workspace partition).
