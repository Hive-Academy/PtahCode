# Code Logic Review — `TASK_2026_2331_f700` (round 3)

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 6/10     |
| Assessment          | REVISE   |
| Blocking issues     | 0        |
| Serious issues      | 1        |
| Moderate issues     | 0        |
| Failure modes found | 1        |

Score is 6 because three of the four fixes hold on the paths that matter, and the Codex guard holds inside one service instance. It is below 7 because a new `SessionHandoffService` drops `failedRuntimeClose`, then `retireCaller` treats a missing Codex row as a finished stop and the tab closer is told the predecessor stopped. It is above 5 because the provider-pool fixture now supplies `policy`, a shared Claude SDK id is `ambiguous` at the Electron resolver, and a pre-bind Claude tab id is refused by cron, harness, worktree capture, and session organization.

No source edits. Re-ran `session-handoff-ack.service.spec.ts`: 17 passed. Did not re-run the other suites named in `ci-and-threads-fix-report.md`. No `code-style-review.md` was present. `platform-cli` and `cli-engine` are not in the diff. `ptah_grep` for `LiveChatSession` in those two trees returned no matches. `provider-session-open-request.ts` is unchanged in `git diff HEAD` (CRLF warning only); production already sets `policy` at `provider-session-open-request.ts:261`.

## Decisions

- The in-memory Codex failure flag is a serious gap, not an accepted scope limit. Options were to approve because `ci-and-threads-fix-report.md` says the guard "tracks retries within the running service", or to send it back because the ack store is the retry record that survives a new service. Evidence: `armed` is a process-local `Map` (`session-handoff.service.ts:161`, write at `1276`), while `SessionHandoffAckStore.transition` persists `closePending` (`session-handoff-ack.store.ts:411`). Electron registers `LIVE_CHAT_SESSION_RESOLVER` for the life of the host (`phase-2-libraries.ts:260`). After restart the Codex map is empty, so `resolve` is `unresolved`, the flag is absent, and `retireCaller` returns at `session-handoff.service.ts:1248`. The existing restart spec does not inject that resolver (`session-handoff-ack.service.spec.ts:190`). Reversible: store the failed runtime on the ack record and keep failing the stop until a runtime close succeeds.

- `SessionRegistry.find` staying last-writer is not a defect of this fix. The Electron resolver calls `findMatches` (`phase-2-libraries.ts:264`). `find` (`session-registry.service.ts:503`) is the single-record lookup lifecycle operations already used.

## Five logic questions

### 1. How does this fail silently?

Inside one service, a failed Codex `closeSession` that drops the live row stays a `retryable-failure`. The next service instance does not. `failedRuntimeClose` is set only on the arm object (`session-handoff.service.ts:1262`) and restored only if that same object is still in `armed` (`session-handoff.service.ts:506`). A new instance builds a fresh arm (`session-handoff.service.ts:508`). `retireCaller` then sees `unresolved`, no Claude lifecycle row, and returns without throwing (`session-handoff.service.ts:1245`). `stopCaller` records the stop as successful (`session-handoff.service.ts:1293`). The next acknowledgement skips the runtime close and calls `closer.close` (`session-handoff.service.ts:531`). `SessionHandoffCloser` broadcasts `predecessorStopped: true` (`session-handoff-closer.ts:35`). The successor is told the predecessor stopped. The runtime close never succeeded.

### 2. What user action produces unexpected behaviour?

Successor calls `ptah_session_handoff` acknowledgement after Codex `closeSession` rejected and removed its live entry, then the host starts a new `SessionHandoffService` (app restart) while the ack record is still `closePending`. The successor acknowledges again. A later turn-flush notice takes the new arm. The stop is reported successful and the renderer is asked to close the predecessor tab.

The same-process loop the new spec locks in does not do that. A second flush throws `Handoff predecessor runtime is unavailable after a failed close` (`session-handoff.service.ts:1243`) and the tab closer is not called. That loop does not finish either: nothing in this process clears the flag or falls through to a successful close while the live row stays missing. Each flush fails the same way. That matches `session-handoff-ack.service.spec.ts:138`. It is fail-closed, not a false close.

### 3. What input data produces a wrong answer?

A shared Claude SDK id does not. `findMatches` returns every live tab whose `realSessionId` equals the spelling (`session-registry.service.ts:495`). The resolver returns `ambiguous` when `matches.length > 1` (`live-chat-session-resolver.ts:37`). Spawn then caps to `plan` (`ptah-api-builder.service.ts:802`). Attribution returns no id (`ptah-api-builder.service.ts:1286`).

