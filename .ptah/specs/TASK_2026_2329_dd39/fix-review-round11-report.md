# PR #1517 · CodeRabbit round 11

## PRRT_kwDOPngTds69DZ25 — Fixed

The task-kind guard previously ran before the lane funnel update. The guard now runs after the update, so eligible unclassified runs contribute to lane totals while task-specific evidence still requires a classification.

- `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts`
- `libs/backend/lane-routing/src/lib/matrix/choice-evidence.spec.ts`

PR reply — In-window unclassified runs now count in lane funnels, with the existing family and model filters and task-specific evidence requirements preserved.

## PRRT_kwDOPngTds69DZ27 — Fixed

All three callers send the same section value. The Providers page now emits a consumption event after opening the wizard, and Settings clears the focus target in response. The specs cover both target delivery on the same tab and closing and reopening the wizard.

- `libs/frontend/chat/src/lib/settings/settings.component.html`
- `libs/frontend/chat/src/lib/settings/settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts`

PR reply — Opening the setup wizard now consumes the Providers focus target, so a second Connect a provider request can reopen it on the same tab.

## PRRT_kwDOPngTds69DZ28 — Fixed

The state service surfaces Kimi Code's CLI staleness independently from the effective credential source. The shared default filter now keeps key-backed connections whose CLI login is stale. The spec also exercises stale CLI-backed, unreadable-key, and missing-key exclusions.

- `libs/frontend/chat/src/lib/settings/providers/provider-connection-options.ts`
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.spec.ts`

PR reply — A stale CLI login no longer hides a Kimi Code connection served by its stored API key.

## Checks

- Chat Jest passed 174 tests across `providers-settings.component.spec.ts` and `settings.component.spec.ts`.
- Lane-routing Jest passed 17 tests across `choice-evidence.spec.ts` and `routing-evidence.service.spec.ts`.
- `git diff --check` passed.
- Used the installed Jest, TypeScript, and ESLint binaries after the `npx.cmd` wrapper produced no output. Ptah's dependent index was partial, so local source searches confirmed the connection-filter callers and Kimi credential mapping.
- Native Codex skill discovery was unavailable. Used the checked-in Angular frontend patterns, UI/UX and orchestration guidance for this implementation lane.
- Electron visual review was unavailable because there was no active Electron session. The renderer's separate Angular template-check target is outside the permitted check commands. The settings template binding is exercised by Jest.
- TypeScript `--noEmit` passed for the Electron app, Electron renderer, `platform-cli`, `cli-engine`, and the lane-routing spec configuration.
- The chat-wide spec TypeScript check exited 2. Its diagnostics include type mismatches in unrelated test fixtures and a target below ES2020 for imported BigInt literals. A filtered rerun found no diagnostics on changed lines. The edited Providers spec has existing fixture diagnostics for `authMethodIsUnset`, the error-message literal, and `transportTimeout`.
- ESLint exited 0 on the changed files with one existing `max-lines` warning in `providers-settings.component.ts`.
