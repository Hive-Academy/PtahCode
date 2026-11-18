# CodeRabbit triage - PR #1421

16 confirmed; T13 rejected. Electron renderer changes are confined to onboarding; no host or RPC contracts changed.

| T# | file:line | verdict | one-sentence reason | change made (file:line) or none |
| --- | --- | --- | --- | --- |
| T1 | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:171` | CONFIRMED | Missing workspace silently produced an empty review and enabled retry; require both workspace and run. | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:149`; workspace error and automatic reload retained. |
| T2 | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:292` | CONFIRMED | A failed replacement search could leave old matches selectable under the new query. | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:294`; clear current matches before requesting. |
| T3 | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:428` | CONFIRMED | Retrying a cancelled guidance navigation created another tab for the same transition. | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:420`; reuse the tab by analysis/workspace/route identity. |
| T4 | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:437` | CONFIRMED | A superseded navigation failure could overwrite the next analysis error and focus. | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:448`; guard recovery by captured identity. |
| T5 | `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.html:56` | CONFIRMED | Truncating coverage badges could hide the active filter even when the skill matched it. | `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.ts:38` and card template; include the active badge in the three visible items. |
| T6 | `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css:34` | CONFIRMED | Compact mode hid selected names and removal controls when filters hid their cards. | `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html:36`; add an accessible selection disclosure, retaining the wide inline list. |
| T7 | `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css:59` | CONFIRMED | CSS order placed Skip visually before Install while keyboard navigation followed DOM order. | `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css:8`; remove the Skip order override so actions follow DOM order. |
| T8 | `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css:71` | CONFIRMED | The frame clipped the fixed header/footer when its pane was too short. | `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css:6`; allow frame overflow with a minimum list viewport and list scrolling. |
| T9 | `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.html:68` | CONFIRMED | Expanding removed the focused More button without a replacement focus target. | `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts:45`; focus the first revealed chip after rendering. |
| T10 | `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts:29` | CONFIRMED | Selected matches with search failures counted as covered despite the failed chip state. | `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts:33`; apply the same state predicate to the review rail count. |
| T11 | `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html:172` | CONFIRMED | An empty search completion had no live announcement while focus could remain in the search field. | `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html:188`; persistent polite empty-result status preserves the error alert. |
| T12 | `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts:156` | CONFIRMED | Selected result metadata and current matches shared one array, mislabelling old selections and keeping Clear results visible. | `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts:94`; separate retained metadata, pass it through both hosts, and render only current matches. |
| T13 | `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts:94` | REJECTED | Original setSearchResults already filtered retained entries by selectedIds before each replacement (original stack-skill.store.ts:90-105); deselected entries cannot survive a later query through that path. | none; the store change belongs to T12, and the regression verifies pruning on replacement. |
| T14 | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html:98` | CONFIRMED | Installed launch recovery replaced the focused control without moving focus to its retry action. | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:507`; after-render focus targets the recovery Continue control, including retry failures. |
| T15 | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:455` | CONFIRMED | Both guidance failure paths could set a warning after launch cancellation or a workspace switch. | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:453`; check controller, abort signal, lifetime and workspace before either warning, and log caught failures. |
| T16 | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:481` | CONFIRMED | An aborted launch controller could still report a generic RPC failure into the new workspace. | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:496`; reuse active-launch ownership before changing error/stage. |
| T17 | `libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.html:23` | CONFIRMED | Disabling an activated unmatched search button removed its focusability in both hosts. | `libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.html:23`; keep it focusable, guard duplicate activation, and retain focus through completion/failure. |

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts`
  - `Test Suites: 7 passed, 7 total`
  - `Tests:       88 passed, 88 total`
  - `JEST_EXIT=0`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` - `TSC_LIB_EXIT=0` (no diagnostics).
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json` - `TOTAL_TS_ERRORS=12`; `TSC_SPEC_EXIT=2`. No diagnostics name changed units. Existing errors in untouched files: `onboarding-ready-host.guard.spec.ts(14,5): error TS2554: Expected 3 arguments, but got 2.`; `onboarding-workspace.store.spec.ts(87,12): error TS2349: This expression is not callable.`; ten `TS2737: BigInt literals are not available when targeting lower than ES2020.` errors in shared capability-id-codec.ts, messages/attention-identity.ts and worker-protocol/pairing-code.ts. These were left outside scope.
- `$changed = @(git diff --name-only -- libs/frontend/onboarding/src); npx eslint $changed` - `✖ 1 problem (0 errors, 1 warning)`; `ESLINT_EXIT=0`. The CSS file is ignored because no matching configuration was supplied.
- `npx prettier --check $changed` - `All matched files use Prettier code style!`; `PRETTIER_EXIT=0`. `$changed` expands to the source files listed below.
- Browser: `ptah_browser_status` returned `Connected: No`; `ptah_browser_navigate` to `http://localhost:4200` returned `Navigation Failed` / `Blocked: the current page is outside the workspace.` No rendered screenshot or visual-quality claim is available. Starting Electron/serve/build/e2e and the project-wide template verification command were prohibited by this task.

