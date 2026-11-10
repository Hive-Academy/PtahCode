# Code-logic review — TASK_2026_911_21b3

Verdict: **APPROVED** — 1 Moderate and 1 Minor finding; no mainline path fails the
requirement. The Moderate finding is a narrow race with a bounded recovery (the runtime
cap); it should be fixed in a follow-up, not a merge blocker.

Scope reviewed: the committed diff `main...HEAD` (54 files, `.ptah/specs/**` skipped),
read in full for `session-spawner.service.ts`, `session-child.registry.ts`,
`session-child-succession.ts`, `session-spawner.port.ts`,
`session-handoff.service.ts`, `session-control.service.ts`,
`session-lifecycle-manager.ts`, `sdk-agent-adapter.ts`,
`chat-stream-broadcaster.service.ts`, `session-tool-handlers.ts` and the B4 call-site
table in `batch-4-report.md`. Decisions 12–20 treated as intended behaviour; each was
checked against the code. No build/test commands were run (scoped verify already passed
for agent-sdk, shared, memory-curator, gateway-chat-bridge, cli-agent-runtime,
vscode-lm-tools, rpc-handlers).

## Findings

1. **Moderate — a session-ended grace that defers to a child-handoff succession can
   leave a dead child live with no recovery owner until the runtime cap.**
   `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:970-977`
   (`onGraceExpired`), with the failure path at `session-spawner.service.ts:1526-1532`
   (`succeed`) and `:1613-1622` (catch/finally).
   Scenario: the child's SDK session dies mid-turn with a succeed-routed cause (for
   example `provider-error`) while its `ptah_session_handoff` tool call is executing.
   The 30 s grace expires while that child-handoff succession is still in flight, so
   `onGraceExpired` returns on `succession-in-progress` ("another succession owns the
   outcome"). The child-handoff succession then fails: its refusal is returned to a
   tool call in a dead session, `revertSuccession` restores the predecessor as live,
   and no path ends it — no grace timer (expired), no retire timer (armed only on
   success). The record shows a live child (`starting`) whose session is dead, its
   reverted lanes keep the dead session as parent, and the parent gets no signal,
   until the runtime cap fires (default up to 120 min) and starts a recovery successor.
   Smallest fix: in `onGraceExpired`, on `succession-in-progress` re-arm a bounded
   re-check (60 s, like `onHandoffGraceExpired` at `:1477-1480`) instead of returning,
   so the outcome is re-evaluated after the owning succession settles; the existing
   terminal and `succeeding` guards keep it idempotent.

2. **Minor — a lane that completes inside a failed succession's adoption window loses
   its completion signal to the dead predecessor.**
   `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1615`
   (`settleLaneAdoption(adopted, 'reverted')`) and `:1495-1502` (`adoptToParent`).
   Scenario: with the `session-ended` cause, a running lane finishes while
   `startOnHost` is awaited; its completion signal is held. The successor start fails,
   the revert sends the held signal to `previousParent` — the predecessor session that
   is already dead — and `endOutside` → `adoptToParent` then re-adopts only lanes with
   `status === 'running'`, so this finished lane keeps the dead predecessor as parent
   and the parent session never receives its completion signal (the lane's work and
   files are unaffected). The same window exists between a `runtimeSafetyNet` revert
   and its `adoptToParent`.
   Smallest fix: when `settleLaneAdoption` reverts to a `previousParent` whose session
   is no longer active, route the held signal to that session's parent instead (or have
   the revert settlement skip signalling and let `adoptToParent`/`endOutside` deliver
   held signals for finished lanes adopted in the same window).

## Checked and correct

- Runtime cap: warning at `cap - runtimeWarnLeadMinutes` is a peer message with no
  admission option, so a mid-turn child holds it queued and an idle child starts a turn
  (`sdk-agent-adapter.ts:1838-1860`, never an interrupt). Idle child at the cap gets a
  successor at once; busy child continues and gets one at turn end (`onTurnEnded`
  capReached branch before the lane check, `session-spawner.service.ts:858-861`); at
  `cap + handoffGraceMinutes` the host interrupts with `parent-stop` and succeeds
  (`onHandoffGraceExpired`). Only a failed start or `maxSuccessions` gives `timed-out`
  via `runtimeSafetyNet`, and lanes move to the parent there.
