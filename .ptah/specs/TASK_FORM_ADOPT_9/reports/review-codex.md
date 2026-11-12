# Review findings

- **Minor — `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:145`: raw toggle remains.** The global “Pause all publication” checkbox still uses `class="toggle toggle-warning"`, although the same template now adopts the form owners and `@ptah-extension/ui` provides `ptahToggle`. `review-settings-drawer.component.spec.ts:114` also finds this control by `toggle-warning`, so changing its DOM class would break that selector. **Fix:** adopt `ptahToggle` (the directive currently uses primary styling, so preserve the warning intent if required), import `PtahToggleDirective` in the component imports array, and give the control a stable id or `data-testid` for the spec.

## Review scope and evidence

Reviewed the uncommitted `git diff` for both requested libraries, the `ptah-field` and control directive implementations, relevant `*.spec.ts` and Electron e2e selectors, and searched the changed files for raw `input`, `select`, `textarea`, `checkbox`, and `toggle` classes. The toggle above was the only remaining raw form class found in the changed files. The changed `data-testid`, id, binding, aria, and label associations were preserved; each adopted directive and field is listed in its component imports. No class-based selector dependency was found for the migrated controls. No tests, build, serve, e2e, or workspace-wide checks were run, as instructed.

