# Independent code-logic review brief — TASK_2026_911_21b3

You review the committed task diff (`git diff main...HEAD`). You wrote none of it. Read-only: change no source
file. Write only the deliverable.

Worktree (stay inside): `D:\projects\ptah-extension\.claude-worktrees\fix-session-runtime-cap-handoff-39238e08cd52`

**Deliverable**: `.ptah/specs/TASK_2026_911_21b3/code-logic-review.md`. Write a skeleton first.
Final content: verdict (`APPROVED` / `REVISE`), then numbered findings, each with severity
(Blocking / Serious / Moderate / Minor), `file:line`, the failing scenario in one or two
sentences, and the smallest fix. Then `## Checked and correct` (short list). No style findings.

## What the change must do

Requirement: nothing ever hard-stops a child chat session mid-work. A "child session" is a chat
session in a git worktree run by `SessionSpawnerService`
(`libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts`).

1. Runtime cap (`agentSessions.maxRuntimeMinutes`): at `cap - runtimeWarnLeadMinutes` the host
   sends a queued peer message (never an interrupt). At the cap: an idle child gets a successor at
   once; a busy child continues and gets one at its turn end; at `cap + handoffGraceMinutes` the
   host interrupts and starts a successor with a recovery prompt. Only a failed successor start
   or `maxSuccessions` gives the old `timed-out` stop, and then running lanes move to the parent.
2. Succession: a NEW child record (new tab id) in the SAME worktree and branch under the SAME
   parent; slot transfer (`SessionChildRegistry.succeed` / `revertSuccession` / `resolveLatest`);
   lane adoption (`adoptLanes` + `settleLaneAdoption` kept/reverted); fresh cap; predecessor ends
   `handed-off`; the old child id forwards to the successor for `ptah_session_*`; one parent signal
   (verdict `unverified`, names the successor). A failed start must never roll back or delete the
   shared worktree.
3. `ptah_session_handoff` from a child (`session-handoff.service.ts`) delegates to
   `ISessionSpawner.succeed` instead of the `child-session` refusal.
4. End cause: `SessionEndPayload.cause` (`libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts`,
   Zod enum, `parseSessionEndCause`). After the 30 s end-grace, `user-stop`, `parent-stop`,
   `workspace-close`, `host-shutdown` → child `ended`, lanes to the parent. Every other cause,
   `unknown` included → successor with a recovery prompt, under `maxSuccessions`.

Design and decisions: `implementation-plan.md`, `decisions.md` in the task folder. Reports of the
implementers: `batch-1-report.md` .. `batch-4-report.md` (B4 has the call-site table of causes).

## How to read the diff

Run `git diff --stat main...HEAD` then `git diff main...HEAD -- <path>` per file (new files: read them). Skip
`.ptah/specs/**`. Core files, in order of risk:

1. `session-spawner.service.ts` (succession, timers, end-cause routing)
2. `session-child.registry.ts`, `session-child-succession.ts`, `session-spawner.port.ts`
3. `session-handoff.service.ts`
4. `agent-sdk`: `session-end-callback-registry.ts`, `session-control.service.ts`,
   `session-lifecycle-manager.ts`, `sdk-agent-adapter.ts`
5. `rpc-handlers`: `chat-stream-broadcaster.service.ts`, `chat-session.service.ts`,
   `chat-slash-command-router.service.ts`, `chat-ptah-cli.service.ts`
6. `vscode-lm-tools` session tool handlers; `lane-completion-notifier.service.ts`

## Look hard at

- A user stop that reaches the spawner with a non-stop cause (it would restart a session the
  user stopped). Check every `user-stop` path in the B4 call-site table, tab close and session
  delete included. Is any user-driven end left at `unknown` or `stream-exit`?
- A normal end: does a child whose stream exits after it COMPLETED its work get a needless
  successor? Does the spawner's own stop / cap / retire path pass `parent-stop`, or set
  `runtime.stopping` before the end signal, so it cannot trigger a successor of itself?
- Races: cap timer vs tool-driven `succeed` vs session end at the same time (`succeeding`,
  `capReached`, `retiring`, timers cleared on every exit, no double successor, no timer left
  armed on a terminal child, `dispose` clears all timers).
- Slot and budget accounting across `succeed` / `revertSuccession`; successor chains and
  `maxSuccessions` (0 = old behavior); `resolveLatest` cycles.
- Lane adoption on each failure path: no lane left with a dead parent, no lane adopted twice.
- Events of the predecessor (turn end, session end) that arrive after the hand-off: can they
  settle or end the wrong record? `findByCwd` with two records for one worktree.
- The predecessor's stream still running while the successor starts in the same worktree.
- Callers of each changed export outside the diff (`ptah_lsp_references`): `IAgentAdapter`
  implementers and `ISessionSpawner` test doubles, `SessionChildStatus` consumers that lack a
  `handed-off` branch (webview, shared RPC types).
- Silent failure: swallowed errors without the `degradation-audit:` comment, `any`,
  `as unknown as`, `console.*`.

## Rules

- Do NOT run `npm`, `npx`, `nx`, Jest, build, serve, dev, e2e or package commands. The
  orchestrator runs `npm run verify -- -p <projects>` (scoped; never workspace-wide).
- Product focus is the Electron host.
- Git: read-only commands only. Never commit, push, restore, checkout, stash, reset or clean.
- Reply: `WROTE: <absolute deliverable path>` plus one line with the verdict.
