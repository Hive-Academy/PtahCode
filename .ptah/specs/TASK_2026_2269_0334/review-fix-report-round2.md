# Round-2 bounded corrections

## Corrections

| Finding | Correction location | Regression evidence |
| --- | --- | --- |
| N1 | `analyze/analyze-skills.page.ts:398`, `closeConsent`: `afterNextRender` with the host injector restores focus after the dialog-closing effect renders. | `analyze/analyze-skills.page.spec.ts:465`, ?closes consent and returns focus on %s?: cancel, partial installation, rejected installation; asserts dialog closed and `document.activeElement` equals the primary. A local focus shim models native-modal background inertness missing in jsdom. |
| N2 | Analysis host `install`, `continueToGuidance`, and installed continuation panel; team-builder `install`, `launchChat`, and installed continuation panel. Completion is private writable/read-only public state; both panels retain Back; installed identifiers remain intact. Navigation/launch retry bypasses preview and installation; `install()` also refuses duplicate calls after success. | Analysis ?retries navigation after successful installation without reinstalling (%s)? covers rejection and `false`, truthful error, closed dialog, installed identifiers, absent install action, and successful retry without another RPC. ?handles rejected navigation when continuing without skills? covers Skip rejection. Team-builder ?retries a failed launch after successful installation without reinstalling? covers preserved installation, truthful launch error, and launch retry without another install. |
| N3 | Both hosts: `loadErrorState` private writable, `loadError` public read-only; all writes go through host methods. New `skillsInstalledState` follows the same pattern. | Analysis ?exposes read-only store signals with methods as the only public writers? and the team-builder launch-retry regression assert no public `loadError.set`. Compared both host diffs and HEAD signal declarations. |

Paths in the table are relative to `libs/frontend/onboarding/src/lib`.

## Scope

Changed source files (relative to `libs/frontend/onboarding/src/lib`):

- `analyze/analyze-skills.page.ts`
- `analyze/analyze-skills.page.spec.ts`
- `proposal/team-builder-start.page.ts`
- `proposal/team-builder-start.page.html`
- `proposal/team-builder-start.page.spec.ts`

Also wrote this deliverable. Earlier writers? changes were retained. No backend, RPC contract, shared review/rail/consent components, or task state changed.

Team-builder already caught launcher errors independently and showed a launch message. However, its review primary returned users to preview/install after successful installation followed by a failed launch. The new continuation panel closes that duplicate-install path. The launcher API returns a launch result or rejects; boolean router results belong to the analysis host.

## Signals left out of scope

HEAD already declared analysis `summary` writable and team-builder `touched`, `submitted`, `launched`, and `ownerDecisionError` writable. These remain unchanged, including the existing owner-decision template writer. Existing private analysis `leavingState` and `selectionResetState` were already exposed read-only and remain so. Store signal ownership was not changed.

## Decisions

- Preserve successful installation independently of continuation. A failed navigation/launch shows a continuation retry instead of another install action; installed identifiers and selection remain recorded. Reversible, local to each host, with no shared API changes.
- Use Angular `afterNextRender` because the native modal closes in a rendered effect; microtask timing cannot guarantee closure.
- Leave pre-task writable host signals untouched as explicitly required by N3.

## Checks

- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: exit 0; no compiler diagnostics (`.ptah/tmp/round2-fix-tsc.log`). The only subsequent host edit was Back button markup in the inline template, plus formatting; no TypeScript logic changed.
- `npx eslint libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: exit 0; no warnings or errors (`.ptah/tmp/round2-fix-eslint.log`).
- Ran `npx prettier --write` on each of the five changed source/spec/template files; exit 0. Repeated on subsequently edited files. Verified new visible labels and messages remain contiguous, existing install labels remain in the unchanged shared components, and all five files are UTF-8 without BOM, without replacement characters, and under 700 lines.
- Focus regression mutation: temporarily replaced `afterNextRender` with the old `queueMicrotask` timing, then restored the exact corrected source in `finally`. Ran the same allowed two-suite Jest command: exit 1 as expected, 1 failed/1 passed suite, 3 failed/36 passed tests. All three failures were the actual-element assertion (cancel, partial install, rejected install), confirming this test detects the original defect. Log: `.ptah/tmp/round2-fix-focus-regression-clean.log`. An earlier mutation run exposed missing mock cleanup; added `afterEach(jest.restoreAllMocks)` before this clean mutation run.
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: final exit 0; 2 suites passed, 39 tests passed, 0 snapshots; 53.177 seconds (`.ptah/tmp/round2-fix-jest-final.log`).

## Limitations

Skill discovery/loading is unavailable in this lane (no invokable skill loader/catalogue). Followed the supplied Angular/repository instructions. Scoped `ptah_get_diagnostics` returned unavailable after 45 seconds; the required native compiler command is the fallback. No Electron session/render, template compiler, builds, or workspace-wide checks were started; the task permits only the focused lane checks. New UI controls use existing `ptahButton` values (`primary`/`ghost`) and existing boolean `busy` bindings.
