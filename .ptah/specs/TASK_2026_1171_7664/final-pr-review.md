# Final pre-push code-logic review — TASK_2026_1171_7664

| Metric | Value |
| --- | --- |
| Reviewed | `git diff main...HEAD` (HEAD `7942e1de6`), fix commit `7942e1de6` |
| Score | 6/10 |
| Verdict | **REVISE** |
| Blocking / Serious / Moderate / Minor | 0 / 1 / 1 / 5 |

The fix round closes the five earlier findings. The caller identity mapping is sound.
The S2 fix adds one new defect: a cancellation callback stays registered after a
completion is delivered. An ordinary `ptah_agent_read` after the push then changes the
delivered envelope to `cancelled`. The score is not in the 7-8 band because this path is
the most common parent flow (push, then read) and no test covers it. The score is not in
the 3-4 band because the defect corrupts delivery state but does not lose or duplicate a
notice.

## Earlier findings

| ID | State | Evidence |
| --- | --- | --- |
| S1 read/wait hooks best effort | Fixed | `protocol-dispatcher.ts:1452-1463` wraps status, resolver and ack in one `try` and returns the read result. `:1730-1740` does the same for wait and returns `result`. Residual: see Minor m1. |
| S2 consumed completion durable | Partly fixed | `parent-envelope-store.service.ts:374-386` writes a `cancelled` key and removes the outbox entry under `serialize`. `putCompletionOutbox` (`:346-347`) skips a consumed key, so the checkpoint race is closed. Replay paths call `consumeAcknowledged` (`lane-completion-notifier.service.ts:692-695,730-733`). Restart replay is safe because the outbox entry is gone and the key shard is consulted. Schema: `state: 'cancelled'` is already in `ParentCompletionKeySchema` (`parent-envelope.schema.ts:105-109`), so persisted data stays compatible. Growth: one key per completion per parent, the same rate as the existing `writeCompletionKeyLocked` (`:693-703`). The new defect S-NEW-1 comes from this fix. |
| S3 report failure visible | Fixed | `agent-report-router.service.ts:284-294` counts attempts and failures (refusal or throw). `agent-process-manager.service.ts:2208-2213,3681-3682` carries bounded counters into the signal. The envelope shows `reportsFailed="N"` and a `Next:` line (`lane-completion-notifier.service.ts:1227-1233`). The verdict enum is unchanged and `verdictOf` still returns `no-deliverable` for missing files. The body is persisted in the outbox, so a replay keeps the text. |
| M1 refused cancel | Fixed | All three cancel sites now check `'refused' in cancelled` and throw or log (`lane-completion-notifier.service.ts:555-563,587-598,876-884`). `completion-read-ack.ts:27-30,45-48` deletes the callback only after it succeeds. `settleEnqueue` no longer rejects. The store refuses only for a missing entry or a frozen parent (`parent-envelope-store.service.ts:293-301`), so a retry through `pendingReplays` cannot push a notice that cancel could stop. |
| M2 pre-auth rejections | Fixed (residual minor) | `http-server.handler.ts:386` writes to `recordRejectedAttempt`. `mcp-attachment-observer.ts:41` prefers the authenticated map. Residual: see Minor m4. |

## Caller identity (B1/B2)

- The caller ID comes only from the authenticated URL. The body field is discarded
  (`http-server.handler.ts:532` `_ignoredBodySession`) and the URL value is stamped at `:544`.
  No tool argument reaches `resolveCodexCallerId`.
- `resolveCodexCallerId` (`ptah-api-builder.service.ts:1209-1217`) returns the raw ID when
  the Codex lookup is ambiguous, stale or throws. The adapter returns a thread only for one
  live tab (`codex-chat-adapter.ts:216`). The raw ID is a tab ID, not a session ID, so the
  existing session guards reject it. This is fail-closed for attribution.
- The read hook compares `resolveCallerParentId(raw)` with `info.parentSessionId`. Both use
  the same resolver as spawn (`agent-namespace.builder.ts:347-348,374`). If the tab became
  live between spawn and read, the IDs differ, no ack occurs, and the push still arrives.
  That failure is safe (an extra notice, never a lost one).
- `codex-chat-host-ports.ts:391-403` skips a user `ptah` server and deletes `mcp.ptah.*`
  secrets when a host session URL exists. A user override cannot replace the host URL or
  inject a credential. When `attachPtahMcp` is false, the user entry still applies, which
  matches the earlier behavior.

## Callers outside the diff

- `acknowledgeTerminalRead`, `reconcilePendingCompletionRead`, `wasTerminalReadAcknowledged`:
  only `protocol-dispatcher.ts` and `lane-completion-notifier.service.ts` use them.
- `consumeCompletion`: only the drainer and the notifier call it. The `key.state` value is
  not read anywhere (`grep key\.state`), so a `cancelled` label on a delivered key is
  harmless.
- `LaneCompletionSignal.reportAttempts` / `reportsFailed` (`agent-process.types.ts:768-769`):
  both optional. Only `cli-agent-runtime` files consume `LaneCompletionSignal`
  (`lane-completion-envelope.ts`, `lane-completion-outcome.ts`, the notifier). No frontend
  store, Electron app or CLI file reads it, so the change is not breaking.
- `getAttempt` has one consumer (`agent-process-manager.service.ts:1461-1463`).

