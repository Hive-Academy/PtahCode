# Code Logic Review (CI Run 3 Fix) — `TASK_2026_2330_2fc3`

## Summary

| Metric              | Value                                      |
| ------------------- | ------------------------------------------ |
| Overall score       | 6/10                                       |
| Verdict             | REVISE                                     |
| Blocking issues     | 0                                          |
| Serious issues      | 1                                          |
| Moderate issues     | 2                                          |
| Failure modes found | 2                                          |

**Score rationale:** Not 7–8 (sound) because the CI-only null-dialog failure was never reproduced, the "lookup race" rationale does not match Angular's synchronous template creation, and the new failure guards (`team-builder-start.page.spec.ts:365,368`) omit DOM/view diagnostics — meaning a repeat CI failure would still be blind. Not 3–4 (needs another pass) because all behavioral assertions are preserved intact (and slightly strengthened), the `TestBed.tick()` / `By.directive` / `getElementsByTagName` mechanics are valid in Angular 22, and the focused spec passes cleanly with zero TypeScript diagnostics.

**Scope reviewed:**
- Uncommitted diff to `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` (`closes the consent modal on install ...`, lines 343–428; excluding the already-approved `assertNotInReactiveContext` test at lines 1474–1506).
- `fix-report-ci-run3.md`, `fix-report-ci-run2.md`, CI logs (`.ptah/tmp/ci2-test3.log`, `.ptah/tmp/ci3-test3.log`).
- Production chain: `team-builder-start.page.html:339-348`, `team-builder-start.page.ts`, `stack-skill-consent.component.ts`, `stack-skill-consent.component.html:1-100`, `native-modal.component.ts:108-204`, `libs/frontend/onboarding/src/test-setup.ts`, `team-builder-run.coordinator.ts:452-493,753-938`.
- Angular 22 `TestBed.tick()` implementation in `node_modules/@angular/core/fesm2022/testing.mjs:7761-8834,62567`.

**Verification run:**
- `ptah_get_diagnostics` on `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: **0 diagnostics** in the edited file (15 pre-existing errors in unchanged sibling specs/shared deps).
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: **46/46 passed** in 5.357 s (`.ptah/tmp/review-ci3-spec.log`).

---

## Direct Answers to Review Questions

### 1. Does the new test still prove the same behaviour as before? Did it weaken any assertion?

**Yes — it proves the exact same behaviour and weakened no assertion.**

- **Unchanged post-consent behavioral assertions (`team-builder-start.page.spec.ts:388-428`):** finding and clicking `Install 1 skill` inside `dialog`, `dialog.open === false`, `dialog.inert === true`, presence of `[data-testid="team-builder-installing-back"]` and `[data-testid="team-builder-cancel"]`, neither button inside `[inert]`, `document.activeElement === cancelBtn`, Enter `keydown` + `click()` cancelling the pending install, `finishInstall(...)` settlement, `runRecords()[0]?.status === 'cancelled'`, `page.viewStage() === 'intent'`, and `fixture.destroy()`.
- **Strengthened setup/pre-install assertions (`team-builder-start.page.spec.ts:361-386`):** verifies `StackSkillConsentComponent` is mounted via `By.directive`, `dialog` is inside `consentHost`, `dialog.isConnected === true`, `root.contains(dialog) === true`, `dialog.open === false` at `intent`, and `page.viewStage() === 'consent'` before `dialog.open === true`.
- **Capturing `dialog` before `setStage('consent')` (`line 367` vs `line 386`):** safe and non-weakening. `<ptah-stack-skill-consent>` (`team-builder-start.page.html:339`), `<ptah-native-modal>` (`stack-skill-consent.component.html:1`), and `<dialog #dialog>` (`native-modal.component.ts:109`) are all unconditional; if `<dialog>` were unexpectedly destroyed and recreated on stage transition, the captured node's `dialog.open` would stay `false` and fail line 386 rather than false-passing.

### 2. Is the new dialog capture (`By.directive`, `getElementsByTagName`, `TestBed.tick()`) robust and plausibly fixing a lookup race in CI?

**Mechanically valid, but NOT plausibly fixing a timing/lookup race — and the CI-only root cause remains unproven.**

