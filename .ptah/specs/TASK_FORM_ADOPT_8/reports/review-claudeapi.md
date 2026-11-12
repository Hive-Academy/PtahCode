# Review: form adoption (accessibility and look rules)

Scope: `git diff` in worktree ui-form-adopt-8 (13 files). No source file edited. No tests run.
Verdict: no blocker. 1 medium, 4 low findings.

## Findings

| # | Sev | File:line (new file) | Finding | Fix |
|---|---|---|---|---|
| 1 | Medium | `mcp-directory-browser.component.ts` ~L354-356 (after `</ptah-field>`) | The `secret` badge moved out of the label. It now sits after the control, outside `ptah-field`. It is not tied to the control, so a screen reader user does not hear that the value is secret. The visual place changed (label row -> below control) and `ml-1` has no left neighbor. | Put the word in the label: `[label]="requiredInput.name + (requiredInput.isSecret ? ' (secret)' : '')"`. Or add the badge text to the hint. Remove `ml-1`. |
| 2 | Low | `guidance-result-panel.component.ts` ~L36-46 | `ptahToggle` has no `size`. Default is `sm`. The old `toggle` was the DaisyUI default (md). The toggle gets smaller. Also the label has a visible name ("Use project guidance") and a duplicate `aria-label="Enable project guidance"`. The two names differ, so the accessible name does not match the visible text (WCAG 2.5.3). | Set `size="sm"` on purpose (accept the change) and drop `aria-label`, or make it equal to the visible text. |
| 3 | Low | `mcp-directory-browser.component.ts` ~L340 | `[id]="'mcp-required-input-' + $index"` on `ptah-select` sets `id` on the host element, not on the combobox trigger. The field label uses the owner `controlId` (`ptah-select-N`), so label association works, but the host id is a dead id and a possible duplicate. | Remove `[id]` from `ptah-select`. Use `[attr.data-testid]` if a test needs a hook. |
| 4 | Low | `apps-page.component.ts` ~L219 | `ptahTextarea` is used for a chat composer (Apps conversation). The look rule says chat composers are exception U2 for the field use. The bare directive is allowed, and `aria-label` is present, so this is acceptable. Size `md` fits a 2-row textarea. | No change needed. Note U2 in the PR text. |
| 5 | Low | `apps-page.component.ts` L16, `inline-agent-bubble.component.ts` L59, `agent-steer-input` | Long import lines are not prettier formatted (`import { PtahButtonDirective, PtahIconButtonDirective, PtahTextareaDirective } ...` and the `imports: [... ,]` array with a trailing comma on one line). | Run prettier on the changed files. |

## Checked and correct

- Imports: every new directive (`PtahInputDirective`, `PtahTextareaDirective`, `PtahCheckboxDirective`, `PtahToggleDirective`, `PtahFieldComponent`, `PtahRichSelectComponent`) is in the `imports` array of its component. `workspace-indexing.component.html` uses `ptahToggle` and the `.ts` imports it. `plugin-catalog-panel` uses all three that it imports.
- Sizes: all sizes are valid. Text controls use `xs`/`sm`/`md` (`PtahControlSize`). Checkbox and toggle use `xs`/`sm` (`PtahChoiceSize`). No `lg` on a bare control.
- Accessible names: every search input, steer input, deny popover input and the textareas keep their `aria-label`. The pending input keeps `<label for="pending-answer">`. The new `ptah-field` gives `label[for]` for the text input (`id` is set) and for `ptah-select` (via `controlId` and `setFieldLabel`).
- Compact controls: the MCP required input uses `appearance="stacked"` with `tone="mono"` and no floating label. This follows the look rule (floating label only for form fields, not dense rows). The hint now moves into `[hint]`, which gets `aria-describedby`.
- Input `type` binding on the owner (`[type]` with `password`/`text`) is valid: the `ptahInput` selector excludes only checkbox and radio.
- `ptahCheckbox` and `ptahToggle` keep native `type="checkbox"` as the selector needs. `checkbox-primary` and `toggle-primary` come from the owner host class, so removing them from templates loses nothing.
- Removed `[class.textarea-disabled]` in `inline-agent-bubble`: the native `[disabled]` stays, and DaisyUI and the owner style `:disabled`. Safe.
- `command-pending-input`: `size="md"` (40 px) with `min-h-11` (44 px) keeps the touch target. Focus ring and contrast now come from the owner (tokens), not per-template classes.

## Specs

- `mcp-directory-browser.component.spec.ts`: still proves behavior. It checks that `ptah-select` renders, that the footer button is disabled until a value is chosen, then opens the combobox, clicks the first option and checks that the button is enabled. The panel renders inline (`@if (open())` in the component template), so `select.querySelector('[role="option"]')` is valid. Weak point: it clicks "the first option" only. It does not assert the chosen value reaches the install call. Optional: assert the payload has `api_host = 'mcp.acme.test'`.
- `command-pending-input.component.spec.ts`: weaker. The old tests checked focus ring, border and placeholder contrast. The new tests check only `data-ptah-control="input"` and `input-md`. They prove the owner is applied, not the a11y outcome. This is acceptable only because the owner specs (`form-controls.a11y.spec.ts`, `form-controls-look.spec.ts`) cover contrast and focus. Keep the label association check (`label[for=pending-answer]`) and the disabled-state behavior in the spec. Optional: add `expect(answer.disabled)` cases if not already present.
