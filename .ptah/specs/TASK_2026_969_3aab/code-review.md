# Code review: form controls look fix (TASK_2026_969_3aab)

**Verdict: APPROVE WITH NITS.** No blocker. The CSS beats the global rules without `!important`. The five defects are corrected by the rules as written. I did not run a browser or tests. I read the diff and the global rules.

## Specificity (a, b, c = ids, classes, types; an id inside `:is()` counts once)

| Rule | Specificity |
| --- | --- |
| Field reset `ptah-field.css:119-132` | (2,0,1) |
| Floating padding `ptah-field.css:140` | (2,1,1) |
| Disabled reset `ptah-field.css:234` | (2,1,1) |
| New focus-visible reset `ptah-field.css:167-172` (input and trigger) | (2,1,1) and (2,1,0) |
| Panel search focus `ptah-select.css:192` | (2,2,0) |
| Family hover/focus/invalid `ptah-form-controls.css:113-132` | max (1,3,0) |
| Global `input:focus-visible` `styles.css:1061` | (0,1,1) |
| Glass `:is(.input,.select,.textarea):focus`, `.input:focus-within` `styles.css:3367` | (0,4,0) |
| Glass `:focus-visible` `styles.css:3474` | (0,3,0) |
| Dark halo `styles.css:3476` | (0,4,0) |

Every field rule has two ids and wins over each family and global rule. No rule still puts a border, outline, shadow or background on the nested native control or on the trigger inside a field. The reset sets `border: 0`, `box-shadow: none`, `outline: none` and a transparent background (`ptah-field.css:128-131`). The `:focus` (mouse) case is also covered, because the base reset (2,0,1) beats (0,4,0).

The panel search has no `.input` class (`rich-select.template.ts:53`). The glass `.input` rules never match it. Only `input:focus-visible` and the glass focus-visible rules apply, and the new rule beats both.

## Findings

1. **minor - A design document contradicts the new behavior.** `.ptah/specs/TASK_2026_950_ed73/family-2-look.md:34` ("Focus: the rail grows") and `:133` ("focus ring > error rail > focus rail") still describe a focus rail. Fix: amend both lines to say the rail carries error and busy only. Error and busy still show: `ptah-field.css:174-196` keeps the rail base and the error rule, and the busy rule is at `:201`. The scaleX(0) base is unchanged.
2. **minor - The search-row focus mark is a weak mark.** `ptah-select.css:197` only recolors a 1 px bottom border. The ring color has 15.8:1 (dark) and 7.2:1 (light) contrast per the notes, so 1.4.11 passes on color. The line is thin, but the field box also shows its 2 px ring while the panel search has focus (`ptah-field.css:161`, `:has(.ptah-field__body :focus-visible)`, the panel is inside the body). This gives the keyboard user a clear mark. Accept. Optional: use `border-bottom-width: 2px` is not needed. Note that the rule uses `:focus-within`, not `:focus-visible`, so a mouse click also shows it. This is acceptable, because the search input takes focus on open.
3. **minor - The reset is now broader than `[data-ptah-control]`.** `:is(input, textarea, select):is(.input, .textarea, .select)` in `.ptah-field__body` also matches any DaisyUI-classed control placed in a field body. Checkbox, radio and toggle use `.checkbox`, `.radio` and `.toggle`, so they do not match (`ptah-field.css:119`). The panel search has no matching class. The native select chevron is a `background-image`, and the reset only sets `background-color`, so it survives. Controls outside a field are not affected, because every selector starts with `.ptah-field__body`. No change needed. Risk: a future nested `.input` in a field slot (for example a trailing inline input) loses its border. Add a short comment at `ptah-field.css:118` to name this.
4. **nit - Chevron math is correct.** In a flex row with `align-items: center`, a margin-top `m` moves the item up by `m/2`. With `m = pad-bottom - pad-top = -0.875rem`, the shift is -0.4375rem. That equals the offset between the content-box center and the border-box center. The rule is limited to `.ptah-field[data-appearance='floating'] .ptah-select__chevron` (`ptah-select.css:96`). A standalone select and a stacked field are not affected. `margin-inline-start: auto` (`:87`) is harmless for the standalone select, because the value already grows (`:55-58`).
5. **minor - Specs check source text, not rendered style.** `form-controls-look.spec.ts` reads the CSS files and matches strings. The checks pin the contract, so a refactor of the formatting breaks them (for example `'border: 0;'` at line 17 matches many places, so it is nearly vacuous). They cannot detect a specificity loss. Fix: replace the `border: 0;` and `background-color: transparent;` checks with regexes inside the reset block, or add a one-time Playwright/Electron computed-style check (the repro in `.ptah/tmp` exists). The `field.component.spec.ts` change is real: it asserts one clear button and `type="search"`. It does not assert that the native cancel button is hidden (jsdom cannot).
6. **nit - Native search styling rule duplicates two selectors** (`ptah-form-controls.css:104-107`). The `[data-ptah-control]` pair serves standalone inputs, and the `.ptah-field__body` pair serves `ptahFieldControl`. Intended and correct. The `-webkit-appearance: none` on a pseudo-element is the only vendor prefix, and it is needed.

## Rules check

- Tokens only: no raw colors, no `!important`. New values use `--ptah-*` tokens.
- No public API change: no selector or input of an owner changed.
- No new ad hoc utility class. `tools/ui-class-audit/baseline.json` is untouched (`git diff --stat -- tools` is empty).
- Electron first: the notes cite Chromium captures in dark and light. Real Electron confirmation is still a manual step.
