# Code Logic Review — TASK_2026_892 docs capture harness

Review family: claude (implementer: codex)

## Scope

- `git diff main -- apps/ptah-electron-e2e apps/ptah-docs/project.json apps/ptah-docs/SCREENSHOTS.md .gitignore`
- Untracked: `apps/ptah-electron-e2e/docs-videos.config.ts`, `src/docs-videos/**` (fixtures, finalize, pace, 4 flows), new `*.shot.ts` files (read where they touch isolation: `chat.shot.ts`).
- Whole files read: `docs-profile.ts`, `docs-fixtures.ts`, `video-fixtures.ts`, `finalize-video.ts`, `pace.ts`, `shooter.ts` (diff), `electron-launcher.ts`, `tray-home.ts`, both docs configs, `playwright.config.ts`, `project.json` (e2e + docs).
- App-side path derivation checked: `apps/ptah-electron/src/main.ts:64-69`, `apps/ptah-electron/src/di/phase-2-libraries.ts`, `libs/backend/platform-electron/src/registration.ts:105-112,227`, `libs/backend/persistence-sqlite/src/lib/db-path.ts:49-60`, `apps/ptah-electron/src/activation/session-store-migration.ts`, `libs/backend/auth-providers/src/lib/providers/copilot/copilot-file-auth.ts:46`.
- `apps/ptah-electron-e2e/src/specs/task-337-agent-card-refresh.spec.ts` shows in `git diff main` but is not modified in the worktree (main moved ahead of the branch base). It is out of scope.
- Images, videos, docs pages and README: not reviewed (as instructed).

## Score

**6/10.** The core isolation of the Electron process is correct. Both fixtures set `USERPROFILE` and `HOME` to a temp home. The app derives `~/.ptah` only from `os.homedir()`. `NODE_ENV=test` from the launcher disables the `Ptah Dev` `setPath` branch. `PTAH_DB_PATH` stays isolated. No secret file is copied. The launcher change is backward compatible. It is not a 7-8: check 3 explicitly asks for a refusal of `~/.ptah` as a source, and there is none. The saved-session shot also opens a real developer repository by default, which the documentation does not say. It is not a 4: no defect lets the Electron app write the real `~/.ptah`.

## Verdict

**REVISE** — defects 1–3 are task-requirement gaps (D8/D11, check 3, check 7). The other defects are LOW.

## Defects

### 1. MEDIUM — No refusal of `~/.ptah` as the copy source
- `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts:17-21`
- `PTAH_DOCS_SOURCE_PROFILE` is accepted as is. If it points at `~/.ptah` (or a folder inside it), `findDevSessionWorkspace()` (`chat.shot.ts:47-63`, runs at module load) reads production `workspace-storage`. `prepareDocsProfile` (`docs-profile.ts:48-55`) then copies production session state into the capture. D8 and D11 say that production `~/.ptah` stays excluded. The doc comment at line 16 says "never the production ~/.ptah profile", but the code does not enforce it.
- **Fix:** In `realProfileDir()`, resolve the candidate with `fs.realpathSync.native` when it exists. Compare it case-insensitively on win32 to `path.join(os.homedir(), '.ptah')`. Throw if the candidate is equal to that folder or inside it. Capture the real home once at module load, before any env override.

### 2. MEDIUM — Saved-session shot auto-selects and opens a real developer repository
- `apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts:47-65,73-77`; `docs-fixtures.ts:57-58,74-75`
- When `PTAH_DOCS_SESSION_WORKSPACE` is not set, `findDevSessionWorkspace()` picks the dev-profile workspace with the most agent outputs. It passes that real folder as `workspace`, so Electron opens the developer's real repository. The app writes into workspaces that it opens (`libs/backend/harness-sync/src/lib/targets/workspace-target.ts`). The old SCREENSHOTS.md warned about this. The new text removed the warning. `SCREENSHOTS.md:11` also says that the capture is "selected with `PTAH_DOCS_SESSION_WORKSPACE`", but the code selects it by default.
- **Fix:** Remove the auto-discovery fallback, or gate it behind an explicit opt-in (`PTAH_DOCS_SESSION_WORKSPACE` set and not empty). Add a sentence to SCREENSHOTS.md that this mode opens the named real workspace and that the app can write into it.

