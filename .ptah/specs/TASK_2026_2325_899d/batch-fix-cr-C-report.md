# Batch CR-C Report — TASK_2026_2325_899d

Triage and fixes for CodeRabbit PR #1514 review findings on the onboarding Angular UI and the Electron e2e driver.

> **Tool & skill availability note**: Checked the host CLI skill catalogue, `ptah_search_files` (`**/*angular-frontend-patterns*`), and `ptah_harness_search_skills` (`angular-frontend-patterns`). The `angular-frontend-patterns` skill is not installed or listed in this environment, so component work followed the repository's existing standalone Angular signals patterns and guidelines. `ptah_lsp_references` returned relative-path errors against the main worktree root and a 0-hit truncated scan for `computeHiddenPoolCandidateCount`, so a targeted `grep` in `libs/frontend/onboarding/src/` was used as fallback. `ptah_get_diagnostics` timed out at 45s, so `npx tsc --noEmit` on both `libs/frontend/onboarding/tsconfig.lib.json` and `apps/ptah-electron-e2e/tsconfig.json` was used as fallback.

## Summary

| Item | Verdict | Files:Lines Changed | Test Added |
| --- | --- | --- | --- |
| CR5 Major (`analyze-workspace.page.ts:910`) | CONFIRMED | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:155-162,184-187,268-271,616-622` | `analyze-workspace.page.spec.ts`: `keeps Setup repair actions visible during stop recovery and allows retry after repair` & `keeps the Setup read-error alert visible during stop recovery` |
| Minor 1 (`ui-driver.ts:149`) | CONFIRMED | `apps/ptah-electron-e2e/src/support/ui-driver.ts:148-200,293-299` | None (Playwright e2e helper; e2e execution excluded by lane rules; verified via `tsc` + `eslint`) |
| Minor 2 (`analyze-skills.page.ts:260`) | CONFIRMED | `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:254-256` | `analyze-skills.page.spec.ts`: `shows the navigation error when Skip skills fails on the Setup-blocked screen` |
| Minor 3 (`analyze-workspace.page.ts:703-704`) | CONFIRMED | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:688-695` | `analyze-workspace.page.spec.ts`: `loads saved analyses on rerun=1 without waiting for Setup readiness` |
| Minor 4 (`skill-method-banner.component.ts:124`) | CONFIRMED | `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.ts:36,122-135` | `skill-method-banner.component.spec.ts`: updated skipped-stage assertion + `labels a failed stage with only pairConfigured as configured, not attempted` |
| Minor 5 (`skill-verdict-filter.component.ts:102`) | CONFIRMED | `libs/frontend/onboarding/src/lib/proposal/skill-verdict-filter.component.ts:101-104` | `skill-verdict-filter.component.spec.ts`: updated Show-all test for `active === 'all'` + `stack-skill-review.component.spec.ts`: `shows Show-all under All verdict when an item filter hides candidates and clears the item filter` |
| Minor 6 (`stack-skill-review.component.ts:436-444`) | CONFIRMED | `libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.ts:50-53,88-99`, `unmatched-stack-list.component.html:52`, `stack-skill-review.component.html:208`, `stack-skill-review.component.ts:424-436` | `unmatched-stack-list.component.spec.ts`: `emits itemSearchRequested with the selected row itemId even when two rows share a name` + `stack-skill-review.component.spec.ts`: `preserves itemId when searching from a duplicate-named judged unmatched row` |
| Minor 7 (`unmatched-stack-list.component.html:56-67`) | CONFIRMED | `libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.html:56-69`, `unmatched-stack-list.component.ts:31-32` | `unmatched-stack-list.component.spec.ts`: asserted legacy mode renders 0 `Write a skill by hand` buttons |
| Minor 8 (`stack-coverage.ts:643`) | CONFIRMED | `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:646-672` | `stack-coverage.spec.ts`: `counts a candidate hidden when the selected item rejected it and another item installs it` |
| Trivial 1 (`onboarding-run-pill.service.ts:47-48`) | CONFIRMED | `libs/frontend/onboarding/src/lib/shell/onboarding-run-pill.service.ts:45-51,123` | None (comment-only documentation fix) |
| Trivial 2 (`stack-coverage.ts:278-282`) | CONFIRMED | `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:273-295` | `stack-coverage.spec.ts`: `deduplicates candidates case-insensitively and preserves failure precedence across multiple items` |

