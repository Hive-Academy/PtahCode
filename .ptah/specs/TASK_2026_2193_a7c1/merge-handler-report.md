# Merge and handler report

## Conflict decisions

| File | Resolution |
| --- | --- |
| `analyze/analysis-step.store.spec.ts` | Kept the Skills flow's saved analysis and reset assertions. |
| `analyze/analyze-done.page.ts` | Kept the Skills step, valid Review skills link, and guidance status; no retired generate link. |
| `analyze/analyze-workspace.page.ts` | Kept Review skills as the next step and the Skills stepper entry. |
| `analyze/analyze-workspace.page.spec.ts` | Kept the Skills navigation expectation. |
| `analyze/analyze-workspace.render.spec.ts` | Kept the rendered Review skills action and route expectation. |
| `analyze/project-guidance.page.ts` | Kept Skills as the completed step before guidance. |
| `analyze/project-guidance.page.spec.ts` | Kept the safe DOM ordering assertion. |
| `home/onboarding-home.component.ts` | Kept skills copy and action; renamed the stale `agentsOnlyLink` field. |
| `home/onboarding-home.component.spec.ts` | Kept Skills link assertions and retired agent link absence. |
| `onboarding.routes.ts` | Kept the Skills page; retired agent routes redirect to Skills and preserve query parameters. |
| `onboarding.routes.spec.ts` | Kept Skills route and legacy redirect coverage. |
| `shell/onboarding-step-link.ts` | Kept Analyze → Skills → Guidance → Done links and their analysis identity. |

Both Choose agents and Generate agents pages remain removed. Removed setup wizard RPC methods and callers were not restored. A stray `<<<<<<< HEAD` line in `apps/ptah-extension-webview/src/app/ui-gallery/gallery-provider-form.component.ts` was also removed.

## Handler

`wizard:recommend-analysis-skills` validates `runId` with the existing Zod schema, searches saved runs only in the active workspace, and passes the matching run's `stackSummary` to `SkillRecommendationService.recommendAnalysis`. Analysis storage and recommendation service use existing tsyringe tokens through constructor injection. Missing workspace, run, summary, or a storage/search error returns an empty result with safe explanatory copy. The setup handler's `METHODS` list owns the RPC manifest entry; Electron and CLI surface guards expect it. Focused tests cover matching run, missing run, and invalid params.

## Files changed

The 12 conflict files above, plus `apps/ptah-extension-webview/src/app/ui-gallery/gallery-provider-form.component.ts`, `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`, `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`, `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`, and this report.

## Checks

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` — passed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts` — passed, 55 tests.
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/onboarding.routes.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts` — passed, 78 tests.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/rpc-surface.spec.ts` — passed, 17 tests.
- `npx jest --config libs/backend/cli-engine/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` — did not start: config path does not exist.
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` — passed, 20 tests.
- `npx eslint <17 changed TypeScript files>` — passed, 0 errors and 28 warnings.
- `git diff --check` — passed (Git emitted line ending conversion warnings).
- `rg -n '^(<<<<<<< |=======|>>>>>>> )' apps libs tools -g '*.ts' -g '*.tsx' -g '*.html' -g '*.md'` — no conflict markers after removing the gallery line.
- Scoped `ptah_get_diagnostics` — unavailable after 45 seconds; TypeScript checks and Jest passed independently.

The named Angular skill was not discoverable through this CLI. The project Angular guidance was applied. No UI screenshot was taken because this task prohibited building, serving, or launching the app.

The merge index still shows `UU` for the 12 conflict files because Git state changes were prohibited; their working-tree contents are resolved and ready for the coordinator to stage.
