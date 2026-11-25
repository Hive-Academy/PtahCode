# Electron visual fixes, round 1

TASK_2026_2325_899d · D45

## Defects and changed files

Paths below are relative to the task worktree.

1. Collapsed disclosures retain their target IDs and apply the `flex` display class only when expanded. Both regression specs assert the hidden attribute and the display class in each state.
   - `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.ts:69`
   - `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.spec.ts:94`
   - `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.html:88`
   - `libs/frontend/onboarding/src/lib/proposal/skill-pick-card.component.spec.ts:131`
   - The onboarding and provider-settings sweep found these two conflicts. The Build row has no display utility on its hidden target. The selected-skills list already has an explicit `[hidden]` display rule.
2. Review Skills opts into the uncapped shell. The judged grids use the shell's page padding, retain the 14.5rem Install minimum with an 8px gap, and fit three Build proposals in one row at 1100 where space permits. The route spec verifies the layout value.
   - `libs/frontend/onboarding/src/lib/onboarding.routes.ts:73`
   - `libs/frontend/onboarding/src/lib/onboarding.routes.spec.ts:42`
   - `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts:36`
   - `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.css:70`
3. The Setup warning takes its own full-width flex row. Recovery buttons flow below it.
   - `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:354`
5. The method banner requires at least one judged-result item, candidate, or proposal. The empty-result regression spec exercises the unavailable-judge method and asserts the banner is absent.
   - `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html:56`
   - `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts:467`

## Measurements and captures

Measurements are in renderer CSS pixels. The previous run is recorded in `.ptah/tmp/visual/observations.log`. Round 1 is recorded in `.ptah/tmp/visual/round1-electron.log`. Both themes produced the same measurements for each width.

| Renderer viewport | Skills content width, before → after | Install columns, before → after | Last Build row bottom y, before → after | Build bottom from Skills top, before → after |
| --- | ---: | ---: | ---: | ---: |
| 1100 × 1000 | 954 → 954 | 3 → 4 | 2177 → 1336 | 1965 → 1124 |
| 1440 × 1000 | 1080 → 1294 | 4 → 5 | 1816 → 1328 | 1604 → 1116 |

- Both widths rendered all eight Install cards and three Build proposals with zero horizontal overflow. At 1100 the Build bottom meets the approximately 1500px budget even when measured from the renderer viewport top. After scrolling, all Build cards were visible through y=628 and the selection bar stayed sticky at y=866–992 in every configuration.
- The collapsed banner went from 36px to 0px at both widths. All eight collapsed Install details went from 100–184px at 1100 and 116–216px at 1440 to 0px. The computed display is `none`. Reopening the banner showed 36px of stage details. Reopening the first Install detail showed 136px at 1100 and 116px at 1440.
- At 1100 the stale warning uses the full 306px inner width. The two action buttons start together 6px below the warning. The model identifier stays on one line in both themes.
- The empty result renders the empty panel and search controls without a method banner.

Screenshot paths are relative to `.ptah/tmp/visual/shots/round1/`.

| View | Dark | Light |
| --- | --- | --- |
| Judged Skills, 1100 × 1000 | `skills-judged-dark-1100.png` | `skills-judged-light-1100.png` |
| Judged Skills, 1440 × 1000 | `skills-judged-dark-1440.png` | `skills-judged-light-1440.png` |
| Build and sticky selection bar, 1100 × 1000 | `skills-scrolled-build-dark-1100.png` | `skills-scrolled-build-light-1100.png` |
| Build and sticky selection bar, 1440 × 1000 | `skills-scrolled-build-dark-1440.png` | `skills-scrolled-build-light-1440.png` |
| Stale Setup picker, 1100 × 1000 | `settings-stale-dark-1100.png` | `settings-stale-light-1100.png` |
| Empty Skills, 1100 × 1000 | `skills-empty-dark-1100.png` | |

The capture runner is `.ptah/tmp/visual/runner/round1.ts`, bundled to `round1.cjs`. The Electron captures were compared with `skills-judged-dark.png`, `skills-judged-wide-dark.png`, `settings-stale-picker-light.png`, and `skills-empty-light.png` in the approved prototype screenshots. The comparison covered the card columns, collapsed content, warning and action placement, and absence of the empty-state method banner. The capture uses the existing `ptah-glass` and `ptah-glass-light` product themes, isolated fixture storage, and a 1000px Playwright viewport inside Electron. The native window manager capped the content height at 982px before the viewport override.

## Checks

| Check | Result |
| --- | --- |
| Scoped Onboarding Jest | Passed, 34 tests in four suites |
| Provider assignment Jest | Passed, 26 tests |
| Onboarding `tsc --noEmit --project` | Passed |
| Chat `tsc --noEmit --project` | Passed |
| `eslint` on all changed source and spec paths | Passed, zero errors. Existing provider file length warning. CSS has no matching lint configuration. |
| Electron `build-dev` and `copy-renderer-dev` under the verify lock | Both passed |
| Electron capture script | Passed, exit 0. All 11 PNGs verified at the requested sizes. |

Scoped `ptah_get_diagnostics` returned unavailable after its TypeScript check exceeded 45 seconds. The tool excludes HTML and CSS. The focused compiler checks and Electron renderer build provided the relevant fallback. The CLI exposed the skill files through the workspace, so `angular-frontend-patterns` and `ui-ux-designer` were read there.

## Decisions

- Use route data for an uncapped shell. The existing `wide` value still caps the shell at 1440px. The route data and class changes are reversible and local to Review Skills.
- Use conditional display utilities on the existing disclosure targets. A scoped CSS override would also hide the panels. Conditional classes use the same expansion signal that drives `hidden` and preserve the controlled element throughout the toggle. Reversible in each template.
- Keep the specified Install minimum and use available shell space plus the existing 8px gap token. The alternate approach of shrinking cards would depart from F22. Use a 19rem Build minimum so three proposals can fit in the same row. Both CSS adjustments are reversible.
- Apply the message-first layout to the Setup issue container at every width. A stale-only class would create a special case in a shared issue layout. The warning copy, alert semantics, and recovery handlers are preserved. Reversible with a class change.

## Open items

- Analyze Start styling is assigned separately. The Unset summary truncation noted by the earlier review was beyond the stale-warning change in this brief.
- The capture log includes unrelated mock RPC and desktop bus warnings. The final run completed all scoped assertions and exited successfully.
- The coordinator owns independent review and the wider verification gate.
