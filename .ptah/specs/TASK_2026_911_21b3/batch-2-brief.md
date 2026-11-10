# Batch B2 brief — TASK_2026_911_21b3

Spawner state machine for "child session succession". Edit, do not explore. Read only the files
named here, plus a file that a type error names.

Worktree (stay inside): `D:\projects\ptah-extension\.claude-worktrees\fix-session-runtime-cap-handoff-39238e08cd52`
Folder `S` = `libs/backend/cli-agent-runtime/src/lib/session-children/`.

**Deliverable**: `.ptah/specs/TASK_2026_911_21b3/batch-2-report.md` — write a skeleton first,
fill it at the end: files changed, behavior per section below, spec cases added, extra files
read, `## Decisions`, `## Not done`.

## Background

A child session is hard-stopped today when its wall-clock runtime cap fires
(`onRuntimeExceeded` in `S/session-spawner.service.ts`). New behavior: the cap never interrupts
work. A SUCCESSION replaces the live child (predecessor) with a successor child: a new chat
session (new tab id) in the SAME worktree and branch under the SAME parent. Batch B1 already
added the building blocks. READ FIRST: `.ptah/specs/TASK_2026_911_21b3/batch-1-report.md`
(exported symbols, and the list "Status usages outside the write set").

B1 building blocks (already in the code, do not change their signatures):

- `S/session-spawner.port.ts`: status `'handed-off'`, `SessionChildSuccessionCause`,
  `SessionChildSuccessionRequest`, `SessionChildSuccessionResult`,
  `SessionChildSuccessionRefusalCode`, snapshot fields `succeeds`, `succeededBy`,
  `successionCount`.
- `S/session-child.registry.ts`: `succeed(predecessorId, successor, reason, endedAt?)`,
  `revertSuccession(predecessorId, successorId)`, `resolveLatest(id)`.
- `S/session-child-succession.ts`: `sessionChildHandoffPath`, `runtimeWarnDelayMs`,
  `renderRuntimeCapWarning`, `renderSuccessorTask`, `successionEndReason`.
- `S/session-child-settings.ts`: `runtimeWarnLeadMinutes`, `handoffGraceMinutes`,
  `maxSuccessions` on `SessionChildSettings`.

## Write set (only these files)

1. `S/session-spawner.service.ts`
2. `S/session-spawner.port.ts` — ONLY: add to `ISessionSpawner`
   `succeed(request: SessionChildSuccessionRequest): Promise<SessionChildSuccessionResult>;`
   with a doc comment.
3. NEW `S/session-spawner.succession.spec.ts`
4. `S/session-spawner.service.spec.ts` — only the runtime-cap block (near lines 1367-1403), the
   grace block (near 1273-1365) where the end reason text changes, and shared test helpers.
5. The completion notifier that implements `signalSessionChild` and its spec (find it with ONE
   search for `signalSessionChild(` in `libs/backend/cli-agent-runtime/src`): map settle status
   `'handed-off'` to verdict `unverified` and a text that names the successor.
6. Files from the B1 list "Status usages outside the write set" that are inside
   `libs/backend/cli-agent-runtime` and need a `'handed-off'` branch (exhaustive switch or
   record). Hits in other projects: list them in the report, do not edit.
7. Other test doubles of `ISessionSpawner` inside `libs/backend/cli-agent-runtime` (add `succeed`).

Do NOT edit `S/session-handoff.service.ts`, `libs/backend/vscode-lm-tools/**`, skills or docs
(batch B3 owns them).

## Read set in `session-spawner.service.ts`