- Final follow-up after rejecting T13: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts` - `Test Suites: 1 passed, 1 total`; `Tests:       24 passed, 24 total`; `JEST_ANALYZE_EXIT=0`. ESLint and Prettier were rerun afterward with the same passing result lines above.
- `git diff --check` - no whitespace errors.

## Changed files

- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
- `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.html`
- `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
- `libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.html`
- `libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts`
- `.ptah/specs/TASK_2026_2269_0334/coderabbit-triage-report.md`

## Template changes

Yes - analyze-skills.page.ts inline template; skill-pick-card.component.html; skill-selection-rail.component.html; stack-skill-review.component.html; team-builder-start.page.html; unmatched-stack-list.component.html. Existing headings and action copy remain intact; the confirmed compact disclosure reuses ?Your selection?, and the missing-workspace state adds the required workspace message.

## Decisions

- T13 is rejected based on the original replacement-time selection filter; no independent T13 change was made. T2/T12 share the current-match/retained-metadata fix. Existing specs that asserted the reviewed defects were adjusted.
- Remaining validation: resolve the 12 unrelated spec TypeScript errors and inspect the real Electron renderer at compact/wide widths and short heights against the existing approved layout. Focus behavior and DOM interactions are covered by the focused Jest specs; screenshots were unavailable.
- Native CLI skill invocation/discovery was not exposed. Read `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md` directly as the filesystem fallback; applied Angular/accessibility guidance within the authorized correction scope, without introducing a design phase.
- Ptah AST inspection was available. Ptah dependent lookup returned an incomplete graph with `fileInGraph:false`; used scoped `rg` to verify both store consumers. Used the explicitly allowed native TypeScript checks rather than an editor diagnostic check that might expand beyond lane checks.
- Initial working tree was clean; final changes are restricted to the permitted source directory and this deliverable. No commit, push, install, build, serve, Nx, or workspace-wide verification was run.

## Coordinator changes after the independent review

Review: `coderabbit-fix-review.md` (claude; implementer codex), verdict APPROVED with 3 Minor defects.

- T6 is DEFERRED, not corrected in this pull request. The lane added a "Your selection" control to
  the compact layout. That is a new visible control with no Electron visual evidence, so the
  coordinator removed it (template, CSS, class field and its spec). It goes to the follow-up visual
  batch. This also removes review defect 3.
- Review defect 1: the `searching()` guard in `submitSearch` of `stack-skill-review.component.ts`
  dropped a submit while a search was pending. The coordinator removed that guard. The guard in
  `searchItem` (T17) stays.
- Review defect 2 (the reserved guidance tab is not closed when the user leaves): not changed. It
  agrees with the "reuse" option of T3.
- Gate after these changes: `npm run verify -- -p onboarding` gave "2 tasks: 2 succeeded" and
  "1 task: 1 succeeded"; `npm run verify -- -t typecheck-templates -p ptah-extension-webview` gave
  "1 task: 1 succeeded". No Electron visual check ran.
