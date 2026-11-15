# Lane brief round 3 — TASK_2026_1189_56c4 (D2/D3 only)

Worktree: D:\projects\ptah-extension\.claude-worktrees\fix-session-lifecycle-handoff-a49b5b532596.
The rules of lane-brief.md still apply: no `npm run verify`, no `nx`, no build/serve/e2e, no commit, no push,
no `git stash`. Run only `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand
--coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`, `npx eslint <files>`.
No `any`, `@ts-ignore`, `as unknown as`, no console.*, no silent error swallow. Never weaken permission or
report-authorization checks.

Scope: D2/D3 in session-handoff.* and, only if finding B proves it necessary, agent-report-router.service.ts.
D13 (stop) is OUT of scope: PR #1286 owns it. Do not edit session-spawner.* files.
Review to fix: .ptah/specs/TASK_2026_1189_56c4/review-round-2.md.

A. Two successors (High). The 5-minute reconciliation must never release the predecessor reservation while
   the host start is still unsettled. New rule: reconciliation with no successor found reverts the adoption
   (lanes and children go back to the caller) and logs it, but the reservation stays until `attempt` settles.
   A retry in that window is refused with the existing in-flight refusal. If `attempt` then succeeds after the
   revert, record the ack and remember the successor, but do not re-adopt; log that adoption was reverted.
   If it fails, release the reservation. Specs: hung start + reconcile absent + retry refused; then late
   success after revert records the ack, keeps the reservation consumed, and does not re-adopt.
B. Report delivery after adoption (High). First write a spec with the real report router
   (agent-report-router.service.ts) and a child adopted by a successor: the successor tab is active, the
   adapter knows the successor by its tab id and by its SDK id. Show whether a child report is delivered.
   If it is delivered, keep the router unchanged and record the spec as proof. If it is refused, fix delivery
   through the verified tab<->SDK binding while the owner check stays, and test both identities.
C. Ack recovery (High). Resolve the canonical handoff path (realpath) during validation, before the start,
   and keep the complete record in memory before persistence. Recovery accepts the predecessor tab id or SDK
   id. Specs: handoff file removed after start, then acknowledge succeeds; acknowledge by predecessor SDK id
   recovers an unpersisted record.
D. Retention (Medium). Keep a predecessor's reservation only while the predecessor lives: remove it when the
   predecessor session ends (find the session-ended signal the service already gets or the lifecycle/registry
   event). Specs: retry after more than 64 handoffs is still refused; after the predecessor ends the entry is
   gone.

Do NOT change `isError` in session-tool-handlers.ts (decision: a timeout is not a fault; the detail tells
the caller not to start another).

At the end run every spec in libs/backend/cli-agent-runtime/src/lib/session-children/ plus
agent-report-router.service.spec.ts, both tsconfigs and eslint on changed files. Append "## Round 3" to
fix-report.md: per item the design, file:line, spec names, commands with pass/fail counts, open limits.
