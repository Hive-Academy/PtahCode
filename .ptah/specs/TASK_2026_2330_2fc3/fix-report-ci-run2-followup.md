# CI run 2 follow-up for TASK_2026_2330_2fc3

## Finding 1 — Electron workspace restore

Boot waits for `ElectronLayoutService.workspaceResolved` before validating a saved Setup route. The layout service settles this signal after the bounded RPCs and any persisted-folder fallback, including failed attempts. Injector teardown and a newer router navigation still end the wait with `cancelled`. [Boot gate](../../../apps/ptah-extension-webview/src/app/initial-navigation.ts#L125) [Layout settlement](../../../libs/frontend/core/src/lib/services/electron-layout.service.ts#L926)

The routing spec advances the clock to 45 seconds with workspace resolution pending and verifies that boot continues to wait with the saved route intact. When the layout signal settles, the spec checks validation, navigation and persistence of the saved Setup route. The existing routing specs cover teardown and superseding navigation. The Electron layout specs exercise settlement after a cached switch succeeds, fails or throws. [Slow restore](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L606) [Newer navigation](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L576) [Teardown](../../../apps/ptah-extension-webview/src/app/webview-routing.spec.ts#L642) [Layout fallback](../../../libs/frontend/core/src/lib/services/electron-layout.service.spec.ts#L711)

## Finding 2 — Onboarding effects

- The Project Guidance handoff effect tracks the record and parent lookup when it needs to recover a late record. Its calls to `bindRunSequence` and `openRecord` run in `untracked`. The new spec asserts that the late handoff attaches and marks an unseen record as seen outside the reactive context. [Effect](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts#L581) [Spec](../../../libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts#L569)
- The Team Builder workspace effect tracks the workspace root. Its call to `abortWorkspace` and the view reset run in `untracked`. The new spec starts a launch, switches workspaces, checks that abort is outside the reactive context, and verifies that the record becomes interrupted. [Effect](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts#L203) [Spec](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L1466)

The scan covered `effect` and `afterRenderEffect` in onboarding and Setup Wizard, including indirect writes through coordinators, attach and mark-seen paths, and generation stores. The two onboarding effects above were the only additional tracked write paths found.

## Finding 3 — Guidance binding dependency

`GuidanceGenerationStore.adopt` reads and checks the binding before entering `untracked`. The caller’s effect tracks the binding and can adopt the already-verified run when the matching binding arrives. Reporting remains untracked. The Windows guidance restore spec now makes the workflow run available before binding guidance and suppresses the binding’s one-shot refresh, so it verifies that the binding change alone triggers adoption. It still covers the transition to completed and bounds the number of effect calls. [Adoption](../../../libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts#L108) [Restore spec](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L214)

## Finding 4 — Legacy tab timestamp validation

`dropLegacySetupTabs` only forwards a finite, positive timestamp at or before restore time. It forwards zero for other values, so Setup Run uses the migration time for those records. The chat-state spec restores stored JSON with missing, null, string, zero, negative and future values. The Setup Run spec checks that missing, zero, negative, NaN and future timestamps yield the migration time and that older output leaves the record interrupted. The existing spec still checks reconciliation using valid historical timestamps. [Validation](../../../libs/frontend/chat-state/src/lib/tab-persistence.ts#L209) [Persistence spec](../../../libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts#L175) [Migration spec](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L834) [Historical timestamps](../../../libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts#L799)

## Decisions

Chose the layout completion signal from the two options in the request, which also included an RPC-derived timer. The signal covers the cache fallback and all outcomes of the latest sync, including any future change to the service’s RPC deadlines. The choice is localized to the boot gate and reversible.

## Focused checks

```sh
npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  apps/ptah-extension-webview/src/app/webview-routing.spec.ts

npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts

npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts \
  libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.spec.ts \
  libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts

npx jest --config libs/frontend/chat-state/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts

npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/frontend/core/src/lib/services/electron-layout.service.spec.ts
```

- Webview routing passed 108 tests. [Log](../../tmp/ci-run2-followup-webview-jest.log)
- Onboarding passed 83 tests. [Log](../../tmp/ci-run2-followup-onboarding-jest.log)
- The same onboarding command run with the original tracked effect bodies exited 1. Both new specs failed with Angular `NG0602` for running inside a reactive context. The other 81 tests passed. [Before-fix log](../../tmp/ci-run2-followup-onboarding-red.log)
- Setup Wizard passed 181 tests. [Log](../../tmp/ci-run2-followup-setup-jest.log)
- Chat-state passed 13 tests. [Log](../../tmp/ci-run2-followup-chat-state-jest.log)
- Electron layout passed 128 tests. [Log](../../tmp/ci-run2-followup-core-jest.log)

```sh
npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/chat-state/tsconfig.lib.json
npx eslint \
  apps/ptah-extension-webview/src/app/webview-routing.spec.ts \
  libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts \
  libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts \
  libs/frontend/chat-state/src/lib/tab-persistence.legacy-setup.spec.ts \
  apps/ptah-extension-webview/src/app/initial-navigation.ts \
  libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts \
  libs/frontend/setup-wizard/src/lib/services/guidance-generation.store.ts \
  libs/frontend/chat-state/src/lib/tab-persistence.ts
npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts
```

- All four focused TypeScript checks exited 0. [Webview](../../tmp/ci-run2-followup-webview-tsc.log) [Onboarding](../../tmp/ci-run2-followup-onboarding-tsc.log) [Setup Wizard](../../tmp/ci-run2-followup-setup-tsc.log) [Chat-state](../../tmp/ci-run2-followup-chat-state-tsc.log)
- ESLint exited 0 with 18 existing warnings for non-null assertions, member accessibility and file length. [ESLint log](../../tmp/ci-run2-followup-eslint.log)
- The degradation audit exited 0 with `TOTAL 0`. [Audit log](../../tmp/ci-run2-followup-degradation.log)
- Scoped `ptah_get_diagnostics` timed out twice with ten files unchecked. The focused TypeScript commands supplied compiler verification. [Initial diagnostics](../../tmp/ci-run2-followup-ptah-diagnostics.log) [Retry](../../tmp/ci-run2-followup-ptah-diagnostics-retry.log)
