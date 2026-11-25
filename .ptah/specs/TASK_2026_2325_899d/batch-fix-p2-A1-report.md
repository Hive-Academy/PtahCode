# F-A1 fix report

## Files changed

Paths are relative to `libs/frontend/onboarding/src/lib/proposal/`.

- `stack-skill.store.ts`, `stack-coverage.ts`, `stack-coverage.spec.ts`
- `skill-verdict-filter.component.ts`, `skill-verdict-filter.component.spec.ts`
- `stack-skill-review.component.ts`, `stack-skill-review.component.html`, `stack-skill-review.component.spec.ts`

## Findings and tests

- **Finding 1, store guard.** D40 (`decisions.md:44`) extends F30 and R18 (`implementation-plan.md:195,569`). `stack-coverage.ts:72` exports the three-outcome contract. `stack-skill.store.ts:569` checks for Create or preview generation before checking dirty consent and before writing recommendation state. `stack-coverage.spec.ts:527,555` verify both refusal outcomes, retained state, confirmed discard, and Create settlement.
- **Finding 3, Show all.** F28 (`implementation-plan.md:193`), amended by P2 review finding 3. `skill-verdict-filter.component.ts:75,89` emits the dedicated action. `stack-skill-review.component.html:74` calls the store's existing two-filter reset. `skill-verdict-filter.component.spec.ts:67` checks the event, and `stack-skill-review.component.spec.ts:185` clicks both filters, then verifies Show all restores the hidden Install and residual candidates.
- **Finding 4, per-item rejections.** R16 and rejected-candidate reachability (`implementation-plan.md:573,578`). `stack-skill-review.component.html:253` renders rejection reasons by candidate and stack item in judged rows. `stack-coverage.ts:564` collects every item-qualified residual rejection and `stack-skill-review.component.ts:187` supplies those reasons to the card disclosure. `stack-skill-review.component.spec.ts:231` verifies a shared candidate retains its Install and rejection reasons, and a residual candidate retains both rejection reasons.
- **Finding 6, Create receipt.** F25 and R18 (`implementation-plan.md:190,569`), amended by P2 review finding 6. `stack-skill.store.ts:1012` only records completion after receiving a nonblank path. An incomplete receipt keeps the draft and clears its submission with an inline error. `stack-coverage.spec.ts:841,866` verify valid completion and draft preservation for undefined and whitespace-only paths.

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the four paths from the brief passed all 57 tests in four suites. The initial run exposed a shared test fixture mutated by an earlier test. Each fixture now receives its own Angular item.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- `npx eslint` on the seven changed TypeScript files exited zero with one `max-lines` warning in `stack-skill.store.ts`, which already exceeded the 700-line limit.
- Both scoped `ptah_get_diagnostics` attempts timed out after 45 seconds. The focused native TypeScript check above supplied compiler verification.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Wire the dedicated Show all event to the existing `resetFilters()` method. | Reuse that method or add a second store action. | The method already clears both active filter signals and has store coverage. | Yes |
| Render item-qualified reasons in judged item rows and include all qualified reasons in the residual card disclosure. | Place reasons in each affected row or add cross-item rejection content to Install cards. | P2 finding 4 allows item rows, and the row view already owns assessments by item. The residual disclosure provides the reasons at the point where the candidate can be selected. | Yes |
| Treat a missing receipt path as a failed Create settlement. | Reuse the existing failure transition or add a receipt-specific draft state. | P2 finding 6 requires preserving edits and displaying an error. The existing failure transition already supports both. | Yes |

## Open items

- The Analyze page's D40 handling belongs to the parallel page lane.
- Electron visual verification was unavailable. Ptah reported no active browser session, and this lane authorizes focused checks only. The component specs render and assert the updated markup in Angular TestBed.

## Extra reads

- Task brief, common lane brief, P2 review findings, D40, and scoped implementation-plan ranges.
- Repository `angular-frontend-patterns` skill and its component reference. Ptah located the skill file and the session exposed no separate skill-loading tool. Also checked the `ui-ux-designer` description for applicability.
- Targeted caller and source lookups in `analyze-skills.page.ts`, `analyze-skills.page.spec.ts`, `stack-coverage-strip.component.ts`, `stack-coverage-strip.component.html`, `skill-draft-preview.component.ts`, and the onboarding entry point. Repository symbol text lookups also located the candidate-assessment declarations in the shared judge contract and backend judge and recommendation services.
- `ptah_search_files` returned zero for the briefs and `ptah_get_dependents` returned an incomplete graph with zero dependents. Used the supplied brief paths and targeted native text lookups to confirm callers.