No `data-testid` or `aria-*` attributes were renamed or removed.

## PR thread replies

- **CR5 Major (`analyze-workspace.page.ts:910`)**: Fixed. The Setup model card and the Setup read-error alert now stay visible during stop recovery (through `showSetupSection()`), even if the runner is still marked active after `cancel()` rejects. Users can repair Setup in place and then use Retry or Start over. Added regression specs in `analyze-workspace.page.spec.ts`.
- **Minor 1 (`ui-driver.ts:149`)**: Fixed. Extracted a shared `resolveMockValue` lookup inside `installFakeRpcListener` and used it in `resolveEffectiveSetupPair` so function mocks for `auth:getAuthStatus`, `auth:getEffectiveRoute`, and `config:model-get` resolve the same way as static mocks.
- **Minor 2 (`analyze-skills.page.ts:260`)**: Fixed. Rendered `state.error()` in a `ptah-alert` inside the Setup-blocked branch so a cancelled `Skip skills` navigation displays the error while keeping the Setup recovery and Skip skills actions visible. Added a regression spec in `analyze-skills.page.spec.ts`.
- **Minor 3 (`analyze-workspace.page.ts:703-704`)**: Fixed. `ngOnInit()` now starts `loadSaved()` alongside `refreshSetupModel()` on the `rerun=1` path without waiting for Setup readiness, while keeping rerun intent handling unchanged. Added a regression spec in `analyze-workspace.page.spec.ts`.
- **Minor 4 (`skill-method-banner.component.ts:124`)**: Fixed. `stageDetails` now uses `pairAttempted` for the `attempted` label and labels `pairConfigured`-only stages as `configured` instead of `attempted`. Updated and added regression specs in `skill-method-banner.component.spec.ts`.
- **Minor 5 (`skill-verdict-filter.component.ts:102`)**: Fixed. Removed the `active() === 'all'` guard from `hiddenCountText` so positive hidden counts under an active item filter render the `Show all` control and clear filters. Updated `skill-verdict-filter.component.spec.ts` and added an integration spec in `stack-skill-review.component.spec.ts`.
- **Minor 6 (`stack-skill-review.component.ts:436-444`)**: Fixed. `UnmatchedStackListComponent` now emits `itemSearchRequested` with `{ itemId, query }` for judged rows and keeps `searchRequested` for legacy rows. `StackSkillReviewComponent` wires `itemSearchRequested` directly to `searchJudgedItem` and removes the name-matching fallback. Added regression specs for duplicate row names in both component specs.
- **Minor 7 (`unmatched-stack-list.component.html:56-67`)**: Fixed. Manual drafting is judged-only (legacy review has no draft editor wired), so the `Write a skill by hand` button now renders only when `row.itemId !== null`. Added a regression check in `unmatched-stack-list.component.spec.ts`.
- **Minor 8 (`stack-coverage.ts:643`)**: Fixed. In `computeHiddenPoolCandidateCount`, the scoped `all` branch now counts only pool candidates exposed on cards in the current view (scoped install outcomes, scoped not-judged candidate cards, and residual `Other candidates` cards), keeping the unscoped `all` count at zero. Added a regression spec in `stack-coverage.spec.ts`.
- **Trivial 1 (`onboarding-run-pill.service.ts:47-48`)**: Fixed. Updated both badge-merging comments to state that Decision and Normal merge only when both their pairs and statuses match.
- **Trivial 2 (`stack-coverage.ts:278-282`)**: Fixed. `buildStackCoverage` now parses `splitStackEvidence(row.evidence, allItems)` once per recommendation into a `Map<string, Set<string>>` before mapping coverage rows, keeping deduplication and failure precedence unchanged. Added a regression spec in `stack-coverage.spec.ts`.