`ChildRuntime` (top of file), `start`/`guardStart`/`provisionAndStart` (239-429), `send`
(497-578), `stop` (713-752), `dispose` (803-817), event handlers and `settle` (823-1063),
helpers (1096-1213), `releaseResources`/`releaseBudget`/`clearTimers`/`armRuntimeCap`/`armGrace`
(1300-1402), `failStart`, `retainMcpRoot`, `startOnHost`, `interruptInBackground`.
Lane adoption API: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`
lines 2289-2367 (`adoptLanes(fromIds, toSessionId): string[]`,
`settleLaneAdoption(agentIds, 'kept' | 'reverted')`). If the spawner's `agents` port type does
not expose these two methods, add them to that port interface (report the file).

## Required behavior

### 1. Runtime state

`ChildRuntime` gains: `settings: SessionChildSettings` (as read at start), `permissionLevel?`,
`model?`, `warnTimer?`, `handoffGraceTimer?`, `capReached: boolean`, `succeeding: boolean`.
`clearTimers` clears the new timers too. `provisionAndStart` fills the new fields.

### 2. Timeline

- `armRuntimeCap` arms two timers: the warning at `runtimeWarnDelayMs(settings)` and the cap at
  `maxRuntimeMinutes`.
- Warning (`onRuntimeWarning`): when the child is live and not stopping, send
  `renderRuntimeCapWarning({ minutesLeft: runtimeWarnLeadMinutes, graceMinutes:
  handoffGraceMinutes, handoffPath: sessionChildHandoffPath(child) })` to the child with
  `adapter.sendMessageToSession` in the same queued, non-interrupting way `send` does it
  (origin kind `peer`, name `Ptah host`). No live session id → log and skip. A send failure is
  logged with a `degradation-audit: reported` comment; it never ends the child.
- Cap (`onRuntimeExceeded`), child live:
  - `successionCount >= settings.maxSuccessions` → safety net (section 5).
  - Else set `capReached`. Child idle (`statusOf(child) === 'idle'`) → host-driven succession
    with cause `runtime-cap` now. Otherwise do NOT interrupt and do NOT mark the child ended:
    arm `handoffGraceTimer` (`handoffGraceMinutes`).
- `onTurnEnded` / `onTurnFailed`: when `runtime.capReached` and the event has no background
  tasks → host-driven succession (`runtime-cap`) instead of the normal settle, also while CLI
  lanes run (the successor adopts them). With background tasks: keep waiting.
- Grace expiry (`onHandoffGraceExpired`), child still live and not succeeded: await
  `adapter.interruptSession` for the live id (failure logged, continue), then host-driven
  succession with cause `runtime-cap-interrupted`.

### 3. Succession core (one private method used by both drivers)

Input: predecessor record, cause, optional continuation `prompt`, optional `label`.

1. Refuse when the host is disposed, the predecessor is terminal/unknown, `runtime.succeeding`
   is set (`succession-in-progress`), the count reached `maxSuccessions`
   (`max-successions-reached`), or `lookupHost()`/adapter is missing
   (`chat-runtime-unavailable`). Set `runtime.succeeding = true`; clear it on every exit path.
2. Build the successor record: new `SessionId.create()` id; copy `parentSessionId`,
   `parentSdkSessionId`, `label` (or the given label), `taskId`, `branch`, `baseRef`,
   `workspaceRoot`, `worktreePath`, `taskFolder`, `deliverables`, `subagentPtahTools`, `task`,
   and `startedAt` (KEEP the predecessor's value: deliverable freshness compares against it).
   Counters start at 0. No `sdkSessionId`.
3. `registry.succeed(predecessorId, successor, successionEndReason(successorId, cause))`.
4. Successor runtime: same `worktree`, fresh `policyFor(...)`, same `permissionLevel`/`model`,
   fresh `readSessionChildSettings(this.workspace)`; `policies.register`, `retainMcpRoot`.
5. `adopted = agents.adoptLanes([predecessorId, predecessor.sdkSessionId], successorId)`.
6. Check whether the handoff file exists (use the file-system access the file already uses;
   else `node:fs/promises` `access`). `startOnHost` with
   `composeSessionChildPrompt(contract, renderSuccessorTask({...}))`, the contract rendered as
   in `provisionAndStart` (parent label `session <parentSessionId>`), the successor descriptor,
   `sessionName` = label, and the remembered permission level and model.
7. Start failed or threw: `settleLaneAdoption(adopted, 'reverted')`, release the successor's
   policy and MCP root, delete its runtime, `registry.revertSuccession(predecessorId,
   successorId)`, return `session-start-failed` with the error text. NEVER call `failStart`
   here: it rolls back the worktree, and the worktree holds the predecessor's work.
8. Start succeeded: `settleLaneAdoption(adopted, 'kept')`, arm cap + warning for the successor,
   `releaseBudget(predecessorId)`, send the parent ONE signal for the predecessor through the
   `settle` path with status `'handed-off'` (the notifier text names the successor id; give the
   notifier the id through an optional field if it needs one). Then retire the predecessor
   (section 4). Log one line. Return `{ ok: true, successor: snapshot, adoptedLanes, tabOpened }`.

No step commits, stashes, reverts, cleans or copies files. The worktree is never touched.

### 4. Predecessor retirement

After `registry.succeed` the predecessor is terminal, so `liveChildForEvent` ignores its events.

- Host-driven: set `stopping`, clear its timers, `releaseResources(predecessorId)`,
  `interruptInBackground(predecessorId)` (ends the old session, keeps its tab).
- Tool-driven (`succeed` public method; the predecessor is inside the tool call): keep its
  policy and MCP root until its turn ends. Track it as "retiring". When a turn-ended or
  turn-failed event arrives for a retiring child (match tab id or SDK id BEFORE
  `liveChildForEvent`), or after a 60 s fallback timer, do the host-driven retirement steps.
  `dispose` clears the fallback timers.
- Verify in `session-child.registry.ts` that `findByCwd` cannot return the terminal predecessor
  for the shared worktree path while the successor is live. If it can, report it under
  `## Not done` (the registry is outside this write set) and guard in the spawner.