A pre-bind Claude tab does not produce a stored canonical id. `toClaudeLiveChatSession` sets `sessionIdIsProvisional` only when `realSessionId === null` (`live-chat-session-resolver.ts:16`). `resolveCallerLiveSessionId` returns `undefined` for that flag (`ptah-api-builder.service.ts:1282`). Cron refuses (`cron-namespace.builder.ts:302`). Harness throws `HarnessProposalNoSessionError` (`harness-namespace.builder.ts:1132`). Worktree capture skips the recorder (`git-namespace.builder.ts:100`). Session organization returns `unattributed-caller` (`session-organization-namespace.builder.ts:133`). After bind, the mapper omits the flag and the same helper returns `realSessionId`.

The wrong answer is the restarted Codex handoff above: missing live row plus no flag is treated as a completed runtime stop.

An open request from the pool specs now includes `policy.permission` (`provider-session-pool.spec.ts:119`, `provider-session-pool.fake-acp.spec.ts` build). `ProviderSessionPool.openTracked` reads that field (`provider-session-pool.ts:385`). The fixture matches `ProviderSessionOpenRequest` (`provider-session.types.ts:75`).

### 4. What happens when a dependency fails?

Codex `closeSession` rejection in the same service re-arms with `failedRuntimeClose` and the acknowledgement returns `retryable-failure` (`session-handoff.service.ts:1273`). A second attempt does not call `closeSession`, `lifecycle.endSession`, or the tab closer while the row is gone. A new service forgets the rejection, as in question 1.

`lifecycle.endSession` failure still does not set `failedRuntimeClose`. That flag is assigned only in the non-Claude `closeSession` catch (`session-handoff.service.ts:1261`). A Claude stop can be retried by calling `endSession` again. The new-service resume spec covers that closer path and does not inject a resolver (`session-handoff-ack.service.spec.ts:205`).

A resolver throw in `resolveCallerLiveSessionId` is caught and returns `undefined` (`ptah-api-builder.service.ts:1293`). Cron and harness refuse. They do not write the tab id.

### 5. What is missing that the requirements never mentioned?

The failure bit is not on the durable ack record. `transition` only patches state, successor SDK id, and `keepPredecessor` (`session-handoff-ack.store.ts:414`). `armCallerStop` (`session-handoff.service.ts:1212`) still replaces an arm without copying `failedRuntimeClose`. It has no caller in this tree. Artifact publish still stores `session.tabId` for a provisional Claude row (`protocol-dispatcher.ts:2895`). That path is outside the four recorders named for this fix, and the tab remains resolvable for workspace scope (`protocol-dispatcher.ts:2891`).

`SessionRegistry.find` still returns `byTabId` or the single `bySessionId` entry (`session-registry.service.ts:503`). `bindRealSessionId` overwrites that entry (`session-registry.service.ts:475`). The live resolver does not use `find`.

## Failure modes

### Restarted handoff treats a failed Codex close as a finished stop

- Trigger: Codex `closeSession` rejects after the adapter has dropped the live row. The ack record stays `closePending`. A new `SessionHandoffService` is constructed with the Electron resolver still registered and the Codex map empty. An acknowledgement arms a stop, and a flush notice arrives.
- Symptom: The successor acknowledgement proceeds to the tab closer with `predecessorStopped: true`. The runtime close is not retried. If the Codex process is still alive, the UI is told it stopped.
- Evidence: `session-handoff.service.ts:506`, `session-handoff.service.ts:1242`, `session-handoff.service.ts:1276`, `session-handoff.service.ts:1293`, `session-handoff.service.ts:531`, `session-handoff-closer.ts:35`
- Current handling: The flag lives on the in-memory arm. The same service preserves it when `callerSdkId` is unchanged and throws if the live runtime no longer matches. A new service has no flag, and an `unresolved` result with no Claude row returns success.
- Recommendation: Persist the failed runtime on the ack record. On every retry, including a new service, keep the stop failed until `closeSession` for that runtime succeeds. Do not take the `unresolved` success return after a recorded runtime-close failure.

## Blocking issues

None.

## Serious issues

### Failed Codex close is invisible to the next handoff service

