# Lane brief — G-Onb-Pages (W12, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FO = libs/frontend/onboarding/src/lib/
Note: the `angular-frontend-patterns` skill is disabled for model invocation here. Follow the
patterns of the neighbor pages (standalone, OnPush, signals, DestroyRef cleanup).

## Objective
Integrate the judged skills step and the Setup pair into the two analyze pages. This is the
cross-surface integration group: all parts, the store and the review are done and committed.

### `FO analyze/analyze-skills.page{.ts,.spec.ts}`
1. Review binding (contract from G-Onb-Review, binding):
   `<ptah-stack-skill-review [store]="state" [runId]="<loaded analysis manifest runId> ?? ''">`.
   - `(draftPreviewRequested)` -> `SkillDraftPreviewAction { params: WizardGenerateSkillDraftParams,
     revision, previewRequestSeq }`: call `wizard:generate-skill-draft` with `params`; settle with
     `state.applyDraftPreviewResult(...)` / `state.applyDraftPreviewError(...)` (same revision/seq).
   - `(draftCreateRequested)` -> `SkillDraftCreateAction { revision, submitted: { name, description,
     body, slug } }`: the review already called `beginCreateDraft`. Call `harness:create-skill` with
     the submitted fields; settle with `state.completeCreateDraft(...)` / `state.failCreateDraft(...)`.
   - `(itemSearchRequested)` -> `{ itemId, query }`: search and fill
     `state.setItemSearchResults(itemId, skills)`; reuse the page searching/error state.
   - Keep `(selectionToggled)` and `(searchRequested)`. Keep the review mounted (or its blocker
     visible) while consent shows (F29).
2. Store wiring (G-Onb-Store-Coverage report "Open Items", G-Onb-Pages bullets): replace the
   select-all at about lines 250-257 with `state.applyRecommendationResult(response.data)`; guard
   `preview()` against `state.draftOpen()` (F29); use `state.openConsent(...)` /
   `state.closeConsent()`.
3. Run pill: call `OnboardingRunPillService.recordRun({ analysisPair, stages })` when the
   recommendation result is accepted and `clear()` when the run ends / page is destroyed (see
   TF/batch-G-Onb-Shell-Pill-report.md for the exact types).
4. F27 / R13 (plan line 192 and the 3.7 row `R13/F27`): await `wizard:get-setup-model` before the
   first load, Re-run and Try again; blocked initial vs blocked restart states with live recovery
   actions. To open Settings at the Setup row use the existing `AppStateService.requestSettingsTab(
   { tab: 'providers', section: 'setup' })` + `setCurrentView(...)` pattern (`requestOpenSettings`
   in plan line 572 does not exist; do not add it).
5. Plan 3.8 (lines 583-606): `ANALYSIS_LOAD_FAILED` and `SKILLS_RECOMMEND_FAILED` open the
   loadError panel with Try again (routing at about lines 241-248); the spec test named at line 605.
6. Parity specs: GAP 25, 58, 63, F27/F29 (plan line 205).

### `FO analyze/analyze-workspace.page{.ts,.spec.ts}`
Read-only Setup pair card on the analyze page (design-spec A2, lines 32-34; plan section 8 line
173): show the effective Setup pair (`source: 'setup' | 'workspace'`), refresh it on init, on
return from Settings and on window focus (release listeners on destroy), never rewrite run
records; a link opens Settings at the Setup row (pattern above).

## Write files (only these 4)
M: FO analyze/analyze-skills.page.ts, .spec.ts; FO analyze/analyze-workspace.page.ts, .spec.ts.
Inline templates stay inline; if a page has an .html file, report it instead of editing it.
Do not edit the review, the parts or the store; report each needed change.

## Read set (line ranges only)
- TF/implementation-plan.md lines 169-206 (sections 8, 9), 559-582 (3.7 rows naming the pages),
  583-606 (3.8). Never read the plan in full.
- TF/design-spec.md lines 32-62 (A2, B, state map) and section 14 (line 238 to end).
  TF/decisions.md lines 40-105. TF/prototype/README.md. NEVER open TF/prototype/index.html.
- Contracts: TF/batch-G-Onb-Review-report.md ("Contract for G-Onb-Pages"),
  TF/batch-G-Onb-Store-Coverage-report.md ("Store API", "Open Items"),
  TF/batch-G-Onb-Shell-Pill-report.md, TF/batch-G-Wizard-Client-report.md (wizard client calls).
- The 4 write files; libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

## Acceptance
- Specs cover each numbered item above (draft preview/create settle by revision, item search,
  recommendation result applied, preview guard, recordRun/clear, setup-model awaited before load,
  blocked states and Settings link, 3.8 error codes, analyze page Setup card refresh + cleanup).
- No `any`. No raw provider errors in UI text.

**Deliverable**: TF/batch-G-Onb-Pages-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