### 5. Safety net (last resort)

Used when `maxSuccessions` is reached at the cap, or a host-driven succession fails. Old
behavior (`timed-out`, release, interrupt) plus:

- Re-parent the child's running lanes to the PARENT:
  `adoptLanes([childId, sdkId], child.parentSessionId)` then `settleLaneAdoption(ids, 'kept')`.
- End reason: `exceeded the <N>-minute runtime cap (agentSessions.maxRuntimeMinutes); automatic
  handoff failed: <detail>; uncommitted work is kept in <worktreePath>; <k> running lane(s)
  moved to the parent session`.
- A failed host-driven succession at the cap while the child is IDLE goes to the safety net at
  once. A failed one at turn end or grace expiry also goes to the safety net.

### 6. Public `succeed(request)` (tool-driven)

Resolve the caller: `registry.get(callerSessionId)` must be a live child, else
`not-a-live-child`. Run the core with cause `child-handoff`, `request.prompt`, `request.label`.
A refusal leaves the predecessor running and unchanged (if `capReached`, its grace timer still
runs).

### 7. Old id forwards to the successor

`resolveOwned`: after the ownership check, when the record has `succeededBy`, continue with
`registry.resolveLatest(childSessionId)`. So `ptah_session_send/status/read/stop` with the old
id act on the newest child of the chain. `snapshotOf` includes `succeeds`, `succeededBy`,
`successionCount`.

### 8. "Ended outside the spawner" path (`onGraceExpired`)

Batch B4 (parallel lane, `libs/backend/agent-sdk`) adds `cause: SessionEndCause` to
`SessionEndPayload` (`session-end-callback-registry.ts`; exported from `@ptah-extension/agent-sdk`
with `parseSessionEndCause(value: unknown): SessionEndCause`). Union: `'user-stop' |
'parent-stop' | 'stream-exit' | 'provider-error' | 'config-reinit' | 'workspace-close' |
'compaction-abort' | 'host-shutdown' | 'unknown'`. If the field is not in the file yet when you
work, code against this contract (read `payload.cause` through `parseSessionEndCause`).

- `onSessionEnd`: remember the cause on the runtime (`endCause`), log it, arm the 30 s grace as
  today.
- `onGraceExpired` (session did not come back):
  - Cause `user-stop`, `parent-stop`, `workspace-close` or `host-shutdown` → a stop stays a
    stop: status `ended`, running lanes re-parented to the parent as in section 5, end reason
    `ended outside the spawner (<cause>); uncommitted work is kept in <worktreePath>` plus
    `; <k> running lane(s) moved to the parent session` when k > 0.
  - Every other cause, INCLUDING `unknown` (log a warning line that names the unknown cause) →
    host-driven succession with a NEW succession cause `'session-ended'`, under the same
    `maxSuccessions` limit. No interrupt is necessary (the session is gone). The successor
    prompt is the recovery prompt: the previous session ended unexpectedly (`<end cause>`), the
    last command may need to run again, no handoff file may exist.
  - Succession refused or failed (also `max-successions-reached`) → status `ended` as in the
    first bullet, the reason also says `automatic successor failed: <detail>`.
