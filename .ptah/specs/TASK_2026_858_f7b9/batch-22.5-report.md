# Batch 22.5 report: worker-side permission expiry, safe `machines:state` reason

## Files changed

### Part B (done first): optional safe `reason` in `machines:state`

- `libs/shared/src/lib/types/rpc/rpc-machines.types.ts`: new `MACHINE_STATE_REASONS`
  tuple and `MachineStateReason` union (`'worker-identity-changed' | 're-pair-required' |
  'session-reattach-failed'`). `MachinesStatePayload` has a new field,
  `readonly reason?: MachineStateReason`. Both are exported through the `rpc.types.ts` barrel.
- `libs/shared/src/lib/types/rpc/rpc-machines.types.spec.ts`: new spec
  "carries only a closed, optional state reason" (it includes a `@ts-expect-error` check that rejects free-form text).
- `libs/backend/remote-machines/src/lib/machine-connection.ts`:
  - `MachineConnection.reason` was a free-form string. It is now `MachineStateReason`, and
    `emit()` pushes it with every `machines:state`.
  - `'re-pair-required'` is set in three places: a stored token with no worker ID (constructor
    and `connect()`), a token closed with 4401/4410 (`rejectToken`), and a `PAIRING_REJECTED`
    that is not an identity mismatch (`??=`).
  - `'worker-identity-changed'` is set when the hello check sees a different machine ID.
  - `'session-reattach-failed'` is set in two cases. In the first, the auto re-attach loop on
    reconnect has a session refused; the `connected` push then carries the reason. In the
    second, an explicit `attach()` of a session that is already tracked fails while the
    machine is connected.
  - The reason is cleared on `reconnecting`, `offline` (schedule), `version-mismatch`,
    `clearToken`, `setToken` and a clean `connected`.
  - **Cursor fix**: when an explicit `attach()` fails, it now restores the previous tracked
    cursor and no longer deletes it. Auto-reconnect therefore re-attaches from the last seen
    `seq`/`epoch`. A first attach that fails still tracks nothing.
- `machine-connection.spec.ts` and `machine-connection.integration.spec.ts`: the assertions
  now expect the enum values. They used to match English copy.
- `machine-connection.regressions.spec.ts`: L12 now asserts `'re-pair-required'`. New specs:
  - "pushes session-reattach-failed when an auto re-attach is refused, then clears it"
  - "keeps the tracked cursor when an explicit re-attach fails, so reconnect re-attaches"
  - "forgets a first attach that fails and pushes no reason"
  - "pushes worker-identity-changed when another worker answers on the alias"

### Part A: worker-side deny after 60 s

- `libs/backend/worker-runtime/src/lib/pending-permissions.ts`:
  - New exports: `REMOTE_PERMISSION_TIMEOUT_MS = 60_000`, `REMOTE_PERMISSION_TIMEOUT_REASON`
    ("No answer from the controller within 60 s"), `REMOTE_PERMISSION_TIMEOUT_BY`
    ("Worker timeout"), `remotePermissionDeadline()`, `withRemotePermissionDeadline()` and
    `PendingPermissionOptions` (`findWriter`, `onExpired`).
  - `PendingPermissionIndex.add` starts one unref'd timer per request. The deadline is
    `timestamp + 60 s`, or the engine's own `timeoutAt` when that is earlier. A missing
    timestamp counts from now.
  - On expiry the index does four things. It removes the entry. It calls
    `handler.handleResponse(id, { decision: 'deny', reason })`. It calls `onExpired`. It
    writes the normal `worker:permission.answered` record (`decision: 'deny'`,
    `by: 'Worker timeout'`) so watchers update.
  - Timers are cleared by `answer`, `remove` (auto-resolved), `clearSession` (session end),
    a re-`add` of the same request ID, and the new `dispose()`.
  - A late `permission.respond` gets the existing `PermissionAnswerError` /
    `ALREADY_ANSWERED`. It does not throw anything new.
- `libs/backend/worker-runtime/src/lib/event-capture.ts`: before `WorkerEventCapture` logs a
  `permission:request` payload, it rewrites `timeoutAt` to the worker deadline. The forwarded
  request therefore carries `createdAt + 60_000`, and the controller can show a countdown.
