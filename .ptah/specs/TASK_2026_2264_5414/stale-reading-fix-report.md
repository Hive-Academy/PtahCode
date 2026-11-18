# Stale context reading fix

The review finding is valid. `SessionControl.setSessionModel` awaited the SDK model change and updated `currentModel`, but left the previous model's context reading cached. The adapter could consequently record the old `autoCompactThreshold` on a compact boundary and irreversibly promote the budget stage too early.

## Change

`SessionLifecycleManager.setSessionModel` now captures the previous model, awaits the existing control operation, and releases the cached reading only when the record's model actually changed. It releases each distinct requested, canonical (`realSessionId`), and tab ID, matching the aliases searched by `getLastContextUsage`. Failed requests and unchanged models retain their reading. With no port, invalidation is a no-op.

This reuses the manager's injected context-usage port. No new dependencies or composition-root changes are needed; Electron and CLI both use `registerSdkServices`. Outgoing auto-compaction settings and configured-window precedence are unchanged; no forced 200k default was introduced.

Reader compatibility was checked in source: the rotation advisor uses optional access and falls back to supplied context tokens, retaining its prior advisory if neither value exists. The coordinator receives readings through the query executor's guarded `readAtTurnEnd` path (`if (!reading || this.released) return`), rather than directly dereferencing `getLast`. `release` clears both per-turn and last-reading caches; an in-flight reading cannot repopulate a released cache. The focused reader suites passed.

## Changed files

- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts`: invalidate all reading aliases after a successful, actual model change.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts`: exercise real model-control delegation through canonical and tab IDs, including failure, unchanged model, successful change, and release timing.
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts`: extend the handoff regression with a real context-usage port, lifecycle facade, and budget service; cache model A's lower threshold under both aliases, change models, verify repeated compact boundaries record a null window and remain normal, then verify a fresh reading is used and handoff resumes. This adapter fixture doubles the underlying model control; the lifecycle-manager suite separately exercises the real control.
- `.ptah/specs/TASK_2026_2264_5414/stale-reading-fix-report.md`: this report.

## Focused checks

All commands ran from `D:\projects\ptah-extension\.claude-worktrees\compact-threshold-setting`.

```powershell
npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.idle.spec.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/context-usage.port.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/session-rotation-advisor.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/compaction-coordinator.spec.ts
```

Final run: **6 suites passed, 0 failed; 295 tests passed, 0 failed**, exit 0. The same command's first run had 5 suites pass and 1 fail to compile (129 tests passed): the new context-reading fixture omitted required `isAutoCompactEnabled`. The fixture was corrected before the successful rerun.

```powershell
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json
```

**2 checks passed, 0 failed**, each exit 0 with no diagnostics.

```powershell
npx eslint libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.ts libs/backend/agent-sdk/src/lib/helpers/session-lifecycle-manager.spec.ts libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts
```

**Passed**, exit 0: **0 errors, 7 warnings**, all on unchanged lines in the lifecycle-manager spec (existing non-null assertions and an unused variable).

## Limits and tooling

- Jest emitted its configuration module-format warning and delayed-exit/open-handles notice, but completed with exit 0. Those notices were not investigated in this focused fix.
- Scoped Ptah diagnostics did not complete within 45 seconds and reported all three files unchecked; direct library/spec TypeScript checks above passed. Ptah AST inspection succeeded after correcting its argument; its dependency graph reported partial coverage, supplemented by targeted source reads and `rg`.
- Native CLI skill discovery/loading is unavailable in this session. The local skill catalog has no matching skill for this focused backend cache fix.
- Electron/CLI applications were not launched; no build, serve, e2e, Nx, npm install, or npm verify command was run. No commit, push, stash, or PR operation was performed. The pre-existing untracked `checks.json` was preserved.
- No known implementation requirement remains open.
