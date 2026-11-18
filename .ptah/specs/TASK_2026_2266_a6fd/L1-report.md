# L1 — system lane Test

## Files changed by L1

- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts`
- `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts` — only `test`, `testResult`, `systemTestTexts`, and `tableTestResults`; template changes in the shared file belong to the other lane.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts`
- This report.

## Design summary

System lane IDs are their CLI names. `testSystemLane` runs `agent:detectClis`, parses it with the existing parser, measures elapsed time, and writes the same `ProvidersCliTest` store as instance tests. A new test drops the old result; section generations and `clearCliTest` discard superseded or cleared probes. Instance tests retain `ptahCli:testConnection`.

Claude reads the actual saved lane selection from the existing Electron-gated `ProviderAccountsStateService` snapshot. A named selection calls `provider:getAccountStatus` and requires `signed-in` with no pending operation; ambient calls `provider:getAmbientClaudeStatus` with refresh and requires `connected` (the contract's signed-in ambient state). The method also accepts an explicit account selection. No new RPC or injectable was introduced.

Failure reasons are fixed short copy: `Not detected.`, `Account not ready.`, and `Account not signed in.` Host text never enters a result. Table values use `Passed.`, `Passed in Nms.`, a short system reason, or `Failed.` for an instance failure. Toasts retain the lane name and full result prefix.

Specs cover detection success, absent/uninstalled failures, signed-out named account, connected/signed-out/unknown ambient states, no registry RPC for system lanes, existing instance RPC behavior, result clearing, matrix routing, compact failure copy, and named toast feedback.

## Checks

- PASS — `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` — final rerun: 118/118 tests.
- PASS — `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` — corrected ambient enum comparison and reran successfully.
- PASS — `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`.
- PASS — `git diff --check -- libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts`.
- PASS with warnings — `npx eslint libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts` — zero errors; existing oversized state service warning; module-boundary rule skipped because no cached Nx project graph exists.
- PASS — `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts` — final rerun: 11/11 tests, including actual detail-panel Test clicks and short rendered results.
- PASS — `npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts` — final spec-only rerun after adjusting the tests to click Test in the expanded detail panel; no lint findings, same missing cached graph warning.

Initial core Jest run passed 116 tests. Initial core typecheck caught an incorrect ambient state comparison; corrected from `signed-in` to the contract's `connected` and the rerun passed.

Initial chat Jest could not resolve the preset's worktree-local `marked` UMD path. Added an ignored local `node_modules` junction to the existing shared checkout dependency directory, without changing dependencies or tracked configuration. The next run reached rendering and failed all 11 specs on concurrent L2-owned `wideDetail` bindings accidentally applied to two native buttons in `lanes-table.component.ts`. The owning lane was notified and corrected those bindings; the final rerun uses that correction.

An intermediate chat rerun passed the 8 existing specs but failed the 3 new tests because their selectors looked for Test in the collapsed row. Corrected the new specs to expand the detail panel and use its rendered Test button; all 11 now pass.

## Tool and visual verification limits

Read the task context first. Skill discovery returned no matching installed result, but filesystem discovery found and I read `.claude/skills/angular-frontend-patterns/SKILL.md`; there was no CLI-native skill loader exposed. Ptah dependents lookup was used; scoped Ptah diagnostics timed out after 45 seconds, so explicit project `tsc` is the fallback. Source reads/searches used PowerShell and `rg`.

No build, serve, e2e, Nx, workspace-wide checks, commits, pushes, stashes, or merges. No browser session was active; this lane did not launch a server under the task's prohibition, so no screenshot or visual-reference comparison was performed. Angular DOM rendering is exercised by the focused matrix specs when the shared table is valid. No visual quality claim is made.

Post-L2 confirmation: reran npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts against the current shared files after L2 completion: PASS, 11/11 tests (28.006 seconds).
