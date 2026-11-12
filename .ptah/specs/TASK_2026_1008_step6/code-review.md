# Code review: canvas rename input migration to ptahInput

Scope: `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts`

## Verdict

- Is the migration correct and complete? **No.** The template change is correct. The spec file is not updated, so one test now fails.

## Checklist findings

1. **Owner API: pass.** `PtahInputDirective` is imported from `@ptah-extension/ui` and added to `imports`. The selector `input[ptahInput]:not([type=checkbox]):not([type=radio])` matches `type="text"`. `size="sm"` is the directive input.
2. **Attributes: pass.** `aria-label`, conditional `aria-describedby`, `[maxLength]`, `[value]`, `[readOnly]`, `(input)` and `(keydown.enter)` are unchanged. The original input had no `autofocus` attribute, so none was lost.
3. **Layout: pass.** `class="mb-3 w-full"` is kept.
4. **Raw classes removed: pass.** `input`, `input-sm`, `input-bordered`, `bg-base-100`, `border-base-content/10` and the `focus-visible:*` classes are gone from the template. The directive host adds `input input-bordered` and `input-sm` itself (`input.directive.ts:17-21`).
5. **Owner supplies look: pass by design.** The directive host sets the token look scoped in `ptah-form-controls.css`. The visual result was not checked in a browser.
6. **Behavior: pass by reading.** The handlers are unchanged, so Enter commit and the `renaming()` readOnly guard work as before. Tests did not run in this review.
7. **Spec selectors: FAIL.** `canvas-rail-card.component.spec.ts` lines 959-968 assert that the input has the classes `focus-visible:outline`, `focus-visible:outline-2`, `focus-visible:outline-offset-[-1px]` and `focus-visible:outline-[oklch(var(--s))]`. The template no longer sets these classes, so this assertion fails. Line 955 (`input-sm`) still passes because the directive adds the class.
8. **Test coverage: not verified.** The spec was not changed. Do not weaken the assertion. Replace it with a check that the input is a `ptahInput` host, for example `panel.querySelector('input[ptahInput]')` and the class `input-sm`. Keep the check `no focus:border-*` classes. Move the focus-ring check to the owner spec or to the form-controls stylesheet.

## Risks

- The failing spec assertion blocks the PR if CI runs the canvas tests.
- The focus ring now depends on the owner stylesheet. If the owner does not give a ring of at least 3:1 contrast in light themes, the old spec guarantee is lost. Confirm that the owner stylesheet covers this.
- The `size="sm"` binding sets the `size` input of the directive. It does not set the native `size` attribute. This is correct, but confirm that no native `size` is rendered.

## Follow-up items

- Update the spec as described in item 8, then run `npm run verify -- -t test -p canvas`.
- Take an Electron screenshot of the rename popover in a light and a dark theme.
- Make an accessibility check of the focus ring contrast in the owner stylesheet.
