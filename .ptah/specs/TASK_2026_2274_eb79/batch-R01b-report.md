# Batch R01b — Bots design-preview capture

Status: implemented; coordinator capture and visual review pending. Opt-in, never a gate.

## Files

- `apps/ptah-electron-e2e/src/design-preview/bots.shot.ts`
- `apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts`
- This report.

## Coordinator capture command

From repository root, after the coordinator separately prepares the Electron build artifacts:

```powershell
node scripts/verify.mjs --exec --task bots-shots -- node node_modules/@playwright/test/cli.js test --config apps/ptah-electron-e2e/design-preview.config.ts bots.shot
```

Existing config: one worker, no retries, build-precheck only. Default output: `.ptah/specs/TASK_2026_2274_eb79/screens`. Override with `PTAH_SHOT_DIR`, resolved from repository root like settings-lanes. Playwright result folder: `dist/apps/ptah-electron-e2e/design-preview-results`.

## States and expected PNG names

Four independent fresh Electron launches at widths 1280 and 900, themes ptah-glass and ptah-glass-light. Height 1100, scale 1. Two bots created through real UI/backend. At 900 capture roster and selected editor. Expected 42 PNGs:

- `bots-empty-1280-ptah-glass.png`
- `bots-populated-1280-ptah-glass.png`
- `bots-editor-1280-ptah-glass.png`
- `bots-dirty-1280-ptah-glass.png`
- `bots-validation-1280-ptah-glass.png`
- `bots-saved-1280-ptah-glass.png`
- `bots-conflict-1280-ptah-glass.png`
- `bots-disabled-1280-ptah-glass.png`
- `bots-delete-dialog-1280-ptah-glass.png`
- `bots-archived-1280-ptah-glass.png`
- `bots-empty-1280-ptah-glass-light.png`
- `bots-populated-1280-ptah-glass-light.png`
- `bots-editor-1280-ptah-glass-light.png`
- `bots-dirty-1280-ptah-glass-light.png`
- `bots-validation-1280-ptah-glass-light.png`
- `bots-saved-1280-ptah-glass-light.png`
- `bots-conflict-1280-ptah-glass-light.png`
- `bots-disabled-1280-ptah-glass-light.png`
- `bots-delete-dialog-1280-ptah-glass-light.png`
- `bots-archived-1280-ptah-glass-light.png`
- `bots-empty-900-ptah-glass.png`
- `bots-populated-900-ptah-glass.png`
- `bots-editor-900-ptah-glass.png`
- `bots-dirty-900-ptah-glass.png`
- `bots-validation-900-ptah-glass.png`
- `bots-saved-900-ptah-glass.png`
- `bots-conflict-900-ptah-glass.png`
- `bots-disabled-900-ptah-glass.png`
- `bots-delete-dialog-900-ptah-glass.png`
- `bots-archived-900-ptah-glass.png`
- `bots-list-900-ptah-glass.png`
- `bots-empty-900-ptah-glass-light.png`
- `bots-populated-900-ptah-glass-light.png`
- `bots-editor-900-ptah-glass-light.png`
- `bots-dirty-900-ptah-glass-light.png`
- `bots-validation-900-ptah-glass-light.png`
- `bots-saved-900-ptah-glass-light.png`
- `bots-conflict-900-ptah-glass-light.png`
- `bots-disabled-900-ptah-glass-light.png`
- `bots-delete-dialog-900-ptah-glass-light.png`
- `bots-archived-900-ptah-glass-light.png`
- `bots-list-900-ptah-glass-light.png`

## Runtime evidence and soft assertion

Every capture softly asserts no Bots button or link has an accessible name beginning Start, Run or Talk. Image names, forbidden-control counts, document overflow and Playwright errors are written even if a later state fails:

- `bots-review-1280-ptah-glass.json`
- `bots-review-1280-ptah-glass-light.json`
- `bots-review-900-ptah-glass.json`
- `bots-review-900-ptah-glass-light.json`

Result: NOT EXECUTED in this lane. Coordinator must record actual soft assertion results from those JSON files and Playwright output. No visual-quality claim.

## Not captured

No required state was excluded as unreachable in the script. Conflict, disabled and archived have real UI/RPC paths and are scripted, pending execution. Additional implementation-plan loading, load error, saving, save error and completed deletion states are not captured; these need timing/fault control or further destructive progression. Keyboard order, focus return, reload persistence and visual reference comparison remain coordinator review work.

## Decisions

- Reuse support fixtures, Electron launcher, UiDriver setup and settings-lanes fixtures, theme popover, CDP viewport and screenshot folder conventions.
- UiDriver replaces every real RPC listener. Local fixture preserves real listeners before installing setup mocks, then multiplexes bots:* exclusively to the real backend and other messages to existing mocks. No Bots responses are mocked.
- New temporary workspace is passed as a real launch argument so backend authorization and renderer scope match. Launcher assigns fresh PTAH_DB_PATH and user-data directory, dropping inherited production DB paths. Workspace is retained for diagnosis, consistent with retained temp DB; launcher cleans user-data.
- Start from Chat shell, click title-bar tab role=tab / aria-label Bots; no URL navigation.
- Current theme picker groups both Ptah Glass variants under Glass, unlike the older settings-lanes Dark-tab example. Use same popover mechanism, select Glass, verify exact data-theme and data-theme-mode.
- Create through New bot, Name, Instructions, Create bot. Dirty/validation/saved use real editor actions. Conflict uses a second real bots:update, then stale UI save and Compare bot revisions. Enable then disable with switch; open permanent-delete retention choices without deleting; archive through removal dialog and select with Show archived.
- Read design spec and implementation-plan Test plan. Coordinator comparison: prototype/bots.html and reference PNGs; check 320px roster, 960 split, gutters, aside alignment, gold focus/primary action, floating labels, save bar, conflict drawer and removal modal. No screenshots rendered here because capture execution is reserved for coordinator.
- CLI skill discovery/loading mechanism unavailable. Local skill paths discoverable; task is capture automation, not Angular UI implementation or design, so no design/frontend skill applied.
- Ptah AST/file search and scoped diagnostics consulted; native PowerShell/Get-Content/rg used for targeted source reads when index results were not useful. No git commands.

## Command results

- `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json`: exit 0. Coverage limitation: solution config has empty files/include; referenced tsconfig.spec.json excludes src/design-preview. This does not establish type safety of new files. Config untouched because scope forbids changes.
- `npx eslint apps/ptah-electron-e2e/src/design-preview/bots.shot.ts apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts`: exit 0, including final rerun.
- `npx prettier --write apps/ptah-electron-e2e/src/design-preview/bots.shot.ts apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts`: exit 0.
- `npx prettier --check apps/ptah-electron-e2e/src/design-preview/bots.shot.ts apps/ptah-electron-e2e/src/design-preview/bots.fixtures.ts`: exit 0, including final check.
- Ptah diagnostics reported 0 errors/warnings, analyzed coverage null; not proof of direct shot typechecking.
- No builds, Playwright, e2e, Nx or npm run verify executed.
