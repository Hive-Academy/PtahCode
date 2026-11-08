# Docs capture harness fix report

## Defects 1–13

1. `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts:17-18,48-57`: capture the original home before env overrides; resolve existing source paths and refuse the production `~/.ptah` tree, case-insensitively on Windows.
2. `apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts:45-58`: saved-session shots require a nonblank `PTAH_DOCS_SESSION_WORKSPACE`; without it, the shot skips and the sample repo remains the fallback. `apps/ptah-docs/SCREENSHOTS.md:11` explains that this opt-in opens a writable real workspace.
3. `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts:23-30`, `docs-fixtures.ts:57,91`, `src/docs-videos/_harness/video-fixtures.ts:24,46`: one shared SHA-256 helper reads the original home's settings before launch and asserts the hash after close and cleanup in both fixtures.
4. `docs-profile.ts:32-35,88-89`, `docs-fixtures.ts:83`, `video-fixtures.ts:40`: both fixtures inherit the same isolated home, APPDATA, LOCALAPPDATA, and child-home assertion.
5. `docs-profile.ts:72-77`: blank capture-dir input uses the default; relative input and paths resolving to repository root or cwd are refused.
6. `docs-profile.ts:80-135`, `docs-fixtures.ts:59-91`, `video-fixtures.ts:26-46`: cleanup is guarded by nested finally blocks, including profile preparation failure; keep-capture remains honored.
7. `docs-profile.ts:37-45`, `video-fixtures.ts:44,72`: both fixtures use a 20-second close race and kill a hung child.
8. `docs-profile.ts:85,88`, `src/support/electron-launcher.ts:116`: the DB now lives inside the run dir, and the launcher avoids allocating an unused external DB dir when the override is supplied.
9. `src/docs-screenshots/_harness/shooter.ts:124-130`: `sharp` loads dynamically with a named missing-package error. `sharp` is not declared in root `package.json`; package and lock files were untouched.
10. `apps/ptah-electron-e2e/tsconfig.spec.json:13,16`: the project typecheck includes the video flows, harness, and config.
11. `src/docs-videos/_harness/finalize-video.ts:8-28`, `video-fixtures.ts:20,31,73`: ffmpeg/ffprobe errors include spawn errors; invalid birthtime falls back to the recorded launch time; ffprobe rejects output under one second.
12. `src/docs-screenshots/sessions.shot.ts:1-12`: removed the always-skipping and racy rail/history/tabs shot. `sessions-overview.webp`, `sessions-history.webp`, and `sessions-tabs.webp` remain stale and were not recaptured. The analytics shot remains.
13. `apps/ptah-docs/SCREENSHOTS.md:9-11`: corrected source exclusion, explicit saved-session opt-in, writable workspace warning, isolation paths, DB location, and Windows cleanup retention.

## Verification

- `npm run verify -- -p ptah-electron-e2e`: exit 0 on final run. Header scope was `ptah-electron-e2e` only (1 project); lint and typecheck succeeded, 0/2 cache hits. The project has no `test` target.
- Earlier `npm run verify -- -p ptah-electron-e2e` runs: exit 1 for the dynamic-import type and fixture lint errors; both were corrected before the final passing run.
- `ptah_get_diagnostics` scoped to changed TypeScript files after final edit: 0 errors, 0 warnings.
- The project tsconfig has `strict: true`, and verify typecheck includes docs-videos after the tsconfig change. No capture, build, serve, or e2e target was run.

## Decisions

- Removed the three stale session rail shots rather than forcing sample data to mimic saved state. The review allowed removal; these images remain for the separate media PR. Reversible: yes.
- Kept `sharp` undeclared per orchestrator direction and report the dynamic import requirement. Reversible: yes.

## Scope

No images, videos, docs content pages, README, package manifest, or lockfile were edited. Existing changes outside this fix were left as found.

## Round 2 (N1–N5)

1. **N1:** `apps/ptah-electron-e2e/src/docs-screenshots/v2-surfaces.shot.ts:1,7-22` now uses the isolated docs fixture and explicitly installs the renderer RPC mock used by that shot. `docs-screenshots.config.ts:28-29` and `docs-videos.config.ts:12-13` both wire shared run-level setup and teardown. `src/docs-screenshots/_harness/docs-global-setup.ts:1-8`, `docs-global-teardown.ts:1-6`, and `docs-run-guard.ts:1-27` record the original home's settings SHA-256 before capture and fail the run if it changes. The ordinary e2e fixture was untouched.
2. **N2:** `src/docs-screenshots/_harness/docs-profile.ts:32-39`, `docs-fixtures.ts:88-90`, and `src/docs-videos/_harness/video-fixtures.ts:42-44` now close the app, assert the settings hash, then remove the capture directory on a match. A mismatch prints and retains the run directory for diagnosis. Sample repo cleanup remains in an outer `finally`.
3. **N3:** `src/docs-videos/_harness/finalize-video.ts:17-40` transcodes inside the run directory, validates duration and size there, copies to a staging file beside the published asset, and atomically renames staging over the MP4 only after checks pass. Failed finalization leaves the tracked MP4 untouched. Empty ffmpeg stderr now falls through to the process status.
4. **N4:** `apps/ptah-docs/SCREENSHOTS.md:15-21` lists the three session images, their page references, and why no current shot regenerates them. No docs pages or images changed.
5. **N5:** `src/docs-screenshots/sessions.shot.ts:1-4` removes the unused `openPreviousSessions` and `visibleNewSessionTrigger` imports.

Verification: `npm run verify -- -p ptah-electron-e2e` exited 0 on the final run; its header named `ptah-electron-e2e` only (1 project), and lint and typecheck both succeeded uncached. This project has no test target. The earlier run exited 1 on `no-unsafe-finally`; that lint error was fixed. `ptah_get_diagnostics` scoped to changed TypeScript files reported 0 errors and 0 warnings after the final edit. The strict project tsconfig includes docs-videos, so the verify typecheck covers them. No capture, build, serve, or e2e target was run.
