# Batch 2 videos report

## Files changed

- `apps/ptah-electron-e2e/src/support/electron-launcher.ts`: optional Playwright `recordVideo` passthrough; existing launches retain their default behavior.
- `apps/ptah-electron-e2e/docs-videos.config.ts`, `src/docs-videos/*.flow.ts`, and `src/docs-videos/_harness/{video-fixtures,pace,finalize-video}.ts`: manual Electron recording flows and isolated capture fixture.
- `apps/ptah-docs/project.json`: manual `videos` target with the screenshot target's build dependencies.
- `apps/ptah-docs/public/assets/videos/{cli-agent-orchestration,ptah-mcp-server,plugins,providers}.mp4`: new recordings.
- `apps/ptah-docs/public/assets/videos/auth.mp4`: deleted after confirming no docs source references with `rg`.
- This report. The screenshot harness, PNGs, docs pages, and `install.mp4` were not edited by this lane. A separate screenshot lane was active concurrently.

## Videos

| Video | Status | Duration | Size | Privacy check |
| --- | --- | ---: | ---: | --- |
| `ptah-mcp-server.mp4` | New Electron recording | 16.88 s | 702,086 B | Passed final 1 fps frame inspection; sample workspace only. |
| `plugins.mp4` | New Electron recording | 11.64 s | 367,149 B | Passed final 1 fps frame inspection; public plugin catalog only. |
| `providers.mp4` | New Electron recording | 12.84 s | 235,047 B | Passed final 1 fps frame inspection; settled connections and CLI row. |
| `cli-agent-orchestration.mp4` | New Electron recording, pre-run UI | 11.56 s | 464,079 B | Passed final 1 fps frame inspection; no AI run shown. |
| `setup-wizard-analysis.mp4` | Kept; docs describes a completed run | 135.25 s | 7,406,211 B | Existing asset, unchanged; outside new/changed frame review. |
| `setup-wizard-agent-generation.mp4` | Kept; docs describes a completed run | 106.21 s | 3,042,575 B | Existing asset, unchanged; outside new/changed frame review. |
| `install.mp4` | Kept per D10 | 24.08 s | 628,420 B | Existing asset, unchanged; outside new/changed frame review. |

All four new clips are 1600 × 900, H.264/yuv420p, encoded with `+faststart`, and below 5 MB. The inspected 1 fps frames contained no personal user paths, emails, account names, tokens, private project names, or OS notifications. `auth.mp4` was deleted and has no docs source reference.

## Commands

- `ptah_get_diagnostics` scoped to `video-fixtures.ts`: 0 errors, 0 warnings after the home isolation correction.
- Earlier captures under the old home setup were replaced. One earlier locked capture using the isolated fixture exited 0 (three Nx tasks succeeded), but its production-settings hash comparison was inconclusive because a screenshot capture overlapped it. Both captures were running when the hash changed from `3B77A44A544E315FAB6EA64E66ACF6A418A2FB94D1AE5D6EC028FEC36215132B` to `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4`. The overlap prevents attribution.
- Final `node scripts/verify.mjs --exec --task docs-videos -- npx nx run ptah-docs:videos`: exit 0; filtered output: `NX 3 tasks: 3 succeeded`, video target 9m 47s. The fixture asserted that the Electron child received its temporary `USERPROFILE` and `HOME`. Production `C:\Users\dev\.ptah\settings.json` SHA256 before **and** after this run: `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4`. The run did not change that file's content. A screenshot capture briefly overlapped the final run, but the hash stayed stable throughout and at exit.
- `ffprobe` on all four new MP4s: H.264, yuv420p, 1600 × 900; durations and sizes in the table. `ffmpeg` extracted 1 fps contact sheets for all four; visual privacy review passed.
- Final `npm run verify -- -p ptah-electron-e2e,ptah-docs`: exit 0; header listed `ptah-electron-e2e,ptah-docs`. Filtered output: `NX 2 tasks: 2 succeeded, 2 cached` for lint/typecheck. `ptah-docs` has no lint/typecheck target; neither project has a test target (`NX 0 tasks`). An earlier uncached run after fixing two fixture lint errors also exited 0.

## Fix round 2

- Added explicit readiness waits before recording Settings flows: a connection card and catalog text must appear, CLI detection must finish, and the Codex agent row and order chips must be visible. Recording now opens on settled screens after the existing FFmpeg lead trim.
- Increased holds to 2 seconds per settled state and 3 seconds at the end; added slow pointer moves and smooth scrolling. The plugins flow holds Skills & Plugins, then Ptah Plugins, each for at least 2.5 seconds. All four final clips run 11.56-16.88 seconds; individual durations and byte sizes are in the Videos table.
- First locked recapture attempt: exit 1; filtered output `NX 3 tasks: 2 succeeded, 1 failed`. The plugins flow's `Ptah Plugins` heading locator matched twice. Replaced it with the unique `source-band-heading` test ID. Production settings SHA256 before and after that attempt was `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4`.
- Final foreground locked recapture, `node scripts/verify.mjs --exec --task docs-videos -- npx nx run ptah-docs:videos`: exit 0; filtered output `NX 3 tasks: 3 succeeded`; video target 10m 40s. The isolated temporary `USERPROFILE` and `HOME` fixture remained in use. `Get-FileHash C:\Users\dev\.ptah\settings.json` SHA256 before: `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4`; after: `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4`. This capture did not change the production settings file.
- Final `ffprobe` and 1 fps FFmpeg frame review on all four recordings: H.264, yuv420p, 1600x900, `+faststart`, each below 5 MB. First frames and contact sheets show no `Detecting...`, loading catalog, or empty CLI table. Privacy review passed for every sampled frame: no personal user paths, emails, account names, tokens, private project names, or OS notifications.
- `ptah_get_diagnostics` on the six changed TypeScript files: 0 errors and 0 warnings; the corrected plugins flow was checked again with 0 errors and 0 warnings. `npm run verify -- -p ptah-electron-e2e,ptah-docs`: exit 0; header listed both projects, with two uncached lint/typecheck tasks succeeded. `ptah-docs` has no lint/typecheck target; neither project has a test target.

## Decisions

- **Home isolation (user correction):** use a fresh temporary home for each video fixture, pass `USERPROFILE` and `HOME` to Electron, and assert the child received both. Electron `--user-data-dir` and `PTAH_DB_PATH` alone do not isolate `os.homedir()/.ptah`. No `.ptah` seed is needed for these four pre-run flows; the docs sample repo and a disposable profile supply their UI state. The fixture reads no production `.ptah` content. This change is reversible.
- **Settled, paced footage (review correction):** wait for concrete Settings data and CLI rows before the first recorded step, then hold each destination and move the pointer slowly so viewers can follow the flow. The source UI and video names remain unchanged. This choice is reversible.
- **No completed AI runs (D9):** record only pre-run UI for CLI orchestration and keep the two existing setup wizard videos because their docs pages describe completed runs. Recording a live provider run or fabricating a completed result would conflict with D9. This choice is reversible when approved, privacy-safe footage exists.
- **Landing reuse (D7):** previewed landing `providers`, `orchestration`, and `multi-agent` with `ffprobe` and sampled FFmpeg frames. Their flows do not match the docs Settings and pre-run orchestration surfaces, so the four new clips are recorded from Electron. This choice is reversible.
- **Cleanup (D10):** removed only the unreferenced `auth.mp4`; kept `install.mp4` and all docs video references. This choice is reversible from the original asset source.

## Clarifications Needed

None currently.
