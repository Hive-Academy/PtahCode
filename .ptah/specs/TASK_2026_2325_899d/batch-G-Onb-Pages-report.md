# Batch report — G-Onb-Pages (W12, TASK_2026_2325_899d)

Status: COMPLETE

## Files changed

All edits stayed strictly within the 4 assigned write files:
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` (modified)
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts` (modified)
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` (modified)
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts` (modified)

Both pages use inline templates (no `.html` files exist). Neither the review component, the child parts, nor the store were edited.

## Plan items done

| Plan / spec reference | Implementation and evidence |
| --- | --- |
| Review binding contract (`brief-G-Onb-Pages.md:14-25`, `batch-G-Onb-Review-report.md:35-41`) | Bound `[store]="state"` and `[runId]="loadedRunId()"` on `<ptah-stack-skill-review>` in `analyze-skills.page.ts`. Wired `(draftPreviewRequested)` to `wizard:generate-skill-draft` settling via `state.applyDraftPreviewResult(...)` / `state.applyDraftPreviewError(...)` with the same `revision` and `previewRequestSeq`; wired `(draftCreateRequested)` to `harness:create-skill` settling via `state.completeCreateDraft(...)` / `state.failCreateDraft(...)` with the same `revision`; wired `(itemSearchRequested)` to `wizard:search-skills` populating `state.setItemSearchResults(itemId, skills)` while reusing page searching/error state and stale-search version guards. Kept `(selectionToggled)`, `(searchRequested)`, and kept `<ptah-stack-skill-review>` mounted while consent is open (F29). |
| Store wiring & F29 mutual exclusion (`implementation-plan.md:177,194,204,575`, `batch-G-Onb-Store-Coverage-report.md:174-177`) | Replaced select-all with `state.applyRecommendationResult(response.data)` so only valid non-deprecated Install verdicts are pre-selected (D5). Guarded `preview()` against `state.draftOpen()`, routed consent opening through `state.openConsent(...)` and closing through `state.closeConsent()` (falling back to `state.setStage('review')` when closing from `'installing'` after an install/navigation failure). Guarded `generateDraftPreview()` and `createDraft()` against `state.consentOpen()`. |
| Run pill integration (`implementation-plan.md:191,197,570`, `batch-G-Onb-Shell-Pill-report.md:78-84`) | Injected `OnboardingRunPillService` in `AnalyzeSkillsPage`; calls `runPill.recordRun({ analysisPair: this.state.analysisPair(), stages: response.data.judge.stages })` when a recommendation result is accepted (preserving immutable `analysisPair` across Re-runs per R14/F26) and `runPill.clear()` on run/workspace change and page destroy. |
| F27 / R13 pre-flight Setup guard & recovery actions (`implementation-plan.md:192,572`, `decisions.md` R13) | `AnalyzeSkillsPage.load()` awaits `wizard:get-setup-model` before first load, Re-run, and Try again. Blocked initial load renders zero loading skeletons and no "previous result" wording; blocked Re-run keeps the prior judged result visible and intact above/below the R13 alert without claiming workspace fallback when `source === 'setup'`. Recovery actions map cause to `"Choose a provider"`, `"Choose a model"`, `"Sign in"` (passing `providerId`), and `"Retry"`, opening Settings via `AppStateManager.requestSettingsTab({ tab: 'providers', section: 'setup', ... })` + `setCurrentView('settings')`. Maps a `SETUP_MODEL_INVALID` race from `wizard:recommend-analysis-skills` into the R13 banner by re-reading `wizard:get-setup-model` (with a safe fallback). |
| Plan 3.8 typed load-error routing (`implementation-plan.md:583-606`) | Routes `!response.isSuccess()` with `errorCode === 'ANALYSIS_LOAD_FAILED'` (`'Could not read the saved analysis.'`), `'SKILLS_RECOMMEND_FAILED'` (`'Could not load skill recommendations.'`), and transport/timeout errors into the `loadError` panel with `backOnLoadError = true`, `"Try again"` (re-running the F27 guard), and `"Back"`, with no raw provider errors in UI text. |
| Analyze workspace Setup pair card (`design-spec.md:32-34`, `implementation-plan.md:173,204`) | Added read-only Setup model card on `analyze-workspace.page.ts` showing state badge (`Default` / `Set` / `Needs attention`), effective pair, hint line, and `"Change in Settings"` link button (`requestSettingsTab({ tab: 'providers', section: 'setup' })` + `setCurrentView('settings')`). Refreshes on init, on return from Settings (`currentView`: `'settings'` -> `'onboarding'`), and on `window` `focus`, removing the `focus` listener and aborting in-flight refresh on destroy, without ever mutating loaded run records. Honors `source: 'setup' | 'workspace'` in alerts, disables `"Start analysis"` (and interrupted-run start actions) with `"Choose a valid Setup model to start."` when invalid/unavailable, provides cause-specific actions plus explicit `"Use workspace model"` (`wizard:set-setup-model` `{ provider: '', model: '' }`) when `source === 'setup'`. |
| Parity & acceptance specs (`implementation-plan.md:205,568,571,572,575,605`, `parity-inventory.md` GAP 25/58/63) | Updated and expanded `analyze-skills.page.spec.ts` and `analyze-workspace.page.spec.ts` to cover all acceptance items, exact plan test names, and GAP 25/58/63. Also verified existing `analyze-workspace.render.spec.ts` passes with zero modifications. |

