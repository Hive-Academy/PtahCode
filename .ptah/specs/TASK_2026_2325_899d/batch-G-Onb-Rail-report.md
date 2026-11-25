# Batch Report — G-Onb-Rail (TASK_2026_2325_899d)

## Files Changed
Only the 4 assigned files in `libs/frontend/onboarding/src/lib/proposal/` were modified:
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css`
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts`

## Plan Items Done
- **R20 / F29 / R17 — Rail Install disabled with visible `aria-describedby` reason while a skill draft is open** (`implementation-plan.md:575`, `decisions.md:69-73,83-88`, `design-spec.md:265-267`, `batch-G-Onb-Store-Coverage-report.md:60,97,167`):
  - Added optional signal input `installBlockedReason = input<string | null>(null)` to `SkillSelectionRailComponent`.
  - Normalized whitespace (`normalizedInstallBlockedReason`) so `null` or blank strings do not block.
  - Added `primaryDisabled` (`blocked() || normalizedInstallBlockedReason() !== null`) and `onPrimaryClick()` guard on `[data-testid="skill-install-primary"]`, ensuring only one primary action exists while a draft is open (R20), while keeping `"Skip skills"` and `"Remove <skill>"` controlled by `blocked()`.
  - Rendered the visible reason in `[data-testid="skill-install-blocked-reason"]` inside `[data-selection-notes]` with a unique per-instance `[id]="installBlockedId"`, `role="status"`, and `text-state-need` styling; linked it to `[data-testid="skill-install-primary"]` via `[attr.aria-describedby]="primaryDescribedBy()"` (switching back to `helperId` when `installBlockedReason` is `null` and `!loading()`).
- **R22 / F22 / Plan 3.6 — Sticky bottom bar rules for judged mode** (`implementation-plan.md:543-546`, `decisions.md:95-103`, `design-spec.md:243-245`):
  - Added `width: 100%; box-sizing: border-box;` to `:host([data-layout='bar'])` in `skill-selection-rail.component.css` alongside the existing `position: sticky; top: auto; bottom: 0; z-index: var(--ptah-z-raised);`.
  - Extended host `[class]` binding for `layout() === 'bar'` with `w-full box-border` alongside `sticky bottom-0 z-[var(--ptah-z-raised)] block`.
  - Added defensive `:host([data-layout='bar']) [data-selected-list]` and `:host([data-layout='bar']) [data-selection-title]` `display: none` rules alongside `progress` in case a consumer sets `[attr.data-layout]="'bar'"` directly.
- **Unjudged team-builder parity preserved** (`implementation-plan.md:478,544`, `brief-G-Onb-Rail.md:18-19`):
  - All new inputs are optional (`installBlockedReason` defaults to `null`; `layout` defaults to `'rail'`; `responsive` defaults to `false`). Existing team-builder behavior and defaults are unchanged.
- **Unit test coverage** (`brief-G-Onb-Rail.md:43-44`):
  - Added focused tests in `skill-selection-rail.component.spec.ts` covering `installBlockedReason` disabling Install + visible `aria-describedby` linkage + click suppression + reset to `null` + whitespace ignore, 0-selected primary button disabling under `installBlockedReason`, unjudged defaults, and sticky bar host attributes/classes (`data-layout="bar"`, `sticky`, `bottom-0`, `w-full`, `box-border`, `!responsive`).

## Contract for G-Onb-Review
### New & Relevant Inputs on `SkillSelectionRailComponent` (`ptah-skill-selection-rail`)
| Input | Type | Default | Usage in `stack-skill-review.component.html` |
| --- | --- | --- | --- |
| `installBlockedReason` (**new**) | `string \| null` | `null` | Bind `[installBlockedReason]="installBlockedReason()"` (from `StackSkillStore.installBlockedReason()`, e.g. `'Finish or cancel the open skill draft before installing'`). When non-null/non-blank, disables `[data-testid="skill-install-primary"]` and renders `[data-testid="skill-install-blocked-reason"]` linked via `aria-describedby`. |
| `layout` (existing) | `'rail' \| 'bar'` | `'rail'` | Bind `[layout]="judgedMode() ? 'bar' : 'rail'"`. **Important:** Bind `[layout]` rather than `[attr.data-layout]`, because `SkillSelectionRailComponent` owns host `[attr.data-layout]="layout()"` and also switches template DOM (`@if (responsive() \|\| layout() === 'rail')`), `ptah-form-actions` button flow, and host sticky classes (`sticky bottom-0 ... w-full box-border`) from `layout()`. |
| `responsive` (existing) | `boolean` | `false` | Bind `[responsive]="!judgedMode()"` so unjudged team-builder mode keeps responsive rail behavior (`@container skills (min-width: 960px)`), while judged mode stays a full-width sticky bottom bar at all widths. |