- File: `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1248`
- Scenario: `closeSession` has already failed and the live Codex row is gone. The process that stored `failedRuntimeClose` is gone, or a new `SessionHandoffService` is handling the same `closePending` record. The resolver returns `unresolved`.
- Impact: The handoff reports the predecessor stopped and asks the renderer to close the tab. The runtime teardown that failed is not retried. This is the false success the in-memory guard was added to stop, on the retry path the durable ack store exists for.
- Fix: Record the failed runtime in the ack store. `retireCaller` must throw when that marker is set and the live runtime is missing or different, including when `armed` was just created. Add a spec that builds a second service with a resolver that returns `unresolved` and expects `retryable-failure`, no `closer.close`, and `closePending`.

## Moderate and minor issues

None beyond the serious issue above.

## Data flow

1. Pool tests build a `ProviderSessionOpenRequest` with `policy.permission` before `openTracked` reads it (`provider-session-pool.ts:385`). OK.
2. `findMatches` scans every live tab for `realSessionId` (`session-registry.service.ts:495`). Two owners become `ambiguous` (`live-chat-session-resolver.ts:37`). OK for the Electron resolver.
3. `toClaudeLiveChatSession` marks `realSessionId === null` provisional (`live-chat-session-resolver.ts:16`). The row is still returned, so artifact cwd and handoff lookup still see the tab. OK.
4. `resolveCallerLiveSessionId` returns `undefined` while the flag is set (`ptah-api-builder.service.ts:1282`). Cron, harness, git capture, and session organization all call that helper (`ptah-api-builder.service.ts:924`, `1010`, `1018`, `1061`). OK. `getParentLevel` still reads `permissionLevel` from the provisional row (`ptah-api-builder.service.ts:802`). OK.
5. Codex `closeSession` failure sets `arm.failedRuntimeClose` and rethrows (`session-handoff.service.ts:1262`). The same service keeps that arm (`session-handoff.service.ts:506`) and the next flush fails closed (`session-handoff.service.ts:1242`). OK inside one instance.
6. A new service creates an arm without the flag. `retireCaller` returns success for `unresolved` with no Claude row (`session-handoff.service.ts:1248`). Gap. The tab closer then runs (`session-handoff.service.ts:531`).

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Provider pool fakes supply `policy` so `openRequest.policy.permission` is defined | COMPLETE | Both specs build a typed request. Production builder already set `policy`. |
| Two Claude tabs sharing a canonical id do not resolve to one owner | COMPLETE | `findMatches` plus resolver `ambiguous`. `find` remains last-writer and is not the resolver path. |
| Pre-bind Claude tab ids stay out of cron, harness, worktree capture, and session organization | COMPLETE | Shared helper returns `undefined` while `sessionIdIsProvisional` is set. Those four callers refuse or skip. |
| Failed Codex predecessor teardown stays visible to handoff retries | PARTIAL | Visible to later flushes in the same service. A new service treats the missing row as a successful stop. |
| Electron, platform-cli, and cli-engine still work | COMPLETE | No diff in `platform-cli` or `cli-engine`. No `LiveChatSession` use there. The new field is optional. Electron resolver behavior is covered above. |

Implicit requirements not addressed: the ack record does not store which runtime close failed.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Two Claude tabs, one SDK id | YES | `findMatches` returns both; resolver is `ambiguous` | `find` still returns the `bySessionId` record |
| Lookup by one of those tab ids | YES | Tab hit is not duplicated; other tabs match only on `realSessionId` | A tab id equal to another tab's SDK id is `ambiguous` |
| Claude tab, `realSessionId` null | YES | Provisional flag; four recorders get no id; resolver still returns the row | Artifact publish still stores `tabId` |
| Claude tab after bind | YES | Flag omitted; helper returns the SDK id | None |
| Codex close fails, same service, row gone | YES | Flag kept; later flush throws; closer not called | Retries do not reach `closed` until the row returns and `closeSession` succeeds |
| Codex close fails, new service, row gone | NO | Fresh arm; `unresolved` returns success; closer runs | False stop |
| Claude `endSession` fails, new service | YES | No runtime flag; `endSession` runs again; resume spec expects the closer | Not the Codex disappearance case |
| Pool open without `policy` | YES | Specs now pass `policy`; pool reads `permission` | None |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: After a new handoff service starts, a Codex close that failed and dropped its live row is reported as a finished stop.
- What a robust implementation would add: Persist the failed runtime on the ack record, fail the stop on every retry until that runtime close succeeds, and cover a second service whose resolver stays `unresolved`.

Checked the uncommitted diff, the four call sites of `resolveCallerLiveSessionId`, `findMatches` against `phase-2-libraries.ts`, `retireCaller` against the ack store and `SessionHandoffCloser`, and the new handoff spec. Jest evidence is the one ack suite above (17 passed).
