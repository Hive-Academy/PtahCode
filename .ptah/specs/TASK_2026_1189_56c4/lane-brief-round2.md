# Lane brief round 2 — TASK_2026_1189_56c4 (review findings)

Worktree: D:\projects\ptah-extension\.claude-worktrees\fix-session-lifecycle-handoff-a49b5b532596.
Read lane-brief.md (same folder) first: its check rules, edit limits and coding rules still apply.
In short: no `npm run verify`, no `nx`, no build/serve/e2e, no commit, no push, no `git stash`.
Run only `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false
--runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>` and `npx eslint <changed files>`.
If you change a port, update every implementer (platform-vscode, platform-electron, platform-cli,
cli-engine, codex-runtime and others) and typecheck each changed project with its tsconfig.

The round-1 changes (uncommitted in the working tree) are kept. An independent review is in
.ptah/tmp/codex-review.md. Fix these findings:

1. Hung start. If the host start promise never settles after the timeout, adoption and the
   inFlight reservation stay pending forever. Add one long reconciliation bound (a named constant,
   for example 5 minutes, not the old 5 s wait). When it expires, ask the host/registry whether a
   successor session for the tab exists. If it exists, settle as a late success. If not, settle
   'reverted' and release the reservation. Report the outcome with reportError or the logger. Spec:
   a start that never resolves (fake timers).
2. Identity. bindAdoptedChildren stores the SDK id in both parent fields. Keep the successor tab id
   as the owner and add the SDK id as the second identity (read registry.reparent and how the report
   router, liveness, status and stop match a parent). Specs: report delivery, liveness, status and
   stop work through the tab id and through the SDK id.
3. Stop. markStopped must happen only after the SDK session really closed. If the adapter close is
   void/async, expose an awaitable close on the port (Promise<void>), await it, and on failure return
   a refusal (keep `interrupt-failed` or add a distinct code) and do not mark the child stopped.
   Spec with an async close that resolves later, and one that rejects.
4. Ack record write failure. A failed ackStore.record() after a late success leaves the successor
   unacknowledgeable. Retry the write a bounded number of times with backoff, and keep the record
   recoverable (for example the ack path falls back to the in-memory successor map). Spec: one
   transient write failure, then acknowledge succeeds.
5. Duplicate guard. Do not rely on the 64-entry history cache for one-successor-per-predecessor.
   Check the durable ack store (findBy predecessor) or keep the predecessor reservation for the
   predecessor's lifetime. Spec: evict the cache, retry the handoff, no second session.

Do NOT change `isError` for `session-start-timeout` in session-tool-handlers.ts (decision: a timeout
is not a fault).

At the end run every spec in libs/backend/cli-agent-runtime/src/lib/session-children/ and the specs of
any other project you changed. Append a "## Round 2" section to fix-report.md: per finding the
design, file:line, spec names, and each command with pass/fail counts.