## Check commands and results

1. **TypeScript typecheck (`@ptah-extension/onboarding`):**
   - Command: `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
   - Result: **PASS** — 0 errors (exit 0).
2. **ESLint (4 changed files):**
   - Command: `npx eslint libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`
   - Result: **PASS** — 0 errors, 2 advisory `max-lines` warnings (`analyze-skills.page.ts` 818 lines, `analyze-workspace.page.ts` 850 lines vs 700-line limit; kept inline in the 2 page files per the 4-write-file lane constraint).
3. **Jest (scoped specs + existing render spec regression check):**
   - Command: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts`
   - Result: **PASS** — 3 passed suites, 60 passed tests, 0 failed (27.8 s).
4. **Scoped `ptah_get_diagnostics`:**
   - Called scoped to all 4 modified TS files; returned `TypeScript check still running after 45s` (unavailable within timeout). Native `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` verified the library cleanly with 0 errors.
5. **Working-tree scope check:**
   - `git status --short libs/frontend/onboarding/src/lib/analyze .ptah/specs/TASK_2026_2325_899d/batch-G-Onb-Pages-report.md` confirmed only the 4 assigned write files were modified plus this report file.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use `AppStateManager.requestSettingsTab({ tab: 'providers', section: 'setup', providerId? })` + `setCurrentView('settings')` | Invent `requestOpenSettings` / `focusProviderId` from plan line 572; use actual `AppStateManager` + `PendingSettingsTab.providerId` | `brief-G-Onb-Pages.md:35-37` explicitly prohibits adding `requestOpenSettings`; `app-state.service.ts:126-143,1459-1477` and `settings.component.ts:335-344` route `section: 'setup'` and `providerId` | Yes |
