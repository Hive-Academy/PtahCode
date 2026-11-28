# PR #1533 webview-e2e failure

## Root cause

The Electron boot path waited for workspace resolution and called `SurfaceRouterService.navigateToUrl` with the saved guidance URL. For both guidance paths, the service validates the `tab` parameter before invoking Angular's router. The pre-fix validator at `app.config.ts:63` called `TabManagerService.findTabByIdAcrossWorkspaces`. Chat restore now removes both legacy setup workflows from the tab collection and queues them for adoption into Setup records. The fixture supplied the guidance identity only as a legacy chat tab, which the validator therefore rejected. Boot fell back to the host's chat view. [Initial navigation](../../../apps/ptah-extension-webview/src/app/initial-navigation.ts#L116) [Restore validation](../../../libs/frontend/core/src/lib/routing/surface-router.service.ts#L205) [Legacy tab migration](../../../libs/frontend/chat-state/src/lib/tab-persistence.ts#L201)

Both guidance routes map directly to `ProjectGuidancePage`. Its root section, including the expected test ID, is unconditional. The CI log shows the timeout at that first locator before the scenario-specific assertions. The Done route is outside this generation URL validation branch, consistent with the passing Done captures. [Route table](../../../libs/frontend/onboarding/src/lib/onboarding.routes.ts#L85) [Page template](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L84) [CI locator failure](../../tmp/ci-webview-e2e.log#L524) [CI Done result](../../tmp/ci-webview-e2e.log#L82)

## Fix

- The webview validator now uses the Setup record ID, checks its bound workflow, and compares its workspace with the active workspace using the existing Windows-aware identity helper. For a missing ID, it drains the existing legacy adoption queue before deciding whether to reject the route. This lets saved legacy links resolve if validation runs ahead of the activation effect. The same validator is used when persisting a route. [Validator wiring](../../../apps/ptah-extension-webview/src/app/app.config.ts#L246) [Setup validation](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L246) [Route persistence](../../../libs/frontend/core/src/lib/routing/surface-route-persistence.ts#L75)
- The visual fixture now seeds Setup records for run-bound scenarios. Idle and owner conflict open the recordless guidance entry, where Start creates the run record. Lookup error uses an existing record without a known backend run ID so it exercises the lookup. Completed guidance sends the terminal `setup-wizard:enhance-stream` event that the adapter accepts for guidance. All page and state assertions are preserved. [Fixture](../../../libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate.fixtures.ts#L322) [Visual scenarios](../../../libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts#L43) [Event adapter](../../../libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts#L90)

## Regression coverage

The focused Jest test navigates through the real `SurfaceRouterService` with a saved `C:\ptah-e2e-ws-a` Setup record, the active workspace `c:/ptah-e2e-ws-a/`, and no chat tab. It accepts the two saved guidance routes and rejects a missing ID, a wrong workflow, and a foreign workspace. The legacy adoption test checks validation before the activation effect. The webview composition spec still checks that Electron waits for workspace resolution before validating a saved ID. [Windows regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L208) [Legacy migration regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L715) [Boot ordering spec](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L505)

## Decisions

- Kept the existing route token and query keys. Batch 14 calls for changing the validator from chat tabs to Setup records. Using the existing binding and workspace comparison preserves identity checks and requires no storage or URL migration. This is reversible at the provider boundary. [Batch 14 acceptance](batches.md#L606)
- Seeded Setup records for visual coverage and retained legacy compatibility in the store regression. Keeping legacy tab seeds for the visual suite would exercise migration on every boot and would give the idle scenario a run record before Start. The fixture changes are reversible independently of the route wiring. [Guidance page acceptance](batches.md#L371) [Start record creation](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L850)

## Checks

### Jest

```sh
npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.spec.ts
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/analyze/generation-step.store.spec.ts libs/frontend/onboarding/src/lib/onboarding.routes.spec.ts
```

Setup Wizard passed 156 tests in two suites. Onboarding passed 60 tests in three suites. [Setup Wizard log](../../tmp/ci-webview-e2e-setup-wizard-jest.log) [Onboarding log](../../tmp/ci-webview-e2e-onboarding-jest.log)

### TypeScript

```sh
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json
```

All three exited 0. [Setup Wizard log](../../tmp/ci-webview-e2e-setup-wizard-tsc.log) [Onboarding log](../../tmp/ci-webview-e2e-onboarding-tsc.log) [Harness log](../../tmp/ci-webview-e2e-harness-tsc.log)

### ESLint and degradation audit

```sh
npx eslint apps/ptah-extension-webview/src/app/app.config.ts \
  apps/ptah-extension-webview/src/app/webview-routing.spec.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts \
  libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate.fixtures.ts \
  libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts
npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
```

ESLint exited 0 with 14 existing non-null assertion warnings. The degradation audit exited 0 with `TOTAL 0`. [ESLint log](../../tmp/ci-webview-e2e-eslint.log) [Audit log](../../tmp/ci-webview-e2e-degradation.log)

Scoped `ptah_get_diagnostics` completed on retry. It reported 27 diagnostics in existing code, including the two `guidanceHandoff` fixture type errors documented by Batch 18A and errors in sibling files. It reported no diagnostic on an edited line. [Ptah diagnostics](../../tmp/ci-webview-e2e-ptah-diagnostics.log) [Batch 18A baseline](impl-report-batch18a.md#L47)

The requested scope leaves Playwright, Electron screenshots, and the webview app Jest suite unverified. The coordinator's two existing spec edits were preserved.
