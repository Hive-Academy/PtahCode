# Batch 2 frontend report

## Files changed

- Added `analyze/analyze-skills.page.ts` and `analyze/analyze-skills.page.spec.ts`: completed-run skill recommendations, detected evidence, unmatched items, registry failures, manual search, preview, per-skill script consent, installation, skip and guidance handoff. The page invalidates late RPC responses when the run or workspace changes.
- Added `analyze/project-skill-draft.component.ts` and its spec: editable draft from verified stack evidence; `harness:create-skill` runs only after Create. Displays the expected plugin destination and the actual path after creation.
- Added `proposal/stack-skill.store.ts`, `stack-skill-review.component.ts/.html` and `stack-skill-consent.component.ts/.html`; switched team-builder page and specs to these shared pieces.
- Updated `onboarding.routes.ts`, `shell/onboarding-step-link.ts` and specs, `core/routing/onboarding-routes.ts` and spec: Review skills route and redirects from legacy agent URLs, preserving the tab query.
- Updated `analyze-workspace.page.ts`, `analysis-step.store.ts`, `project-guidance.page.ts`, `analyze-done.page.ts` and affected specs: removed agent steps and agent selection/generation UI state; guidance receives a bound tab from the skills page; Done reads workspace skill candidates and guidance status from host state.
- Updated `home/onboarding-home.component.ts`, chat settings copy and related specs, and `webview-e2e-harness/src/lib/scenarios/settings/settings-advanced.entries.ts`.

## Files deleted

- `analyze/choose-agents.page.ts`, `analyze/generate-agents.page.ts`, `analyze/agent-recommendation-list.component.ts` and their specs.
- Old team-builder skill store, review and consent implementation files. Their specs now import the shared components.

## Checks

- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: pass.
- `npx eslint` on affected frontend source files: 0 errors; existing explicit-accessibility warnings.
- Focused onboarding Jest command: all six suites failed before tests started with esbuild `spawn EPERM`.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json`: remains red from existing ready/workspace spec errors and ES2020 target errors in shared/worker protocol. Changed specs have no reported errors after fixing the guidance spec's nullable DOM assertion.
- `ptah_get_diagnostics` on the new skills page: 0 errors in the requested file; sibling errors match the spec-project issues above.
- Rendered UI screenshot was unavailable because this lane was prohibited from serving/building the Angular app.

## Decisions

- Guidance tab: create a `setup-project-prompt` tab on Continue because the existing guidance page requires a bound tab. Reversible; based on `ProjectGuidancePage.ngOnInit` and `TabManagerService.setWorkflow`.
- Project draft destination: show the path derived by the backend's `createSkillPlugin` slug rule. Reversible; based on `harness-fs.service.ts`.

## Open items

- Done uses the durable `harness:get-skill-selection` candidate list. That API does not identify which skills were installed or skipped by this particular Analyze run, so the exact per-run outcome requirement is not fully represented. A durable per-run skill outcome contract is needed if that distinction must survive restart.
- Jest execution remains blocked by `spawn EPERM`; interaction and visual behavior need a runnable host check.
