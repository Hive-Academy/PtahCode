# Review A: button look adoption (read-only)

Verdict: no blocker, no major finding. Two minor findings.

## Checks that passed

1. Leak and compound errors: none found.
   - `grep data-ptah-look` in ptah-button.css returns 0 hits.
   - All 38 rules start with `.btn[data-ptah-button]`. No rule is left that matches a raw `.btn`.
   - The replacement is correct before `.btn-xs/.btn-sm/.btn-md/.btn-square/.btn-primary/...`,
     `:is(...)`, `:not(...)`, `::before`, `> :where(svg)`, ` :where(svg)` and inside `@media`.
   - Example: `.btn[data-ptah-button]:is(.btn-ghost, .btn-link):is(:disabled...)` is valid.
2. Specificity: unchanged for every rule.
   - Old: `[data-ptah-look='next'] .btn:is(.btn,#ptah-next)` = (0,1,0)+(0,1,0)+(1,0,0) = (1,2,0).
   - New: `.btn[data-ptah-button]:is(.btn,#ptah-button)` = (0,1,0)+(0,1,0)+(1,0,0) = (1,2,0).
   - Modifier classes add the same weight in both files (checked by diff line pairs).
3. Tokens: every `var(--ptah-*)` in the file is declared in ptah-tokens.css (script check: 0 missing).
   The focus ring uses `outline-*`. `box-shadow` appears only for elevation tokens
   (ptah-button.css:37,126,139...) and never for focus.
4. Gallery: one reference column (`data-testid="button-family-reference"`).
   - No leftover `data-ptah-look`, `ptah-next` or `ButtonLookColumn` in apps/ or libs/.
   - `button-family-col` and `data-ptah-look` appear only in negative assertions in
     ui-gallery.component.spec.ts:186-188 (intended).
   - Matrix counts (15/5/30/5/5/5/5/9/1/1) are kept, so the spec stays meaningful.
   - Old docs in .ptah/specs/TASK_2026_929_26ca still mention the old names (history, no fix needed).

## Findings

### minor: ui-gallery.component.spec.ts:189-195 and :197
Evidence: the check `button:not([data-ptah-button])` has length 0 only if the column contains buttons.
The count assertions after it (15 matrix, 30 state) already prove that buttons exist, so the test is
not vacuous. But the guard assertion order lets a reader think it is a stand-alone proof.
Fix (optional): add `expect(col.querySelectorAll('button').length).toBeGreaterThan(0)` before it,
or put it after the count checks.

### minor: gallery lost the raw-`.btn` reference
Evidence: gallery-button-family.component.ts now shows only directive buttons. The old "Current"
column was the only visual check of the legacy raw `.btn` look that the task says must stay.
No test covers "raw `.btn` is not styled by ptah-button.css" (jsdom does not load the CSS).
Fix (optional): add a small raw `<button class="btn btn-primary">` specimen to the gallery, or
a CSS-text spec that asserts every selector in ptah-button.css contains `[data-ptah-button]`
and none contains `data-ptah-look`. This is the only guard against a future leak.

## Test quality (item 5)

- button.directive.spec.ts:116-125: iterates all buttons of `ClassesHost` (all variants and sizes)
  and checks `hasAttribute('data-ptah-button')`. It has a length guard. Good.
- icon-button.directive.spec.ts:35: one extra assertion on the single icon button. Good. It does not
  cover an icon button without a tooltip. This is acceptable because both directives share
  `BUTTON_HOST`. Note: `icon-button.directive.ts:20` spreads `...BUTTON_HOST`, so the attribute is
  inherited. The `class` list assertion (`['btn', ...]`) is unaffected because the new key is an attribute.
- No test shows that a host without the directive lacks the attribute. Low value, skipped.