- For this you may edit two B1 files, additively only: add `'session-ended'` to
  `SessionChildSuccessionCause` in `S/session-spawner.port.ts`, and extend
  `renderSuccessorTask` / `successionEndReason` in `S/session-child-succession.ts` (+ spec) with
  the `session-ended` wording and an optional `endCause?: string` input.
- The pure routing decision (`cause` → `'stop' | 'succeed'`) goes in
  `session-child-succession.ts` as an exported function with a spec case per cause.
- A spawner `stop()` and the cap paths set `runtime.stopping`, so their own session ends never
  reach this routing (keep that).

Spec cases to add (number 11 below becomes these): each stop cause → `ended`, no successor,
lanes to the parent; `stream-exit`, `provider-error`, `config-reinit`, `compaction-abort` and
`unknown` → successor child in the same worktree with the recovery prompt, predecessor
`handed-off`; `unknown` logs; a re-registered session inside the grace → nothing happens;
successor start failure → `ended` with the failure detail and lanes to the parent;
`maxSuccessions` reached → `ended`. Update the existing spec assertions on the old reason text.

## Specs (`session-spawner.succession.spec.ts`, style and harness of the existing spec file)

Read the first 150 lines of `session-spawner.service.spec.ts` for the harness; export/reuse
helpers rather than copy 100+ lines when possible. Use Jest fake timers as that file does. Cases:

1. Warning: sent at `cap - warnLead` as a queued peer message; the child stays live.
2. Cap + idle child → successor live in the same worktree/branch/parent; predecessor
   `handed-off` with `succeededBy`; `liveCount` unchanged; fresh cap armed for the successor.
3. Cap + busy child → no interrupt, child still live; turn end → succession.
4. Cap + busy, lanes running at turn end → succession; `adoptLanes` called with predecessor
   ids → successor id; `settleLaneAdoption(…, 'kept')`.
5. Grace expiry while busy → `interruptSession` called, then succession with
   `runtime-cap-interrupted` (successor prompt contains the interrupted wording).
6. Host-driven start failure → safety net: `timed-out`, reason contains "work is kept", lanes
   adopted to the parent, `revertSuccession` effect (successor unknown), worktree rollback NOT
   called.
7. `maxSuccessions` 0 → safety net at the cap; chain count limit with `maxSuccessions` 1.
8. Tool-driven `succeed`: ok result, predecessor retired at its turn end and by the 60 s
   fallback; refusals `not-a-live-child`, `succession-in-progress`; start failure → predecessor
   live and unchanged.
9. Parent signal: one `signalSessionChild` call with status `handed-off` for the predecessor.
10. Forwarding: `status`/`send`/`stop` with the predecessor id act on the successor.
11. `onGraceExpired`: lanes re-parented to the parent, new reason text.

Replace the old runtime-cap spec block (it asserts the hard stop) with assertions of the new
behavior or delete the cases that the new spec file covers.

## Rules

- TypeScript strict: no `any`, no `@ts-ignore`, no `as unknown as`. No `console.*` (use
  `this.log`). Every intentional error swallow needs a `// degradation-audit: reported - …`
  comment like the existing ones. Keep methods small; `session-spawner.service.ts` is already
  large, so put pure decisions in `session-child-succession.ts` if you need new ones (that file
  may gain functions, with spec cases).
- You cannot run Jest, lint or typecheck in your sandbox. Do NOT run `npm`, `npx`, `nx`, build,
  serve, dev, e2e or package commands. The orchestrator runs
  `npm run verify -- -p cli-agent-runtime`. Never workspace-wide checks.
- Product focus is the Electron host; this lib is host-neutral and must stay so (no `vscode`
  or `electron` imports).
- Git: never commit, push, restore, checkout, stash, reset or clean. Report a change you did
  not make; never revert it.
- Reply: `WROTE: <absolute deliverable path>` plus one headline line, nothing else.
