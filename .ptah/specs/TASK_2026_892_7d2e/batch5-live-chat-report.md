# Batch 5 screenshot report

## Files changed

- apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts: saved-session shot now uses the Lanes tablist and visible sub-agent lane, requires a tool row, and checks rendered privacy before capture.
- apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts: saved-session mode passes CLAUDE_CONFIG_DIR to the original home/.claude in place and copies only the two D15-approved development databases and their present WAL/SHM sidecars into the isolated run directory. The app home and ~/.ptah stay isolated; no credential file is copied.
- apps/ptah-docs/SCREENSHOTS.md: documented saved-session mode, the development DB copy, environment variables, Claude configuration passthrough, and the model-price mask.
- apps/ptah-docs/public/screenshots/chat-model-selector.webp: recaptured earlier in this batch with prices masked; not changed by this D14 pass.
- This report.

The six requested chat/session WebPs were not changed by the D15 attempt. They retain their 18:03 UTC timestamps. Earlier code and image changes from this batch were present when this pass began; no other existing changes were reverted.

## Live run and retry

Earlier D12 prompt: “Use one sub-agent to read README.md and src/pricing.ts in this repository, then summarize what the project does in three bullet points. Do not edit files.”

The first locked run stopped before sending because Plan Mode intercepted Send. The next run sent the prompt once; Claude auth and an Explore sub-agent worked, but the turn stopped at ExitPlanMode and timed out. The authorized single retry used default approval mode and sent the same prompt once. Auth worked, the Explore sub-agent finished, and the main turn returned three summary bullets. The retry's screenshot assertion failed on the obsolete ptah-inline-agent-bubble selector; current UI represents the sub-agent as a lane tab. Retry locked-command duration: 2m 55s. No further AI prompt was sent.

## Saved-session capture

D14 barred further prompts and directed replay of existing sessions. The saved-session test never fills or sends the composer. It opens Previous sessions, searches candidate titles, and requires a visible sub-agent lane with a tool row before writing any of the six images. PTAH_DOCS_KEEP_CAPTURE=1 retained the isolated captures.

Two locked saved-session attempts used PTAH_DOCS_SESSION_WORKSPACE=D:\projects\ptah-extension, PTAH_DOCS_LIVE_AI unset, and the docs-live-chat machine lock around the scoped ptah-docs:screenshots grep:

1. Exit 1 after 3m 8s. The Sessions panel was collapsed, so Previous sessions could not be opened. I fixed the test to expand the panel.
2. Exit 1 after 2m 55s. Previous sessions opened, but none of “Run F. Use the Agent tool”, “Run E. Use the Agent tool”, or “Convene a Tribunal Council” rendered a saved sub-agent lane with tool rows. The isolated app showed no active session rows. No screenshot was written.

Read-only metadata search found Run F/E strings in real Claude transcript files, but the selected development workspace state did not expose those titles as replayable session rows in the isolated app. “Convene a Tribunal Council” occurred in another development workspace's state. D15 then authorized the final development DB copy attempt described below. No new AI prompt was sent.

## Settings hash

C:\Users\dev\.ptah\settings.json SHA-256 before and after saved-session capture:
54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238 (unchanged).
The fixture hash guard stayed on. The harness did not use the real ~/.ptah as the app home.

## Privacy check

All six existing images were opened after the failed saved-session runs. Since none was regenerated, these observations do not approve them as D14 captures.

| Image | Observation |
| --- | --- |
| chat-execution-tree.webp | Old research conversation with tool rows and token/cost numbers; no visible path, email, account, or token secret. Wrong conversation. |
| chat-overview.webp | Old “ollama deep-agent” conversation and tool calls; no obvious private path or email. Wrong conversation. |
| chat-cost-bar.webp | Old neutral cost panel; no obvious private path, email, or account name. Wrong conversation. |
| sessions-overview.webp | Old generic single session row; no obvious private text. Not regenerated. |
| sessions-tabs.webp | Old image visibly contains a private project name. Unsuitable for publication under D14. |
| sessions-history.webp | Old generic single session row; no obvious private text. Not regenerated. |
| chat-model-selector.webp | Earlier new capture was opened: per-model prices absent; no visible private path, email, account name, or token secret. |

