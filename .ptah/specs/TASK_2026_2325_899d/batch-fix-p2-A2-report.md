# F-A2 fix report

## Files changed

All source paths below are relative to `libs/frontend/onboarding/src/lib/proposal/`.

- `skill-selection-rail.component.ts`, `skill-selection-rail.component.html`, `skill-selection-rail.component.css`, and `skill-selection-rail.component.spec.ts`
- `stack-coverage-strip.component.ts`, `stack-coverage-strip.component.html`, and `stack-coverage-strip.component.spec.ts`

## Plan items and findings

- **Finding 2, R22 and F22** (`implementation-plan.md:178`, `:187`, `:543`). The selection bar starts collapsed. Its native button exposes the selected list through `aria-expanded` and `aria-controls`. The list reuses every selected item's existing removal action. The stylesheet caps the expanded list height and keeps the primary action in the bar's first row. See `skill-selection-rail.component.html:30`, `skill-selection-rail.component.ts:102`, and `skill-selection-rail.component.css:45`. The regression at `skill-selection-rail.component.spec.ts:96` checks the collapsed and expanded states, lists both selected skills, and verifies removal emits the retained registry key.
- **Finding 5, R22 and F23** (`implementation-plan.md:182`, `:188`). Once the item chips are fitted, the strip checks the rendered overflow control's line and width and trims second-line chips if needed. It can show zero item chips and rechecks the rendered control after the label changes. See `stack-coverage-strip.component.ts:227` and `stack-coverage-strip.component.html:73`. The regression at `stack-coverage-strip.component.spec.ts:234` models flex wrapping for the real set of buttons and asserts both the chip count and the control's line. It covers zero visible chips, full-width recovery, and focus on expansion.

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts` passed. Both suites passed, 19 tests total.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- `npx eslint libs/frontend/onboarding/src/lib/proposal/{skill-selection-rail,stack-coverage-strip}.component{,.spec}.ts` passed.
- Scoped `ptah_get_diagnostics` timed out twice at 45 seconds for TypeScript and did not support HTML or CSS. The focused TypeScript command above completed successfully.

## Decisions

- Chose a collapsed in-flow disclosure from the brief's disclosure and permanently visible compact-list options. The judged sticky bar has a compact default under R22, and the existing rail markup already provides the item list and remove action. The change is reversible within the rail component.
- Chose a post-render measurement of the real overflow button. Measuring a separate off-flow copy was an option, but the visible control already provides its exact label, width, and line in the flex row. The change is reversible within the strip component.

## Open items

- Electron visual review and Angular's dedicated template typecheck remain for the coordinating agent. This lane was limited to the focused commands above. The Jest assertions use simulated strip geometry.
- No changes required from other implementation groups.

## Extra reads

- `CLAUDE.md` and `.claude/skills/{angular-frontend-patterns,ui-ux-designer,orchestration}/SKILL.md` supplied repository conventions and skill guidance. No host skill-loading tool was exposed, so the workspace skill files were read directly.
- The Ptah dependency graph returned zero hits for both components with partial coverage. A scoped `rg` search confirmed the review template call sites and the judged bar bindings in `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html:626`. A free-text search located the existing Ptah button selector in `libs/frontend/ui/src/lib/button/button.directive.ts:19`.
