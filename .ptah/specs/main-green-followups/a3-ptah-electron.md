# ptah-electron Jest followups

## Config-home assertion

- Verdict: test defect. The spec created only a `.git` marker in its temp repo (`phase-2-libraries.config-home.spec.ts:86-87`, introduced in `a96d12d507`). `resolveHarnessWorkspaceRoot` searches `.ptah` markers before `.git` markers (`libs/backend/harness-sync/src/lib/workspace/workspace-root.ts:48,66-85`), so a `.ptah` marker in an ancestor temp directory changed the recorded harness root. The targeted Jest run reported expected `.../ptah-config-home-Z8uEam`, received `.../Temp` at spec line 143. Electron's `initPluginLoader` wires that documented resolver at `plugin-activation.ts:278-284` (commit `a96d12d507`); product behavior is correct.
- Fix: create `.ptah` alongside `.git` in the temporary repo so the fixture wins the documented marker priority, independent of developer machine state. All test writes stay in temp directories and in-memory storage.
- File changed: `apps/ptah-electron/src/di/phase-2-libraries.config-home.spec.ts`.

## Launcher outside app.asar

- Verdict: test defect. `worker-host-packaging.spec.ts:75` used POSIX executable bits from `statSync`, which Windows checkout does not preserve. Git tracks `worker-host/ptah-worker` as mode `100755` (`git ls-files --stage`). The spec and launcher were introduced together in `3b7fbb05c5`.
- Fix: assert Git tracked executable mode on both platforms, and filesystem executable bits on non-Windows hosts. Product launcher and packaging declaration remain correct.
- File changed: `apps/ptah-electron/src/config/worker-host-packaging.spec.ts`.

## Decisions

- Both failures are test defects; leave product behavior unchanged.
- No matching Electron/Jest skill was found in the local `.claude/skills` catalog.

## Verification

- Targeted verify with `--testPathPatterns` reached Jest: launcher suite passed; config-home failed at line 143 as above. The same pattern was forwarded to lint and typecheck, where the option is unsupported, so those stages did not check code.
- Unfiltered `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p ptah-electron`: `NX 2 tasks: 2 succeeded` (lint, typecheck); `NX 11 tasks: 11 succeeded` (test stage and dependencies); `lock released after 301.3s, exit code 0`.

## Not done

- None.