### 3. MEDIUM — D11 "check the `settings.json` hash before and after" is not in the harness
- `docs-profile.ts` / `docs-fixtures.ts` / `video-fixtures.ts` (no hash check). Evidence that this matters: `batch1-screenshots-report.md:13` and `batch2-videos-report.md:29` report a production hash change during overlapped runs that "cannot be attributed".
- The check was done by hand. The code gives no guard if a future change breaks isolation.
- **Fix:** In a `globalSetup`/`globalTeardown` pair for both docs configs, hash `<real home>/.ptah/settings.json` (capture the real home before any override). Compare the hashes at the end. Fail, or at minimum print a loud warning, on a change. As an alternative, add the hash check to the fixture around launch and close.

### 4. LOW — The two fixtures have different isolation contracts
- `docs-fixtures.ts:74-79` vs `video-fixtures.ts:31-50`
- The video fixture also sets `APPDATA`/`LOCALAPPDATA` and asserts the child's `USERPROFILE`/`HOME`. The screenshot fixture does neither. The app does not derive `~/.ptah` from `APPDATA`/`LOCALAPPDATA`, so this is not a `~/.ptah` leak. But the screenshot runs read real third-party state, for example `%LOCALAPPDATA%\github-copilot` auth (`copilot-file-auth.ts:46`), which can show real accounts on provider shots.
- **Fix:** Build the env (home keys plus `APPDATA`/`LOCALAPPDATA` into the run dir) and the child-home assertion once in `prepareDocsProfile` or a shared helper. Use that helper in both fixtures.

### 5. LOW — An empty `PTAH_DOCS_CAPTURE_DIR` puts run dirs inside the e2e project
- `docs-profile.ts:33`
- `??` does not catch `''`. `path.resolve('')` is the Playwright cwd (`apps/ptah-electron-e2e`), which is not git-ignored. Deletion stays safe because cleanup removes only the `mkdtemp` result (`runDir`), never the base.
- **Fix:** Use `process.env['PTAH_DOCS_CAPTURE_DIR']?.trim() || default`. Reject a value that is not absolute.

### 6. LOW — Temp state leaks when profile preparation fails
- `docs-profile.ts:35-56` (throws at line 52 after `mkdtempSync`); `docs-fixtures.ts:57,65-69`; `video-fixtures.ts:23-24`
- If `prepareDocsProfile` throws (for example, "no saved state"), the `runDir` is never removed and the sample repo created before it also leaks. In both fixtures, if `profile.cleanup()` throws a non-EPERM error, `sample/repo.cleanup()` is skipped.
- **Fix:** In `prepareDocsProfile`, wrap the work after `mkdtempSync` in `try/catch` and remove `runDir` before you rethrow. In the fixtures, create the profile inside a `try` that cleans up the repo. Use nested `try/finally` so that each cleanup runs.

### 7. LOW — Video fixture teardown has no close timeout
- `video-fixtures.ts:55`
- The screenshot fixture races `app.close()` against 20 s and kills the process (`docs-fixtures.ts:91-97`). The video fixture awaits `app.close()` with no limit. A hung shutdown uses the whole teardown budget, and `profile.cleanup()` does not run.
- **Fix:** Reuse the same race-and-kill helper in both fixtures.

### 8. LOW — The isolated DB is outside the run dir and is never removed
- `apps/ptah-electron-e2e/src/support/electron-launcher.ts:66-71,116`
- Each launch creates `os.tmpdir()/ptah-e2e-db-*` and nothing deletes it. This behavior existed before the task. But `SCREENSHOTS.md:9` now implies that all run state lives in the run directory and is removed.
- **Fix:** Put `PTAH_DB_PATH: path.join(runDir, 'state', 'ptah.sqlite')` in `profile.env`, or correct the documentation.

