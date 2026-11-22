# Code Logic Review — `TASK_2026_2297_agy` (commit 3afcdc016)

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6.5/10         |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 3              |
| Moderate issues     | 8              |
| Failure modes found | 11             |

Scope read in full: `provider-session-composition.ts`, `provider-session-orphan-sweep.ts`, `provider-session-pid-ledger-store.ts`, `provider-session-binding-registry.ts`, `bootstrap.ts` and `shutdown.ts` diffs, `native-chat-core-composition.ts`, the `ipc-bridge.ts` permission branch, `provider-session-pool.ts`, `-open-request.ts`, `-start-options.ts`, `-chat-options.ts`, `-chat-host-ports.ts` diff, `acp-provider-session-runtime.ts`, `acp-event-hub.ts`, `acp-prompt-content.ts`, `acp-mcp-servers.ts`, the antigravity profile, the `acp-session-runtime.ts` diff, `provider-session-turn-files.ts` and the adapter, queue, controls and turn-stream diffs, `antigravity-sign-in.ts` and the adapter diff, the rpc-handlers auth, session, provider, connection-check and llm diffs, and the renderer diffs for chat-view, message-sender, resume notice, provider registry and settings. I ran the pool and start-options specs (51 tests pass). I did not run the app or the gate.

Boot safety: no defect found. Every null default is a `useFactory: () => null` (`libs/backend/agent-sdk/src/lib/di/register.ts:1075-1092`, `libs/backend/rpc-handlers/src/lib/chat/di.ts:146-150`). `PROVIDER_SESSION_RELEASE` has no default but is `@inject(..., {isOptional:true})` with a `= null` parameter default (`session-rpc.handlers.ts:379-380`). The binding is built inside its own try/catch (`bootstrap.ts:665-697`). `finishElectronNativeChatCore` registers all five tokens in one synchronous step and the catch path disposes the unregistered binding. The tokens resolved at bind time (WEBVIEW_MANAGER, CLI_DETECTION_SERVICE, metadata store, spawner) are the same ones the Codex binding resolves at the same stage.

## Five logic questions

### 1. How does this fail silently?

- A failed or timed-out agent close drops the pid from the ledger first, so the survivor is never swept (S1). `provider-session-pool.ts:384-396`.
- If agy does not carry the `session/new` system-prompt append across `session/resume` or `session/load`, every restored session silently loses the Ptah identity, memory, user system prompt and output style (S2). Nothing detects it.
- `PROVIDER_SESSION_PTAH_MCP_HINT` says the `ptah` server is attached when the credential mint failed (the pool opens without Ptah tools and only warns) or the MCP server stopped between prepare and open. `provider-session-start-options.ts:155-158`, `provider-session-pool.ts:484-490`, `provider-session-open-request.ts:104`. The model is told to prefer tools that do not exist.
- Windows `cmdkey` output that does not contain the target twice reads as `signed-out` and the row says unauthenticated. Any query error reads as signed-in. `antigravity-sign-in.ts:93-100`.

### 2. What user action produces unexpected behaviour?

- Selecting a history session whose entry is `resume` and idle closes the live agent and reopens it with `load` and no user MCP, tool profile or instructions. `provider-session-pool.ts:196-205`. The next send then reopens it again if `openOptionsKey` differs (user MCP present, apps profile, or policy-disabled Ptah MCP). That is two cold starts of about 1 GB each.
- Quitting Ptah while the first prompt of a new tab is still opening the agent leaves a live, unrecorded agy (S3).
- A user MCP server with a non-http(s) URL aborts the whole chat start with `unsupported-option` instead of dropping that server. `provider-session-start-options.ts:187-191`.
- Closing the tab before the first turn ends can leave a native id that agy never persisted, so the next resume fails. The user sees the resume-failed notice (see Moderate 6).

### 3. What input data produces a wrong answer?

- A workspace file reference that is a symlink or junction inside the workspace but swapped after `realpath`. The check validates the canonical path, then sends the lexical `path` (`provider-session-turn-files.ts:31-33`). The agent resolves the link again at read time.
- A user MCP server named `ptah_lane` is not filtered (only `ptah` is) and collides with the agent-side name of Ptah's server. `antigravity-acp-profile.ts:79,241-243`, `provider-session-open-request.ts:130`.
- Instructions that go through the prompt-prefix fallback are a user turn. A later `session/load` replay will show the `<ptah-session-instructions>` block as user text in the transcript (affects profiles without `instructionsMeta`, not agy 1.5.14 with the hook).

### 4. What happens when a dependency fails?