- **`TestBed.tick()` works as intended in Angular 22:** verified in `node_modules/@angular/core/fesm2022/testing.mjs:62567` (`appRef.includeAllTestViews = true; appRef.tick()`). It synchronously checks `fixture.hostView`, propagates signal inputs into `StackSkillConsentComponent` and `NativeModalComponent`, flushes `NativeModalComponent`'s `effect()` (`native-modal.component.ts:193-204`), and runs `afterNextRender` hooks.
- **Why a "lookup race" does not explain CI Runs 2 & 3:**
  1. `<ptah-stack-skill-consent>` (`team-builder-start.page.html:339`), `<ptah-native-modal>` (`stack-skill-consent.component.html:1`), and `<dialog #dialog>` (`native-modal.component.ts:109`) have no `@if`/`@for`/`@defer` guards. Angular creates all three DOM nodes **synchronously** during template creation inside `TestBed.createComponent()`.
  2. CI Run 2 failed synchronously on bare `root.querySelector('dialog')` after `fixture.detectChanges()` (`ci2-test3.log:749-755`). CI Run 3 failed on `root.querySelector('ptah-stack-skill-consent dialog')` even after **two** `fixture.detectChanges(); await fixture.whenStable();` cycles (`ci3-test3.log:743-748`). An async rendering race cannot explain a synchronously created node being absent after two full CD + stability cycles.
- **Why bypassing `@asamuzakjp/dom-selector` is only a weak hypothesis:**
  - Switching from `root.querySelector(...)` to `fixture.debugElement.query(By.directive(StackSkillConsentComponent))` + `consentHost.getElementsByTagName('dialog').item(0)` does bypass jsdom 30.1.0's CSS selector engine (`@asamuzakjp/dom-selector`).
  - However, in both CI Run 2 and CI Run 3 (same runner, Node v24.22.3, jsdom 30.1.0, `--coverage --maxWorkers=2`), `team-builder-skill-consent.component.spec.ts:32` called `fixture.nativeElement.querySelector('dialog')` and **passed** (`ci3-test3.log:1400`), and all other 45 tests in `team-builder-start.page.spec.ts` using `root.querySelector(...)` **passed**.
  - Because `fix-report-ci-run3.md:11` confirms no CI DOM state was captured and local runs never reproduced the failure, there is no positive evidence that CI Run 4 will not fail at line 365 or line 368.

### 3. Any flake risk left?

**Yes — two concrete risks remain:**

1. **High repeat-failure risk without diagnostics (`team-builder-start.page.spec.ts:365,368`):** This test failed 2/2 times in CI and 0/N locally. Because the root cause is still unknown, if CI's `<ptah-native-modal>` or `<dialog>` was genuinely absent from `consentHost`, `getElementsByTagName('dialog').item(0)` will return `null` just like `querySelector` did, and the bare error messages will again conceal the DOM/component state.
2. **Pre-existing test hygiene / async settlement edges (low-to-moderate):**
   - Test #1 (`team-builder-start.page.spec.ts:288-341`), which runs immediately before this test, never calls `fixture.destroy()` (relying on `afterEach`'s `TestBed.resetTestingModule()`) and schedules an unflushed `afterNextRender(() => this.recoveryContinue()?.nativeElement.focus())` (`team-builder-start.page.ts:1140`) during `page.install()`. Test #2 itself only calls `fixture.destroy()` at line 427 (outside `try/finally`).
   - Line 417/422 relies on `await fixture.whenStable()` to drain `cancelRun()` and `finishInstall(...)` settlement rather than awaiting the promise directly; safe under Zone.js (`setupZoneTestEnv`), but fragile if any microtask escapes Zone.

---

## Five Logic Questions

1. **How does this fail silently?**
   No silent false-pass was introduced: if `consent` or `dialog` is missing, lines 365/368 throw; if `dialog` were replaced on stage change, line 386 (`expect(dialog.open).toBe(true)`) fails. (Pre-existing note: `dialog.inert` in jsdom 30 is a JS property set by `native-modal.component.ts:202`, not a reflected HTML `[inert]` attribute, whereas `cancelBtn?.closest('[inert]')` checks the template `[attr.inert]` binding at `team-builder-start.page.html:304` — both still check what they checked before.)