### 9. LOW — `sharp` is not a declared dependency
- `apps/ptah-electron-e2e/src/docs-screenshots/_harness/shooter.ts:3`
- `sharp` resolves only through hoisting from `astro` and `@huggingface/transformers` (`package-lock.json`). A dependency change upstream can silently remove it, and the capture would then fail at import. The WebP error path itself is correct: `sharp` errors propagate and are not swallowed. The file name `<name>.webp` matches `/screenshots/<name>.webp`.
- **Fix:** Add `sharp` to root `devDependencies`.

### 10. LOW — The `typecheck` target does not cover the video harness
- `apps/ptah-electron-e2e/tsconfig.spec.json:9-15`
- `include` lists `src/docs-screenshots/**` and `docs-screenshots.config.ts`, but not `src/docs-videos/**` or `docs-videos.config.ts`. The scoped verify was a cache hit and passed, but it did not check these files. An ad hoc `tsc --strict` of the video files passed (see Checks run).
- **Fix:** Add both paths to `include`.

### 11. LOW — `finalizeVideo` error and trim edges
- `apps/ptah-electron-e2e/src/docs-videos/_harness/finalize-video.ts:11-13,24`
- If `ffmpeg` is missing, `result.error` is ignored and the message is `ffmpeg failed: undefined`. The trim depends on `birthtimeMs`. If the file system reports `0`, `-ss` is far past the end of the clip, and the size check does not detect an empty or short output.
- **Fix:** Include `result.error?.message` in the error. Fall back to the Playwright start time when `birthtimeMs` is not positive. Use `ffprobe` to assert a minimum duration.

### 12. LOW — The sessions rail shot always skips and the check is racy
- `apps/ptah-electron-e2e/src/docs-screenshots/sessions.shot.ts:21-23`
- The default workspace is the sample repo, so the trigger never appears. `sessions-overview`, `sessions-history` and `sessions-tabs` are never regenerated, but `sessions-history.webp` is referenced (`session-history.md:10`). `isVisible()` runs at once with no wait, so the test can skip even when the trigger would appear later. D10 allows stale images, but the report must list these three as not recaptured.
- **Fix:** Wait for the canvas to settle (or `waitFor` with a short timeout) before the check. List the three shots as stale in the batch report.

### 13. LOW — SCREENSHOTS.md text does not match the code in several places (check 7)
- `apps/ptah-docs/SCREENSHOTS.md:9,11`
  - Line 11: "selected with `PTAH_DOCS_SESSION_WORKSPACE`". The code also auto-selects a workspace when the variable is not set (defect 2).
  - Line 9: "never the real `~/.ptah`". This is true for the Electron process, but the source profile is not guarded (defect 1).
  - Line 9: "Its temporary Electron profile, `HOME` and `USERPROFILE` all live there". The database lives in `os.tmpdir()` (defect 8). The video fixture also points `APPDATA`/`LOCALAPPDATA` at the profile, and the text does not say this.
  - Line 9: "removes the run directory after Electron closes". On Windows `EPERM`/`EBUSY`, the directory is retained with a stderr note (`docs-profile.ts:72-82`). The text does not say this.
  - The warning that the app writes into opened workspaces was removed (defect 2).
- **Fix:** Update the text after defects 1, 2 and 8 are fixed.

## Five logic questions