- Keyring query failure, timeout or `maxBuffer` overflow rejects, and `ensureTokensFresh` answers `true` (optimistic). Bounded at 5 s. OK. `antigravity-cli.adapter.ts` ensureTokensFresh.
- Ledger write failure is logged and the pool continues. OK (`provider-session-pid-ledger-store.ts:63-72`).
- The orphan sweep failing (CIM query error) keeps the rows for the next start and never blocks boot. OK. A hung PowerShell query has no timeout, so the promise stays pending, which is harmless.
- Credential port failure opens the session without Ptah tools. OK, but see the hint issue above.
- Harness sync failure continues with a warning (as Claude chat). OK.
- `pool.dispose` exceeding 2 s: shutdown continues and the close is already in flight (`shutdown.ts:455-461`). Fine only if the ledger row survived (S1).

### 5. What is missing that the requirements never mentioned?

- No abort of in-flight opens on `pool.dispose`, and no pid recorded before the open resolves.
- No verification, live or in a spec, that instructions survive `session/resume`.
- No memoisation of the `cmdkey` probe. It spawns a process on every `auth:getAuthStatus` and every connection check.
- No ledger flush at shutdown (the store has `flush()` but nothing awaits it).

## Failure modes

### Close that fails or times out loses its ledger row

- Trigger: `closeEntry` removes the pid from the ledger before `closeSession` runs, then `closeProcess` times out at 5 s or `session.close()` throws.
- Symptom: agy (about 1 GB, detached) outlives Ptah and is never swept. `shutdown.ts:103-108` states the opposite ("one that outlives the budget is swept on the next start").
- Evidence: `provider-session-pool.ts:384-396` (remove, then `await this.closeSession`), `:402-422`, `acp-provider-session-runtime.ts:222-232` (the `late` outcome only logs).
- Current handling: log lines only.
- Recommendation: remove the row only after the exit is confirmed. Have `closeProcess` report timeout or failure and keep the row in that case. At shutdown, a late row is exactly what the next-start sweep needs.

### In-flight open is unrecorded and not aborted at dispose

- Trigger: the user quits, or the host crashes, between `acp.start()` spawning agy and `open` resolving (cold start, `session/load` replay up to 90 s).
- Symptom: orphan agy with no ledger row. After a clean quit with an open in flight, `dispose()` only closes `entries` and the open continues until the host dies.
- Evidence: `provider-session-pool.ts:264-312` (`recordPid` runs only after `runtime.open` resolves), `:197-210` and `:218-221` (dispose closes entries and sets `disposed`, no abort of openings).
- Current handling: a late-resolving open is closed if the host is still alive.
- Recommendation: give each open an internal `AbortController` that `dispose` aborts (the runtime already maps abort to `lifetime.abort()`). Record the pid at spawn through a runtime callback.

### Instructions assumed durable across resume and load

- Trigger: restart Ptah, or a pool re-acquire with `attach`, for a session created with `_meta.antigravity.systemPrompt.append`.
- Symptom: if agy rebuilds its system prompt on `session/resume` or `session/load`, the session runs with no Ptah identity, no memory and no user system prompt. Silent.
- Evidence: `provider-session-open-request.ts:162-166` and `acp-session-runtime.ts` `pendingInstructions` (never sent when `restoredContext`), `provider-session-start-options.ts:174-176` (`resumed` returns no body). The live probe in `agy-acp-probe.md` covers `session/new` only; "the agent already holds them" is untested.
- Recommendation: add a live probe (resume, then ask for the marker). If agy does not persist it, pass the same `_meta` on `session/resume` and `session/load`, or deliver the prefix once per process.

### cmdkey sign-in heuristic

- Trigger: localized or different `cmdkey /list` heading; credential stored under another target; env var set in a shell that is not the host env.
- Symptom: stored credential with count 1 reads `signed-out`; settings show Antigravity unauthenticated while agy works. Also `process.env` is read, but the agent spawns with `laneAcpBaseEnv` (same env, so consistent).
- Evidence: `antigravity-sign-in.ts:97-100`.
- Recommendation: treat an ambiguous heading as `unknown`, not `signed-out`. Cache the result for a short TTL.

### File reference race and canonical path

- Evidence: `provider-session-turn-files.ts:25-33` sends `path`, not `real`.
- Recommendation: send the canonical path (`real`) in the resource link.

### Re-open on history adopt

- Evidence: `provider-session-pool.ts:196-205`, `:526-534` (see Q2).

### Prompt prefix visible in replay