| Read `response.errorCode` on `RpcResult` rather than `response.error?.code` | Cast `response.error`; use real `RpcResult.errorCode` | `claude-rpc.service.ts:59-66` defines `error?: string` and `errorCode?: RpcUserErrorCode` | Yes |
| Handle `'installing' -> 'review'` in `AnalyzeSkillsPage.closeConsent()` alongside `state.closeConsent()` | Call only `state.closeConsent()` (leaves dialog stuck open after failed install/navigation); branch on `'consent'` vs `'installing'` | `stack-skill.store.ts:620-622` transitions only when `stageState() === 'consent'`; `analyze-skills.page.ts` closes consent on partial/failed install and failed guidance navigation | Yes |
| Resolve `AppStateManager` safely via `resolveOptionalAppState(inject(Injector))` and run background `refreshSetupModel()` RPC outside Angular Zone with `AbortController` cleanup in `AnalyzeWorkspacePage` | Hard-inject `AppStateManager` (breaks unmodified `analyze-workspace.render.spec.ts` whose bare `{ navigate }` `Router` mock crashes `SurfaceRouterService` on `router.events.pipe`); catch missing-router construction error and abort RPC on destroy | `analyze-workspace.render.spec.ts:83,127-136` is outside the 4-file write set and omits `AppStateManager` and `ClaudeRpcService` mocks; production always has real `Router` so `AppStateManager` resolves normally | Yes |
| Wrap `retry()` load kickoff in `NgZone.run(...)` in `AnalyzeSkillsPage` | Leave raw `void this.load(...)` (breaks Zone `whenStable()` when tests invoke `page.retry()` directly across two sequential `await`s); wrap in `ngZone.run(...)` | Matches template `(click)` zone execution and keeps `await fixture.whenStable()` deterministic in Zone-based specs | Yes |
| Keep Setup display/issue helpers inline inside both page files | Extract shared helper file (violates 4-write-file restriction); keep pure helpers inline | `brief-G-Onb-Pages.md:48-51` restricts writes strictly to the 4 files | Yes |

## Open items and needed changes in other groups

- **`G-Onb-Store-Coverage` (optional cleanup, non-blocking):** `StackSkillStore.closeConsent()` (`stack-skill.store.ts:620-622`) only transitions `'consent' -> 'review'`; allowing `'installing' -> 'review'` there would remove the `'installing'` fallback branch in `AnalyzeSkillsPage.closeConsent()`.
- **Advisory (`max-lines`):** Once the 4-file batch restriction is lifted, the pure `formatProviderDisplayName` / Setup-issue helper shared by `analyze-skills.page.ts` and `analyze-workspace.page.ts` can be extracted into a small sibling helper under `libs/frontend/onboarding/src/lib/analyze/` to bring both page files below 700 lines.
- **Electron visual review:** Focused-check policy forbids launching Electron/builds/e2e in this lane; rendered verification of the integrated Analyze and Skills pages in Electron at 1100×1000 and 1440×1000 remains for the visual-review phase.
- **Skill note:** As stated in `brief-G-Onb-Pages.md:6`, `angular-frontend-patterns` was disabled for model invocation in this host; neighboring standalone `OnPush` + signal + `DestroyRef` component conventions were followed.

## Extra reads

- `.ptah/specs/TASK_2026_2325_899d/implementation-plan.md` lines 250-291 (batch table) and lines 607-679 (Coordinator amendment C1 and Round 2 closure table).
- `.ptah/specs/TASK_2026_2325_899d/parity-inventory.md` (verified GAP 25, 58, 63 definitions).
- `.ptah/specs/TASK_2026_2325_899d/batch-G-Settings-UI-report.md` (verified Settings deep-link precedence for `section: 'setup'` vs `providerId`).
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts` & `.html`, `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts`, `libs/frontend/onboarding/src/lib/shell/onboarding-run-pill.service.ts`, `libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts`, `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`, `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts`, `libs/frontend/onboarding/jest.config.ts`, `libs/frontend/onboarding/src/test-setup.ts`.
- `libs/frontend/core/src/index.ts`, `libs/frontend/core/src/lib/services/index.ts`, `libs/frontend/core/src/lib/services/app-state.service.ts`, `libs/frontend/core/src/lib/services/claude-rpc.service.ts`, `libs/frontend/core/src/lib/services/vscode.service.ts`.
- `libs/frontend/chat/src/lib/settings/settings.component.ts`, `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts`.
- `libs/frontend/ui/src/index.ts`, `libs/frontend/ui/src/lib/button/button.types.ts`, `libs/frontend/ui/src/lib/badge/badge.types.ts`, `libs/frontend/ui/src/lib/foundation/alert.component.ts`.
- `libs/shared/src/index.ts`, `libs/shared/src/lib/types/rpc.types.ts`, `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`, `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`.
