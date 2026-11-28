# CI run 3 onboarding Jest failure

## Reproduction

CI run 2 failed on the initial dialog lookup. CI run 3 failed in the same test after setting the consent stage and waiting for fixture stability. Both runs stopped before clicking Install. Each run reported one failure out of 896 onboarding tests. [Run 2](../../tmp/ci2-test3.log#L746) [Run 3](../../tmp/ci3-test3.log#L740)

The first locked whole-project run on the supplied worktree passed 898 tests across 64 suites on Node v24.15.0. A focused `--runInBand` run of the Team Builder and Analyze Skills specs, the first two long suites in the CI log, passed 106 tests both on the local Node and on CI's Node v24.22.3 with `CI=true`. The two locked runs were reserved for the before and after coverage checks. [Locked baseline](../../tmp/ci3-repro.log) [Local focused baseline](../../tmp/ci3-focused-baseline.log) [CI Node focused baseline](../../tmp/ci3-focused-node24.22-baseline.log) [CI Node version](../../tmp/ci3-test3.log#L437)

## Failure mechanism and change

The confirmed failure was the spec's DOM lookup. Run 2's bare `dialog` query returned null during fixture setup. Run 3's descendant selector returned null after entering consent. The page declares the consent component at section level, the consent template declares the native modal unconditionally, and the native modal creates its dialog independently of visibility. The modal effect then updates `open` and `inert` on that element. The CI logs record no DOM or fixture state at the lookup. The local runs could not establish whether CI omitted the DOM node, queried a different root, or missed an existing node in selector resolution. [Run 2 lookup](../../tmp/ci2-test3.log#L749) [Run 3 lookup](../../tmp/ci3-test3.log#L743) [Page template](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html#L339) [Consent template](../../../libs/frontend/onboarding/src/lib/proposal/stack-skill-consent.component.html#L1) [Native dialog template](../../../libs/frontend/ui/src/lib/native/modal/native-modal.component.ts#L108) [Modal effect](../../../libs/frontend/ui/src/lib/native/modal/native-modal.component.ts#L190)

The spec now synchronizes the initial render with `TestBed.tick()`, locates the consent component in the fixture's Angular view, and captures its actual native dialog while the page is at intent. It checks that the dialog is connected, belongs to the fixture, and starts closed. After setting consent, it ticks Angular again and checks that the captured dialog opens. It clicks Install and retains the closure, inertness, Back and Cancel availability, Cancel focus, and cancellation assertions against the pending install. The Enter event and explicit click retain the existing jsdom activation sequence. [Fixture setup](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L357) [Consent render and install click](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L383) [Closure and cancellation](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L397)

## Decisions

Chose a fixture-local change over altering production rendering. The templates and modal effect establish the expected lifetime of the dialog, and the available failure evidence stops at the test's lookup. The setup change is reversible and leaves CI confirmation open. Kept the supplied follow-up edits, including its additions to this spec.

## Checks

- Focused Team Builder Jest on Node v24.22.3 with `CI=true` passed 46 tests. [Spec log](../../tmp/ci3-fixed-spec.log)
- The second locked coverage run on Node v24.22.3 with `CI=true` passed 898 tests across 64 suites. [Project log](../../tmp/ci3-fixed-project.log)
- Scoped Ptah diagnostics reported zero diagnostics in the edited spec and 15 errors in unchanged sibling specs and dependencies.
- Onboarding library TypeScript and scoped ESLint both exited 0. [TypeScript log](../../tmp/ci3-fixed-tsc.log) [ESLint log](../../tmp/ci3-fixed-eslint.log)

## Correction

Added bounded DOM and Angular view diagnostics for missing consent, dialog, Install, Back, and Cancel. The consent test now runs `fixture.detectChanges()` followed by `TestBed.tick()` at each render checkpoint. Both it and the preceding retry test destroy their fixtures in `finally`. The original behavioral checks still run. [Consent and dialog diagnostics](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L367) [Fixture cleanup](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L347) [Install and cancel checks](../../../libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts#L409)

Focused Jest passed all 46 tests, and ESLint exited 0. The spec TypeScript check exited 2 with 17 diagnostics in unchanged sibling specs, shared, and worker-protocol files. Both the compiler log and scoped Ptah diagnostics reported zero diagnostics in the edited spec. [Jest](../../tmp/ci3-correction-jest.log) [ESLint](../../tmp/ci3-correction-eslint.log) [TypeScript](../../tmp/ci3-correction-tsc.log)
