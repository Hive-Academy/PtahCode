# Batch B report

Integrated the coverage board in both Electron onboarding hosts while keeping a single install/continue primary in the DOM. Existing RPC contracts and backend files are unchanged.

## Files changed

- All 14 Batch A source/template/spec files formatted in place.
- Added `proposal/stack-skill-review.component.css` and `proposal/skill-selection-rail.component.css` for named container queries.
- Updated `proposal/stack-skill-review.component.{ts,html}`, `proposal/stack-skill.store.ts`, `analyze/analyze-skills.page.ts`, `proposal/team-builder-start.page.{ts,html}`, and only the confirm label in `proposal/stack-skill-consent.component.html` (plus formatting).
- Updated the four existing host/review/consent specs named by the batch.
- Paths above are relative to `libs/frontend/onboarding/src/lib/`. No git commands or existing-file reversions were performed.

## Step 0

Scanned all 14 Batch A files; replaced literal question marks in the `Finding skills` and `Preparing install` labels/specs with U+2026. Files were rewritten as UTF-8 without BOM. Ran `npx prettier --write` on all Batch A files and every changed source/template/spec/CSS file. Final audit of all 27 changed/new implementation and spec files: valid UTF-8, no BOM, no malformed question-mark labels, all below 700 lines (maximum 515 lines). The rail template and its spec contain `Finding skills…`; its class and spec contain `Preparing install…` (literal U+2026).

## Integration APIs

All existing review inputs/outputs are retained. `stackLoading` enables the analysis-only strip skeletons before its first summary arrives; team-builder leaves it off and has no coverage strip. New optional review inputs: `detectedItems: StackSummaryItem[] = []`, `unmatchedItems: StackSummaryItem[] = []`, `searchFailures: {item: string; reason: string}[] = []`, `summarySource: 'structured' | 'legacy' | 'none' | null = null`, `warning: string | null = null`, `selectionReset = false`, `previewing = false`, `stackLoading = false`, `previewScriptCount: number | null = null`, `headingLevel: 1 | 2 = 2`. New outputs: `selectionResetDismissed: void`, `retryRequested: void`, `searchCleared: void`. Clear invalidates pending analysis searches; team-builder uses its existing empty-search cancellation path. The results heading includes the submitted query.

The rail adds `responsive = false`. It measures the nearest scroll container and observes its size; the one observer and resize listener are released with the component. The selected list alone flexes and scrolls. Actions use one column below 720px. The strip collapses more than 12 items to 11 chips plus an in-place expansion button. The shell enables it: a named `skills` container query switches one component between bar and rail at 1100px. The shell card grid changes at 720/1440px. The existing explicit `layout: 'rail' | 'bar'` API still works for standalone callers.

Store addition: private writable `previewingState`, public readonly `previewing`, writer `setPreviewing(boolean)`. `previewScriptCount` derives from previews matching the current selected keys; toggling clears previews and approvals, returning the helper to its pre-preview text. Reset, reload and Back invalidate preview busy state.

## Capability preservation

The table maps every inventory capability. Approved label/layout changes are identified explicitly; only the removals R1-R4 are applied.

