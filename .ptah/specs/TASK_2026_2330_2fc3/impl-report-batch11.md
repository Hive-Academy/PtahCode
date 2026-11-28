# Batch 11 implementation report — Setup runs list on Home and removals

Status: COMPLETE

## Changed files

- CREATE `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts`
- CREATE `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.spec.ts`
- MODIFY `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts`
- MODIFY `libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts`
- MODIFY `libs/frontend/onboarding/src/lib/shared/run-status-chip.component.ts` and `.spec.ts` in revise round 1
- MODIFY `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.ts`
- MODIFY `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.spec.ts`
- DELETE `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` + `.spec.ts`
- DELETE `libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts` + `.spec.ts`
- DELETE `libs/frontend/onboarding/src/lib/home/resume-banner.component.ts` + `.spec.ts`
- `libs/frontend/onboarding/src/index.ts` — no change. It exports only
  `ONBOARDING_ROUTES`, the chat launcher and the new-project intake model; none of the
  deleted symbols.

## Acceptance table

| # | Acceptance | Evidence | State |
| --- | --- | --- | --- |
| 1a | One `<ul aria-label>` list | `setup-runs-list.component.ts:114` renders a single list with `aria-label="Setup runs"`. The spec checks the list element and label. | MET |
| 1b | At most 5 rows plus "Show all" | `setup-runs-list.component.ts:216` limits the collapsed list to five rows. See “shows at most five rows and expands them with Show all.” | MET |
| 1c | Chip text readable without color | Rows reuse `RunStatusChipComponent` (text labels); spec `it.each` asserts the text of all six statuses; the stopping state is covered too | MET |
| 1d | Primary button names the run | `setup-runs-list.component.ts:267` includes the workflow title and start date/time in the accessible name. The spec checks distinct names for two runs. | MET |
| 1e | Dismiss on terminal rows | `setup-runs-list.component.ts:287` uses `isTerminalSetupRunStatus`. The spec verifies the store call and removal. | MET |
| 1f | "Review skills" for a completed analysis without a child run | `setup-runs-list.component.ts:269` checks `parentId`. The specs verify the Review skills URL and the label change to “Open” when a child appears. | MET |
| 1g | `markSeen` on open | `setup-runs-list.component.ts:225` calls `markSeen(id)` and navigates through `setupRunStepLink(record)`. The specs assert both calls. | MET |
| 2a | Wired into Home | `onboarding-home.component.ts:112` mounts the list after the connection banner. | MET |
| 2b | No refresh on Home mount, no polling | `setup-runs-list.component.ts:210` derives rows from the active store bucket. `onboarding-home.component.spec.ts:181` checks that mounting Home leaves the runs store refresh spy untouched. | MET |
| 3 | Step link derives the target from `stepTarget` | `onboarding-step-link.ts:50` wraps `stepTarget` for the list's primary button at `setup-runs-list.component.ts:225`. Static tile and stepper links use `onboardingStepLink`. | MET |
| 4a | Resume store deleted | `onboarding-resume.store.ts` + spec removed; repo-wide grep for `OnboardingResumeStore`, `onboarding-resume.store`, `OnboardingResumeItem`, `resumeItem`, `onboarding-resume-banners` returns 0 matches | MET |
| 4b | Found card deleted | `analysis-found-card.component.ts` + spec removed (incl. `analysisAge`, used nowhere else); grep for `analysis-found-card`, `analysisAge`, `ptah-analysis-found-card` returns 0 matches | MET |
| 4c | Banner deleted | `resume-banner.component.ts` + spec removed; grep for `ResumeBannerComponent`, `ptah-resume-banner` returns 0 matches | MET |
| 4d | `onboardingGenerationTarget` (core) preserved | The deleted resume store was its last onboarding consumer; the function stays in `libs/frontend/core/src/lib/routing/onboarding-routes.ts:109` untouched (Batch 14 owns its deletion) | MET |
| 5 | Electron first, accessible | The list waits for workspace resolution at `setup-runs-list.component.ts:210`. The focused tests exercise keyboard focus destinations and accessible button names in the DOM. | MET |

## Preserve list

Capabilities of the deleted files and where they move:

| Capability of the deleted file | New home |
| --- | --- |
| Resume/re-open a discovered run (live analysis banner, resumable generation/guidance from `OnboardingResumeStore.refresh`) | `SetupRunsListComponent` rows: `SetupRunStore.runsFor(activePath)` already reconciles and adopts backend runs (component 1); the row's primary action opens `stepTarget(record)` |
| "Analysis found" card: jump into a finished analysis ("Use it", "View progress") | The completed-analysis row's "Review skills" action opens `analyze/skills?analysis=<id>` — the same intent, record-driven |
| "Analysis found" card — re-run an analysis | The completed analysis row's “Re-run” button opens Analyze with `?rerun=1`. The “Start analysis” tile opens the standard Analyze entry. Batch 12 owns handling the rerun query. |
| Resume banner presentation (chip + title + one action per run) | The list rows reuse the same `RunStatusChipComponent` and one-primary-action shape |