- Evidence: `acp-session-runtime.ts` `acpInstructionsPrefix`. Not hit by agy 1.5.14 (hook advertised).

### Unverified resume of a zero-turn session

- Evidence: the native id is reported at `onSessionResolved` before any prompt. If agy does not persist empty sessions, a restart before the first turn ends in `resume-failed`.

### Stale hint on the Ptah MCP

- Evidence: see Q1. The hint says "`ptah` ... ptah_* tools", while agy names the tools `mcp_ptah_lane_<tool>` (`antigravity-acp-profile.ts:79`).

### One bad user MCP server aborts the start

- Evidence: `provider-session-start-options.ts:187-191`.

### Ledger writes not flushed at quit

- Evidence: `shutdown.ts:455-461` never calls the store's `flush()`. A dropped write leaves stale rows. Harmless because of the start-time check, but it costs a CIM snapshot every start.

## Blocking issues

None.

## Serious issues

### S1. Ledger row removed before the agent is confirmed dead

- File: `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-pool.ts:384-396`
- Scenario: any close whose `session.close()` throws or exceeds `PROVIDER_SESSION_CLOSE_TIMEOUT_MS` (idle sweep, eviction, release, shutdown). The row is already gone.
- Impact: orphan agy processes of about 1 GB stay alive across restarts and are never swept. The shutdown comment promises the opposite.
- Fix: remove the row after a confirmed exit only. Keep it when `closeProcess` times out or fails.

### S2. System-prompt delivery on restored sessions is an untested assumption

- File: `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts` (`pendingInstructions`, `createSession`), `provider-session-open-request.ts:162-166`
- Scenario: app restart, history reopen, or pool re-acquire with `attach` of a session whose instructions went through `session/new` `_meta`.
- Impact: Ptah context (identity, memory, user system prompt, output style) can be silently absent after the first restart. This is the "same Ptah context as Claude and Codex" requirement.
- Fix: live probe for resume and load. If agy drops the append, send the same `_meta` on resume and load.

### S3. Opening agent is unrecorded and survives `pool.dispose`

- File: `provider-session-pool.ts:197-221` (dispose), `:264-312` (`open`, `recordPid`)
- Scenario: quit or crash during agy cold start or history replay.
- Impact: an untracked 1 GB detached agy per occurrence.
- Fix: abort in-flight opens from `dispose`. Record the pid at spawn.

## Moderate and minor issues

1. Moderate: history adopt double spawn. `provider-session-pool.ts:196-205` and `mustReopen` at `:526-534`.
2. Moderate: `ptah` MCP hint can be false. `provider-session-start-options.ts:155-158` and `:104` of `provider-session-open-request.ts`.
3. Moderate: file path TOCTOU. `provider-session-turn-files.ts:31-33`.
4. Moderate: Windows sign-in false negative and a `cmdkey` spawn per status call. `antigravity-sign-in.ts:93-100`.
5. Moderate: a non-http user MCP server fails the whole start. `provider-session-start-options.ts:187-191`.
6. Moderate: resume of a session agy may never have persisted. `acp-session-runtime.ts` `onSessionResolved`.
7. Moderate: user MCP name `ptah_lane` collides with agent-side Ptah name. `provider-session-open-request.ts:130`, `antigravity-acp-profile.ts:241`.
8. Moderate: the pid ledger flush is not awaited at shutdown. `shutdown.ts:455-461`.
9. Minor: stale comment in `provider-session-auth-status.ts:20-23` (says Antigravity omits `ensureTokensFresh`; it no longer does).
10. Minor: `ProviderSessionOpenRequestDeps.baseEnv` says "credential-free" but `laneAcpBaseEnv` is `{...process.env, ...CLI_CLEAN_ENV}` (`lane-acp-spawn.ts:20-22`); host secrets reach the agent, as in the lane.
11. Minor: `acquire` in `provider-session-chat-host-ports.ts` records the in-flight token set per session but a final release of one session id does not affect other ids by design. Fine; noted only for the test gap on `releaseAll` while an acquire runs.

## Data flow

