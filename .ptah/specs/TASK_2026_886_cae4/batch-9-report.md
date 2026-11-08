# Batch 9 report — task-specs write-settle signal and session-organization export

Executor: backend-developer subagent. No git commands were run. `batches.md` and `task.md` were not edited.

## Files

- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/lib/task-writer.service.ts`: adds `TaskWritesSettledEvent` (:122), the in-flight map (:250), the `createEvent` wiring with per-listener try/catch (:264-283), `onDidSettleWrites` (:289), `hasWriteInFlight` (:294) and the private `trackWrite` (:304). `create` (:334), `adoptFolder` (:480) and `updateMetadata` (:731) route through it. The bodies of `create` and `adoptFolder` past validation moved, unchanged, into the private `claimAndCreate` (:338) and `adoptValidated` (:486).
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/index.ts`: `type TaskWritesSettledEvent` is exported beside `TaskWriterService` (:42).
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/lib/task-writer.settle.spec.ts`: 13 tests.
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/session-organization/src/index.ts`: `export { taskIdsInWorktreeName } from './lib/auto-link/task-link-rules';` (:41).

No Batch 2 or Batch 10 file was touched. No peer TASK_2026_879_9809 file was touched.

## Evidence per task

### Task 9.1 — `hasWriteInFlight` / `onDidSettleWrites`

- **Counting.** `trackWrite(root, write)` increments `writesInFlight[root]` and then runs `try { return await write(); } finally { decrement }`. When the count reaches 0, the entry is deleted and `fireSettled({ workspaceRoot: root })` fires synchronously inside the `finally`.
  - The map holds only roots that have a write in flight, so its size is bounded by concurrent roots.
  - The cost is O(1) per write. There is no timer and no I/O.
- **Key.** `root` is `normalizeWorkspaceRoot(workspaceRoot)`, the same function `TaskIndexService.applyFolderChange` uses. `hasWriteInFlight` normalises its argument the same way.
- **R10 ordering.**
  - Each method's early-return argument validation runs before `trackWrite`:
    - `create`: title.
    - `adoptFolder`: folderName and title.
    - `updateMetadata`: taskId segment, parent segment and the empty-patch check.
  - The awaited `notify()` sits inside the tracked closure: `writeCarrier` for create and adopt, `applyFrontmatterPatch` for metadata. The decrement therefore comes after it.
  - `updateStatus` delegates to `updateMetadata`, so it is covered.
- **Listener errors.** `createEvent`'s `fire` iterates listeners without a catch (`platform-core/src/utils/event-emitter.ts:30-34`). The public `onDidSettleWrites` therefore wraps each listener where it subscribes:
  - a throwing listener is logged with `logger.warn('[task-specs] write-settle listener failed', { workspaceRoot, error })`;
  - it cannot stop later listeners, and it cannot reject the writer's promise.
  - `dispose()` still removes the wrapped listener.
- **Unchanged contract.**
  - No constructor parameter was added; the 4 existing constructor arguments are unchanged.
  - Return values, error codes and the order of steps inside each write are unchanged. The moved bodies are byte-identical apart from computing `root` before the hand-off.

### Task 9.2 — Settle spec (`task-writer.settle.spec.ts`, 13 tests)

- The count rises and falls around:
  - `updateMetadata`, including `updateStatus`;
  - `create`;
  - `adoptFolder`.
  
  A `GatedNotifier` holds each write open at its final `applyFolderChange`. The tests assert `hasWriteInFlight === true` and no fire while it is held, then `false` and exactly one fire after release.
- Overlapping writes on one root (TASK_1 and TASK_2): no fire after the first write finishes and the root is still in flight; exactly one fire after the second.
- Two roots stay independent: A settles while B is still in flight, and each fires once.
- An unnormalised root (a trailing separator) maps to the same key.
- A `ThrowingNotifier` still settles, and the write still returns `success: true`.
- A write that fails (`fs.writeFile` rejects) still settles, and the result is the unchanged `WRITE_FAILED` / `'Failed to write task.md.'`.
- A throwing listener changes neither the result nor a later listener, and the warn log is asserted.
- A `deferNotify: true` write settles, with 0 notifier calls.
- A call rejected by argument validation is never counted and never fires.
- A disposed listener receives nothing.

### Task 9.3 — Export `taskIdsInWorktreeName`

- One export line was added to the session-organization barrel. The function is at `libs/backend/session-organization/src/lib/auto-link/task-link-rules.ts:295`.
- It is covered by the existing `task-link-rules.spec.ts`, which passed (below).

## Verification (command + tail + exit code)

