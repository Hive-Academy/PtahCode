# Lane report: TASK_FORM_ADOPT_7 (claude)

No build, lint, verify or commit was run. Public alias `@ptah-extension/ui` only.

## Files and DOM delta (libs/frontend/...)
- marketplace/smithery-surface.component.ts: 2 inputs (API key, search) lose `input input-bordered input-sm`; now bare `ptahInput size="sm"` (+ `w-full text-xs`, `w-full pl-8 text-xs`).
- marketplace/ui/capability-toggle.component.ts: `toggle toggle-sm toggle-primary focus-visible:*` replaced by `ptahToggle size="sm"` + `shrink-0`. Owner sets role=switch.
- marketplace/ui/provider-card-list.component.ts: checkbox -> `ptahCheckbox size="xs"` + `relative z-10 mt-1`.
- marketplace/ui/provider-table.component.ts: 2 checkboxes (select-all, row) -> `ptahCheckbox size="xs"`.
- marketplace/ui/provider-filters.component.ts: `<label class="input ...">` wrapper becomes `<div class="relative ...">`; icon is absolute; inner search input is `ptahInput size="sm"` with `w-full pl-8`.
- onboarding/analyze/agent-recommendation-list.component.ts: checkbox -> `ptahCheckbox size="sm"` + `mt-0.5`.
- onboarding/proposal/new-project-intake.page.ts: 2 textareas and the stack-other input moved into `ptah-field appearance="stacked"` (external `<label>` removed, label text is the field label; first one `[required]`). Controls use `ptahTextarea`/`ptahInput size="md"` with `[invalid]`; `[attr.aria-invalid]` removed. The ids, names, ngModel, events and `aria-describedby` are kept. Hint and error `<p>` stay outside the field.
- onboarding/proposal/team-builder-start.page.ts: textarea -> `ptah-field` stacked + `ptahTextarea [invalid]`, same rules.

All data-testid, id, name, bindings and events are kept.

## Raw leftovers
None of the raw form recipes remain in these 8 files. Radio groups (`join` / `aria-checked` segments) and button classes were not in scope.

## Notes / risks
- The "(optional)" hint text in the constraints label lost its muted span (plain label text).
- `[attr.aria-describedby]` is still bound on owner textarea/input hosts (the brief says keep aria); the owner also writes aria-describedby for the field hint. Check at review.
- provider-filters search lost the in-box icon layout (now absolute icon over the owner input).

## Specs
No spec updated. Searched marketplace and onboarding specs: the only `aria-checked` hits are radios, not toggles.
