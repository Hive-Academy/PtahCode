# TASK_2026_911_21b3 — implementation plan

Source: `investigation-report.md` (same folder). Electron first; the code is host-neutral
(`libs/backend/cli-agent-runtime`), so VS Code gets the same behavior where the chat host port
exists.

## Root cause (short)

1. `onRuntimeExceeded` (`session-spawner.service.ts:949`) is a wall-clock timer that marks the
   child `timed-out`, releases its resources and interrupts the turn. No warning, no handoff,
   and the child's CLI lanes keep a dead parent id.
2. `ptah_session_handoff` refuses a child (`child-session`, `session-handoff.service.ts:302`).
   The session-budget banner still sends `/session-handoff` to a child, so the budget limit
   dead-ends for children too.
3. "ended outside the spawner" is `onGraceExpired` (`:923`): any SDK session end (stream error,
   config re-init, workspace close, user stop) plus 30 s without re-registration.
   `SessionEndPayload` carries no cause, so a user stop cannot be told from a fault.

## Design: child succession

A **succession** replaces a live child with a successor child: a new chat session (new tab id)
in the SAME worktree and branch, under the SAME parent, with the same task id, task folder,
deliverables, label, model and permission level. It takes the predecessor's slot (no cap check),
adopts its running lanes and held completions, and gets a fresh runtime cap.

### Timeline for the runtime cap

| Moment | Action |
| --- | --- |
| `cap - warnLead` | Host sends a queued peer message to the child: finish the current step, write `HANDOFF.md`, call `ptah_session_handoff`. Never interrupts. |
| Child calls `ptah_session_handoff` | Tool-driven succession (below). Normal path. |
| `cap`, child idle (no turn, no lane) | Host-driven succession at once. |
| `cap`, child busy | Overtime: no interrupt. Succession runs when the turn ends (`onTurnEnded`), also when lanes still run (the successor adopts them). |
| `cap + handoffGrace`, still busy | Last resort: interrupt the turn, then host-driven succession with a recovery prompt. |
| Successor start fails, or `maxSuccessions` reached | Safety net: today's `timed-out` stop, plus: lanes re-parented to the PARENT, end reason states that the work is kept in the worktree. |

No path deletes or reverts files. The worktree, branch and uncommitted work are never touched.

### Succession mechanics (spawner)

1. Build the successor record from the predecessor record + remembered start options
   (`ChildRuntime` gains `permissionLevel`, `model`, `settings`, `successionCount`).
2. `registry.succeed(predecessorId, successorRecord)`: atomic slot transfer; predecessor gets
   terminal status `handed-off` and `succeededBy`; successor gets `succeeds`.
3. Register policy, retain MCP root, `agents.adoptLanes([predId, predSdkId] → successorId)`,
   move `heldCompletion`.
4. `startOnHost` with `composeSessionChildPrompt(contract, continuationTask)`. The continuation
   task names the predecessor, the original task, `HANDOFF.md` (when it exists), the adopted
   lane ids, and tells the successor to inspect `git status` / `git diff` first.
5. Success → `settleLaneAdoption(confirm)`, arm cap + warning for the successor, end the
   predecessor (tool-driven: after its turn ends, 60 s fallback; host-driven: immediately),
   notify the parent.
6. Failure → revert adoption, `registry.revertSuccession`, predecessor continues (tool-driven:
   tool returns a refusal) or goes to the safety net (host-driven at grace expiry).
7. Parent notice: one completion signal for the predecessor with new settle status
   `handed-off` (verdict `unverified`, text names the successor id). `resolveOwned` follows
   `succeededBy`, so the old child id keeps working for `ptah_session_send/status/read/stop`.

### Tool-driven succession

`SessionHandoffService.guardAndStart`: a child caller is no longer refused. It validates the
handoff file as today, then delegates to `ISessionSpawner.succeed({ childSessionId,
handoffPath, prompt, label })` and maps the result to `SessionHandoffResult`
(`adoptedLanes` filled, `adoptedChildSessions` empty). This also repairs the session-budget
limit path for children (context/token budget → `/session-handoff` → succession).
The successor does not call `ptah_session_handoff_ack`; the spawner ends the predecessor.

### Settings (`session-child-settings.ts`)

| Key | Default | Range |
| --- | --- | --- |
| `agentSessions.runtimeWarnLeadMinutes` | 10 | 1..60, clamped below `maxRuntimeMinutes` |
| `agentSessions.handoffGraceMinutes` | 15 | 1..120 |
| `agentSessions.maxSuccessions` | 8 | 0..50 (0 = old hard stop) |

### "Ended outside the spawner" path

Changed on parent instruction (2026-11-10, plan approval): this path is in scope now.

- Batch B4 adds `cause: SessionEndCause` to `SessionEndPayload` (agent-sdk): `user-stop`,
  `parent-stop`, `stream-exit`, `provider-error`, `config-reinit`, `workspace-close`,
  `compaction-abort`, `host-shutdown`, `unknown`. Typed union from a Zod enum;
  `parseSessionEndCause` normalizes the value in `notifyAll`. Every `endSession` /
  `interruptSession` / dispose call site passes its cause (`batch-4-brief.md`).
- Spawner (B2): after the 30 s grace, `user-stop`, `parent-stop`, `workspace-close` and
  `host-shutdown` stay a stop (`ended`, lanes re-parented to the parent, reason names the
  worktree). Every other cause, `unknown` included (logged), starts a successor child with a
  recovery prompt (succession cause `session-ended`), under `maxSuccessions`.
- A failed successor start ends the child as `ended` with the failure detail; lanes go to the
  parent; work stays in the worktree.

## Batches

| # | Scope | Files (write set) | Executor |
| --- | --- | --- | --- |
| B1 | Settings, status types, registry succession, pure helpers | `session-child-settings.ts`, `session-spawner.port.ts`, `session-child.registry.ts`, new `session-child-succession.ts`, `session-child-contract.ts`, their specs, `index.ts` | Glm |
| B2 | Spawner timeline + succession + ended-path lane re-parent | `session-spawner.service.ts`, new `session-spawner.succession.spec.ts`, runtime-cap block of `session-spawner.service.spec.ts`, notifier status mapping | Glm (codex fallback) |
| B3 | Tool path + texts | `session-handoff.service.ts` + spec, `vscode-lm-tools` session tool texts/handlers + specs, `.claude/skills/session-handoff/SKILL.md`, agent-lanes §9, docs "Agent Sessions" page, settings schema where the keys are declared | Glm |

Verify (orchestrator only): `npm run verify -- -p cli-agent-runtime` after B1/B2, then
`npm run verify -- -p cli-agent-runtime,vscode-lm-tools` (+ any other project a batch touched,
and the Electron DI guard specs if a registration changes). One independent code-logic review
on the whole diff by a different family (codex if room, else antigravity), one fix round.

## Acceptance

1. A child at the cap is never interrupted while a turn runs, until `handoffGrace` expires.
2. At every cap outcome except the safety net, a successor child runs in the same worktree and
   branch under the same parent, owns the predecessor's running lanes, and has a fresh cap.
3. The parent receives one signal that names the successor; the old id still resolves.
4. A child's `ptah_session_handoff` call succeeds through succession.
5. The safety net and the `ended` path never leave lanes with a dead parent.
6. Specs cover: warning send, idle succession, overtime succession at turn end, grace-expiry
   succession, start-failure safety net, `maxSuccessions`, slot accounting, lane adoption,
   `resolveOwned` forwarding, tool-driven succession, `ended` lane re-parent.