- Race guards: `runtime.succeeding` is set synchronously before the first await in
  `succeedChild`, so cap timer, tool-driven handoff and session end racing each other
  cannot start two successors; `hostSucceed` skips the safety net for
  `succession-in-progress`; every exit path (`stop`, `endOutside`, `runtimeSafetyNet`,
  `retirePredecessor`, `succeedChild` per-cause branches, `failStart`, `dispose`)
  clears all five timers; `dispose` clears runtimes and the `retiring` set.
- Registry: `succeed`/`revertSuccession` keep the slot (`liveCount` unchanged),
  `resolveLatest` is cycle-safe (seen set + 64 hops ≥ max chain 50), `findByCwd`
  prefers the live record so predecessor and successor in one worktree cannot bind
  each other's turn events, and the terminal guard plus `markEnded` idempotence keep
  late predecessor events (turn end, session end) from settling or ending the wrong
  record.
- End-cause routing: `parseSessionEndCause` normalises every notify; `user-stop`
  (child tab abort `chat-session.service.ts:2333`, `/clear`
  `chat-slash-command-router.service.ts:239,244`, Ptah CLI abort
  `chat-ptah-cli.service.ts:296`), `parent-stop` (spawner interrupts, handoff
  `stopCaller`, slash record replacement, knowledge-agent reprime), `workspace-close`
  and `host-shutdown` all stay stopped (`routeSessionEndCause`); every other cause
  succeeds under `maxSuccessions`. No user-driven end was found left at `unknown` or
  `stream-exit`: the resume and slash dead-record cleanups (`:2618`, `:2915`) use
  `stream-exit` but re-register and cancel the grace in `onSessionIdResolved`
  (`:904-909`); `session:delete` and tab close end no SDK session at all;
  `subagent:interrupt` goes to the subagent dispatcher, not the session end chain.
  Gateway keeps `stream-exit` per decision 20 and no child record matches its ids.
- The spawner's own stop paths all pass `parent-stop` and set `runtime.stopping` before
  the end signal (`stop:752-758`, `interruptInBackground:1378`,
  `onHandoffGraceExpired:1486`, `retirePredecessor`, `runtimeSafetyNet`), so none can
  start a successor of itself.
- Succession record: new tab id, same worktree/branch/parent/task folder/deliverables,
  fresh cap (`readSessionChildSettings` re-read), `successionCount` bounds the chain at
  `maxSuccessions` (0 restores the old stop), and the failed-start catch reverts
  adoption, policy, MCP root and link without touching the worktree or provisioner.
- Tool-driven handoff: `session-handoff.service.ts` delegates to `ISessionSpawner.succeed`
  after `checkHandoffFile` (absolute, in an open folder); refusal mapping covers all
  five codes; the child's own handoff path is used (decision 16) and the successor
  prompt carries the stale-file caution (decision 17).
- One parent signal: `settle('handed-off')` fires once per succession;
  `sessionChildVerdictOf` returns `unverified` for it and the envelope names the
  successor (`lane-completion-notifier.service.ts:196,278-280`). The old child id
  forwards to the successor for `ptah_session_*` via `resolveOwned`/`resolveLatest`.
- `handed-off` needs no new consumer branch: both outside consumers
  (`vscode-lm-tools` session tool handlers, namespace builder) print the status string
  and `endedAt`, and the status tool description documents it; `IAgentAdapter` cause
  parameters are optional, so existing implementers stay assignable.
- Silent failure: every new catch in the spawner and handoff service carries the
  `degradation-audit:` comment; no new `console.*`, `any` or unexplained
  `as unknown as` (the registry's `as unknown as` deletes are the pre-existing
  `markEnded` pattern). Host-shutdown resumability is the parent-approved follow-up
  (decision 6b), so `dispose()`'s sync `stopped` sweep was left unchanged.