| Capability | Result                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1         | Moved to review shell h1; title changes by D9/R4, `skill-review-title` focus target and analysis test id retained.                                             |
| C2         | Moved to coverage strip; name on chip, kind and evidence in title and accessible description (P12).                                                            |
| C3         | Moved to shell hint and polite warning alert; exact no-summary text retained.                                                                                  |
| C4         | Moved to shell failure alert and unmatched-list section; item/reason and name/kind retained.                                                                   |
| C5         | Moved to projected header action and dismissible info alert; rerun invalidation stays in page.                                                                 |
| C6         | Stays in analysis page/store; initial/rerun selection and stale-response guards retained.                                                                      |
| C7         | Stays in analysis page; query restoration and exact error texts retained.                                                                                      |
| C8         | Stays; shell error alert/panel and continuing without selection retained.                                                                                      |
| C9         | Stays in analysis page; navigation, tab creation and duplicate guard retained.                                                                                 |
| C10        | Moved to shell header; D9 title and R4 duplicate-heading removal, description/focus target/error preserved.                                                    |
| C11        | Moved to shell skeleton grid and live region (P18); previous grid stays on rerun, per States.                                                                  |
| C12        | Stays in shell; normative empty-state labels/action replace old copy (P19).                                                                                    |
| C13        | Moved to skill-pick-card; score text removed by R2; full key line removed by R3 (key remains in title); evidence becomes chips/raw fallback D4.                |
| C14        | Moved to skill-pick-card and rail; canonical toggle/store semantics retained, busy disabling added per card States.                                            |
| C15        | Moved above recommendations in shell; field/name/ngModel/trimmed submit retained.                                                                              |
| C16        | Stays in shell; search disabled rules, loading live text and error retained.                                                                                   |
| C17        | Moved to search-results region above recommendations using skill-pick-card; recommendation deduplication retained; query heading and Clear added as specified. |
| C18        | Stays in analysis/team hosts; immediate vs 300ms debounce and version/workspace guards retained.                                                               |
| C19        | Stays in shared review shell; guidance facts, translated labels, evidence and note retained.                                                                   |
| C20        | Stays in shared review shell; fieldset, prompt, radios and optional label retained.                                                                            |
| C21        | Stays in team host and review shell; owner-decision gating and error retained.                                                                                 |
| C22        | Moved to header; host Back behaviour and busy disabling retained.                                                                                              |
| C23        | Moved to rail/bar; D10 labels; Skip at zero removed by R1; disabled and no-install navigation semantics retained.                                              |
| C24        | Stays in hosts; D6 separates previewing from recommendation loading without changing validation/consent flow.                                                  |
| C25        | Stays in consent modal; title/description/error unchanged.                                                                                                     |
| C26        | Stays in consent modal; names, hashes and script status unchanged.                                                                                             |
| C27        | Stays in consent modal; script/all-file disclosures unchanged.                                                                                                 |
| C28        | Stays in consent modal/store; script approval and toggle unchanged.                                                                                            |
| C29        | Stays; modal Back/native-close behaviour and team trigger-focus restoration unchanged.                                                                         |
| C30        | Stays in modal; only confirm labels change under D10; approval gating unchanged.                                                                               |
| C31        | Stays in hosts; install request/hash consent/date/duplicate guards unchanged.                                                                                  |
| C32        | Stays in hosts; partial/thrown install error and preserved selection unchanged.                                                                                |
| C33        | Stays in team host; heading, test id, icon and workspace header unchanged.                                                                                     |
| C34        | Stays in team intent form; workspace/intent/paste/drop unchanged.                                                                                              |
| C35        | Stays in team intent form; attachments, hints and validation unchanged.                                                                                        |
| C36        | Stays in team host; intent Back/Review/submit guards unchanged.                                                                                                |
| C37        | Stays in team host; clearing state/newest analysis/fallback preserved; stale preview also cleared on reload.                                                   |
| C38        | Stays in team host; readable guidance/recommendation failures unchanged.                                                                                       |
| C39        | Stays in team host; installing live status/inert/modal state unchanged.                                                                                        |
| C40        | Stays in team host; launch status/back/guidance note unchanged.                                                                                                |
| C41        | Stays in team host; attachment snapshot/owner record/launch behaviour unchanged.                                                                               |
| C42        | Stays in team host; cancellation, stale guards, attachment retention and reset preserved; Back also clears previewing.                                         |
| C43        | Stays; no extra intent-stepper/draft-loader/leave-dialog added.                                                                                                |
| C44        | Moved under unmatched-stack-list; existing project-skill-draft child is unchanged.                                                                             |
| C45        | Stays in unchanged project-skill-draft child; create/validation/errors/revision behaviour retained.                                                            |
| C46        | Stays in unchanged workspace-header child; Electron folder controls retained.                                                                                  |
| C47        | Stays; text interpolation only, no innerHTML or trust bypass.                                                                                                  |

## Checks

The following PowerShell file set was passed to the commands (all paths relative to the worktree):