1. Renderer start or send, then `chat:start` config. `check()` rejects unknown keys. OK. `accountSelection` and `providerProfile` are set only for `claude-sdk` (`chat-session.service.ts:1923-1937`).
2. `prepare`: runtime profile, then `startOptions.resolve` (capability policy, harness sync, memory, user MCP). OK. Instructions only when `stored` is undefined. OK (but see S2).
3. `acquire`: `openRequests.request` builds nothing, the pool mutex takes the id, `mustReopen` decides. OK. Credential minted per open under a `#n` subject and revoked on every close or failure path. OK.
4. `build`: CLI detection, saved permission level, Ptah MCP with token in the header (never logged), `instructions` only when `!context.attach`. OK.
5. `runtime.open`: spawn, handshake, `session/new` with `_meta`. The pid is recorded only after open (S3).
6. Prompt: images capped (10, `MAX_IMAGE_SIZE_BYTES`, strict base64), files confined by lexical then canonical check. OK (path caveat above).
7. Approvals: runtime to relay sink to chat sink; no owner means `cancel`. Renderer reply goes `ipc-bridge` Codex ports, then provider-session ports, then Claude handler. Prompt ids are looked up per owner (`takePrompt`), so there is no cross-claim. OK.
8. Close: pool `closeEntry` (S1), credential revoked in `finally`. OK. Shutdown: `disposeAfterPersistence` step with 2 s budget.
9. Next start: ledger rows swept only when the live process start time falls in `[startedAt-120 s, startedAt+1 s]`. OK. A reused pid cannot match because the original agy held the pid at `startedAt`.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Boot never broken by a binding failure | COMPLETE | None found |
| Approvals never auto-granted | COMPLETE | Chat has `autoApprove:false` and an owner-less relay cancels. `antigravitySkipsPermissions` returns false for `consumer==='chat'` (`antigravity-acp-profile.ts:105-110`); yolo maps to agy `auto` mode only. |
| Credential issue/revoke per open | COMPLETE | None found |
| History adopt reopen | PARTIAL | Works, but costs a double spawn (Moderate 1) |
| Orphan sweep only kills matching processes | COMPLETE | Start-time window sound |
| Pid ledger covers every agent | PARTIAL | S1, S3 |
| Close bounds | COMPLETE | 5 s per entry, 2 s shutdown budget |
| Instructions only on new sessions | COMPLETE | No duplication on resume/load/adopt (`context.attach` guard) |
| Same Ptah context after restart | PARTIAL | S2 unverified |
| Memory blocks, user MCP mapping, policy filter | COMPLETE | `isMcpServerEnabled` applied; `ptah` never taken from the user |
| File-link confinement | PARTIAL | Lexical path sent, not canonical (Moderate 3). Windows drive/UNC handled: `relative()` yields an absolute path across drives and is refused. |
| Image caps | COMPLETE | |
| Renderer: shown only when host reports profile | COMPLETE | Registry entries filtered by status row |
| Auth banner never calls Codex sign-in | COMPLETE | `chat-view.component.ts` branches to `checkProviderSessionSignIn` |
| Resume-failed never automatic | COMPLETE | The user chooses `startNewSession` |
| Registry loops refuse provider-session | COMPLETE | api-key, ptah-cli, llm, curator, background, add-cli-instance filtered; `sdk-model-service` `new URL('')` is inside try/catch |
| Sign-in check never prints/reads secrets | COMPLETE | Presence only, stdout never logged |

Implicit requirements not addressed: shutdown flush of the ledger; abort of in-flight opens at dispose; the `cmdkey` probe cache.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Binding throws at boot | YES | try/catch, Claude and Codex continue | None |
| Null-default tokens | YES | `useFactory: () => null` | None |
| Process exits idle | YES | `requireOpen` throws `process-exited`, the pool re-acquires with attach | None |
| Process exits mid-turn | YES | `terminal{failed, broken}` | None |
| Two ledger writers | YES | Serial promise chain, `previous` kept until settled | Flush at quit missing |
| Pid reuse | YES | Start-time window | None |
| Crash during open | NO | No row yet | S3 |
| Close times out | NO | Row already dropped | S1 |
| Windows UNC / other drive file ref | YES | Refused | None |
| Symlink inside the workspace swapped later | NO | Lexical path sent | Moderate 3 |
| Non-agy resume of empty session | UNKNOWN | | Moderate 6 |
| Localized cmdkey output | PARTIAL | Counts the target twice | Moderate 4 |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH. The pool, ledger and sweep were read in full and the pool specs pass. S2 and Moderate 6 depend on agy behaviour I could not observe.
- Top risk: agy processes (about 1 GB each, detached) that Ptah loses track of, through a close that fails after its ledger row was already dropped or an open in flight at quit.
- What a robust implementation would add: keep the ledger row until exit is confirmed; abort in-flight opens in `dispose` and record the pid at spawn; a live probe for instruction persistence on resume and load (with `_meta` on resume or load as the fallback); canonical path in resource links; a TTL cache and an `unknown` outcome for ambiguous `cmdkey` output; an await of `ledger.flush()` in the shutdown step.
