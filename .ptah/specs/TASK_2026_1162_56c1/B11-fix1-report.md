# B11 fix round 1 report

## Items

- 0 done: `skill-services.spec.ts` awaits `getGuidance`. The repository search found direct calls only in `project-guidance.service.spec.ts` (seven test calls), `skill-services.spec.ts` (one), and the guidance handler in `setup-rpc.handlers.ts` (one). The service definition is not a caller. No `apps/**` caller was found.
- S1 done: `project-guidance.service.ts` checks `lstat`, regular-file status, and the 1 MB limit before each file read. A skipped probe logs once and adds no fact. The oversize test passes. This Windows host denied creation of a symlink fixture with `EPERM`, so the symlink assertion was skipped here.
- S2 done: `project-guidance.service.ts` sanitizes fact and evidence text in the response and record. File names are capped at 80 characters and appear only in evidence. Record evidence is inline code with backticks removed. `team-builder-guidance-brief.ts` sanitizes every quoted fact. The record test covers a filename with a Unicode line separator and backtick. Windows does not allow a control-character filename; the brief test covers control characters.
- M1 done: `team-builder-start.page.ts` passes trimmed intent. Its spec expects trimmed text.
- M2 done: `team-builder-start.page.ts` assigns `guidanceAnalysis` after the stale response check.
- M4 done: `team-builder-start.page.ts` returns to review when an install launch hits a guard.
- M5 done: `launchTeamBuilder` opens a chat tab and does not navigate. `team-builder-start.page.ts` keeps stage `launching` after success, preventing another Skip launch.
- M6 done: `project-guidance.service.ts` treats a parsed non-object package value as an empty object. A `null` test passes.
- M7 done: `project-guidance.service.ts` prefers `tsconfig.json`, then `tsconfig.base.json`, then another match. It no longer counts `pyproject.toml` as test configuration.
- M8 done: `team-builder-start.page.ts` clears selected IDs and owner decision at the start of `loadReview`. Its spec checks both.
- M9 done: `team-builder-guidance-brief.ts` orders Do not copy, Tolerate, Follow. A clipped line ends with ` (more omitted)` within 500 bytes. Its spec checks the order and marker.
- Accessibility done: `team-builder-skill-review.component.html` says `(optional)` when no owner decision is required. The control remains native radio input. The page binding uses `ownerDecisionRequired()` and the component declares `decisionRequired`.
- 12 done: the guidance handler uses bracket access for the index-signature `codeConventions` field. The Electron spec TypeScript check passed.
- Handler test done: `setup-rpc.handlers.spec.ts` checks that empty `codeConventions` is not passed as detected analysis.
- Double click tests: the page spec checks a second Skip does not launch; the existing install spec checks a second Install makes one RPC call. The existing consent spec checks that the dialog opens again when closed during install.

## Checks

- Backend Jest command for the two service specs and `setup-rpc.handlers.spec.ts`: 3 suites, 73 tests passed. The first run failed on TS4111 and Windows symlink `EPERM`; both were addressed before the passing run.
- Frontend Jest command for all four Team Builder specs: 4 suites, 22 tests passed. The first run failed on an old `starting() === false` expectation; the expectation now matches the launch lock.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`: passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.spec.json`: passed.
- `npx eslint` on changed TypeScript files: exit 0, 0 errors, 51 warnings. Warnings include existing missing accessibility modifiers and max-lines findings.
- Changed template bindings were read against the component inputs. No rendered screenshot was possible without running a forbidden build, serve, or dev command.

The workspace already had unrelated modified and untracked files when this lane began. They were left as found. No files were staged or committed.
