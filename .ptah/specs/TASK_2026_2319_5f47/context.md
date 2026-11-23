# TASK_2026_2319_5f47 — Watchdog race with the SDK first-byte wait, P2 follow-ups (e), (f)

Program: TASK_2026_2297_920a ("Pause, never kill"). Branch `fix/coop-handoff-watchdog-followups`.

## 1. Watchdog stop of child session f7ea7de9 (2026-11-23)

Evidence: `~/.config/Ptah/logs/Ptah Electron-2026-11-23.log` and the SDK transcript
`9efff483-551a-4bf1-bcc6-e9d0de7dfb95.jsonl`.

| Time (UTC) | Event |
| --- | --- |
| 11:44:28.8 | Last tool result (a Jest run). The guard quiet window starts (180 s). |
| 11:44:29.3 | The SDK sends the next provider request. No frame follows. |
| 11:47:28.9 | The Ptah guard fires and ends the child (`no-activity-timeout`). |
| 11:47:30.6 | The SDK reports its own first-byte timeout: `waited_ms 181000`, `retry_wait_ms 599000`. |
| 11:48:01.8 | Grace expires. The spawner releases the slot. |

Why P2 did not stop it:

1. The running app (`/opt/Ptah/resources/app.asar`, built 2026-11-20 16:43) is older than
   `7b196a56f` (2026-11-20 19:32, Ptah sets the SDK first-byte wait to 150 s) and older than P2
   (#1472, 2026-11-22). The log text "recovering unaccounted silence" is not in current source.
2. On current main the same race stays in two paths. The activity that is not counted is the SDK's
   own pending first-byte wait. The guard sees it only when the `api_retry` frame arrives, at the end
   of the SDK wait:
   - A user value of `CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS` of 180 s or more wins over the 150 s default.
   - A named run's certified env drops the key, so the SDK default (about 181 s) applies.

Fix: the executor sizes the guard window from the first-byte wait that the SDK will use:
`noActivityWindowMs(firstByte) = max(180 s, min(900 s, firstByte + 30 s))`. The SDK retry frame then
always arrives first and the existing `api_retry` accounting extends the window. A real hang after
the SDK retry still ends with the Ptah-labeled reason, which now reports the real window.

Regression spec: `no-activity-watchdog.spec.ts`, describe "guard window versus the SDK first-byte wait
(incident 2026-11-23, child f7ea7de9)". The 180 s guard fires before the 181 s SDK retry; the sized
window lets the SDK retry run. `build-safe-env.spec.ts` covers `sdkFirstByteTimeoutMs`.

## 2. Follow-up (e) and the child-side report

See the follow-up table below. The cli-agent-runtime part is in this same PR.

## 3. Follow-up (f): P2 minor findings

### review-P2-A.md (agent-sdk, rpc-handlers): all already fixed on main, no change

| Finding | Evidence on main |
| --- | --- |
| MINOR-1 | `observe()` returns first when `terminalError` is set; `noteOutwardEvent()` checks it too (`no-activity-watchdog.ts`). |
| MINOR-2 | `onTimer` only calls `onTimeout`; the owner records the failure through `registry.recordProviderTurnEnd`. |
| MINOR-3 | `session-control.service.ts` holds the watchdog during a `user-stop` interrupt wait (spec "holds the watchdog while waiting for an explicit user interrupt"). |
| MINOR-4 | `MAX_ENDED_STOP_CONTEXTS = 256` caps `endedStopContexts` (`session-registry.service.ts`). |
| MINOR-5 | `compact_boundary`, `status` compacting / `compact_result` and `PreCompact` / `PostCompact` set `sawWork`. |
| MINOR-6 | `background_tasks_changed` skips a finished task with no `run_id`. |
| MINOR-7 | The broadcaster comment now says the branch only covers adapters with no token. |

### review-P2-B.md (cli-agent-runtime)

| Finding | Result | Evidence or reason |
| --- | --- | --- |
| M1-M4 | Already fixed | Paused-child send resumes; probe fails a dead first turn; grace re-arms during replay; notice only while paused. Specs exist on main. |
| m1 | Skip, already fixed | `resumeChild` calls `armRuntimeCap`. |
| m2 | Skip, already fixed | `onHandoffGraceExpired` re-arms while `runtime.succeeding`. |
| m3 | Skip, already fixed | `sendParentNotice` logs each drop reason. |
| m4 | Partly fixed | An end with no `startedAt` during `replaying` is now ignored (new spec). Phase `used` is unchanged: both watchdog end producers set `startedAt`, and a skip there would hide a real retry failure. |
| m5 | Skip, already fixed | `replay` logs each non-failure outcome. |
| m6 | Skip, no longer valid | The cap `busy` refusal is gone; a send resumes the child. |
| m7 | Skip, already fixed | `IChildChatSessionHost.wasStoppedSince?` replaces the `Symbol.for` lookup. |
| m8 | Fixed | Follow-up (e). Specs in `session-spawner.succession.spec.ts` ("cap-reached predecessor retirement") and `session-handoff.service.spec.ts`. |
| m9 | Fixed (rest) | `runtime-cap` pause: `measured` is the time since the cap was armed (`capArmedAt`), `limit` is the cap. |
| m10 | Skip, covered | Specs for M2-M4, m1, m2 exist on main. |

### Child-side report after a watchdog end (incident f7ea7de9)

`onSessionEnd` counted the child as working only in phase `generating`. After a watchdog end the phase
can already be `failed`, and `onTurnFailed` skips a `ProviderTurnEndError`, so the parent got nothing.
Now a `provider-no-response` / `no-activity-timeout` end with `turnsSettled > 0` counts as working: the
parent gets one failed completion with the Ptah provider-hang reason and the kept worktree. First
turns stay with the watchdog recovery.

Not changed (out of scope): the 60 s retire timer after a normal (not paused) child handoff.

## Independent review (code-logic-review.md): resolution

| Finding | Action |
| --- | --- |
| Hard-coded `formatProviderHang(180)` is wrong for a larger window | Fixed: child texts use `formatProviderHang(undefined)` (no number). The SDK error text keeps the real window. |
| The 900 s clamp lets the race return above 870 s | Fixed: no upper clamp in `noActivityWindowMs`. |
| 181 s SDK default rests on one incident | Kept: it is the only measured value, and it errs on the long side. A wrong value only delays the guard. |
| `turnRuns` ignores a queued follow-up | Fixed: a queued follow-up counts as a coming turn. New spec "waits for the turn of a queued follow-up". |
| `retirePredecessor` early return keeps the `retiring` entry | Fixed: the entry is removed first. |
| Idle predecessor with open background tasks retires at once | No change: allowed by the `parent-stop` ack decision; the predecessor already handed off. |
