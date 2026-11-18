# L3d — Round 4 related-test repairs

## Files and causes

- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts`: `pickKind` wrote a DOM `value` and dispatched a native `change` on the shared select host. It now locates `ptah-select` by the existing testid and sets its public `PtahRichSelectComponent<string>.value` model, matching the component suite. Existing endpoint rendering, validation, saving, key handling, catalog filtering and stale-result assertions remain intact. No endpoint product fix was needed: custom fields render when the real component receives the selection.
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts`: the D6 reassignment test had the same obsolete native-select helper; it now uses the shared select's public model. Deep-link assertions resolve the inner combobox (or the existing focusable control for effort) and compare it with `document.activeElement`. Confirm/save coverage remains intact. No popover product fix was needed: its existing focus implementation already reaches the combobox.
- `libs/frontend/chat/src/lib/settings/settings.component.spec.ts`: six tests assumed the retired closed `details` section. The three background-models/memory-curator/enhancement deep links now assert that the always-visible section exists outside `details`, receives `scrollIntoView({ block: 'nearest' })`, and becomes `document.activeElement`. The revisit case first proves actual deep-link focus, then proves the remounted visible section is neither scrolled nor focused. The normal Providers and CLI-agents cases each prove the visible section is neither scrolled nor focused. A local scroll mock is installed and restored because jsdom has no layout scrolling. No coverage was deleted. Required Prettier formatting also expanded existing compact formatting in this file and the providers suite.
- `libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts`: real product fix: a resolved deep-link target was focused without an explicit scroll request. It now calls `scrollIntoView?.({ block: 'nearest' })` before the existing focus and consumption logic. Optional invocation accommodates non-layout test hosts; browser/Electron calls the native method.

## Checks

```powershell
npx prettier --write libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts libs/frontend/chat/src/lib/settings/settings.component.spec.ts libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts libs/frontend/chat/src/lib/settings/settings.component.spec.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.spec.ts libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.spec.ts
npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json
npx eslint libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts libs/frontend/chat/src/lib/settings/settings.component.spec.ts libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts
```

- Prettier: PASS (all four files).
- Jest: PASS, 5 suites / 248 tests, exit 0. Final log: `.ptah/tmp/L3d-jest-final.log`. Initial run passed four suites but failed the landing suite because jsdom lacked a scroll method to spy on; the final run includes the corrected local mock.
- TypeScript: FAIL, exit 1, 382 diagnostics across the existing spec-project dependency graph. Log: `.ptah/tmp/L3d-tsc.log`. Examples: incompatible CdkDragMove mock in `resize-handle.component.spec.ts:7`; AgentOutputDelta mocks missing fields in `agent-card-truncation.spec.ts:138,142`; BigInt literals under the configured target in shared codec/identity and worker-protocol code. In the changed Providers suite, existing fixtures lack `authMethodIsUnset` (route) and `transportTimeout` (ambient status views). Verified those fixture shapes are already present in HEAD. None of the new helper/focus/scroll lines has a diagnostic. The other three changed files have no diagnostics. These unrelated fixture/configuration repairs were left outside Round 4.
- ESLint: PASS, exit 0, no output/errors/warnings. Log: `.ptah/tmp/L3d-eslint.log`.
- `git diff --check -- <the four changed files>`: PASS.

## Scope and limitations

No forbidden files were edited, tests skipped, or commits/pushes/stashes/merges performed. No Nx, verify, build, serve or e2e commands were run. This round changes tests and deep-link scrolling; refreshed Electron screenshot verification was not performed. Focus assertions use real rendered DOM controls; scroll assertions verify the native method request, not browser geometry.

The existing providers/settings spec files already exceeded 700 lines before this round; the required formatting expands them further. Splitting unrelated suites was left outside this targeted repair. The endpoint spec and product component remain under 700 lines.

CLI-native skill loading is unavailable. Skill search returned no match, so the local `.claude/skills/angular-frontend-patterns/SKILL.md` was read directly and applied. Ptah dependents returned an incomplete graph with the component absent; native source inspection and rg supplied the fallback. Ptah diagnostics reported its compiler check unavailable after 45 seconds; the explicitly requested TypeScript command supplies validation instead.