## Checks run

| Check | Command | Result |
| --- | --- | --- |
| Pre-fix TDD check | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath ...` (7 specs) | 11 expected failures before source fixes (log: `.ptah/tmp/cr-c-before.log`) |
| Post-fix Jest (all affected suites) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath ...` (10 suites) + re-run on 2 updated spec files | PASS — all 10 suites pass (174/174 tests; `analyze-workspace.page.spec.ts` + `stack-coverage.spec.ts` re-verified 46/46 after test fixture fix; logs: `.ptah/tmp/cr-c-jest.log`, `.ptah/tmp/cr-c-jest-2.log`) |
| Typecheck (onboarding lib) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | PASS (exit 0; log: `.ptah/tmp/cr-c-tsc-onboarding.log`) |
| Typecheck (electron e2e) | `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json` | PASS (exit 0; log: `.ptah/tmp/cr-c-tsc-e2e.log`) |
| ESLint (all 18 changed files) | `npx eslint <changed files>` | PASS (exit 0; 0 errors, 7 pre-existing warnings; logs: `.ptah/tmp/cr-c-eslint.log`, `.ptah/tmp/cr-c-eslint-2.log`) |
| UI class audit | `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` | PASS (exit 0; `0 token count(s) over baseline`; log: `.ptah/tmp/cr-c-ui-audit.log`) |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | PASS (exit 0; `TOTAL 0 unsuppressed site(s)`; log: `.ptah/tmp/cr-c-deg-audit.log`) |
| Diagnostics tool | `ptah_get_diagnostics` (scoped to 9 changed `.ts` files) | Timed out at 45s; covered by `npx tsc --noEmit` above |

## Decisions

1. **CR5 stop-recovery product choice (`analyze-workspace.page.ts`)**
   - **Decision**: Keep the Setup model card and Setup read-error alert visible while `stopRecovery()` is true (using `showSetupSection = (!runner.isRunning() && !runner.isCanceling()) || stopRecovery()`), without changing `retry()` semantics.
   - **Options**: (a) Keep Setup repair path visible during stop recovery; (b) Change stop panel's Retry action to re-attempt `stop()`.
   - **Evidence**: Matches the batch recommendation, matches the existing `max-w-[760px]` layout predicate in `analyze-workspace.page.ts:157-165`, matches the `failed` panel layout, and handles cases where `runner.isRunning()` remains true after `cancel()` fails.
   - **Reversible**: Yes.

2. **Minor 7 legacy manual-draft button (`unmatched-stack-list.component.html`)**
   - **Decision**: Render `Write a skill by hand` only for judged rows (`row.itemId !== null`).
   - **Options**: (a) Hide the button in legacy mode (judged-only); (b) Wire a legacy draft editor.
   - **Evidence**: `stack-skill-review.component.html:557-561` binds only `[items]`, `[searching]`, and `(searchRequested)` in legacy mode; `draftView` and manual drafting are gated behind `judgedMode()` (`stack-skill-review.component.html:404`); `decisions.md` D5 approved removing legacy per-item draft forms.
   - **Reversible**: Yes.

3. **Minor 4 `pairConfigured`-only stage label (`skill-method-banner.component.ts`)**
   - **Decision**: Display `configured <provider> / <model>` when `pairAttempted` is absent and `pairConfigured` is present.
   - **Options**: (a) Label as `configured <pair>`; (b) Omit the pair.
   - **Evidence**: Preserves diagnostic visibility of the configured pair for `skipped` and `pre-dispatch-error` stages while keeping `pairConfigured` strictly distinct from `pairAttempted` per R14.
   - **Reversible**: Yes.

## Extra reads

- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` (read lines 1-800 to verify `displayedCandidateIdsInVerdictOrItemRows`, `residualCandidates`, `showOtherCandidatesSection`, and `hiddenPoolCandidateCount` interactions for Minor 5 and Minor 8).

## Clarifications Needed

None.
