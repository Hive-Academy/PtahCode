## Verdict

APPROVE AFTER FIXES. Confirmed code and look-sheet defects were corrected. Electron screenshots remain a prerequisite for the separate look approval.

## Defects

1. **Medium — FIXED** `apps/ptah-extension-webview/src/app/ui-gallery/gallery-button-family.component.ts:20`: `description` was bound to `ptah-gallery-section`, which declares only `id` and `title`. The component does not render that host attribute, so the intended section description was absent. Moved text into projected content.
2. **Medium — FIXED** `libs/frontend/ui/src/lib/button/ptah-button.css:270`: busy ring used the scale/opacity `ptah-pulse-core` animation. Added `ptah-button-spin` rotation and a reduced-motion stop.
3. **Medium — FIXED** `libs/frontend/ui/src/lib/button/ptah-button.css:248`: busy padding reductions altered intrinsic width for short text and SVG cases. Spinner is now an absolute overlay; label and SVG keep layout space.
4. **Low — FIXED** `.ptah/specs/TASK_2026_929_26ca/family-1-look.md:48`: label size, spinner duration, gap resolution, and busy-layout description disagreed with the tokens/CSS. Corrected the table and description.
5. **Low — FIXED** `.ptah/specs/TASK_2026_929_26ca/batch-1c-report.md:45`: browser tool availability and spinner implementation claims were stale. Updated them to the review findings.

6. **Low — FIXED** `libs/frontend/ui/src/lib/button/ptah-button.css:284`: tooltip panel is portaled into a CDK overlay outside the Proposed column, so its scoped selector never matched. Removed that dead rule; the shared tooltip panel style remains active.

## Fixes applied

- `libs/frontend/ui/src/lib/button/ptah-button.css`: centered rotating spinner, preserved layout, reduced-motion rule, removed unreachable overlay selector.
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-button-family.component.ts`: valid projected description.
- `.ptah/specs/TASK_2026_929_26ca/family-1-look.md`: corrected token and busy-state descriptions; marked future page outcomes as screenshot predictions.
- `.ptah/specs/TASK_2026_929_26ca/batch-1c-report.md`: corrected the independent review's browser and spinner account.

## Checked

1. Scope: every CSS selector starts under `[data-ptah-look='next']`; keyframes define only the animation. Token diff adds declarations without changing prior values. No product template changed. Only the proposed gallery column sets the scope.
2. Variants/states: inspected five variant blocks, three sizes, hover/active forced twins, shared focus outline, disabled/aria-disabled, busy and icon button rules. Static dark-theme render showed all five variants and forced states. Browser measured normal and busy buttons at 102.0625 px each. ID specificity beats later unlayered glass rules; retain as debt until migration.
3. Tokens: CSS has no raw palette or pixel literal. New token names appear in guard; guard includes button `.css` files. Look sheet now lists every token referenced by the button CSS, including host-resolved elevation and border tokens.
4. Design: xs/sm labels use 12 px, md 14 px; no uppercase transform. Emphasis order documented. Contrast assertions use culori OKLCH conversion and WCAG contrast, with real theme surfaces. Independent sRGB luminance arithmetic gave dark muted/base-100 13.075:1, dark/base-300 10.126:1, light/base-100 6.488:1, light/base-300 5.251:1.
5. Angular: checked inputs and imports against `PtahButtonDirective`, `PtahIconButtonDirective`, and `GallerySectionComponent`; found/fixed invalid description input. Required icon labels present; icon variant union excludes link; all `@for` loops track; signal inputs are called.
6. `iconOnly`: searched `libs/` and `apps/`; only a negative source assertion remains.
7. Gallery: shared column markup yields Current/Proposed, 15 matrix specimens each, 30 state specimens each, nine icon specimens each with accessible label/tooltip. OnPush and source assertions checked. The 220-line column file stays together because splitting one specimen grid would add indirection.
8. Look sheet: checked sections B and D, five references against research, token expressions against CSS, Before/after, Proposed Removals, contrast, screenshot requests, recommendations, and empty approval record. No absolute local path or personal identifier found. Real-page visual claims require Electron screenshots.
9. Batch report: compared file list and implementation claims with diff; updated stale claims.

## Verify

Final `npm run verify -- -p ui,ptah-extension-webview` (second run; final code state) exited 0. Last relevant output lines:

```text
[verify 2026-11-10T20:52:24.472Z] starting verify lint,typecheck (ui,ptah-extension-webview)
 NX   4 tasks: 4 succeeded
[verify 2026-11-10T20:53:40.221Z] starting verify test (ui,ptah-extension-webview)
 NX   2 tasks: 2 succeeded
[verify 2026-11-10T20:55:24.728Z] lock released after 180.3s, exit code 0
```

Ptah diagnostics was unavailable because its provider pointed at a different worktree; targeted verify was used instead.
## Notes

- Reviewer's static HTML probe at `.ptah/tmp/review-button.html` inlined the dark tokens and button CSS. It checked state treatment and equal busy width; it is not an Electron gallery or product-page screenshot. Actual dark/light gallery and five reference pages need Electron captures for look approval.
- The ID specificity trick is technically needed against later unlayered glass overrides. Remove it when the scope and legacy selectors are retired.