2. **What user action produces unexpected behaviour?**
   N/A for production code (spec-only edit; production files untouched).
3. **What input data produces a wrong answer?**
   If `consentHost` contains no `<dialog>` in CI, `getElementsByTagName('dialog').item(0)` returns `null` and throws a context-free error (`team-builder-start.page.spec.ts:368`) that cannot distinguish an unrendered `NativeModalComponent` from an empty `StackSkillConsentComponent` or detached root.
4. **What happens when a dependency fails?**
   If `NativeModalComponent` fails to render its `<dialog>` in CI (e.g., module/template resolution or stale cache mismatch under `--coverage --maxWorkers=2`), line 368 fails without reporting whether `By.directive(NativeModalComponent)` matched or what `consentHost.outerHTML` contained.
5. **What is missing that the requirements never mentioned?**
   Diagnostic state on lookup failure so a third CI failure (if it occurs) immediately identifies the root cause instead of requiring another speculative round.

---

## Findings

### Serious Issues

#### S1. Blind speculative retry — no DOM/component diagnostics on lookup failure
- **File:** `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:362-368`
- **Scenario:** The exact same test failed 2/2 times in CI (`ci2-test3.log:749`, `ci3-test3.log:743`) and 0 times locally. Neither the previous fix (`d322af4f3b`) nor this change could reproduce the failure, and the synchronous template chain (`team-builder-start.page.html:339` → `stack-skill-consent.component.html:1` → `native-modal.component.ts:109`) rules out an async creation race. If CI omits or detaches `<dialog>` for an environmental reason, lines 365 and 368 will fail again with only `'Expected the fixture to render skill consent'` or `'Expected a native dialog in skill consent'`, providing zero DOM or Angular view state.
- **Impact:** High risk of wasting another full CI run (~15 min shard) and remaining completely blind to why `<dialog>` is missing in CI.
- **Fix:** Include compact diagnostic context in both throw messages (and optionally query `By.directive(NativeModalComponent)`), e.g.:
  - When `!consent`: include `page.viewStage()`, `root.childElementCount`, and `root.innerHTML.slice(0, 500)`.
  - When `!dialog`: include `consentHost.outerHTML.slice(0, 500)`, whether `consent.query(By.directive(NativeModalComponent))` matched, `root.getElementsByTagName('dialog').length`, and `document.getElementsByTagName('dialog').length`.

### Moderate and Minor Issues

- **M1 (`team-builder-start.page.spec.ts:357-386` vs `394-395`):** Mixing `TestBed.tick()` alone (lines 358, 384) with `fixture.detectChanges(); TestBed.tick();` (lines 394–395) is inconsistent and slightly obscures intent; `TestBed.tick()` alone works in Angular 22 because `TestBed.createComponent` registers `hostView` in `allTestViews`, whereas `fixture.detectChanges()` explicitly runs `checkNoChanges()` on the fixture inside `NgZone`. Either keep `fixture.detectChanges(); TestBed.tick();` consistently at all three synchronization points or note why `TestBed.tick()` is used alone.
- **M2 (`team-builder-start.page.spec.ts:288-341, 427`):** Pre-existing hygiene — Test #1 immediately before this test does not call `fixture.destroy()` (leaving cleanup to `afterEach`'s `TestBed.resetTestingModule()`), and Test #2 calls `fixture.destroy()` at line 427 without `try/finally`. Not caused by this diff, and `TestBed.resetTestingModule()` tears down active fixtures, but wrapping or calling `fixture.destroy()` in Test #1 eliminates cross-test DOM/focus residue as a variable while investigating a CI-only failure.

---

## Verdict

- **Recommendation:** `REVISE`
- **Confidence:** HIGH
- **Top risk:** The CI-only root cause is still unconfirmed, so if `<dialog>` is genuinely absent in CI, this edit will fail again on CI run 4 without printing the DOM/view state needed to diagnose it.
- **Required before approval:** Add concise DOM/component diagnostics to the `!consent` and `!dialog` failure throws at `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:365,368` (S1).