- `libs/backend/worker-host/src/lib/commands/remote-sessions.ts` (scope extension, see
  Decisions):
  - The index is built with `findWriter: deps.logs.findWriter` and
    `onExpired: permissionSessions.delete`.
  - `drain()` calls `pending.dispose()` first. The listener is already closed, so no answer
    can arrive, and no timer outlives the logs.
- Specs:
  - `pending-permissions.spec.ts`, describe "remote permission expiry":
    - "denies after 60 s, writes the answered record and refuses a late answer"
    - "counts from the request timestamp, not from when it was indexed"
    - "stops the timer on answer, auto-resolve, session end and dispose"
    - "re-adding a request replaces its timer"
    - "computes the forwarded deadline"
  - `event-capture.spec.ts`: "stamps the worker deadline on a captured permission request".
  - `remote-sessions.spec.ts`, describe "remote permission expiry (decision 27)":
    - "denies an unanswered request after 60 s, logs it and refuses a late answer"
    - "logs the forwarded request with the worker deadline as timeoutAt"
    - "stops expiry timers when the worker drains"

`libs/backend/agent-sdk` is unchanged. Local, non-worker sessions keep `timeoutAt: 0`.
Only a worker process constructs `PendingPermissionIndex` and `WorkerEventCapture`.

## Verification

- `npm run verify -- -p @ptah-extension/worker-runtime,@ptah-extension/remote-machines,@ptah-extension/shared,@ptah-extension/worker-host`:
  - lint and typecheck: "8 tasks: 8 succeeded" (0/8 cache hits)
  - test: "4 tasks: 4 succeeded"
  - the lock was released with exit code 0, and no "Failed tasks" line was printed
- `TMPDIR=/home/amun/.cache/ptah-phase-e-tmp npm run verify -- -t typecheck -p ptah-electron`:
  "1 task: 1 succeeded", exit code 0.
- No build, serve, e2e or package targets were run.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| **Scope extension**: edited `libs/backend/worker-host/src/lib/commands/remote-sessions.ts` and its spec, and added `@ptah-extension/worker-host` to verify. | (1) wire it in worker-host; (2) keep to worker-runtime with no answered record and no dispose | The index is constructed only in `remote-sessions.ts:247`. That file also holds the log writers and the shutdown `drain()`. The coordinator approved option 1. | yes |
| The reason set holds only the three causes `remote-machines` can detect. A token rejection (4401/4410) maps to `re-pair-required`, so no new value was added for it. | add `token-rejected`; reuse `re-pair-required` | The user's action is the same (pair again). The union stays closed and small for the renderer. | yes (additive) |
| `MachineConnection.reason` changed from English copy to the enum value. | keep both a string and an enum | Only specs read the string (grep). Worker-supplied text must never reach the renderer. | yes |
| The auto re-attach loop still drops a session the worker refuses. Only an explicit re-attach keeps its cursor. | keep every cursor forever | When a reconnect is refused, the session is gone or no longer granted. Keeping that cursor would fail and push the reason on every reconnect. The review finding named the explicit re-attach. | yes |
| The deadline is `min(engine timeoutAt, timestamp + 60 s)`, and the same function drives both the timer and the forwarded `timeoutAt`. | always `timestamp + 60 s` | An unattended route already sets a bounded deadline (`sdk-permission-handler.ts:935-938`). The countdown must never show a later time than the real deny. | yes |
| The deadline rewrite runs in `WorkerEventCapture`. | worker-host `tap` | Capture runs only inside the worker. It is in worker-runtime scope and keeps the payload rewrite next to the deadline logic. | yes |
| Timers are `unref()`'d. | ref'd timers | A pending prompt must not keep the worker process alive. `drain()` disposes them explicitly anyway. | yes |
| An expiry record that fails to append is swallowed, with a `degradation-audit` note. | throw from the timer | This is the same convention as `deliver` in `remote-sessions.ts`. A failed append degrades the writer, which aborts the turn. | yes |

## Not done / follow-ups

- A tab-only request held for a start that never resolves its session (`heldPermissions`)
  gets no expiry timer, because it is never indexed. Its start has already timed out.
  Behaviour there is unchanged.
- `MachineSummary` (`machines:list`) does not carry `reason`. Only the `machines:state` push
  carries it, as the brief asked.
- Electron main forwards `MachinesStatePayload` unchanged (`machines-service.ts:115-119`), so
  `apps/ptah-electron` needs no source change.