1. `npm run verify -- -p @ptah-extension/task-specs,@ptah-extension/session-organization` gave exit 1.
   - Lint and typecheck: `NX 4 tasks: 4 succeeded`.
   - Test: `2 failed`.
     - task-specs: 1 of 555 failed. My own spec used a backslash root, which `normalizeWorkspaceRoot` does not fold on Linux. I fixed the spec to use a trailing-separator root.
     - session-organization: 6 suites failed with "Test suite failed to run" and `Could not locate module marked mapped as: /home/amun/ptah-extension/.claude-worktrees/task-end-hook/node_modules/marked/lib/marked.umd.js`. **This worktree has no `node_modules` directory**, and the `^marked$` mapper in `jest.preset.js` resolves relative to the worktree. The failing suites reach `marked` through `session-organization.service.ts` → `agent-sdk` → `tool-output-reducers`. The barrel line does not cause this. All 176 tests that ran passed.
2. `npm run verify -- -t test -p @ptah-extension/task-specs` (after the spec fix) gave exit 0:
   ```
   NX   1 task: 1 succeeded
           @ptah-extension/task-specs:test    1m 0s
   [verify 2026-11-06T20:09:05.093Z] lock released after 74.4s, exit code 0
   ```
3. `npm run verify -- -t test -p @ptah-extension/session-organization -- --testPathPatterns=task-link-rules` gave exit 0: `NX 1 task: 1 succeeded`, `lock released after 29.0s, exit code 0`.
4. `npm run verify -- -p @ptah-extension/rpc-handlers -- --testPathPatterns=tasks-rpc` gave exit 1, but only because the Jest flag was also forwarded to typecheck and lint: `error TS5023: Unknown compiler option '--testPathPatterns=tasks-rpc'`. The test phase passed: `NX 1 task: 1 succeeded` (`@ptah-extension/rpc-handlers:test 2m 42s`). Typecheck and lint for rpc-handlers were re-run in step 5 without the flag.
5. `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine,ptah-electron` gave exit 0:
   ```
   NX   8 tasks: 8 succeeded, 2 cached
   [verify 2026-11-06T20:19:11.443Z] lock released after 410.5s, exit code 0
   ```

Not run:
- The full session-organization test suite cannot pass in this worktree until `node_modules` resolves there. This is an environment issue for the coordinator.
- platform-cli was not named in the batch. cli-engine typecheck and lint passed.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` gave exit 0 (`TOTAL 220 unsuppressed site(s)`, within the baseline).
- The only task-writer site listed is `task-writer.service.ts:924`: the old `listFolderNames` catch, which moved because lines were added above it.
- The new listener catch logs at warn and returns nothing, so the audit does not flag it.

## Risks handled

- **R10 (gate stuck closed or opened early).**
  - The decrement is in `finally` after the awaited notify, so a throwing write and a throwing notifier both settle. Each case is pinned by a test.
  - The increment comes after the early-return validation and is pinned by the "not counted" test.
  - One fire per drain to zero is pinned by the overlap test.
- **Listener isolation.** Each listener is wrapped at subscription, so neither the result nor later listeners are affected. Pinned by a test.
- **AC 1.8 (same result, same call).** The constructor signature, return unions, error codes and step order are unchanged. The existing writer specs (create-race, metadata, conflict integration, service) all pass in the 555-test task-specs run.
- **Key mismatch with index events.** The same `normalizeWorkspaceRoot` is used. Pinned by the unnormalised-root test.
- **C1 / C3.** Nothing is deleted, moved or archived, and no git is invoked.
- **Peer 879 and parallel batches.** No overlapping files.

## Decisions

- **Listener error handling: wrap each listener where it subscribes, rather than one try/catch around `fire`.**
  - Options considered: one try/catch around `fire`; a custom listener set; wrapping at subscription.
  - Evidence: `createEvent`'s fire loop has no catch, so a single try/catch around `fire` would skip every listener after a throwing one. Wrapping at subscription keeps the plan's `createEvent` pattern.
  - Reversible: yes.
- **Wiring the tracking: a private `trackWrite` helper, with the bodies of `create` and `adoptFolder` past validation extracted into `claimAndCreate` and `adoptValidated`.**
  - Options considered: an inline `try/finally` that re-indents about 100 lines, or the helper.
  - Evidence: the helper puts the increment, decrement and fire in one place, and the extracted bodies are unchanged.
  - Reversible: yes.
- **Batch verify command 2:** the extra Jest flag was also passed to lint and typecheck. I ran the test phase with the flag and lint/typecheck separately without it, instead of changing the command's meaning.
