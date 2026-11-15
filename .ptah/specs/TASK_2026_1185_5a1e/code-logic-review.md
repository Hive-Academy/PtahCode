# Code Logic Review — `TASK_2026_1185_5a1e`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 4/10 |
| Assessment | NEEDS_REVISION |
| Blocking issues | 0 |
| Serious issues (major) | 4 |
| Moderate issues (minor) | 2 |
| Failure modes found | 6 |

The bounded wait addresses the observed chat admission stall, but the new paths can leave registrations stale or a follow-up waiting indefinitely. The score is above 1–2 because the primary deadline and serialization work; it is below 5–6 because multiple normal concurrency sequences still break promised behavior.

## Five logic questions

### 1. How does this fail silently?

A workspace change during an already running repoint is discarded by the `pendingRepoint` return at `http-mcp-server.service.ts:425-444`; no later reconcile is scheduled. A timed out `chat:start` can leave a queued prompt held with no session ID and no drain (`message-sender.service.ts:719-725`, `follow-up-queue.service.ts:420-425`).

### 2. What user action produces unexpected behaviour?

Switching or closing a folder during a slow reconcile can strand the old folder's entry (`http-mcp-server.service.ts:398-400,425-445,645-654`). Two sessions retaining the same worktree root followed by one release remove the other's entry (`http-mcp-server.service.ts:695-696,725-737`).

### 3. What input data produces a wrong answer?

An on-disk `ptah` URL with the same localhost port and `/auth/` prefix but an invalid or replaced token passes the fast path (`http-mcp-server.service.ts:570-585`) without credential reconciliation (`http-mcp-server.service.ts:851-865`). The returned `registered: true` does not establish usable authentication.

### 4. What happens when a dependency fails?

If host admission never establishes a session after the renderer's RPC timeout, the timeout branch preserves streaming state (`message-sender.service.ts:719-725`) and the held follow-up cannot pass the `bound` guard (`follow-up-queue.service.ts:420-425`). The raced queue promise is observed by `Promise.race`, and the deadline timer is cleared in `finally` (`http-mcp-server.service.ts:556-567`); those two paths do not appear to leak a timer or produce an unhandled rejection.

### 5. What is missing that the requirements never mentioned?

Recovery needs an explicit terminal path for a timed out start that never binds a session. The root retention contract also needs ownership counts or per-session leases, because a set cannot represent two live retainers (`http-mcp-server.service.ts:695-696,725-727`).

## Failure modes

### Repoint change during an active reconcile is lost

- Trigger: Workspace event B arrives after the pending repoint begins `reconcileRegistrations` and has captured desired slots for state A.
- Symptom: A stale `.mcp.json` entry remains, or B's slot is absent, until another unrelated event forces reconciliation.
- Evidence: `http-mcp-server.service.ts:425-445,645-654,755-766`.
- Current handling: B receives the same pending promise, without marking that another pass is needed.
- Recommendation: Track a dirty generation and run another full reconcile after the active pass if a request arrived during it.

### Last release removes another session's root entry

- Trigger: Two sessions call `retainRoot(root)`, then either session calls `releaseRoot(root)`.
- Symptom: The remaining session's subagents lose the Ptah MCP entry.
- Evidence: `http-mcp-server.service.ts:695-696,725-737`.
- Current handling: `retainedRoots` is a set and one release deletes its sole membership. This ownership flaw predates the diff, but the changed scoped release preserves it.
- Recommendation: Return a unique lease or count retainers and remove only after the final release.

### Timed out start can hold follow-ups indefinitely

- Trigger: `chat:start` times out in the renderer and the host never binds a session to the tab.
- Symptom: The optimistic streaming state persists; a second prompt is accepted into a held queue but cannot send because there is no session ID.
- Evidence: `message-sender.service.ts:669-670,719-725`; `message-dispatch.service.ts:106-132`; `follow-up-queue.service.ts:193-208,420-425`.
- Current handling: A 30-second guard expires, but no timeout resolution clears streaming state or fails/restores the held prompt.
- Recommendation: Reconcile admission by tab after timeout; on a confirmed failed start, mark idle and restore or fail queued prompts visibly.

### Home-scoped MCP targets stop refreshing on chat registration

- Trigger: Startup registered no home target, or a home target was installed/changed after the last full reconcile; then a chat starts in an existing workspace.
- Symptom: Home-scoped CLI MCP configs remain absent or stale despite successful chat registration.
- Evidence: `http-mcp-server.service.ts:603-605,660-669`; `ptah-mcp-slots.ts:293-304`.
- Current handling: `registerRootSlots` deliberately filters `workspaceRoot === root`, while home slots have `workspaceRoot: ''`; only full reconcile handles them.
- Recommendation: Define a separate bounded refresh trigger for home slots, or explicitly narrow the feature contract and test that behavior.

### Fast path accepts an unusable credential

- Trigger: Another process edits the auth token but preserves the localhost port and `/auth/` URL shape.
- Symptom: `ensureRegisteredForSubagents` reports success while subagent requests are unauthorized.
- Evidence: `http-mcp-server.service.ts:552-555,570-585,851-865`.
- Current handling: It validates URL prefix only and skips `preparePersistent`.
- Recommendation: Verify the exact owned token against the credential registry, or treat an externally modified entry as requiring reconciliation.

### Timeout tests omit the failure recovery path

