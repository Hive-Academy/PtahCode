# PR #1533 CI fix revision 1

## Review findings

1. **Guidance owner conflict.** The mock returns a blocked response without an owner ID. The workflow store adopts a valid named owner and clears the rejection, so supplying a valid owner prevented the banner from appearing. The visual test retains its Start and banner assertions. [Visual scenario](../../../libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts#L207) [Owner adoption](../../../libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.ts#L341)
2. **Missing active workspace.** The validator returns false before record lookup or migration when the active workspace is null. The Windows-path regression accepts equivalent drive casing and separators, rejects a foreign workspace, and verifies that no-workspace navigation cannot restore or overwrite the saved route. [Workspace validation](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L247) [Restore and persistence regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L214)
3. **Provider wiring.** The webview routing spec checks the production provider block for delegation to `SetupRunStore.canRestoreGenerationRoute`. Reintroducing the chat-tab lookup in that block fails the check. The Windows-path integration spec covers both workflow types, rejects swapped identities, and verifies persistence through the same validator. [Production provider](../../../apps/ptah-extension-webview/src/app/app.config.ts#L246) [Wiring regression](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L1337) [Integration regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L214)
4. **Skills route restore.** The restore guard and the persistence binding parser now share the generation path classifier. The core regression checks stale, valid, repeated, and absent `tab` values on `/onboarding/analyze/skills`. [Shared path classifier](../../../libs/frontend/core/src/lib/routing/onboarding-routes.ts#L164) [Restore guard](../../../libs/frontend/core/src/lib/routing/surface-router.service.ts#L209) [Skills regression](../../../libs/frontend/core/src/lib/routing/surface-router.service.spec.ts#L675)
5. **Legacy adoption.** The validator drains the legacy queue through `untracked()`. The migration path inserts records without marking them live in this session, so reconciliation can recognize committed guidance output. The regression evaluates validation inside a computed signal before activation, then verifies completion from saved output and rejection after a workspace switch. [Untracked validation](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L253) [Legacy migration](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts#L580) [Reactive migration regression](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L754)
6. **Recordless guidance boot.** A restored `/onboarding/guidance` waits for `workspaceResolved` before navigation. The webview regression holds workspace resolution false, checks that route navigation has yet to begin, then verifies that the route lands without requesting an ID check. [Boot gate](../../../apps/ptah-extension-webview/src/app/initial-navigation.ts#L116) [Boot regression](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L547)
7. **Spec diagnostics.** The test record helper accepts and returns `StoredSetupRunRecord`, which declares `guidanceHandoff`. The existing deadline specs exercise the two affected fixtures. The spec compiler no longer reports either TS2353 error. [Fixture type](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L41) [Existing deadline specs](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L1605)

## Decisions

- Kept automatic owner adoption in production because the workflow store spec pins it as intended behavior. Mocking a blocked response without an adoptable owner isolates banner coverage. The fixture choice is reversible.
- Applied the generation validator only to saved skills-route identities covered by the existing persistence classifier. Live Setup links continue through the normal surface navigation entry point. The guard change is reversible without a route or storage migration.
- Extended the boot gate for the standalone guidance entry because that page reads workspace state when it mounts. This avoids a recovery-state flash on restored Electron windows and is reversible within initial navigation.

## Checks

### Jest

```sh
npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts
npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/routing/surface-router.service.spec.ts libs/frontend/core/src/lib/routing/surface-route-persistence.spec.ts
npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts
```

All six suites passed with 407 tests. Setup Wizard passed 165, core passed 100, the webview passed 106, and onboarding passed 36. [Setup Wizard](../../tmp/ci-fix-r1-setup-jest.log) [Core](../../tmp/ci-fix-r1-core-jest.log) [Webview](../../tmp/ci-fix-r1-webview-jest.log) [Onboarding](../../tmp/ci-fix-r1-onboarding-jest.log)

### TypeScript

```sh
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json
npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json
npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.spec.json
npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.spec.json
```

The Setup Wizard, core, webview app, and harness production checks exited 0. [Setup Wizard lib](../../tmp/ci-fix-r1-setup-lib-tsc.log) [Core lib](../../tmp/ci-fix-r1-core-tsc.log) [Webview app](../../tmp/ci-fix-r1-webview-tsc.log) [Harness lib](../../tmp/ci-fix-r1-harness-lib-tsc.log)

- The Setup Wizard spec check exited 2 with ten TS2737 errors for BigInt literals in unchanged shared and worker-protocol files. The spec target is below ES2020. The two `guidanceHandoff` diagnostics are absent. [Setup Wizard specs](../../tmp/ci-fix-r1-setup-tsc.log)
- The harness spec check exited 2 with TS1343 errors for `import.meta` under its CommonJS configuration and a TS2345 error in the settings scenario. The edited guidance visual spec produced no diagnostic. [Harness specs](../../tmp/ci-fix-r1-harness-tsc.log)

### ESLint and degradation audit

```sh
npx eslint \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts \
  libs/frontend/core/src/lib/routing/surface-router.service.ts \
  libs/frontend/core/src/lib/routing/onboarding-routes.ts \
  libs/frontend/core/src/lib/routing/surface-router.service.spec.ts \
  apps/ptah-extension-webview/src/app/initial-navigation.ts \
  apps/ptah-extension-webview/src/app/webview-routing.spec.ts \
  libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-generate-visual.e2e.spec.ts
npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
```

ESLint exited 0 with 14 existing non-null assertion warnings in the Setup Wizard spec. The degradation audit exited 0 with `TOTAL 0`. [ESLint](../../tmp/ci-fix-r1-eslint.log) [Degradation audit](../../tmp/ci-fix-r1-degradation.log)

Scoped `ptah_get_diagnostics` timed out on both attempts. The focused TypeScript checks above supplied the compiler results. [First attempt](../../tmp/ci-fix-r1-ptah-diagnostics.log) [Retry](../../tmp/ci-fix-r1-ptah-diagnostics-retry.log)

Playwright and Electron screenshots remain unverified under the requested check scope.
