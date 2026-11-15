# Lane brief — TASK_2026_1189_56c4 (session lifecycle: D2, D3, D13)

Worktree: D:\projects\ptah-extension\.claude-worktrees\fix-session-lifecycle-handoff-a49b5b532596 (branch
fix/session-lifecycle-handoff; Nx monorepo, TypeScript, Jest). Code: libs/backend/cli-agent-runtime/src/lib/session-children/.
Root-cause notes (may be partly wrong; verify against code): d2-handoff-timeout-root-cause.md,
d3-reports-and-children-lost-root-cause.md, d13-stop-but-alive-root-cause.md, root-causes-found.md (this folder).

## Check rules (mandatory; machine RAM is limited)

Do NOT run `npm run verify`, `nx`, build, serve or e2e. Run only:
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec paths>`
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` (and `tsconfig.spec.json`)
- `npx eslint <changed files>`

Do NOT commit, push or open a PR. Edit only libs/backend/cli-agent-runtime and this task folder (plus MCP tool
description text that lists handoff refuse codes, if any). Never weaken permission enforcement. No `any`,
`@ts-ignore` or `as unknown as`. Use the injected logger, no console.*. Never swallow errors silently.
Do not use `git stash`. Electron is the priority host; keep platform-cli and cli-engine compiling (update every
implementer if you change a port).

## State

Commit 565f6e5f7 added a broken fix. The working tree has an uncommitted partial rework of
session-handoff.service.ts (TIMED_OUT branch near line 405). Keep what is right, fix the rest.

## D2/D3 — session-handoff.service.ts, TIMED_OUT branch after `withDeadline(attempt, SESSION_HANDOFF_START_TIMEOUT_MS)`

(a) No fixed sleeps or deadlines for the late start. On TIMED_OUT, attach a continuation to `attempt` that runs
whenever it settles. On ok: remember(), settleAdoption('kept'), ackStore.record(). On failure:
settleAdoption('reverted'). Do not await it in the request path. Every rejection reaches reportError. Adoption
always ends 'kept' or 'reverted' and never stays pending.
(b) successorSdkId reads `this.pending.get(tabId)` after `this.pending.delete(tabId)`, so it is always null. Take
the real sdk id from the attempt result, or capture it before the delete.
(c) The timeout result must be truthful: the caller must learn that the successor may still start and must not
start another. Use a distinct refuse code (for example `session-start-timeout`) with a detail like "the successor
may still start; do not start another handoff; check session status". Update the result types and code unions,
and any tool description text that lists refuse codes (search the repo for `session-start-failed`).
(d) One successor per predecessor: a second handoff for the same predecessor while the first attempt is in
flight, or after a late success, must return or refuse with the existing successor and must not start a new
session.
(e) A successor that acknowledges (session-handoff-ack.service) after a late start must find the record. Children
adopted by the successor must route to it, so child reports reach the successor parent and do not get
`parent-session-not-active`. Read session-child.registry.ts and session-child-succession.ts for adoption and
report routing; fix the gap the notes describe if it is real.

## D13 — stop-but-alive

ptah_session_stop marks a child stopped while its SDK session keeps running turns. Find where stop resolves IDs
(childSessionId vs sdkSessionId / tabId) in session-spawner.service.ts and the registry. Make stop end the running
SDK session and the registry entry of the same session, and make status show the real state. If the note's root
cause is wrong, document the real one.

## Tests

Add specs next to the code (extend session-handoff.service.spec.ts, session-spawner*.spec.ts,
session-child.registry.spec.ts as fits):
- late success after timeout records the ack and keeps adoption
- late failure reverts the adoption
- a second handoff during the in-flight attempt starts no second session
- successorSdkId is the real id
- the timeout refuse code is distinct
- stop ends the SDK session (D13)

Each new spec must fail on the code of commit 565f6e5f7 and pass after the fix. Show this by reasoning from the
diff, or by a temporary one-line revert, a rerun and a restore. At the end, run every spec in
libs/backend/cli-agent-runtime/src/lib/session-children/ with the jest command above.

## Deliverable

Write `.ptah/specs/TASK_2026_1189_56c4/fix-report.md`: the real root cause per defect (file:line), the changed
files, the design of each fix, the spec names, each jest/tsc/eslint command with pass/fail counts, and anything
you could not fix.