The user approved removing the analysis age and `.gitignore` sharing hints. Batch 16 owns the gaps
in completed disk-analysis adoption, dismissal persistence and Home discovery retry. Review skills
owns errors when loading a selected saved analysis.

## Check results

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <setup-runs-list.component.spec, onboarding-home.component.spec, onboarding-step-link.spec>` — **42 passed, 0 failed** (`.ptah/tmp/b11-jest.log`).
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` — **1 error, not from this batch**:
  `onboarding.routes.ts(5,40): TS2307: Cannot find module './analyze/agent-generation-run.page'`.
  That file belongs to the concurrent Batch 9 lane (it imports a page that lane is creating).
  No error in any Batch 11 file (`.ptah/tmp/b11-tsc.log`).
- `npx eslint <6 changed files>` — **0 errors**, 10 pre-existing warnings (non-null assertions in the
  home spec, constructor accessibility in the home component; all present before this batch)
  (`.ptah/tmp/b11-eslint.log`).
- Degradation audit: `TOTAL 0 unsuppressed site(s)`, no onboarding site
  (`.ptah/tmp/b11-degradation.log`). The two `optional-capability` markers of the deleted resume
  store and the found-card markers are gone with their files; the new code swallows nothing.

## Template change

Yes — `onboarding-home.component.ts` (removed the found card and banners, added
`<ptah-setup-runs-list />`) and the new inline template of `setup-runs-list.component.ts`.
The coordinator should run `-t typecheck-templates -p ptah-extension-webview`.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Give `needs-input` its own shared chip state | Use the waiting label / extend the chip | Finding 8 requires a visible “Needs input” label. The existing idle mapping continues to display “Ready”. | Yes |
| `cancelled` and `interrupted` both render `resumable` ("Interrupted") | separate labels / reuse the existing mapping | `run-status-chip.component.ts:18` already maps `cancelled` to `resumable`; following the existing convention | Yes |
| A completed analysis counts as childless when no record has `parentId === record.id` | parentId check / also match `analysisRunId` | Records chain through `parentId` (analysis -> skill-review -> generation -> guidance, `setup-run.types.ts:80`); the direct check is the documented chain | Yes |
| `setupRunStepLink` added beside `onboardingStepLink` instead of replacing it | replace / add | `onboardingStepLink` still has three consumers outside this batch's write set (`analyze-workspace.page.ts:1087`, `project-guidance.page.ts:964`, home tiles). The record-driven builder is the `stepTarget` derivation the plan asks for; the static builder is Batch 12/14 cleanup material | Yes |
| The runs list sits after the connection banner (the old banners' position) | old found-card position (before) / old banners position (after) | The list replaces the resume banners, whose placement test the home spec keeps in adapted form | Yes |
| Move focus to “Skip for now” after the final dismissal | Home heading / unconditional Home button | Finding 6 calls for a stable Home control. The existing button is available across Home workspace and readiness states. | Yes |
| Focus the first newly revealed row after Show all | Keep a disclosure button / transfer focus | Batch 11 permits one-way expansion. The first revealed primary button gives keyboard users a starting point in the new rows. | Yes |
| Reset Show all on workspace changes | Reset each switch / remember each workspace | Finding 7 permits either behavior. Linking expansion to the active path preserves the five-row entry view. | Yes |
| Include local seconds in the start time | Minute / second precision | `createdAt` is the only start timestamp. Seconds distinguish starts one second apart, as exercised by the two-analysis test. | Yes |

## Proposed Removals

- Completed disk analysis without a run record. The user rejected this removal in
  `batches.md:467`. The store follow-up owns adoption and deduplication.
- The analysis age hint ("Analysed N days ago · consider re-running") and the
  `.gitignore` sharing hint of the found card are gone; no surface shows them today.
- `onboardingStepLink`'s static step-path table remains the route source for the Home tiles and
  two pages; retiring it fully needs the Batch 12/14 page migrations first.
- Home's checkpoint agents-written count. The published `SetupRunRecord` in
  `setup-run.types.ts:66` carries no such count. The row displays skills selected or team-builder
  agents installed when the corresponding workflow data exists.
- Home's saved-analysis freshness state and reason, such as stale or incomplete. The same
  record carries workflow status and optional error text. It has no saved-analysis freshness
  fields.
- Home's in-place error for loading a chosen saved analysis. Review skills owns the load and
  its error message at `analyze/analyze-skills.page.ts:621`. Home discovery retry is a
  separate store follow-up under finding 3.

## Clarifications Needed

None.

## Revise round 1

Codex finished the round from the Ollama Code lane's partial edits after that lane hit its usage
limit. Findings 1–3 remain assigned to the store follow-up in `batches.md`. Paths below are
relative to `libs/frontend/onboarding/src/lib`.

| Finding | Change | Focused test evidence |
| --- | --- | --- |
| 4 | Completed analysis rows offer Re-run. The action marks the record seen and navigates to Analyze with only the `rerun=1` query parameter (`home/setup-runs-list.component.ts:234`, predicate at `:285`). | `home/setup-runs-list.component.spec.ts:381` “re-runs a completed analysis through the Analyze rerun query” and `:399` “offers Re-run on completed analyses only” |
| 5 | Rows show saved skill-selection or installed-agent counts and retain recorded error text (`home/setup-runs-list.component.ts:69`, `:134`). Review skills owns the selected-analysis load error (`analyze/analyze-skills.page.ts:621`). The unsupported metadata and in-place Home load error are recorded under Proposed Removals. | `home/setup-runs-list.component.spec.ts:436` “shows record context: a saved skill selection” and `:451` “shows installed team-builder agents alongside a recorded error” |
| 6 | Dismiss focuses the next visible primary button, then the previous one if needed. The final dismissal focuses Home's “Skip for now” button (`home/setup-runs-list.component.ts:241`, `home/onboarding-home.component.ts:114`). Show all focuses the first newly revealed primary button (`home/setup-runs-list.component.ts:256`). | `home/setup-runs-list.component.spec.ts:484` “moves focus to the next row primary after a middle Dismiss”, `:507` “moves focus to the previous row primary after the last Dismiss”, `:210` “focuses the first newly revealed row after Show all”, and `home/onboarding-home.component.spec.ts:227` “focuses Skip for now when the last run row is dismissed”. Each asserts `document.activeElement`. |
| 7 | Show all expansion resets when the active workspace path changes (`home/setup-runs-list.component.ts:204`). | `home/setup-runs-list.component.spec.ts:226` “resets the Show all expansion when the workspace changes” expands seven A rows, switches to B and confirms only its first five rows appear. |
| 8 | `needs-input` displays “Needs input” and idle displays “Ready” (`home/setup-runs-list.component.ts:43`, `shared/run-status-chip.component.ts:50`). Checked chip and run-panel consumers with `ptah_grep`. The existing view mapping stays intact. | `home/setup-runs-list.component.spec.ts:259` “reads the needs-input status as chip text, not color” and `shared/run-status-chip.component.spec.ts:26` “pairs the needs-input glyph with text” plus “pairs the idle glyph with text” |
| 9 | Each row shows its local start date and time, and its accessible button names include the same identity (`home/setup-runs-list.component.ts:60`, `:132`, `:267`). | `home/setup-runs-list.component.spec.ts:321` “distinguishes two completed analyses by identity and destination” verifies visible times and both Review skills and Dismiss names, then checks both destinations. |

The workspace-keyed fake removes terminal records and returns the store's boolean result.
The Dismiss spy asserts the call and the DOM asserts row removal
(`home/setup-runs-list.component.spec.ts:470`). Same-ID signal tests retain the original DOM row
through a status update and when a child appears (`:159`, `:405`). The stopping chip also updates
after initial render (`:274`).

**Template change** — Yes. The list template adds context, run identity, Re-run and focus
references. Home wires the final-dismiss event to its existing button. The shared chip template
still renders the label and decorative glyph from its state.

### Round 1 checks

- Focused Jest passed all 71 tests across the list, Home, step-link and chip suites.
  See `.ptah/tmp/b11r1c-jest.log`.
- ESLint on the six changed TypeScript files reported 0 errors and 10 existing Home warnings.
  See `.ptah/tmp/b11r1c-eslint.log`.
- The degradation audit reported `TOTAL 0 unsuppressed site(s)`.
  See `.ptah/tmp/b11r1c-degradation.log`.
- Scoped Ptah TypeScript diagnostics found zero issues in the six changed files. After an
  initial timeout, the retry returned 17 errors outside the write set.
  See `.ptah/tmp/b11r1c-diagnostics.log`.
- The focused DOM tests rendered the list and Home templates. There was no running Electron
  renderer for screenshot review within the focused-check scope. Electron visual review and
  renderer template typechecking are coordinator checks.