- Trigger: A renderer timeout is returned without any later host session event.
- Symptom: The production stuck-state case is not caught by the new tests.
- Evidence: `message-sender.service.spec.ts:965-977` asserts that idle is not called, and `message-dispatch.service.spec.ts:401-410` checks only enqueue; neither asserts eventual recovery.
- Current handling: Tests prove immediate guard behavior only.
- Recommendation: Add a focused timeout-without-late-admission test and a late-admission test, including queue delivery or restoration.

## Blocking issues

None confirmed.

## Serious issues

### Lost workspace change during active repoint — major

- File: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:425-445`
- Scenario: A workspace event arrives after the pending job begins and after desired slots have been computed.
- Impact: The file set can remain stale indefinitely, including credentials pointing to a root no longer open.
- Fix: Mark active work dirty and schedule one more pass when it finishes.

### Shared root release lacks ownership — major

- File: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:695-696,725-737`
- Scenario: Concurrent sessions retain one root and the first finishes.
- Impact: Remaining session's subagents lose access.
- Fix: Use reference counts or unique retention handles. This is a pre-existing issue retained by this change.

### Timed out start has no failed-admission recovery — major

- File: `libs/frontend/chat/src/lib/services/message-sender.service.ts:719-725`
- Scenario: Host never admits the turn after renderer timeout.
- Impact: The user sees a streaming tab and held messages that cannot drain.
- Fix: Resolve the tab's admission state after timeout and explicitly settle queued content if no session exists.

### Home targets are skipped by scoped registration — major

- File: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:660-669`
- Scenario: Normal chat start is the only registration action after a home target appears or changes.
- Impact: Supported CLI home configs are never repaired by that action.
- Fix: Provide a separate refresh path for home targets that does not extend chat admission.

## Moderate and minor issues

- **Minor:** The fast path checks URL shape rather than credential validity (`http-mcp-server.service.ts:570-585`); an externally replaced token can produce a false success.
- **Minor:** The added tests do not cover a second repoint arriving during execution, shared-root retain/release, home-slot refresh, or failed-admission queue recovery (`http-mcp-server.service.concurrency.spec.ts:345-395`; `message-sender.service.spec.ts:948-977`).

## Data flow

1. Renderer dispatch checks streaming/start state and queues later prompts: **OK for immediate duplicate sends** (`message-dispatch.service.ts:106-135`).
2. Sender marks the tab streaming, calls `chat:start`, and on timeout holds the start guard for a margin: **gap on failed late admission** (`message-sender.service.ts:669-725`).
3. Host starts MCP server and asks for subagent registration: **OK bounded queue wait** (`http-mcp-server.service.ts:548-568`).
4. The queue registers active-root slots: **gap for home slots** (`http-mcp-server.service.ts:603-605,660-669`).
5. Workspace events request full reconcile: **gap for events during an active pass** (`http-mcp-server.service.ts:398-400,425-445`).
6. Root release removes owned slots: **gap for multiple owners** (`http-mcp-server.service.ts:725-737`).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Fast active-root path | PARTIAL | URL shape does not prove usable credential. |
| Three-second deadline | COMPLETE | Timer cleanup and race rejection handling are present. |
| Root-scoped registration/release | PARTIAL | Home refresh disappears; shared root ownership remains unsafe. |
| Coalesced full reconcile | PARTIAL | A request during active work is lost. |
| Slow-step timing | COMPLETE | `registerInSlot` logs prepare/write/commit durations at `http-mcp-server.service.ts:982-1009`. |
| Per-tab duplicate start guard | PARTIAL | Immediate duplicate is held; failed admission has no recovery. |

Implicit requirements not addressed: bounded recovery after ambiguous host admission; per-session root ownership.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Queue promise rejects after deadline | YES | `Promise.race` observes it (`http-mcp-server.service.ts:564-567`). | None observed. |
| Deadline timer cleanup | YES | `finally` clears it (`http-mcp-server.service.ts:565-567`). | None observed. |
| Map deletion during release iteration | YES | JavaScript Map iteration tolerates deletion of current key (`http-mcp-server.service.ts:733-737`). | No skipped existing key observed. |
| Stop while queued registration waits | YES | `stopped` guard inside queued job (`http-mcp-server.service.ts:590-594`). | Already running write still completes before stop joins queue. |
| Change during active repoint | NO | Pending promise reused (`http-mcp-server.service.ts:425-426`). | Needs another pass. |
| Same root retained twice | NO | Set has one membership (`http-mcp-server.service.ts:695-696`). | First release removes it. |

## Decisions

- Treated a timed-out start with no eventual binding as a real failure case. Evidence: the renderer timeout branch leaves streaming state set, and the follow-up pump requires a bound session. Reversible: yes, by adding admission reconciliation.
- Classified the shared-root ownership issue as major despite predating this diff because the requested root-scoped release must preserve concurrent session use. Reversible: yes.

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM
- Top risk: A workspace change during a slow active reconcile is silently lost, leaving stale registrations.
- What a robust implementation would add: dirty-pass repoint coalescing, root retention ownership, and a terminal recovery path for ambiguous timed-out starts.

Verification: Reviewed the uncommitted diff, task context, relevant method bodies, slot planner, follow-up queue, and added test cases. No source edits or test run. Scoped Ptah diagnostics were unavailable because the TypeScript check exceeded its 45-second response window; neither changed file was checked.
