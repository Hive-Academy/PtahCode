## Summary

Added live Windows tests for real root, child, and grandchild processes. Detached descendants prove that production cleanup kills the tree. A non-detached control explains the earlier false result. All five cases pass.

## Files written

- D:\projects\ptah-extension\.claude-worktrees\process-tree-live-windows\libs\backend\platform-core\src\utils\windows-orphan-cleanup.live-windows.spec.ts
- D:\projects\ptah-extension\.claude-worktrees\process-tree-live-windows\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\cli-adapter.live-windows.spec.ts
- D:\projects\ptah-extension\.claude-worktrees\process-tree-live-windows\.ptah\specs\TASK_2026_2251_7d2e\test-report.md

## Cases

| Case | Spec file | Result | Run time |
| --- | --- | --- | --- |
| Shared cleanup kills detached child and grandchild | windows-orphan-cleanup.live-windows.spec.ts | Pass | 7.6 s suite |
| Shared cleanup leaves unrelated process alive | windows-orphan-cleanup.live-windows.spec.ts | Pass | 7.6 s suite |
| CLI root self-exit kills detached descendants | cli-adapter.live-windows.spec.ts | Pass | 26.7 s suite |
| CLI handle stop kills detached descendants | cli-adapter.live-windows.spec.ts | Pass | 26.7 s suite |
| Detached daemon survives root exit with cleanup disabled | cli-adapter.live-windows.spec.ts | Pass; observed for 2 s | 26.7 s suite |
| Non-detached control dies with cleanup disabled | cli-adapter.live-windows.spec.ts | Pass | 26.7 s suite |

## Commands run and results

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts`: 4 tests passed, 26.7 s.
- `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts`: 1 test passed, 7.6 s.
- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.spec.json`: passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed.
- `npx eslint libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts`: passed. Nx reported two ProjectGraph cache warnings.

## Defects found

None. The earlier claim about `cli-adapter.utils.ts:324` was incorrect. The non-detached control lost its descendants even with cleanup disabled. This supports the Windows libuv job explanation. With detached descendants and cleanup disabled, the grandchild stayed alive for two seconds. With cleanup enabled, detached descendants died.

## Decisions

- The root spawns its child with `detached: true` in the cleanup tests. The child spawns its grandchild with `detached: true`. The control uses non-detached descendants.
- The child keeps one stdout pipe to report PIDs. The grandchild uses ignored stdio.
- PID liveness is polled. `afterEach` kills every recorded PID with `taskkill /T /F`.
- Skill discovery found no relevant installed skill. The CLI platform command file is under `cli-engine` in this worktree.

## Not done

- No live Codex or agent-sdk spec was added.
- No production code was changed.

## Revise round 2

1. Done. The unrelated process now starts after `startedAt` and before root exit. A comment states why ancestry must exclude it.
2. Done. Both tree readers reject on root `exit` or `close` before the tree line. The error includes exit code and stderr. The root reports its child PID early for cleanup on failure.
3. Done. Both `dispose` helpers try every recorded live PID, clear the set, and throw one `AggregateError` for remaining live processes after failed kills.
4. Done. Both `alive` helpers return true for `EPERM`, false for `ESRCH`, and rethrow other errors.
5. Done. Both `dispose` helpers state the accepted short PID reuse risk in a comment.
6. Done. `staysAlive` checks the middle child and grandchild on every sample and takes at least 10 samples.
7. Done. The control test name states that non-detached descendants die when cleanup is off.
8. Done. `treeFor` has an explicit return type.
9. Done. The CLI suite indentation matches the shared suite. `npx prettier --write` ran on both spec files and passed.
10. Done. Both suites skip when `PTAH_SKIP_LIVE_WINDOWS=1`; per-test deadlines are unchanged.

Check results:

- CLI Jest run 1: pass, 4 tests, 26.985 s.
- CLI Jest run 2: pass, 4 tests, 21.145 s.
- Platform-core Jest run 1: pass, 1 test, 7.868 s.
- Platform-core Jest run 2: pass, 1 test, 5.958 s.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: pass, exit 0.
- `npx tsc --noEmit --project libs/backend/platform-core/tsconfig.spec.json`: pass, exit 0. An earlier run found the environment-variable index-signature error; the final run passed after the fix.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.live-windows.spec.ts libs/backend/platform-core/src/utils/windows-orphan-cleanup.live-windows.spec.ts`: pass, exit 0.
- `tasklist /FI "IMAGENAME eq node.exe"`: no matching tasks. No test Node process remained.

