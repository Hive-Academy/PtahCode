# PR #1533 CI run 2 fixes

## A. Electron boot with a saved guidance run

The running and completed captures both restore a running backend ID. The first verified state reaches the effect in `ProjectGuidancePage`, which calls `GuidanceGenerationStore.adopt`. Adoption reads the Setup index to find the record, reports that state through the bound coordinator, and causes `SetupRunStore.patch` to publish a fresh index even when the lifecycle is still running. Because the effect tracked the original index read, the write queued adoption again. The idle and lookup-error cases never supply the verified running state that starts this cycle. [CI shell failure](../../tmp/ci2-webview-e2e.log#L529) [Running fixture](../../../libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts#L104) [Page effect](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L576) [Guidance report](../../../libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts#L188) [Bound coordinator](../../../libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts#L281) [Index write](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L662)

Adoption now runs inside `untracked`, so the page effect follows the workflow run and the page binding without subscribing to the index or the signals that adoption updates. The Jest regression restores the saved URL through `SurfaceRouterService` and the real validator with `C:\ptah-e2e-ws-a` and the equivalent active path `c:/ptah-e2e-ws-a/`. It wires the same effect to the real workflow and guidance stores, exercises coordinator reconciliation, then verifies that adoption settles in both running and completed states. Prior to the fix, the bounded regression failed with “Guidance adoption did not settle” from Angular’s effect queue. [Fix](../../../libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts#L108) [Regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L214) [Before-fix log](../../tmp/ci-run2-adoption-red.log)

## B. Team-builder consent dialog

CI failed before clicking Install, when the spec dereferenced the result of a broad `dialog` query immediately after the first change-detection pass. The consent component is outside the installed-recovery conditional, so the template does not support the theory that installed recovery hides it. The original whole spec passed all 45 tests locally under coverage. The CI-only trigger and any cross-test leak remain unconfirmed. [CI error](../../tmp/ci2-test3.log#L746) [Consent placement](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html#L339) [Original whole-spec coverage run](../../tmp/ci-run2-b-baseline.log)

The suite now destroys TestBed before clearing persisted state between cases. The test waits for the fresh page to settle, checks it starts at intent, switches to consent, and queries the consent component’s own dialog after the consent view settles. It uses the shared jsdom dialog implementation and still checks closure, inertness, focus, mouse access, and cancellation. [Per-test setup and teardown](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L78) [Regression](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L341) [Dialog test setup](../../../libs/frontend/onboarding/src/test-setup.ts#L8)

## C. Bounded workspace restore

The workspace gate ends when the workspace resolves, Angular starts a newer navigation, the injector is destroyed, or 30 seconds elapse. A timeout opens the default surface without validating the saved route. Teardown and superseding navigation return `cancelled`. The webview routing spec leaves the signal unresolved to verify all three exit paths and retains the successful restore cases. [Implementation](../../../apps/ptah-extension-webview/src/app/initial-navigation.ts#L123) [Regression cases](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L576)

## D. Legacy guidance timestamps

The legacy handoff carries the persisted tab’s `lastActivityAt`. A valid historical value becomes the migrated record’s creation time. Missing, invalid, or future timestamps use the migration time to avoid treating unrelated older output as completion evidence. The regression checks that output committed after tab activity and before reload completes the restored run, and that output older than the tab leaves it interrupted. The chat-state contract spec also checks that the migration queue forwards the activity timestamp. [Legacy handoff](../../../libs/frontend/chat-state/src/lib/tab-persistence.ts#L168) [Timestamp selection](../../../libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts#L172) [Reconciliation regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L793) [Chat-state contract](../../../libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts#L71)

## Decisions

- Kept route validation and RPC fixtures on their existing contract. The red regression accepts the Windows route before reproducing the loop, so changing either would leave the reactive feedback path in place. The fix is reversible at the adoption boundary.
- Set the workspace wait ceiling to 30 seconds, in line with the host RPC timeout. An unbounded wait can keep the shell from mounting, while a shorter ceiling would give Electron less time than a normal host RPC. The constant is local to initial navigation.
- Used the persisted legacy tab activity time as migration evidence. It provides a per-tab cutoff without guessing from the age of the workspace output. A tab whose last recorded activity came after its output will still require recovery.

## Checks

### Jest

```sh
npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.spec.ts
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts
npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts
```

- **A and D** — 200 tests passed across the Setup Wizard specs. [Setup Wizard log](../../tmp/ci-run2-setup-jest.log)
- **A and B** — 81 tests passed across the guidance page and complete team-builder specs. The complete team-builder spec also passed all 45 tests under coverage. [Onboarding log](../../tmp/ci-run2-onboarding-jest.log) [Team-builder coverage log](../../tmp/ci-run2-team-builder-coverage.log)
- **C** — 108 webview routing tests passed. [Webview routing log](../../tmp/ci-run2-webview-routing-jest.log)

Playwright and Electron screenshots were outside the requested check scope. The chat-state contract spec was updated for the new handoff field and is outside the listed Jest projects. The Setup Wizard migration spec was run.

### TypeScript, ESLint, and degradation audit

```sh
npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/chat-state/tsconfig.lib.json
npx eslint \
  apps/ptah-extension-webview/src/app/initial-navigation.ts \
  apps/ptah-extension-webview/src/app/webview-routing.spec.ts \
  libs/frontend/chat-state/src/lib/tab-persistence.ts \
  libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts \
  libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts
npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
```

- The webview app, Setup Wizard library, and chat-state library TypeScript checks exited 0. [Webview](../../tmp/ci-run2-webview-tsc.log) [Setup Wizard](../../tmp/ci-run2-setup-tsc.log) [Chat-state](../../tmp/ci-run2-chat-state-tsc.log)
- ESLint exited 0 with 14 pre-existing non-null assertion warnings in the Setup Run Store spec. The degradation audit exited 0 with `TOTAL 0`. [ESLint](../../tmp/ci-run2-eslint.log) [Degradation audit](../../tmp/ci-run2-degradation-final.log)
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.spec.json` exited 2 with the same ten TS2737 diagnostics recorded in the prior fix. The spec target is below ES2020 and the diagnostics are in unchanged shared and worker-protocol dependencies. [Spec TypeScript log](../../tmp/ci-run2-setup-spec-tsc.log) [Prior baseline](fix-report-ci-fix-r1.md#L45)
- Scoped `ptah_get_diagnostics` timed out twice with nine files reported unchecked. The focused TypeScript commands above supplied the compiler results. [Ptah diagnostics](../../tmp/ci-run2-ptah-diagnostics.log) [Retry](../../tmp/ci-run2-ptah-diagnostics-retry.log)