The saved-session test masks rendered paths, emails, the local username, and the selected workspace name before capture, then checks target text. This masking was not exercised on a successful saved-session image. The stale sessions-tabs.webp still shows a private project name and must not be published as an approved D15 capture.

## Verification

- First saved-session locked capture: exit 1 (Previous sessions trigger hidden).
- Second saved-session locked capture: exit 1 (no replayed sub-agent lane with tool rows).
- ptah_get_diagnostics scoped to the two edited TypeScript files: 0 errors.
- npm run verify -- -p ptah-electron-e2e: exit 0; header confirmed one project; lint and typecheck passed. The project has no test target.
- node apps/ptah-docs/scripts/check-screenshot-refs.mjs: exit 0; all 29 references resolve.
- Final D15 DB-copy locked capture: exit 1 after 3m 8s; details below. No image was written.
- Final `npm run verify -- -p ptah-electron-e2e`: exit 0 after the machine queue released; one project selected, lint and typecheck both succeeded, and this project has no test target.
- Screenshot reference check after D15: exit 0; all 29 references resolve.
- No skill-loading tool was exposed by this host, so no optional UI skill could be loaded.

## Decisions

- Stop after the final D15 capture fails. Options: retry or stop and report. The user explicitly called this the last attempt; no further capture or prompt is authorized. Reversible with new direction.
- Copy only the two D15-approved development databases and their present WAL/SHM sidecars into the isolated profile. Options: use the isolated empty DBs or copy the approved development DBs. D15 and the source path resolvers support the copy; the original files were never opened with SQLite or modified. Reversible by removing the isolated run directory.
- Leave six stale images untouched. Options: overwrite with empty/incomplete views or retain them. The test wrote none because its prerequisite failed. Reversible.
- Read Claude transcripts in place for saved mode. Options: use CLAUDE_CONFIG_DIR or copy configuration files. D14 explicitly chooses in-place access and bars credential copying. Reversible.
- Keep the real settings hash guard. The before/after SHA-256 match confirms the isolation check held. Reversible.
## DB copy attempt

D15 explicitly allowed read-only file copies of `~/.ptah/state/ptah-dev.sqlite` and `sessions-dev.sqlite`, with their present `-wal`/`-shm` sidecars, into the isolated run directory. The harness used `fs.copyFileSync` only; it never opened an original with SQLite, never read a production database, and wrote nothing under the real `~/.ptah`. It set `PTAH_DB_PATH` and `PTAH_SESSIONS_DB_PATH` to the copies. `CLAUDE_CONFIG_DIR` still pointed to the original `.claude` for transcript replay, while app HOME/USERPROFILE/APPDATA/LOCALAPPDATA stayed isolated.

The final locked command used `PTAH_DOCS_SESSION_WORKSPACE=D:\projects\ptah-extension`, `PTAH_DOCS_KEEP_CAPTURE=1`, `PTAH_DOCS_LIVE_AI` unset, and `node scripts/verify.mjs --exec --task docs-live-chat -- npx nx run ptah-docs:screenshots -- --grep "saved conversation, lane, cost, and sessions surfaces"`. It exited 1 after 3m 8s. Electron reported `SqliteMigrationRunner: database reports schema_migration` and `PERSISTENCE_UNAVAILABLE`: the copied development database schema is newer than this build. Playwright then timed out clicking `[data-previous-sessions-trigger]:visible` because the top bar's `Git status is unavailable (git reported an error)` element intercepted pointer events. The test never reached a saved lane or wrote an image. No prompt was sent; retry count for D15: zero. The earlier live retry had already exhausted the one permitted AI retry.

The real `C:\Users\dev\.ptah\settings.json` SHA-256 was `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238` before and after this run. The six image timestamps remained 18:03 UTC. This was the user-designated last attempt, so capture stopped. The stale `sessions-tabs.webp` contains a private project name and remains unsuitable for publication. The other five stale images likewise do not satisfy the requested saved-session capture.
