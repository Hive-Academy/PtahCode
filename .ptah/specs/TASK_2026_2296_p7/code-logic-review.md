# Code Logic Review — `TASK_2026_2296_p7`

Scope read in full: agent-sdk `provider-session/*` (adapter, turn-stream, session-controls, follow-up-queue, approval-sink, chat-session, chat-ports, error-mapping), `di/register.ts` + `tokens.ts` diffs, rpc-handlers `provider-session-host/*` (pool, host ports, open-request, history port, approval presentation, auth-status, native-controls), slash-router diff, auth probe/cache diffs. Specs not executed (not requested). No diagnostics run (gate in progress).

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 3              |
| Moderate issues     | 6              |
| Failure modes found | 9              |

Evidence for the score: approval semantics (never auto-approve), error-code mapping, per-id mutex, credential revoke on pool close paths, DI wiring and the /clear fix are sound. The score is held at 6 because the pool and the adapter disagree about who owns a process's lifetime, which breaks the first send after an idle close, and because of one credential race. These are likely-path defects, not data loss, hence no blocking.

## Five logic questions

### 1. How does this fail silently?

- Pool closes (idle sweep, LRU eviction, history-reopen) never tell the adapter. `ProviderSessionChatSession.live` keeps pointing at a closed `ProviderSession` (`provider-session-pool.ts:290-312`, `provider-session-chat-session.ts` `live`, `provider-session-turn-stream.ts:130`). The first send after 10 minutes idle goes to a dead process (see S-1).
- Idle accounting never sees chat activity (S-2): an active-but-bursty chat is closed as "idle".
- Approval cards of a closing session are never withdrawn from the UI (M-1).
- Stuck "queued" follow-up on a failed steer after the session closed (M-5): the `failed` state is never emitted.
- MCP credential of a reopened session can be revoked by the previous process's close (S-3); the agent just loses Ptah tools, no log.

### 2. What user action produces unexpected behaviour?

- Send a message after >10 min idle, or after another tab's open evicted this one: the turn fails ("provider session stopped responding") and only the second send works.
- Press Stop at the moment the turn ends: `interruptSession` sees `interrupt()` return false while `busy` is still true (finally has not run) and closes the whole chat session, failing every queued follow-up with "The session ended." (`provider-session-session-controls.ts:597-610`) (M-3).
- Open a session's history while its chat is idle: the pool closes the chat's own process and replaces it with a `load` entry the adapter does not know (`provider-session-pool.ts:155-157`); next send fails once, then recovers.
- Tab close / `/clear` while an approval card is open: card remains for the full unroutable-permission window (M-1).

### 3. What input data produces a wrong answer?

- A repeated steer/withdraw race re-inserts a follow-up at a stale index into an orphaned array (M-5).
- Auth probe timeout answers `{}` while the host is configured: `providerSessionStatus: {}` is sent (truthy), so an installed provider's card vanishes for that cache window (`auth-status-probes.ts` `probeProviderSessions`, `auth-status-cache.ts` spread). Mild, intentional per comment, but it is indistinguishable from "no profile admitted" (M-6).

### 4. What happens when a dependency fails?

- `ports.acquire` rejects (auth-required, binary missing, abort): the adapter does not call `release`, so host `tabs` and `openRequests.sinks` entries set before the pool call leak per failed open (M-2).
- Credential mint failure: warns and opens without tools (accepted decision; logged at `provider-session-pool.ts:371`).
- Pool close timeout: bounded 5 s, logged, credential still revoked (OK).
- Identity save rejects: session released with `broken`/`tab-closed`, error mapped (OK).
- Pid ledger failure: logged, never blocks (OK).

### 5. What is missing that the requirements never mentioned?

- A "process closed by the pool" signal back to the adapter (or an `isClosed`/liveness check on `ProviderSession`).
- A call to `pool.touch`/activity on every prompt.
- Cleanup of host per-session maps when an acquire fails.
- A test that sends after a pool idle close.

