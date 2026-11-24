# Status — TASK_2026_2312_c3ef

Reports that `ptah_agent_report` did not deliver (reason: unattributed-caller) are written here.

## 2026-11-23 13:01 UTC — batch update (B2 checks, B3)

- B2 inner loop: memory-curator related tests exit 0. Lint and typecheck for memory-curator and
  memory-contracts exit 0. persistence-sqlite passed before.
- Environment fix: this worktree had no `node_modules`. Suites that import `marked` failed to
  load, because `jest.preset.js` maps `marked` to `<worktree>/node_modules`. I added the
  git-ignored link `node_modules -> /home/amun/ptah-extension/node_modules`, as other worktrees
  have. All test cases of the earlier run passed (workspace-intelligence 690, thoth-runtime 27).
  Only two suites failed to load for this reason.
- B3 indexer (codex): scope predicate in the full run and in `reindexFile` (containment, excludes,
  nested `.git` ancestor, ignore files inside the lock, JS twin). Fingerprint skip inside the lock,
  before the runtime gate. A fresh record only when both stats agree and the outcome is analyzed.
  Force bypass. `filesSkippedUnchanged`. `markRootValidated` after a complete run. Lane checks:
  87 tests pass, tsc lib and spec exit 0, ESLint 0 errors.
- Running: workspace-intelligence related tests, then lint and typecheck. B4 (Ollama Code) runs
  at the same time on memory-curator, rpc-handlers, thoth-runtime and vscode-lm-tools.

## 2026-11-23 14:05 UTC — batch update (B3 fixes, B4, reviews started)

- All four batches are implemented (uncommitted).
- B3: two coordinator fixes. (1) The new `reindexFile` guard rejected drive-letter paths on
  POSIX (existing fixture `D:/census-ws`). It now accepts `path.isAbsolute` or
  `path.win32.isAbsolute`. (2) Two old integration-spec doubles got
  `isIgnoredForIndex: async () => false`. Indexer specs pass (98), php/ruby/cpp spec passes.
  workspace-intelligence lint and typecheck exit 0.
- B4 (Ollama Code): reindex without `filePath` forces. The lazy run never forces. The control
  service forwards the caller's `force`, so a forced start that joined a boot census keeps
  `force` for the follow-up. Resume never forces. Lazy staleness: `symbolCount === 0` and
  `validatedAt` null. Lane checks: 59 + 37 + 48 + 29 tests pass, tsc exit 0.
- Running: B4 inner loop (memory-curator, rpc-handlers, thoth-runtime, vscode-lm-tools). G7
  harness (real store and sqlite-vec on temp copies, census of this worktree). Independent
  review: Claude code-logic-reviewer on the full diff (the 9 revision 3c points), codex lane on
  the coordinator-written parts.
- Next: review fixes, full gate, live test in an isolated Electron instance, commit, push, PR.

## 2026-11-23 14:06 UTC — status to parent (sent by SendMessage)

- B4 inner loop running. G7 store part done: A1 cold 71 parsed / 971 embedded / 19.8 s;
  A2 restart 0 parsed / 71 skipped / 0 embedded / 0.12 s; A3 one edit 1 parsed / 0 embedded;
  B1 second root same content 71 parsed / 0 embedded (reuse); A4 forced 71 parsed / 0 embedded.
- G7 census of this worktree: run 1 in progress (before: 4,769 parsed, 50,287 texts, 1,547 s).
- Reviews (Claude full diff, codex coordinator parts) in progress.
- The parent may merge with the admin flag after a clean review and green CI. This session
  does not merge. Messages follow at PR open and at CI green.

## 2026-11-23 (3rd successor coordinator)
- Final inner loop green: related tests 6/6 Nx tasks; lint + typecheck 13/13 tasks.
- Final code-logic review (Claude subagent): APPROVE 8/10, 0 blocking, 0 serious, 5 moderate
  (follow-ups). See `code-logic-review.md`.
- Live test in isolated HOME + Electron dev build: PASS (`live-test.md`). Cold run indexed only
  `src/a.ts` + `src/b.js`; restart skipped both files with rows unchanged.
- G7 census (3 runs) in progress; full gate after it.

### Gate and delivery (3rd successor coordinator, cont.)
- G7 census finished: restart 30 parsed / 4,741 skipped / 14.9 s vs cold 1,295 s (`g7-results.md`).
- Full gate: lint+typecheck 19/19 succeeded. Test phase: 17/19; cli-engine failed once and passed
  on re-run (31/31 suites, flaky). rpc-handlers: 1 failure in
  `plugin-rpc.handlers.session-notice.spec.ts` (file not touched by this task). Cause: a stray
  `/tmp/.claude/` directory (created 15:48 by another session) makes `resolveHarnessWorkspaceRoot`
  return `/tmp` for the spec's `/tmp/ptah-plugin-notice-project` fixture. Environment only; CI has
  a clean `/tmp`. All other rpc-handlers tests: 273/274 suites, 6977 passed.
- Review: moderate findings 1-6 and codex finding 2 dispositioned in `code-logic-review.md`
  (4 mitigated, others deferred with reasons). Final verdict APPROVE, no open finding.

- PR #1491 opened (head 7e8b98332). task.md set to in_review.
