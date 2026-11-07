# Batch 23 report — C10a Machines state layer (Task 23.1)

## Files

All under `libs/frontend/machines-ui/src/`:

- CREATED `lib/services/machines-api.ts`: `MachinesApi`, one method per `machines:*` RPC (all 17 in
  `MACHINES_RPC_METHOD_NAMES`). It returns `RpcResult` unchanged.
- CREATED `lib/services/machines-feed.ts`: `MachinesFeed` (`MessageHandler` for `machines:event` and
  `machines:state`). It validates each push and relays it to listeners in delivery order.
- CREATED `lib/services/session-event-reducer.ts`: a pure per-session reducer keyed by (epoch, seq).
  It handles held gaps, one replay request per gap, an epoch reset, snapshot (watch-only) mode, turn
  tracking and pending permissions.
- CREATED `lib/services/transcript-events.ts`: normalises the flat-event list (the A5 rules: one event
  per slot, the first definitive event wins, stream deltas accumulate).
- CREATED `lib/services/machines-store.ts`: `MachinesStore`, a signal store. It holds machines (state,
  nextRetryAt, versions, lastSeenAt, `reason`), workspaces, sessions by workspace, opened session
  views, approval counts and actions.
- CREATED `lib/services/testing/machines-fixtures.ts`: event builders used only by the specs.
- CREATED specs: `machines-api.spec.ts`, `machines-feed.spec.ts`, `session-event-reducer.spec.ts`,
  `transcript-events.spec.ts`, `machines-store.spec.ts`.
- MODIFIED `index.ts`: exports the public API.
- MODIFIED `libs/frontend/machines-ui/jest.config.ts`: added `transformIgnorePatterns` (see Decisions).

## Criteria and the specs meant to prove them

| # | Criterion | Spec |
| --- | --- | --- |
| 1 | 4.2: duplicates and a gap across a reconnect equal no disconnect | `machines-store.spec.ts` "4.2: duplicates and a gap…" and "4.2: a failed re-attach in main…"; `session-event-reducer.spec.ts` "drops duplicates", "holds events past a gap" |
| 2 | A5: history and live events of one message are idempotent | `transcript-events.spec.ts` "A5: …" (2 tests); `machines-store.spec.ts` "A5: …" |
| 3 | Offline never marks sessions failed | `machines-store.spec.ts` "a machine going offline never marks its sessions failed" |
| 4 | Watch-only per revised 4.9 | `machines-store.spec.ts` "watch-only" block (snapshot refuses send, stop and answer; `SESSION_DRIVEN_ELSEWHERE` re-attaches; lock-unavailable 9c keeps the cached view; Refresh recovers); reducer "a snapshot is watch-only…" |
| 5 | A new epoch resets the cursor | reducer "resets the cursor and transcript on a new epoch", "an attach of a new epoch…"; store "a new epoch resets the session cursor and replays from 0" |
| 6 | Strict TS, no `any`, signals, `inject()`, `providedIn: 'root'` | lint and typecheck pass |

## Verification

`npm run verify -- -p @ptah-extension/machines-ui` exited with code 0:

- lint and typecheck: 2 tasks succeeded.
- test: 1 task succeeded, **5 suites, 60 tests passed**. The 4.2 and A5 specs are among them.
- The first run failed: every suite failed to load ("Must use import to load ES Module:
  @angular/core/fesm2022/core.mjs") because `jest.config.ts` had no `transformIgnorePatterns`. Fixed
  as recorded under Decisions, then re-run.

## Decisions

- **Scope extension, approved by the coordinator.** I edited
  `libs/frontend/machines-ui/jest.config.ts` and added only the `transformIgnorePatterns` entry, copied
  exactly from `libs/frontend/tasks-ui/jest.config.ts:15`
  (`'node_modules/(?!(?:.*\\.mjs$|marked|ngx-markdown))'`). Without it no spec in the lib can load
  Angular's ESM bundle. Reversible: yes.

- **The renderer has its own reducer.** I did not import `@ptah-extension/worker-protocol`'s
  `SessionEventReducer`. Options: reuse the worker one, or write one in the renderer. Evidence: the
  renderer contract is `MachinesEventPayload` / `MachinesSessionAttachResult` in `libs/shared`, and
  that contract is deliberately free of worker-protocol (see the `rpc-machines.types.ts` header). The
  worker reducer takes worker frames (with `ts` and tokens) and the worker's `session.attach` result.
  Recovery here goes through `machines:session.replay`. Reversible: yes.
- **Reconnect.** Electron main re-attaches tracked sessions from its own cursor
  (`machine-connection.ts:298-314`). On `connected`, the store therefore sends a replay only when a view
  is behind its `target`, or when the push carries `reason: 'session-reattach-failed'`. Every other gap
  is found from the event stream and replayed with `afterSeq = last`. Reversible: yes.
- **A5 rule: the first definitive event wins.** A later `complete` or `history` copy of a slot is
  dropped, and a `stream` event never overrides a definitive one. Applying both copies then gives
  exactly the array that one copy gives. Stream deltas accumulate into one event per block, so the list
  grows with blocks, not chunks. Reversible: yes.
- **Watch-only.** A snapshot attach (or a 9c lock failure) makes the view `watchOnly`, and send, stop
  and answer are refused locally. A send refused with `SESSION_DRIVEN_ELSEWHERE` re-attaches. Nothing
  re-checks on a timer (4.9 9d). A snapshot is not re-attached on reconnect, only by `openSession`
  (Refresh).
- **A `machines:state` push for a machine missing from the list is ignored** until the list holds that
  machine.
- **`reason`.** The type was already present (`MachineStateReason`) when I read it. The store copies
  it from each push, and a push without one clears it.

## Not done / out of scope

- Registering `{ provide: MESSAGE_HANDLERS, useExisting: MachinesFeed, multi: true }` in
  `apps/ptah-extension-webview/src/app/app.config.ts`: outside this batch's scope, needed for Batch 24
  or 25.
- `permission:auto-resolved` and `permission:session-cleanup` do not clear pending permissions. I
  could not confirm their payload shape in the renderer contract, so only
  `worker:permission.answered` clears one.
- No UI (by design for this batch).