## Failure modes

### Send after pool idle close / eviction / history-reopen (S-1)

- Trigger: entry idle >= 10 min (`PROVIDER_SESSION_IDLE_CLOSE_MS`), LRU eviction by a 4th session, or `acquireForHistory` on a non-load live entry.
- Symptom: next send uses `session.live` (the closed process). Result depends on the runtime's closed-session behaviour: at best a failed turn with `disposition: broken` followed by a notice, then success on the next send; at worst a prompt on a dead connection that hangs until a runtime timeout.
- Evidence: `provider-session-pool.ts:290-312` (closeEntry/closeSession, no notification), `:155-157`, `:481-491` (sweep); adapter `live()` returns `session.live` when set (`provider-session-chat-adapter.ts:229-230`); `'crashed'` reason has no caller (grep: only the type).
- Current handling: relies on the runtime reporting `process-exited`; `broken()` only runs after a failed prompt or a `broken` terminal.
- Recommendation: give the pool an `onClosed(sessionId, reason)` hook (or have the host port return a wrapper) so the adapter clears `session.live`, cancels approvals and re-acquires transparently on the next turn; or have `live()` re-validate through `ports.acquire` (cheap, the pool returns the live entry) on every turn instead of caching `session.live`. Going through `pool.acquire` per turn also fixes S-2.

### Idle accounting ignores chat turns (S-2)

- Trigger: turns shorter than the 60 s sweep interval with gaps under 10 min between them but more than 10 min after the last observation.
- Symptom: the pool closes a session that was used minutes ago, then S-1.
- Evidence: `lastActiveAt` set only in `open` and `touch` (called from `acquire`/history), and refreshed in `sweep` only when a turn is running at the tick (`provider-session-pool.ts:149, 273-278, 481-491`). The adapter calls `pool.acquire` only once per process (`provider-session-chat-adapter.ts:229-233` caches `session.live`).
- Recommendation: touch the entry on each prompt (acquire per turn, or a `pool.touch(sessionId)` port).

### Credential revoked by an unlocked close racing a new open (S-3)