1. **What happens on failure?** A launch failure cleans up the profile and the repo in both fixtures. A failure in the test body cleans up through `finally`. A failure in profile preparation leaks the run dir (defect 6). A failure of `sharp`, `ffmpeg` or the size check throws and fails the test. Nothing is swallowed except the documented Windows `EPERM`/`EBUSY` cleanup retention.
2. **What input is not validated?** `PTAH_DOCS_SOURCE_PROFILE` (defect 1), an empty or relative `PTAH_DOCS_CAPTURE_DIR` (defect 5), and an auto-discovered workspace (defect 2). An empty `PTAH_DOCS_SESSION_WORKSPACE` is safe: the describe block skips.
3. **What races exist?** The sessions trigger check (defect 12). Overlapped captures made the production hash change impossible to attribute (defect 3). The single-instance lock is per userData, so concurrent capture runs do not collide.
4. **Is the work complete against the decisions?** D9 (no live AI) and D10 are respected in the reviewed code. D11 "check the hash before and after" is manual only (defect 3). Check 3 "refuses ~/.ptah" is missing (defect 1).
5. **Does the change break existing behavior?** No. `recordVideo` is optional and only spread when present (`electron-launcher.ts:30,141`). The `env` passthrough existed before. `playwright.config.ts` has `testDir: './src/specs'`, so `*.shot.ts` and `*.flow.ts` are not picked up. The `videos` target mirrors `screenshots` (same `dependsOn`, same `cwd`, separate config) and no CI workflow references it.

## Verified correct (requested checks)

- **Check 1:** Both fixtures pass `HOME_ENV_KEYS` (`USERPROFILE`, `HOME`) set to `<runDir>/home`. The app resolves `~/.ptah` only through `os.homedir()` (`phase-2-libraries.ts`, `electron-safe-storage-vault.ts:34`, `db-path.ts:60`). There is no `app.getPath('home')` use in `apps/ptah-electron/src` or `libs/backend`. `NODE_ENV=test` means `main.ts:66-68` does not redirect userData to `%APPDATA%\Ptah Dev`. `profile.env` does not override `PTAH_DB_PATH`, so the launcher's isolated DB stays in effect.
- **Check 2:** The base is `<repo>/.ptah/tmp/docs-capture` (5 levels up from `_harness` resolves to the repository root). `.ptah/tmp/` is git-ignored. Cleanup removes only `runDir`, which is a `mkdtempSync` result, so it cannot delete outside the base. `PTAH_DOCS_KEEP_CAPTURE=1` keeps the directory.
- **Check 3:** `PROFILE_COPY_ALLOWLIST` is empty. Only `workspace-storage/<key>` of one workspace is copied, so `secrets.json`, `secrets.enc*`, `master-key-ref.json` and `config.json` are never copied. The `base64url` key matches `registration.ts:227`. The refusal of `~/.ptah` is missing (defect 1).
- **Check 4:** Default launcher behavior is unchanged.
- **Check 5:** `sharp` errors propagate. The output name is `<name>.webp`.
- **Check 6:** Correct (see question 5).

## Checks run

| Command | Result |
| --- | --- |
| `npm run verify -- -p ptah-electron-e2e` | exit 0. lint and typecheck: 2/2 succeeded (cache hit). The project has no `test` target. |
| `npx tsc --ignoreConfig --ignoreDeprecations 6.0 --noEmit --strict ... docs-videos.config.ts src/docs-videos/*.flow.ts src/docs-videos/_harness/*.ts` (in `apps/ptah-electron-e2e`) | exit 0, no errors (ad hoc, because `tsconfig.spec.json` excludes these files) |

I did not run capture, build, e2e or `check-screenshot-refs`. The settings-hash claims in the batch reports are not verified by this review.

## Decisions

- Decision: treat `task-337-agent-card-refresh.spec.ts` as out of scope. Options: review it, or ignore it. Evidence: `git status` shows that the worktree does not modify it. The diff comes from main moving ahead. Reversible: yes.
- Decision: rate the missing `~/.ptah` source refusal as MEDIUM, not HIGH. Evidence: only the test process reads the source, and it does not write to it. The Electron app cannot reach the real `~/.ptah` through the two docs fixtures (the re-review found a third fixture in the same target that can: N1). Reversible: yes.

---

## Re-review

Review family: claude (implementer: codex)

Scope: the same diff and untracked files after the fix round, with `harness-fix-report.md`. Whole files read again: `docs-profile.ts`, `docs-fixtures.ts`, `video-fixtures.ts`, `finalize-video.ts`, `chat.shot.ts` (saved-session part), `sessions.shot.ts`, the `shooter.ts` / `electron-launcher.ts` / `tsconfig.spec.json` diffs, and `SCREENSHOTS.md`. I also read the shot files that `docs-screenshots.config.ts` collects but that are not in the diff (`v2-surfaces.shot.ts`), and `src/support/fixtures.ts`.