```powershell
$batchFiles = @(
  'libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts'
  'libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.ts'
  'libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.html'
  'libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts'
  'libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.html'
  'libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.ts'
  'libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html'
  'libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.ts'
  'libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.html'
  'libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts'
  'libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html'
  'libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.css'
  'libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css'
  'libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts'
  'libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts'
  'libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html'
  'libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts'
  'libs/frontend/onboarding/src/lib/proposal/stack-skill-consent.component.html'
  'libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts'
  'libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts'
)
$batchSpecs = $batchFiles | Where-Object { $_.EndsWith('.spec.ts') }
$batchHtml = $batchFiles | Where-Object { $_.EndsWith('.html') }
npx prettier --write @batchFiles
npx prettier --write --parser angular @batchHtml
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath @batchSpecs
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
npx eslint @batchFiles
```

| Check                                                             | Real result                                                                                                                                                                 | Exit code |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Prettier on all 27 implementation/spec files                      | Passed; every Batch A file included                                                                                                                                         | 0         |
| Prettier with Angular parser on all 7 changed/new HTML templates  | Passed; expanded the team template's previously compressed control flow                                                                                                     | 0         |
| Jest with all 9 changed/new spec files above                      | 9 suites passed; 75 tests passed; 0 snapshots; 29.191 seconds                                                                                                               | 0         |
| TypeScript library project                                        | Passed; no diagnostics                                                                                                                                                      | 0         |
| ESLint on all 27 files above                                      | 0 errors; 2 warnings for CSS files lacking an ESLint configuration; 18 additional notices that module-boundary checks were skipped because no cached Nx ProjectGraph exists | 0         |
| Scoped `ptah_get_diagnostics` after edits (6 production TS files) | Unavailable: host compiler still running after 45 seconds; 6 files reported unchecked. Direct `tsc` above is the native fallback and passed                                 | N/A       |

Behaviour coverage includes all primary counts/states, Skip hidden at zero, busy consent/approval gating, removed relevance text, source title, evidence accessibility, coverage filtering/expansion, deselect from rail, search ordering/deduplication/query/Clear, rerun vs initial skeletons, D6 in both hosts, preview helper invalidation, stale preview after Back, and unmatched-item search. Existing navigation, draft, attachment, launch and install regressions remain in the passing suite.

No build, serve, dev, e2e, package, nx, npm install, npm run verify, or git command was run. Logs: `.ptah/tmp/batch-b-{prettier,prettier-angular,jest,tsc,eslint}.log`.

## Decisions

| Decision                                                                                             | Options                                                              | Evidence                                                                                                                                  | Reversible                                    |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| One responsive selection component, styled by the shell's named container                            | Duplicate rail/bar instances; one responsive instance                | D3 requires container-width behaviour; D10 calls for the only primary action; duplicate instances would add duplicate controls to the DOM | Yes; optional `responsive` input defaults off |
| Keep a level-2 review heading for team builder and level-1 heading for analysis                      | Same heading level in both; host-selectable level                    | R4 removes the duplicated analysis title while preserving a heading in the team card                                                      | Yes                                           |
| Store helper count derives only from a complete preview of the same selection; toggle clears preview | Retain stale preview; invalidate on selection change                 | Actions helper line 2 requires returning to pre-preview wording after any selection change                                                | Yes                                           |
| Observe one scroll container per rail with destroy cleanup                                           | Fixed viewport offset; container measurement                         | Amendment A2 requires available scroll-container height; no hard-coded Electron chrome height is available                                | Yes                                           |
| Preserve search button's existing query/searching disabled rules                                     | Also disable search while navigation/previewing; keep existing rules | P10/C16 explicitly preserve the conditions                                                                                                | Yes                                           |

## Not done

- CSS linting and module-boundary verification were unavailable in the lane command (no CSS ESLint configuration / cached Nx ProjectGraph); no Nx command was run to rebuild the graph.
- Real Electron dark/light screenshots, verification of measured viewport geometry, and renderer `typecheck-templates` are reserved for the coordinator. The lane explicitly prohibits build/serve/e2e and `npm run verify`; TestBed checks do not establish visual parity.
- No skill catalogue or skill read/load mechanism is exposed in this lane; `angular-frontend-patterns` and `ui-ux-designer` could not be loaded. Explicit task/framework rules and source conventions were used without reconstructing missing skills.