- Trigger: sweep `void this.closeEntry(entry,'idle')` (`:481-491`) or eviction of a victim (`:228-236`) removes the entry synchronously and closes without the per-id lock; the close can take up to 5 s. A send to the same id in that window runs `acquire`, issues a new credential with the same subject, then the old close's `revokeCredential(sessionId)` calls `revokeSubject` (subject-wide, `mcp-caller-credentials.interface.ts:70`) and kills the new token.
- Symptom: new process holds a revoked token; Ptah MCP calls fail with auth errors, no log line.
- Evidence: `provider-session-pool.ts:290-312`, `:331-341`. The open-failure path documents this hazard (`:222-224`) but the close path does not honour it.
- Recommendation: run idle/evict closes under `withLock(entry.sessionId, ...)` (eviction already inside the evictor's lock for another id, so use a try-lock/skip), or revoke by token/generation instead of by subject.

### Stale approval card on close (M-1)

- Trigger: tab close, `/clear`, hard stop with a pending approval.
- Evidence: `ProviderSessionSessionControls.close` deletes the record before `approvals.dispose()` (`provider-session-session-controls.ts:552-555`); the router cancel fan-out then calls `owns()` which is false (`register.ts` new callback), so Codex's presentation gets `cancelPrompt` and no-ops for an unknown prompt (`codex-chat-approval-presentation.ts:206-216`). The provider-session presentation never clears its card/timer.
- Symptom: card stays up until the timeout; a click gets `approval-response-rejected` and auto-resolved. Decline-only, never a grant.
- Recommendation: dispose approvals before deleting the record, or let `owns()` also consult a "recently closing" set / the router owner kind (the owner kind `provider-session` is known to the router and is the better discriminator than adapter ownership).

### Failed acquire leaks host maps (M-2)

- Evidence: `provider-session-chat-host-ports.ts` `acquire` sets `tabs` and `attachApprovals` before `pool.acquire`; adapter `open()` catch does not release (`provider-session-chat-adapter.ts:~205-215`) and the id is new on start, so nothing ever calls `release` for it.
- Impact: one `tabs` entry and one sink (holding the adapter session graph via closures) per failed start; auth-required retries are the common trigger.
- Fix: in host `acquire`, wrap the pool call and detach/delete on rejection when the id has no live entry.

### Stop at turn end closes the session (M-3)

- Evidence: `provider-session-session-controls.ts:593-610`. `interrupt()` false while `busy` is still true (finally not yet run) is treated as a refused interrupt.
- Fix: re-check `session.turnId`/`busy` after the await, or treat false as benign when the turn has since terminated.

### History reopen replaces a chat-owned idle process (M-4)

- Evidence: `provider-session-pool.ts:155-157`; adapter keeps the old `live`. Same recovery path as S-1; fix with S-1's hook.

### Steer failure re-queues into stale array (M-5)

- Evidence: `provider-session-follow-up-queue.ts:150-170` splices the item out, awaits, then `queue.splice(index, 0, item)` on the captured array. If the turn ended (drain shifted), the session closed (`rejectAll` deleted the map entry) or another item was withdrawn, the index is stale or the array orphaned; the item neither runs nor reports `failed`.
- Fix: re-read `this.queues.get(session)`, emit `failed` when the session is closed, insert at `Math.min(index, length)`.

### Probe timeout looks like "no profiles" (M-6)

- Evidence: `auth-status-probes.ts` `probeProviderSessions` fallback `() => ({})`; cache treats `{}` as present. Use `undefined` for the timeout fallback so the field is omitted exactly as "unknown", or preserve the previous rows.

## Blocking issues

None.

## Serious issues

### S-1 Dead `session.live` after pool-initiated close
- File: `provider-session-pool.ts:290-312, 481-491`; `provider-session-chat-adapter.ts:229-230`
- Scenario: idle >10 min, eviction, history reopen, then send.
- Impact: first message after idle fails or hangs; most likely user-visible regression of the phase.
- Fix: see Failure modes.

### S-2 Idle clock not fed by turns
- File: `provider-session-pool.ts:149, 273-278, 481-491`
- Scenario/Impact/Fix: see above. Together with S-1 it makes S-1 hit active users.

### S-3 Unlocked close revokes the successor's credential
- File: `provider-session-pool.ts:228-236, 290-341, 481-491`
- Scenario/Impact/Fix: see above.

## Moderate and minor issues

- M-1 stale approval card on close: `provider-session-session-controls.ts:552-555`, `register.ts` cancel fan-out.
- M-2 failed acquire leaks `tabs`/`sinks`: `provider-session-chat-host-ports.ts` `acquire`.
- M-3 Stop-at-end closes session: `provider-session-session-controls.ts:597-610`.
- M-4 history reopen kills chat process: `provider-session-pool.ts:155-157`.
- M-5 steer re-queue: `provider-session-follow-up-queue.ts:150-170`.
- M-6 probe-timeout shape: `auth-status-probes.ts`.
- Minor: `open()` busy-collision branch releases `tab-closed` for an id another session owns, which would close the existing session's process and detach its sink (`provider-session-chat-adapter.ts:~190-194`); guarded by the `opening` map so effectively unreachable.
- Minor: `reserveSlot` frees the cap slot while a late-resolving aborted open still holds a process (`provider-session-pool.ts:222-226, 236`); transient over-cap by at most the open duration.
- Minor: pool `acquire` ignores `signal` when an entry is already live (fine) but `acquireForHistory` holds the per-id lock up to 90 s, blocking a send to that id; acceptable.
- Minor test gap: no spec sends after a pool idle close or evicts an adapter-owned session.

## Evaluated decisions (not re-litigated)

- Attachments refused (`provider-session-chat-adapter.ts` `turnInput`): coded `unsupported-option`, thrown before spawn and in `sendMessageToSession` before any queueing. OK, not silent.
- User Stop keeps the process: OK except the false-positive close in M-3.
- Antigravity installed counts signed-in: row is honest in the type (`ensureTokensFresh?`), surfaces `auth-required` on open. OK.
- MCP mint failure: logged warn, open proceeds. OK (but see S-3 for a silent variant).

## Verified OK

- Approval semantics: abort, turn end, dispose, history-only open, duplicate request id and missing target all resolve `cancel`; timeout resolves `decline` (`provider-session-approval-presentation.ts` timer, `provider-session-open-request.ts` relay); `deny`->`cancel`, `deny_with_message`->`decline`. No path grants without a user reply. Context id check guards replies to an older process.
- History-then-adopt relay: sinks are looked up per request, `attachApprovals` precedes `pool.acquire`, `detachApprovals` skipped for `broken` so re-acquire keeps routing.
- Re-acquire ordering: `broken()` queues the pool release synchronously before any later `acquire` (both under the per-id mutex).
- Credential issue/revoke: revoked on open failure, abort, dispose-after-open, entry close (any reason), close timeout/failure (finally). Only gap is S-3.
- Error mapping: every `ProviderSessionChatAdapterErrorCode` handled by `providerSessionFailure`; runtime codes exhaustively mapped with a `never` check; `cancelled` not logged.
- Codex parity: router fan-out picks provider-session presentation only for adapter-owned sessions, else Codex, else provider-session on Codex-less hosts; `/clear` finds Codex first then provider session, interrupt in try/finally then `closeSession`. Codex behaviour unchanged. The only parity regression is M-1 (provider-session `owns()` is false by the time `dispose` cancels).
- DI: `PROVIDER_SESSION_CHAT_ADAPTER` is now built from ports (null without ports); router callback resolves it lazily, so no construction cycle. Auth probe token defaulted to null in `registerChatServices`.

## Data flow

1. RPC start -> `prepare` (host, stored binding on resume) OK.
2. `attach` -> `ports.acquire` -> openRequests -> pool mutex -> credential issue -> runtime open OK; leak on rejection (M-2).
3. `identity.save` before first prompt OK; settings re-applied OK.
4. `turn` -> `session.live.prompt` : stale `live` after pool close (S-1), no activity touch (S-2).
5. Events -> projector -> flat stream OK; terminal `broken` -> `broken()` OK.
6. Close -> `release` -> pool `closeEntry` -> revoke OK; approvals disposal order M-1.

## Requirements fulfilment

| Requirement                                    | Status   | Gap                                    |
| ---------------------------------------------- | -------- | -------------------------------------- |
| Adapter (plan section 8) turns, follow-ups     | COMPLETE | steer re-queue (M-5)                   |
| Host ports (section 9) incl. approvals, history | PARTIAL  | acquire-failure cleanup (M-2)          |
| Pool (section 10): mutex, cap, LRU, idle, creds | PARTIAL  | S-1, S-2, S-3                          |
| P6 M-1 `/clear` closes the provider session    | COMPLETE | -                                      |
| Error codes via `providerSessionFailure`       | COMPLETE | -                                      |
| Codex approval cancel parity                   | PARTIAL  | M-1                                    |

Implicit requirements not addressed: pool-to-adapter close notification; activity tracking per turn.

## Edge cases

| Case                          | Handled | How                         | Concern            |
| ----------------------------- | ------- | --------------------------- | ------------------ |
| Concurrent opens same id      | YES     | per-id mutex + `opening`    | -                  |
| Cap reached, all running      | YES     | `limit` error               | -                  |
| History while turn running    | YES     | `busy`                      | -                  |
| Send after idle close         | NO      | cached dead `live`          | S-1                |
| Close races reopen            | NO      | unlocked close, subject revoke | S-3             |
| Approval during history-only  | YES     | cancel                      | -                  |
| Approval on tab close         | PARTIAL | decline only, card lingers  | M-1                |
| Stop as turn ends             | NO      | closes session              | M-3                |
| Abort during open             | YES     | raceAbort + late close      | slot count minor   |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (runtime behaviour of a closed `ProviderSession` is not in this checkout; S-1 severity depends on it, and the specs were not run)
- Top risk: the pool closes processes the adapter still treats as live, so the first message after idle or eviction fails.
- What a robust implementation would add: a pool-close notification or per-turn re-acquire/touch; closes under the per-id lock (or token-scoped revoke); approval dispose before record removal (or owner-kind based routing); host map cleanup on failed acquire; a Stop-at-turn-end guard; specs for send-after-idle-close and credential survival across close/reopen.

---

# Re-review (after fixes and attachments)

Read in code: pool (full), host ports, open-request, adapter attach/live/turnInput/current, controls (full), follow-up queue (steer/requeue), turn-stream (prompt path, providerTurnInput), contracts diff, auth probe diff, MCP token registry. Ran `provider-session-pool.spec.ts` and `provider-session-chat-host-ports.spec.ts` (43 passed). Other specs and typecheck not run.

## Summary

| Metric          | Value                       |
| --------------- | --------------------------- |
| Overall score   | 7.5/10                      |
| Assessment      | APPROVED with moderate follow-ups |
| Blocking        | 0                           |
| Serious         | 0                           |
| Moderate        | 4 (new) ; minor 4           |

## Fix verification

| Finding | Status | Evidence |
| ------- | ------ | -------- |
| S-1 dead live after pool close | FIXED | `live()` calls `attach()` every turn (`provider-session-chat-adapter.ts` `live`/`attach`): `ports.acquire` returns the pool entry or a replacement; identity is re-saved and settings re-applied only when `live !== previous` (so no double identity save on the open->first-turn path: second acquire returns the same object). `holds()` at `provider-session-pool.ts:211`, used by `current()` for setters and the images capability check. |
| S-2 idle clock | FIXED | per-turn acquire hits `touch()` (`pool.ts:~149`), also re-inserts for LRU. |
| S-3 credential race | FIXED, verified safe | subject `<sessionId>#<n>` (`pool.ts` `open`, `closeEntry` -> `closeSession(entry.credentialSubject)`), failed open revokes its own subject. `McpCallerTokenRegistry.issue/revokeSubject` treat the subject as an opaque revoke key (`mcp-caller-token-registry.ts:133-150`); verification is by token hash -> binding, and the binding `sessionId` is unchanged, so MCP URL/session routing is unaffected. Grep of all `revokeSubject` callers: none revokes by a provider-session id (SDK builder/runner, agent-process-manager use their own subjects). Codex untouched. Consequence: nothing can revoke a provider session's token by bare session id any more; only the pool revokes it, on every close path (close, evict, idle, history-reopen, failed open, dispose). `revokeEphemeral()` on server stop still kills all. |
| M-1 stale cards | FIXED | `controls.close` disposes approvals before deleting the record (`session-controls.ts` `close`), so `owns()` is true during the router fan-out. |
| M-2 failed-acquire leak | FIXED, one residue (see N-2) | `acquired` set + cleanup in host `acquire` catch. |
| M-3 Stop at turn end | FIXED | `stillRunning()` re-checks `busy`, same `turnId` and `live.isTurnRunning()`. |
| M-4 history reopen | COVERED by S-1 (adapter adopts the new process on next turn; re-saves identity, cancels stale prompts as `superseded`). |
| M-5 steer requeue | FIXED | `requeue()` fails closed sessions with `failed` + waiter rejection, else inserts at `min(index,len)` into the live queue and `drainIfIdle` starts it. Ordering OK: if the turn is still running, its `finally -> onIdle -> drain` picks the item up; if it ended during the steer, `drainIfIdle` starts it. Residual: a send that arrived during the steer await may run ahead of the re-queued item (benign). |
| M-6 probe timeout | FIXED | last rows kept; `undefined` before the first success so the field is omitted. |

`superseded` semantics: `cancelAll('superseded')` runs only when a different process replaced the cached one, after the identity save, so the router/presentation cancel fan-out sees an owned session. The reason is in the shared union (`session-runtime.types.ts:150`). Decline-only, no grant path.

## New findings

### N-1 (Moderate) File references are unbounded and unconfined
- `providerTurnInput` does `resolve(cwd, file)` with no containment check (`provider-session-turn-stream.ts:70-90`); `turnFilesSchema` only requires a non-empty string. An absolute path or `../..` outside the workspace becomes a `file://` resource link the agent reads on its own, outside Ptah's tool approval. Sources: renderer (local user, acceptable) and `sendMessageToSession` with a peer origin (another agent, less trusted).
- Fix: for `inboundPeer` turns refuse files outside the workspace (or drop `files` support for peers); for the renderer path, at least reject paths with NUL and non-existent files with a coded `unsupported-option`/notice rather than letting the agent fail.

### N-2 (Moderate) Images have no size or base64 validation
- `turnImagesSchema` (`provider-session-chat-adapter.ts:~733`) only requires `data` non-empty and a `image/*` type. A multi-MB payload is held in the queue (up to 32 held turns), echoed into the prompt and passed to the agent unvalidated. Upstream RPC limits were not verified. Fix: cap total bytes per turn and per queued turn, and check base64 shape (e.g. regex on a prefix plus length % 4).

### N-3 (Moderate, new) Per-turn acquire re-runs host open-request work and re-attaches approvals
- Host `acquire` runs `openRequests.request` (CLI detection, saved permission level read) and `attachApprovals` on every turn (`provider-session-chat-host-ports.ts` `acquire`). If detection later reports the CLI missing while the process is alive, the turn fails with `unavailable` although a live process exists. Also a per-id pool lock wait: a send blocks behind a history load of the same id (up to 90 s).
- Fix: check the pool for a live entry first (`holds`-style `peek`) and skip the request build; surface the wait.

### N-4 (Moderate) Tab-close racing an in-flight acquire leaks sink and tab entry
- Close during `acquire` (while awaiting `openRequests.request`): `release('tab-closed')` detaches, then the in-flight `acquire` re-adds the sink/`tabs`, opens the process, adapter `check()` throws `cancelled` and releases with `broken`, which deliberately keeps sinks/tabs (`host-ports.ts` `release`). One small entry per such race; the process itself is closed.
- Fix: in `release`, treat a release for an id whose adapter session is closing as final, or have the adapter release with `tab-closed` when `session.closing`.

### Minor
- `setSessionModel` checks `session.live` capabilities directly instead of `current()` (`session-controls.ts` `setSessionModel`), so a pool-closed process can still reject the capability test.
- `userEcho` shows only text; images/files of a turn are not echoed in the flat stream (UI parity gap, not a data loss).
- `capabilities().images` is tested as `=== false` at message time but `!images` at prompt time: undefined is accepted early and refused late; consistent outcome, inconsistent timing.
- Idle/evict closes remain outside the per-id lock; with per-open subjects this is now harmless for credentials, but the cap counts the entry as gone while the old process is still dying (transient over-cap by up to the 5 s close bound).
- Attachments: the runtime that consumes `ProviderTurnInput.images/files` is not in this checkout (`acp-runtime` has no reference); whether `files` is honoured or silently ignored there is unverified.

## Updated verdict

- Score: 7.5/10 (was 6/10). Blocking 0, Serious 0.
- Recommendation: APPROVE; address N-1 (peer-origin file confinement) before the P8 wiring exposes inter-agent sends, N-2 and N-3 as follow-ups.
- Confidence: MEDIUM-HIGH (pool and host-port specs pass; adapter, queue and attachment paths verified by reading, not by running).