## New findings

### Blocking

None.

### Serious

**S-NEW-1 A read after a delivered push cancels the delivered envelope.**

- Evidence: `lane-completion-notifier.service.ts:555-563` registers a callback before
  the checkpoint. The callback calls `find(key)` and `cancel(queued.id)` with no state
  check. Only `acknowledgeTerminalRead` or an already-acknowledged reconcile removes it
  (`completion-read-ack.ts:27-30,45-48`). When `settleEnqueue` returns `delivered: true`,
  the code at `:586` registers nothing new, so the first callback stays.
  `store.cancel` → `cancelLocked` (`parent-envelope-store.service.ts:293-301,651-655`)
  sets `state: 'cancelled'` on any state, including `delivered`, and the drainer emits
  the update (`parent-delivery-drainer.service.ts:117-120`).
- Scenario: the lane exits, the parent gets the push, then the parent calls
  `ptah_agent_read`. The hook runs the stale callback. The delivered envelope becomes
  `cancelled`, the UI receives that update, and `pruneExpiredLocked` (`:776-781`) treats it
  as expired at once. The same occurs on the pending path (`:587-598`) if the drainer
  delivers before the read.
- Fix:
  1. In both callbacks, call `cancel` only when `find(key)?.state` is not `delivered`
     or `cancelled`.
  2. Delete the `pendingCancellation` entry when the signal settles as delivered.
     Export a small `clearPendingCompletionRead(key)` for this.
  3. Optional defense: make `store.cancel` return the existing entry unchanged when its
     state is `delivered` or `cancelled`, the same as `retry` does at `:316`.
  4. Add a spec: signal delivered, then `acknowledgeTerminalRead`. Expect the state to stay
     `delivered` and expect no `cancel` call.

### Moderate

**M-NEW-1 The fix round has no runtime test evidence.**

- Evidence: `lane-F1-fix-report.md` "Focused checks": every Jest run stopped with no output,
  so 0 tests passed. The new cases at `lane-completion-notifier.service.spec.ts:1143-1260`,
  `protocol-dispatcher.spec.ts:283-320` and `mcp-attachment-observer.spec.ts:4-30` only
  type-check.
- Fix: the coordinator runs `npm run verify -- --related -p cli-agent-runtime,vscode-lm-tools`
  and then the full gate before push. Add the S-NEW-1 spec before that run.

### Minor

- **m1** `protocol-dispatcher.ts:1730-1740`: one `try` covers the whole loop. If the
  acknowledgment for one exited entry throws, later entries get no acknowledgment and
  receive a push after the wait. Put the `try` inside the loop.
- **m2** `lane-completion-notifier.service.ts:1233`: `reportsFailed` counts failed
  attempts, not lost reports. A lane that is refused once (for example a rate refusal) and
  then retries with success shows "1 reports were not delivered". Use the wording
  "N report attempts failed", or count a failure only when no later attempt succeeds.
  A `pending` result that the drainer later abandons is not counted.
- **m3** `ptah-api-builder.service.ts:1203-1218`: the new `resolveCodexCallerId` sits
  between the JSDoc of `resolveCallerSdkSessionId` and that method, so the JSDoc now
  documents the wrong method. `:1084-1087` has a one-space indentation error.
- **m4** `mcp-attachment-observer.ts:39-48`: when a lane never authenticated, any local
  caller can still overwrite its rejected reason (`forbidden` / `auth-required` only, low
  impact). If the authenticated attempt has expired, `getAttempt` also deletes a fresh
  rejected attempt and returns `undefined`. Check expiry per map.
- **m5** The pre-checkpoint callback in `lane-completion-notifier.service.ts:555-563`
  runs at registration time when the read already occurred, and it repeats the work of
  the `skipAcknowledged` / `consumeAcknowledged` path at `:567-570`. This is not wrong,
  but each early read causes two `consumeCompletion` writes. Keep only one path after you
  fix S-NEW-1.

## Five logic questions

1. Silent failure: S-NEW-1 changes delivered state with only an update event and no log.
2. Unexpected user action: a parent read after a push (S-NEW-1).
3. Wrong answer from input: a retried, refused report shows as "not delivered" (m2).
4. Dependency failure: cancel or consume errors are logged and kept for retry. Read and
   wait results return (S1, M1 fixed).
5. Missing requirement: no rule says when a pending cancellation expires once the notice
   is delivered. S-NEW-1 is the result.

## Decisions

- Treat S-NEW-1 as Serious, not Blocking. Options: Blocking, Serious. Evidence: no notice is
  lost or duplicated, but the delivery state is wrong on the main path. Reversible.
- Accept the raw tab ID fallback as fail-closed. Evidence: `codex-chat-adapter.ts:216` and
  the session guards. This repeats the earlier review decision. Reversible.

## Verification

Read the full fix diff, the ack module, the store completion-key and cancel paths, the
schema, the report router and manager counters, the dispatcher hooks, the observer and
the B1/B2 identity code. Searched consumers with `grep` (Ptah symbol search was not used
because the targets were known string names). I ran no checks: no `tsc`, `eslint` or Jest.
Uncertainty: medium on the UI effect of S-NEW-1, because I did not trace the renderer
handling of a `cancelled` completion update.

**Recommendation: REVISE.** Fix S-NEW-1 with a test, run the gate, then push.
