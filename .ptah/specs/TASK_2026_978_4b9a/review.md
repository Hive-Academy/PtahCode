Verdict: PASS — no defects found in the requested adoption review.
Scope: git diff HEAD -- libs apps in ui-form-adopt-10; 13 changed components and 1 changed spec across the three named libraries.
Directive owners: ptahInput, ptahTextarea, ptahSelect and ptahCheckbox selectors match their native elements; used size values xs/sm, tone mono, and [invalid] are supported inputs.
Bindings: comparison of changed template lines found no removed data-testid, id, name, aria-*, ngModel, event, or value binding.
Imports: every used form directive is present in its standalone component imports array and exported by @ptah-extension/ui.
Spec grep: the only relevant old-class assertion is surface-choice-input.component.spec.ts:77 (`select-sm`); PtahSelectDirective still adds `select-sm` for size="sm". No relevant old-class selector found in the requested e2e scopes.
Checks were static only; no build, serve, e2e, or workspace checks run.
Skill discovery: no invocable local review skill was available.