### Outputs & Test Selectors
- Outputs unchanged: `primary`, `skip`, `removed`.
- Primary button selector: `[data-testid="skill-install-primary"]`.
- Visible blocked-reason selector (rendered only when `installBlockedReason` is non-empty): `[data-testid="skill-install-blocked-reason"]` (also referenced by the primary button's `aria-describedby`).

### Grid Container & Sticky Containing Block Required in `G-Onb-Review`
Per `implementation-plan.md:478-546` (owned by `G-Onb-Review`, not modified here):
- In `proposal/stack-skill-review.component.css`, add `.skills-container { overflow: visible; }` and `.skills-layout.skills-layout--judged` rules (placed after existing lines 32-64) with `overflow: visible`, `grid-template-areas: 'header' 'coverage' 'main' 'rail'`, and `.skills-layout.skills-layout--judged > .skills-selection { grid-area: rail; align-self: end; width: 100%; }` so the `onboarding-shell` scrollport acts as the sticky containing block for `:host([data-layout='bar'])`.

## Checks
1. **Jest (focused spec):**
   - Command: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts`
   - Result: **PASS** — 1 passed suite, 13 passed tests, 0 failed (`exit 0`).
2. **TypeScript typecheck:**
   - Command: `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
   - Result: **PASS** — 0 errors (`exit 0`).
   - Note on `ptah_get_diagnostics`: Invoked scoped to the 2 changed `.ts` files; returned `unavailable` (`TypeScript check still running after 45s`). Verified via `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` instead.
3. **ESLint:**
   - Command: `npx eslint libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.html`
   - Result: **PASS** — 0 errors, 0 warnings (`exit 0`).
4. **Type safety & hygiene:** Verified no `any` in changed `.ts` files; verified via `git diff --stat` that only the 4 assigned files were modified.
5. **Skill & visual notes:**
   - `angular-frontend-patterns` skill is disabled for model invocation per `brief-G-Onb-Rail.md:6`; neighbor standalone/OnPush/signal/Ptah-token conventions were followed directly.
   - Electron visual verification (plan 3.6 line 556) is not executed by this focused unit lane (builds/Electron launches are disallowed for this lane); CSS sticky/grid behavior is verified at unit/source level and handed off to `G-Onb-Review` and Electron visual review.

## Decisions
| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Point `aria-describedby` to `installBlockedId` (exact `<p>` element) while `installBlockedReason` is set, and to `helperId` otherwise | (a) Concatenate `installBlockedId` + `helperId` (causes double screen-reader announcement because `<p [id]="installBlockedId">` lives inside `[data-selection-notes][id="helperId"]`); (b) point to `installBlockedId` when blocked and restore `helperId` when `null` | `skill-selection-rail.component.css:44-60` places `[data-selection-notes]` as the sole full-width `grid-column: 1 / -1` notes slot in bar mode; single ID avoids duplicate announcement and satisfies both single-ID and ID-list lookups | Yes |
| Disable `[data-testid="skill-install-primary"]` whenever `installBlockedReason` is non-empty (both `selected().length > 0` and `=== 0`), while leaving `Skip skills` and `Remove` governed by `blocked()` | (a) Disable all rail buttons; (b) disable Install only when `selected().length > 0`; (c) disable primary button whenever `installBlockedReason` is set | `decisions.md:86-88` (R20: "one primary action (Create) exists" while draft is open), `stack-skill.store.ts:239-241` (`installBlockedReason` is set whenever `draftOpen()` is true regardless of selection count) | Yes |
| Recommend `[layout]="judgedMode() ? 'bar' : 'rail'"` (rather than `[attr.data-layout]`) in Contract for `G-Onb-Review`, while also adding defensive `:host([data-layout='bar'])` CSS rules for title/selected-list hiding | (a) Replace `layout` input with attribute-only binding; (b) keep `layout` input driving host `[attr.data-layout]`, template branches, and host classes, plus defensive CSS | `skill-selection-rail.component.ts:30-34,92` and `.html:6,31,72` already own `[attr.data-layout]="layout()"` and switch bar/rail markup and `ptah-form-actions` classes from `layout()` | Yes |

## Open Items & Needed Changes in Other Groups
- **`G-Onb-Review` (`proposal/stack-skill-review.component.ts/.html/.css`):**
  - Pass `[installBlockedReason]="installBlockedReason()"` (input on `StackSkillReviewComponent`, wired from `StackSkillStore.installBlockedReason()`), `[layout]="judgedMode() ? 'bar' : 'rail'"`, and `[responsive]="!judgedMode()"` to `<ptah-skill-selection-rail>`.
  - Apply the `.skills-container { overflow: visible; }` and `.skills-layout.skills-layout--judged` grid-area/breakpoint rules from `implementation-plan.md:479-541` in `stack-skill-review.component.css`.
- **`G-Onb-Pages` (`analyze/analyze-skills.page.ts`):**
  - Bind `store.installBlockedReason()` into `StackSkillReviewComponent` and continue enforcing the page-level F29 guard (`!state.draftOpen()`) before opening consent.
- **Visual Review (Electron host):** Verify sticky bottom bar pinning, full-width layout, and blocked-reason rendering at 1100x1000 and 1440x1000 once `G-Onb-Review` lands.

## Extra Reads
- `.ptah/specs/TASK_2026_2325_899d/implementation-plan.md` lines 250-291 (batch table) and lines 583-679 (Amendment 3.8-3.9 & Coordinator amendment C1 precedence check), plus `grep -nE` for `G-Onb-Rail|skill-selection-rail|installBlockedReason|data-layout` (per `lane-brief-common.md:15-17`).
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html` lines 320-355 and `stack-skill-review.component.css` lines 1-64 (verified existing `<ptah-skill-selection-rail>` bindings and grid container breakpoints).
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` lines 231-250 (via `grep -C 8` on `installBlockedReason`/`draftBlockedReason`, verified store signal semantics).
- `libs/frontend/onboarding/src/lib/proposal/skill-build-row.component.ts` lines 1-120 and `grep -rn "text-state-"` across `libs/frontend/onboarding/src/lib/` (verified sibling Ptah token usage for blocked-reason styling).
- `grep -rn "ptah-skill-selection-rail\|SkillSelectionRailComponent"` across `libs/frontend/onboarding/src/` (verified all consumer sites and test references).
