# PR #1514 CI class-audit fix (D47)

The existing baselines pass without edits.

| Item | Before / limit | Fix and source | After |
| --- | --- | --- | --- |
| Provider assignments `<dynamic>` | 13 / 8 | Apply the extracted Setup action look to the five new Settings buttons in `provider-consumer-assignments.component.ts:365,377,387,398,425`. | 8 |
| Provider assignments `gap-1.5` | 6 / 4 | Use `calc(var(--ptah-space-1)*1.5)` at `provider-consumer-assignments.component.ts:356,414`. | 4 |
| Provider assignments `gap-2` | 2 / 1 | Use `--ptah-gap-controls` at `provider-consumer-assignments.component.ts:313`. | 1 |
| Provider assignments `p-2` | 4 / 2 | Use `--ptah-space-2` at `provider-consumer-assignments.component.ts:356,414`. | 2 |
| Provider assignments `px-1` | 3 / 1 | Use `--ptah-space-1` at `provider-consumer-assignments.component.ts:307,338`. | 1 |
| Start analysis `btn`, `btn-primary` | 1 each / 0 | Select `primaryFull` or `plainFull` with `ptahSetupAction` at `analyze-workspace.page.ts:446`. The native button remains disabled until Setup is ready. The existing regression covers both states at `analyze-workspace.page.spec.ts:456`. | 0 each |
| Skill card `card-name`, `card-details`, `card-actions` | 1 each / 0 | Rename the hooks at `skill-pick-card.component.html:22,92,109`, their scoped style selectors at `skill-pick-card.component.ts:33,41,49,54`, and the collapsed details assertion at `skill-pick-card.component.spec.ts:169`. | 0 each |

## Audit output

Before, from `.ptah/tmp/ui-class.log`:

```text
ui-class-audit: TOTAL 852 blocked token(s) across 215 file(s); 6 token count(s) over baseline
ui-class-audit [raw-spacing]: TOTAL 521 blocked token(s) across 36 file(s); 4 token count(s) over baseline
ui-class-audit: FAILED rule(s): daisyui-class, raw-spacing
```

After, `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` exited 0:

```text
ui-class-audit: TOTAL 842 blocked token(s) across 213 file(s); 0 token count(s) over baseline
ui-class-audit [raw-spacing]: TOTAL 514 blocked token(s) across 36 file(s); 0 token count(s) over baseline
```

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0:

```text
degradation-audit: TOTAL 0 unsuppressed site(s)
```

## Checks

- Chat Jest passed 26 tests in `provider-consumer-assignments.component.spec.ts`. Onboarding Jest passed 27 tests across `analyze-workspace.page.spec.ts` and `skill-pick-card.component.spec.ts`. Each run used its library Jest config with `--runInBand --coverage=false --runTestsByPath`.
- UI Jest passed the directive spec (1 test) on rerun with the same scoped flags. The new assertion compares class tokens independently of Angular's DOM class order.
- `npx tsc --noEmit --project libs/frontend/<lib>/tsconfig.lib.json` passed for chat, onboarding, and UI.
- `npx eslint` passed for all eight changed files, with zero errors and two `max-lines` warnings for the already oversized provider assignments and analysis page files.
- Source comparison confirmed that `ghostLink` matches the existing Settings action recipe exactly and that the full-size Start recipes retain their original classes. The scoped card rules keep the same declarations. Visual evidence is limited to class and CSS equivalence. There was no active Electron session and application launches were outside this focused CI check.
- `ptah_ast_analyze` could not parse the external HTML template, so it was inspected directly. Both `ptah_get_diagnostics` attempts timed out on TypeScript after 45 seconds and reported HTML as unsupported. The native scoped checks above cover the changed files.

## Decisions

- Extended the existing public `SetupActionDirective` with `plainFull` and `ghostLink` in `setup-action.look.ts:4` and `setup-action.directive.ts:4`. The alternative `ptahButton` adds `data-ptah-button`, which activates a different CSS recipe. Both added looks reproduce the former class lists, and the directive spec asserts the resulting classes and native disabled state. The additive looks and their callers are reversible together.
- Used existing spacing tokens and the neighboring Settings pattern for a half-step. The resulting values are `0.375rem` for the compact gaps, `0.5rem` for the controls gap and panel padding, and `0.25rem` for paragraph inline padding. Changing gap sizes or adding a token would go beyond restoring the ratchet. These value-preserving substitutions are local and reversible.
- Kept the skill-card rules in their component and renamed their hooks. The removed DaisyUI `.card-actions` rule sets display, wrapping, alignment, and gap, all already set by the component's more specific scoped rule. Each rename is reversible across template, styles, and spec.