### Status of the first-round defects

| # | Defect | Status | Evidence |
| --- | --- | --- | --- |
| 1 | No refusal of `~/.ptah` as source | **Fixed** | `docs-profile.ts:17-18,48-56`. The real home is read once at module load. Both paths go through `realpathSync.native` when they exist, the compare is case-insensitive on win32, and the check covers an equal path and every path inside it. A junction that points into `~/.ptah` resolves and is refused. |
| 2 | Saved-session auto-selects a real repository | **Fixed** | `chat.shot.ts:45,53-58`. Only a non-blank `PTAH_DOCS_SESSION_WORKSPACE` enables the mode. The auto-discovery is gone. `SCREENSHOTS.md:11` warns that the app can write into the named workspace. |
| 3 | No automated hash check | **Fixed for the two docs fixtures** | `docs-profile.ts:23-30`. Used in `docs-fixtures.ts:57,91` and `video-fixtures.ts:24,46`. It does not cover the third fixture in the same target (new defect N1). |
| 4 | Fixtures have different isolation | **Fixed** | `docs-profile.ts:88-89` builds one env (`HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `PTAH_DB_PATH`). `assertChildHome` (`:32-35`) runs in both fixtures (`docs-fixtures.ts:82`, `video-fixtures.ts:39`). |
| 5 | Empty `PTAH_DOCS_CAPTURE_DIR` | **Fixed** | `docs-profile.ts:72-77`. A blank value uses the default. A relative value is refused. The repository root and cwd are refused as the base. |
| 6 | Leaks when preparation fails | **Fixed** | `docs-profile.ts:82,132-135` removes `runDir` and rethrows. The fixtures use nested `try/finally` (`docs-fixtures.ts:58-91`, `video-fixtures.ts:25-46`), so the repo cleanup and the hash assert run even if `profile.cleanup()` throws. |
| 7 | No close timeout in the video fixture | **Fixed** | `closeDocsApp` (`docs-profile.ts:37-45`) is used by both fixtures and by `finish`. A second call after `finish` closes the app is harmless: `close()` resolves or rejects, and `kill()` on an exited process does not throw. |
| 8 | DB outside the run dir | **Fixed** | `docs-profile.ts:85,88`. The launcher keeps `isolatedDbPath()` as the default when no override is passed (`electron-launcher.ts:116`), so existing e2e specs do not change. |
| 9 | `sharp` not declared | **Fixed as the orchestrator decided (accepted risk)** | `shooter.ts:124-130`. Dynamic import with a named error and `cause`. It is still undeclared. A lockfile change can still remove it, but the failure is now clear. |
| 10 | Typecheck does not cover videos | **Fixed** | `tsconfig.spec.json:13,16`. `npm run verify -- -p ptah-electron-e2e` exit 0 (lint and typecheck 2/2, cache hit after the implementer's uncached pass). |
| 11 | `finalizeVideo` error and trim edges | **Fixed** | `finalize-video.ts:11-12,24-28`. Spawn errors show, the birthtime falls back to the launch time, and `ffprobe` rejects output under 1 s. There is a small leftover issue: `result.stderr` is `''` (not `null`) when ffmpeg exits non-zero with no output, so `??` gives an empty message. See also N3. |
| 12 | Sessions rail shot always skips | **Fixed by removal** | `sessions.shot.ts:6-9`. Only the analytics test is left. See N4 for the pages that still reference the images. |
| 13 | SCREENSHOTS.md mismatches | **Partly fixed** | `SCREENSHOTS.md:9-11` now matches `docs-profile.ts` (absolute base, DB, `APPDATA`/`LOCALAPPDATA`, the refusal, the opt-in, the write warning, Windows retention). But "The app uses the isolated home" and "Both fixtures check..." are not true for every shot that the `screenshots` target runs (N1). |

### Checks requested for the fix

- **The hash helper reads the original home.** Correct. `originalHome = os.homedir()` is read at module load in the Playwright worker (`docs-profile.ts:17`). The override is only passed to the Electron child through `launchPtah({ env })`. The only `process.env` write in the worker is `PTAH_E2E_DB_PATH` (`electron-launcher.ts:122`). The child's `HOME`/`USERPROFILE` cannot change the path that the helper hashes. A missing file before the run and a new file after the run also fails the check (`undefined` !== hash).
- **Teardown order.** The order in the code is: app close → temp cleanup → sample cleanup → hash assert (`docs-fixtures.ts:88-91`, `video-fixtures.ts:43-46`). The order that the orchestrator asked for was close → hash assert → cleanup. The check is still valid because the hash does not depend on the temp dir. But if the hash changed, the run dir is already gone (N2).
- **The cleanup guard cannot delete outside the capture base.** Correct. Both delete paths (`docs-profile.ts:119,133`) only remove `runDir`, which is a `mkdtempSync(path.join(base, 'run-'))` result. The base itself is never deleted.
- **Removing the sessions rail shot.** Three docs pages now reference images that no shot regenerates, and no page or `SCREENSHOTS.md` says so (N4):
  - `apps/ptah-docs/src/content/docs/sessions/index.mdx:12` → `/screenshots/sessions-overview.webp`
  - `apps/ptah-docs/src/content/docs/sessions/managing-sessions.md:10` → `/screenshots/sessions-tabs.webp`
  - `apps/ptah-docs/src/content/docs/sessions/session-history.md:10` → `/screenshots/sessions-history.webp`
  - The three files exist in `public/screenshots/` (they ship in PR #984), so `check-screenshot-refs` passes. Only the `sessions.shot.ts:6-9` comment says that they are not recaptured.

### New defects

#### N1. HIGH — The `screenshots` target still launches one shot file with the real home
- `apps/ptah-electron-e2e/src/docs-screenshots/v2-surfaces.shot.ts:1,21` (the active `Thoth Memory curator` test) → `src/support/fixtures.ts:61` → `launchPtah()` with no `env`.
- `docs-screenshots.config.ts` collects `**/*.shot.ts`, so `nx run ptah-docs:screenshots` runs this file. That fixture overrides only userData and `PTAH_DB_PATH`. The Electron main process inherits the real `USERPROFILE`/`HOME` and boots with the real `~/.ptah` (settings manager, `.machine-uuid`, model cache, and so on). The renderer RPC is faked, but the backend still runs. The hash guard does not cover this test. This breaks D11 and the requirement "the real `~/.ptah` cannot be reached through any path". It also makes `SCREENSHOTS.md:9` untrue. The file is unchanged from main (`53645bcbf`), but it runs in the target that this task documents as isolated. I missed it in the first round.
- **Fix (choose one):**
  - (a) Move the active test to the docs fixtures.
  - (b) Give `src/support/fixtures.ts` an opt-in home isolation through `createIsolatedPtahHome()` (`support/tray-home.ts`) and use it from this file.
  - (c) Remove `v2-surfaces.shot.ts` from `testMatch` in `docs-screenshots.config.ts`.
- Also move the hash check into a `globalSetup`/`globalTeardown` pair for `docs-screenshots.config.ts` and `docs-videos.config.ts`. Then every test in the run is covered, whatever fixture it uses.

#### N2. LOW — The hash assert runs after the temp cleanup
- `docs-fixtures.ts:90-91`, `video-fixtures.ts:45-46`
- If the real settings change, the run dir (temp home, profile, DB) is already deleted, so the evidence of what happened is gone. The order also differs from the orchestrator's decision.
- **Fix:** Assert the hash right after `closeDocsApp`. On a mismatch, skip `profile.cleanup()` (keep the run dir) and print its path.

#### N3. LOW — A failed video finalize overwrites the tracked asset
- `apps/ptah-electron-e2e/src/docs-videos/_harness/finalize-video.ts:17-30`
- ffmpeg writes directly to `public/assets/videos/<name>.mp4` (`-y`). If ffmpeg, ffprobe, or the duration or size check fails, the committed MP4 is replaced by a broken or too-large file, and the test only throws.
- **Fix:** Encode to `<runDir>/video/<name>.mp4`. Run the ffprobe and size checks on that file. Copy it to `assetDir` only after it passes. Use `result.error?.message || result.stderr || String(result.status)` so that an empty stderr does not hide the status.

#### N4. LOW — Pages reference three images that nothing regenerates, and no text says so
- `SCREENSHOTS.md` (no list). The pages are listed above.
- The old text said "Screenshots not covered by a shot file are captured by hand". The new text removed that sentence. Nothing tells a maintainer that these three images are hand-maintained and stale.
- **Fix:** Add a short "Not produced by the harness" list to `SCREENSHOTS.md` with the three file names and the reason (they need saved session state). Also list the three images in the PR #984 description.

#### N5. LOW (cleanup) — Unused imports in `sessions.shot.ts`
- `apps/ptah-electron-e2e/src/docs-screenshots/sessions.shot.ts:3-4`
- `openPreviousSessions` and `visibleNewSessionTrigger` were used only by the removed test. Lint did not flag them.
- **Fix:** Remove both imports.

#### Note (no change needed)
- If the installed Ptah app writes `~/.ptah/settings.json` during a capture, the hash check fails even when the capture did not cause the change. This is the correct conservative behavior. The error message could say "or another Ptah process".

### Checks run in this round

| Command | Result |
| --- | --- |
| `npm run verify -- -p ptah-electron-e2e` | exit 0. lint and typecheck 2/2 succeeded (cache hit). The project has no `test` target. |

I did not run capture, build, e2e or `check-screenshot-refs`.

### Re-review score and verdict

**Score: 7/10.** All 13 first-round defects are fixed or accepted as decided. The new helpers are correct: the original-home hash, the shared env, the close race, and the cleanup that cannot leave the base. The score is not 8 because N1 lets one active shot in the same `screenshots` target reach the real `~/.ptah`, which is the main requirement of D11.

**Final verdict: REVISE.** Fix N1 (any of options a–c, preferably with a run-level hash check). After that, the harness meets D8–D11. N2–N5 are LOW and do not block approval.

---

## Final review

Review family: claude (implementer: codex)

Scope: the same paths after round 2, with `harness-fix-report.md` `## Round 2 (N1–N5)`. I read these files again: `docs-global-setup.ts`, `docs-global-teardown.ts`, `docs-run-guard.ts`, both docs configs, `docs-profile.ts:17-55`, `docs-fixtures.ts:12-93`, `video-fixtures.ts:20-50`, `finalize-video.ts`, the `v2-surfaces.shot.ts` diff, `sessions.shot.ts:1-6` and `SCREENSHOTS.md:13-21`. I also read the Playwright 1.63.0 runner task order (`node_modules/playwright/lib/runner/index.js:6321-6397`).

### Status of N1–N5

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| N1 | `v2-surfaces.shot.ts` launched with the real home | **Fixed** | `v2-surfaces.shot.ts:1` now imports `./_harness/docs-fixtures`. The `beforeEach` (`:7-21`) installs the fake renderer RPC listener on the isolated app. A grep of `src/docs-screenshots` and `src/docs-videos` finds no `support/fixtures`, `real-rpc-fixtures` or `_electron` import. The only `launchPtah(` calls are `docs-fixtures.ts:76` and `video-fixtures.ts:33`, and both pass `profile.env`. The run-level guard is wired in both configs (`docs-screenshots.config.ts:28-29`, `docs-videos.config.ts:50-51`). |
| N2 | Hash assert ran after cleanup | **Fixed** | `docs-fixtures.ts:88-90` and `video-fixtures.ts:42-44` use the order close → `assertSettingsOrRetain` → `profile.cleanup()`. On a mismatch, `assertSettingsOrRetain` (`docs-profile.ts:32-39`) prints the run dir and throws before cleanup, so the run dir is kept. The sample repo cleanup is in the outer `finally`. |
| N3 | Failed finalize overwrote the tracked MP4 | **Fixed** | `finalize-video.ts:17-41`. The encode goes to the run dir. ffprobe and the size check run on that file. The file is copied to a staging file in `assetDir` and moved over the asset with `renameSync` only after all checks pass. The `finally` block removes the source, the output and any staging file. The error text now uses `||`, so an empty stderr falls through to the status. |
| N4 | No text about the three images that nothing regenerates | **Fixed** | `SCREENSHOTS.md:15-21` lists `sessions-overview.webp`, `sessions-tabs.webp` and `sessions-history.webp`, the page that uses each one, and the reason. |
| N5 | Unused imports | **Fixed** | `sessions.shot.ts:1-2` imports only `test`, `expect` and `shoot`. |

### Checks requested for round 2

- **globalSetup/globalTeardown wiring in both docs configs.** Correct. Both configs point at the same two files. `docs-global-setup.ts:5-8` still runs `buildPrecheck()` first, so the build check that the configs had before is kept.
- **The guard reads the original home.** Correct. Global setup and teardown run in the Playwright runner process. That process never gets the temp `HOME`/`USERPROFILE` (they go only to the Electron child), so `originalHome` (`docs-profile.ts:17`) is the real home there too. The baseline stores `null` when the file does not exist, so a file that the run creates also fails the check.
- **A failed check fails the run.** Correct. The guard throws from `globalTeardown`, and Playwright reports a teardown error as a fatal run error with a non-zero exit code. The baseline file is under `project.outputDir`. Playwright 1.63.0 removes the output dirs *before* global setup (`createRemoveOutputDirsTask` comes first in `createGlobalSetupTasks`, `index.js:6321-6327`), so the baseline survives the run and an old baseline from an aborted run cannot be reused.
- **The ordinary e2e config is not affected.** Correct. `git diff --quiet main -- playwright.config.ts src/support/fixtures.ts` shows no change. `playwright.config.ts:33` still uses `./src/support/build-precheck.ts`.

### New defects

#### F1. LOW — A second, misleading error when global setup fails
- `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-run-guard.ts:18-20`, with `docs-global-setup.ts:6-7`
- Playwright registers the global teardown task before the global setup task (`index.js:6325-6326`), so the teardown runs even when setup throws. If `buildPrecheck()` fails, the baseline is never written. `assertSettingsBaseline` then throws `ENOENT` on `readFileSync`, and the run reports this second error next to the real build-precheck error. This does not weaken the guard, because no test ran.
- **Fix:** Return the assert as a function from `docsGlobalSetup` (Playwright runs a returned function as teardown only when setup succeeded), and remove the separate `globalTeardown` entry. As an alternative, return early in `assertSettingsBaseline` when the baseline file does not exist.

#### Note (no change needed)
- The per-fixture check and the run-level check both fail if the installed Ptah app writes `~/.ptah/settings.json` during a capture. This is the correct fail-closed behavior.

### Checks run

| Command | Result |
| --- | --- |
| `npm run verify -- -p ptah-electron-e2e` | exit 0. lint and typecheck 2/2 succeeded (cache hit of the implementer's uncached pass). The project has no `test` target. |
| `git diff --quiet main -- playwright.config.ts src/support/fixtures.ts` | no difference |

I did not run capture, build, e2e or `check-screenshot-refs`. The guard's runtime behavior comes from reading the code and the Playwright runner source. No capture run confirmed it.

### Final score and verdict

**Score: 8/10.** All defects from the first review and the re-review are fixed or accepted as decided. Every docs shot and flow now launches through one of the two isolated fixtures, and a fail-closed hash guard covers each test and the whole run. The video publish cannot replace the asset with a bad file. F1 is a diagnostic issue only. The score is not 9 because the guard and the atomic publish were never run end to end in a capture. `sharp` also remains an undeclared dependency (accepted risk).

**Final verdict: APPROVED.** F1 is LOW and does not block approval.
