# Review: form owner adoption in git-ui and review-runs-ui

Scope: uncommitted `git diff` of libs/frontend/git-ui and libs/frontend/review-runs-ui.
Method: static read of the diff, the owners in libs/frontend/ui, and grep of specs and e2e.
No build, test or verify command was run.

## Verified OK
- Every changed component imports each owner it uses (Input, Select, Textarea, Checkbox, Field).
- `data-testid`, `id`, `aria-label`, `[ngModel]`, `[value]`, `(change)`, `(input)`, `maxlength`, `required` are kept.
- ptah-field wraps controls and removes the old `<label for>`. The owner sets `for` from the control id (`syncId` keeps an existing `id`).
- e2e (`apps/ptah-electron-e2e`) uses only `data-testid` selectors for these controls. No class selector depends on `input`, `select`, `textarea` or `checkbox`.
- No `*.spec.ts` selects by changed form classes.
- `FOCUS_RING` const is still used in comparison-bar and changed-file-row-actions (`iconButton`), so no dead const.

## Findings

### 1. Medium - default size changes from md to sm
- Files: review-settings-drawer.component.html (all `ptahInput` fields), review-bot-identity.component.ts:~47, review-repositories-editor.component.ts (`ptahInput`, three `ptahCheckbox`), review-confirm-dialog.component.ts:14 (`ptahCheckbox`).
- Evidence: `PtahTextControlBase.size` and `PtahChoiceControlBase.size` default to `'sm'` (text-control.base.ts, choice-control.base.ts:8). The old classes `input input-bordered` and `checkbox` were md. The editor checkboxes were `checkbox-sm`, so those are unchanged.
- Fix: pass `size="md"` where md was intended, or accept the change and state it in the PR.

### 2. Medium - commit message label becomes visible
- File: commit-composer.component.ts:~269-290.
- Evidence: the old `<label class="sr-only">` is replaced by `ptah-field` with the default `floating` appearance. The label is now visible and floats over the textarea with a placeholder bound through `[placeholder]`. The spec at commit-composer.component.spec.ts:812 still expects `label[for=id]` with text "Commit message". It should pass only if the field effect has written `for` after `detectChanges`.
- Fix: use `appearance="stacked"`, or keep the label sr-only. Run the commit-composer spec. Also check that `[attr.aria-describedby]` (generateNotice) is not erased by the field `syncDescription`. It keeps non-field ids, so it should be safe.

### 3. Low - raw toggle left
- File: review-settings-drawer.component.html:145.
- Evidence: `class="toggle toggle-warning"` on a checkbox, inside a wrapper `<label>`.
- Fix: use `ptahToggle` (toggle.directive.ts exists) if in scope. Otherwise state it as out of scope.

### 4. Low - wrapper labels kept in file-diff-section
- File: file-diff-section.component.ts:279-327.
- Evidence: Side select, From, To and Comment still use wrapper `<label>` with a span. This is a valid link and is not a regression. It is inconsistent with the ptah-field recipe used elsewhere.
- Fix: optional. Convert to `ptah-field appearance="stacked"` if consistency is required.

### 5. Low - sr-only labels beside owners
- Files: review-findings-table.component.ts (`finding-lens`), review-runs-page.component.ts (repo and state filters).
- Evidence: `<label class="sr-only" for=...>` is kept with `ptahSelect`. The link is valid. No regression. The Search runs input keeps `aria-label`.

### 6. Low - lost focus outline override
- Files: branch-picker-dropdown, comparison-bar, file-diff-section, task-worktree-view.
- Evidence: `focus-visible:outline-[oklch(var(--s))]` was removed. The owner look in ptah-form-controls.css is expected to supply focus. This is not verified visually.
- Fix: confirm focus ring in Electron.

### 7. Info - settings drawer toggles/number inputs
- `ptah-field` default floating appearance is used for the number inputs ("Poll interval" and others). A floating label with an empty value adds a placeholder `' '` through the field. Number input with `[value]` binding is fine. Check the layout in a screenshot (a grid of two columns).

## Verdict
No blocking defects found. Fix or accept findings 1 and 2 before merge. Run the scoped specs for git-ui commit-composer and review-runs-ui settings drawer, and `typecheck-templates` for the webview.
