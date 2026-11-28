# Code Logic Review (CI Run 4 Fix) — `TASK_2026_2330_2fc3`

## Summary

| Metric              | Value      |
| ------------------- | ---------- |
| Overall score       | 5/10       |
| Verdict             | **REVISE** |
| Blocking issues     | 0          |
| Serious issues      | 2          |
| Moderate issues     | 1          |
| Minor issues        | 1          |
| Failure modes found | 3          |

**Score rationale:** Placed at **5/10** (real gaps). Not 7–8 (sound) because the unconditional `if (dialog) { ... } else { consentComponent.install.emit(); }` branch (`team-builder-start.page.spec.ts:419-434, 443-446`) silently disables the DOM modal open/close/inert and Install-button click assertions whenever `<dialog>` is missing, which can mask a real production defect in Electron — and was added without first inspecting the CI merge base (`8995919a`), whose `<!--container-->` output directly contradicts the local templates. Not 3–4 (needs another pass at the foundation) because the page-level signal/output/focus/cancellation checks (`team-builder-start.page.spec.ts:372-391, 412-416, 439-442, 447-482`) are intact, strictly typed (0 diagnostics), and pass all 46 focused tests.

**Scope reviewed:**
- Commit `23c3b702c9` (`libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:352-486`, `.ptah/specs/TASK_2026_2330_2fc3/fix-report-ci-run4.md`).
- Full production & test chain: `team-builder-start.page.ts`, `team-builder-start.page.html`, `stack-skill-consent.component.ts`, `stack-skill-consent.component.html`, `team-builder-skill-consent.component.spec.ts`, `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`, `native-modal.component.spec.ts`, `libs/frontend/onboarding/src/test-setup.ts`, `libs/frontend/onboarding/jest.config.ts`.
- CI logs: `.ptah/tmp/ci2-test3.log`, `.ptah/tmp/ci3-test3.log`, `.ptah/tmp/ci4-test3.log`, and prior reviews (`code-logic-review-ci-run2.md`, `code-logic-review-ci-run3.md`).

**Verification run:**
- `ptah_get_diagnostics` scoped to `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: **0 diagnostics** in the edited spec (15 pre-existing errors in unchanged sibling/shared files).
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: **46/46 passed** in 5.454 s (`.ptah/tmp/review-ci4-spec.log`).
- Note on Ptah search fallbacks: `ptah_code_search_symbols` returned 0 hits (empty index) and `ptah_search_files` returned 0 hits for `.ptah/specs/**`; fell back to native `read_file` and read-only `git grep`/`git log`/`git show`.

---

## Direct Answers to Review Questions

### 1. Does the test still prove the page behavior? Which assertions are now conditional, and is that acceptable?

**Partially — it still proves the Angular component/template wiring on `TeamBuilderStartPage`, Back/Cancel availability, focus, and cancellation, but it no longer proves the DOM modal lifecycle or real Install button click when `<dialog>` is absent. Making the open/click/close/inert assertions silently conditional is NOT acceptable.**

- **Still proven unconditionally (both paths):**
  - `StackSkillConsentComponent` and `NativeModalComponent` mount in the view (`team-builder-start.page.spec.ts:373-389`).
  - Input binding propagation across `intent` → `consent` → `installing`: `consentComponent.open()` (`false → true → false`), `consentComponent.busy()` (`false → true`), `consentComponent.allApproved()` (`true`), and `modalComponent.isOpen()` (`false → true → false`) (`:390-391, 412-416, 439-442`).
  - Page `(install)="install()"` binding transitions `viewStage()` to `'installing'` (`:439`).
  - `Back` and `Cancel` buttons render, are enabled, have no `[inert]` ancestor (outside `team-builder-start.page.html:304`), and `document.activeElement === cancelBtn` (`:447-462`).
  - Activating `Cancel` cancels the pending install; settling `finishInstall(...)` leaves `runRecords()[0]?.status === 'cancelled'` and `page.viewStage() === 'intent'` (`:465-482`).

- **Now conditional (silently skipped whenever `consentHost.getElementsByTagName('dialog').item(0)` is `null`):**
  1. **Pre-open DOM dialog presence & closed state** (`:392-397`, `if (initialDialog)`): `isConnected`, `root.contains(initialDialog)`, `initialDialog.open === false`.
  2. **Open DOM dialog & real Install button click** (`:418-434`, `if (dialog)`): `dialog.open === true`, presence of the `Install 1 skill` button inside `<dialog>`, `installBtn.disabled === false`, and clicking `installBtn` (replaced by synthetic `consentComponent.install.emit()` at `:433`).
  3. **Post-install DOM dialog closure & inertness** (`:443-446`, `if (dialog)`): `dialog.open === false` and `dialog.inert === true`.

- **Why this is NOT acceptable:**
  - Making #1 conditional while `isOpen() === false` would only be acceptable if `NativeModalComponent` intentionally lazy-mounts `<dialog>` on open.
  - Making #2 and #3 silently conditional while `isOpen() === true` strips out the exact top-layer `<dialog>` behavior the test exists to verify (`"closes the consent modal on install so Back and Cancel are reachable by mouse and keyboard while installing"`), without failing or even warning when the fallback fires.
  - Neither `team-builder-skill-consent.component.spec.ts` nor any other test in `@ptah-extension/onboarding` clicks the consent Install button to verify `(click)="install.emit()"` or verifies `open: true → false` closes `<dialog>` and sets `dialog.inert = true` without `StackSkillConsentComponent.onClosed()` (`stack-skill-consent.component.ts:33-42`) reopening it.

### 2. Could the fallback path hide a real production defect (e.g., the dialog really not rendering in Electron)?

**Yes — in four concrete ways:**

1. **`<dialog>` never rendering in Electron / broken `NativeModalComponent`:** If `NativeModalComponent` stops rendering `<dialog>` when `isOpen() === true` (template bug, failed `@if`/effect, broken selector/import), `team-builder-start.page.spec.ts:419-434` silently takes the `else` branch and passes green while users see no consent modal at all.
2. **Broken content projection or Install button wiring in `StackSkillConsentComponent`:** Synthetic `consentComponent.install.emit()` (`:433`) completely bypasses `[modal-footer]` projection (`native-modal.component.ts:120`), `[disabled]="busy() || !allApproved()"` (`stack-skill-consent.component.html:87`), and `(click)="install.emit()"` (`:88`).
3. **Consent modal staying open / non-inert in the browser top layer during install:** On the fallback path, `cancelBtn.closest('[inert]')` (`:460`) only checks the template's `[attr.inert]` wrapper (`team-builder-start.page.html:304`), NOT whether a native top-layer `<dialog>` is still open and intercepting all pointer/keyboard events in Electron. If `NativeModalComponent`'s close effect (`native-modal.component.ts:199-203`) failed or `StackSkillConsentComponent.onClosed()` (`stack-skill-consent.component.ts:38-41`) reopened `<dialog>` while `busy() === true`, the fallback path would pass while Back and Cancel are completely unreachable in Electron.
4. **Hiding a real CI merge-base divergence (`8995919a`):** `ci4-test3.log:404` shows CI ran `Merge 89f3e36b5c into 8995919a6172a2ef00bb476087f834b56be014f3`, whereas local `origin/main` is older (`f9fe470cd6`, `8995919a` is absent locally). `ci4-test3.log:743` printed:
   ```html
   <ptah-stack-skill-consent><ptah-native-modal arialabelledby="skill-consent-title" size="lg"><!--container--></ptah-native-modal><!--container--></ptah-stack-skill-consent>
   ```
   Neither the local `NativeModalComponent` (`native-modal.component.ts:108-126`) nor `StackSkillConsentComponent` (`stack-skill-consent.component.html:1-100`) contains any `@if`/`@for`/`@defer` capable of emitting those `<!--container-->` anchors, yet `team-builder-skill-consent.component.spec.ts` (which always sets `open = true` before `detectChanges()`) passed in CI runs 2, 3, and 4 (`ci4-test3.log:1398`). A commit on `main` between `f9fe470cd6` and `8995919a` likely altered `NativeModalComponent` (e.g., lazy-mounting `<dialog>` on open, or gating it behind a signal/effect that did not flush in CI run 3 without `TestBed.tick()`). The silent fallback would hide whether `<dialog>` actually fails to mount at `open === true` on `main`.

### 3. Concrete Tightening Suggestions

1. **Inspect the CI merge base (`8995919a`) before touching the spec further:** Fetch `origin/main` (coordinator/human action; outside this read-only lane) and inspect `git diff f9fe470cd6..8995919a -- libs/frontend/ui/src/lib/native/modal/ libs/frontend/onboarding/src/lib/proposal/stack-skill-consent.*` to confirm why CI's `<ptah-native-modal>` emitted `<!--container-->` while `open === false`.
2. **Remove the silent `else { consentComponent.install.emit(); }` fallback at `open === true` (`team-builder-start.page.spec.ts:418-434, 443-446`):**
   - If `main` intentionally lazy-mounts `<dialog>` only while `isOpen() === true`, tolerate `initialDialog === null` ONLY at `:392-397` (`viewStage() === 'intent'`), and **require** `<dialog>` + the real `Install 1 skill` button click unconditionally at `:418-434` (after `setStage('consent')`, `fixture.detectChanges()`, `TestBed.tick()`, plus a second `fixture.detectChanges(); TestBed.tick()` if `main` mounts `<dialog>` via an effect). Throw with bounded diagnostics (`consentHost.outerHTML`, `modalComponent.isOpen()`, `rootDialogs`, `documentDialogs`) if `<dialog>` is absent when open.
   - After clicking Install (`:443-446`), assert unconditionally that `<dialog>` is either removed from the DOM (`!dialog.isConnected && consentHost.getElementsByTagName('dialog').length === 0`) OR remains closed and inert (`expect(dialog.open).toBe(false); expect(dialog.inert).toBe(true);`).
3. **Close the unit-test gap in `team-builder-skill-consent.component.spec.ts`:** Add a focused test covering `open: false → true`, clicking the real `Install` button and asserting `install` emits, then flipping `open: false, busy: true` and asserting `<dialog>` is closed/inert (or unmounted) and not reopened by `onClosed()`.
4. **Tighten the Enter-key check (`team-builder-start.page.spec.ts:465-468`):** Dispatch `new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })` and assert `expect(enterEvent.defaultPrevented).toBe(false)` before `cancelBtn.click()` so an ancestor/modal keydown handler swallowing Enter cannot pass unnoticed.

---

## Five Logic Questions

1. **How does this fail silently?** `team-builder-start.page.spec.ts:418-434, 443-446` silently skips all DOM `<dialog>` and Install-button assertions and emits `consentComponent.install.emit()` whenever `consentHost.getElementsByTagName('dialog').item(0)` is `null`, turning a genuinely broken modal render or unclosed dialog into a green pass.
2. **What user action produces unexpected behaviour?** N/A directly (spec-only commit), but in Electron a regression where clicking Install fails to close/inert the native `<dialog>` — or where the consent `<dialog>` / Install button fails to render — would trap or block the user while this regression test still passes on its fallback branch.
3. **What input data produces a wrong answer?** When `NativeModalComponent` omits `<dialog>` during `open === false` (as observed in `ci4-test3.log:743`) and mounts it on `open === true` then unmounts it on `open === false`, line 418 captures `dialog` and lines 443–446 assert `dialog.open === false` and `dialog.inert === true` on a stale detached element (where `NativeModalComponent`'s effect at `native-modal.component.ts:194-195` returns early once `this.dialog()` is `undefined`).
4. **What happens when a dependency fails?** If `NativeModalComponent` fails to create its `<dialog>` or project `[modal-footer]` (e.g., due to a regression on `main` `8995919a`), the spec silently falls back to `consentComponent.install.emit()` (`:433`) instead of surfacing the failure.
5. **What is missing that the requirements never mentioned?** Reconciling the local worktree's `origin/main` (`f9fe470cd6`) with CI's actual PR merge base (`8995919a`, `ci4-test3.log:404`) to confirm the cause of `<ptah-native-modal><!--container--></ptah-native-modal>` before altering assertions.

---

## Findings

### Serious Issues

#### S1. Silent fallback disables the test's core DOM modal & Install-button assertions and can mask real Electron defects
- **File:** `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:418-434, 443-446`
- **Scenario:** Whenever `consentHost.getElementsByTagName('dialog').item(0)` returns `null` at `viewStage() === 'consent'`, the spec skips `dialog.open === true`, skips finding/clicking the `Install 1 skill` button, calls `consentComponent.install.emit()` synthetically (`:433`), and skips `dialog.open === false` and `dialog.inert === true` (`:443-446`). No assertion fails and no warning is emitted.
- **Impact:** A real production defect in Electron where `<dialog>` fails to render, `[modal-footer]` fails to project, the Install button stays disabled or unhooked, or the native `<dialog>` stays open/non-inert on install (trapping mouse and keyboard input away from Back/Cancel) passes this test silently. `team-builder-skill-consent.component.spec.ts` does not cover clicking Install or `open: true → false` closure either.
- **Fix:** Require `<dialog>` and clicking the real `Install 1 skill` button unconditionally once `viewStage() === 'consent'` and `modalComponent.isOpen() === true`, throwing with bounded DOM/component diagnostics if absent; unconditionally verify `<dialog>` is closed+inert or unmounted after Install.

#### S2. Unchecked CI merge-base divergence (`8995919a` vs local `f9fe470cd6`) explains the `<!--container-->` DOM and was bypassed rather than diagnosed
- **File:** `.ptah/specs/TASK_2026_2330_2fc3/fix-report-ci-run4.md:5-9`; `.ptah/tmp/ci4-test3.log:404, 743, 1398`; `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:108-126`
- **Scenario:** `ci4-test3.log:404` shows CI tested `Merge 89f3e36b5c into 8995919a6172a2ef00bb476087f834b56be014f3`, whereas local `origin/main` is `f9fe470cd6`. `ci4-test3.log:743` recorded `<ptah-native-modal arialabelledby="skill-consent-title" size="lg"><!--container--></ptah-native-modal><!--container-->` while `isOpen() === false` — markup the local unconditional templates cannot produce — while `team-builder-skill-consent.component.spec.ts` (which always sets `open = true` before `detectChanges()`) passed in CI runs 2, 3, and 4. Furthermore, CI run 4 failed *before* `setStage('consent')`, so CI has never even been observed lacking `<dialog>` after `setStage('consent'); fixture.detectChanges(); TestBed.tick();`.
- **Impact:** The silent fallback at `:431-434` papers over an unverified `main` change (either intentional lazy mounting of `<dialog>` on open, or a real `false → true` rendering bug in `NativeModalComponent` on `main`).
- **Fix:** Fetch and diff `origin/main` (`8995919a`) for `native-modal.component.ts` and `stack-skill-consent.component.*`, confirm the actual `<dialog>` mounting contract on `main`, and align the spec's unconditional open/close assertions to that contract.

### Moderate and Minor Issues

- **M1 (`libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:418, 443-446`):** If `main`'s `NativeModalComponent` conditionally unmounts `<dialog>` when `isOpen()` turns `false` (consistent with `<!--container-->` in `ci4-test3.log:743`), the `dialog` captured at `:418` becomes detached on close; `NativeModalComponent`'s effect (`native-modal.component.ts:194-195`) returns early when `this.dialog()` is `undefined`, leaving `dialog.open === true` and `dialog.inert === false` on the detached node and falsely failing `:444-445`. Check `if (dialog.isConnected) { expect(dialog.open).toBe(false); expect(dialog.inert).toBe(true); } else { expect(consentHost.getElementsByTagName('dialog').length).toBe(0); }`.
- **m1 (`libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:465-468`):** Pre-existing — `cancelBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))` is not `cancelable: true` and ignores `defaultPrevented` before calling `cancelBtn.click()`. Assert `expect(enterEvent.defaultPrevented).toBe(false)` on a cancelable event so a stray modal keydown handler intercepting Enter is caught.

---

## Verdict

- **Recommendation:** `REVISE`
- **Confidence:** HIGH
- **Top risk:** The silent `if (dialog) ... else { consentComponent.install.emit(); }` fallback at `team-builder-start.page.spec.ts:419-434, 443-446` permanently masks any regression where the consent `<dialog>` fails to render, project its Install button, or close/become inert on install — while leaving the `8995919a` merge-base divergence (`<!--container-->` inside `<ptah-native-modal>`) undiagnosed.
- **Required before approval:**
  1. Check `8995919a` (current `origin/main`) to confirm why `<ptah-native-modal>` rendered `<!--container-->` in CI run 4 (S2).
  2. Remove the silent `else` fallback at `open === true` and assert `<dialog>` rendering, real `Install 1 skill` button click, and post-install closure/inertness (or DOM removal if `main` unmounts closed dialogs) unconditionally (S1, M1).

---

## Re-review (681f30b56d)

### Summary

| Metric          | Value        |
| --------------- | ------------ |
| Overall score   | 9/10         |
| Verdict         | **APPROVED** |
| Blocking issues | 0            |
| Serious issues  | 0            |
| Moderate issues | 0            |
| Minor notes     | 2 (non-blocking) |

**Score rationale:** Placed at **9/10** (clean, solid fix). All four findings from the CI run 4 review (`S1`, `S2`, `M1`, `m1`) are resolved with zero silent fallbacks remaining, every behavioral check is at least as strong as before `23c3b702c9`, and the test now faithfully supports both the branch's inline `<dialog>` `NativeModalComponent` and `origin/main` (`8995919a61`)'s CDK Dialog portal implementation. Held back from 10/10 only by two tiny non-blocking nitpicks noted below.

**Scope & verification:**
- Inspected commit `681f30b56d` (`git show 681f30b56d`), full diff from pre-`23c3b702c9` (`git diff 23c3b702c9~1..681f30b56d -- libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`), `origin/main`'s CDK modal (`git show 8995919a61:libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`), `stack-skill-consent.component.html`, and `.ptah/specs/TASK_2026_2330_2fc3/fix-report-ci-run5.md` (+ `.ptah/tmp/ci-run5-portal-jest.log`).
- `ptah_get_diagnostics` scoped to `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`: **0 diagnostics** in the edited spec (15 pre-existing errors in unchanged sibling/shared files).
- Focused Jest run (`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`): **46/46 passed** in 5.524 s (`.ptah/tmp/review-ci5-spec.log`).

### Resolution Check

- **S1 (silent fallback) — RESOLVED (`team-builder-start.page.spec.ts:390-393, 431-451`):** The `if (dialog) ... else { consentComponent.install.emit(); }` fallback is completely removed. Once `viewStage() === 'consent'`, the test unconditionally requires a matching consent dialog in `document` (`dialog[aria-labelledby="skill-consent-title"], [role="dialog"][aria-labelledby="skill-consent-title"]`), rejects missing/closed/inert dialogs with bounded diagnostics (`modalDetails`), unconditionally requires an enabled button with exact text `'Install 1 skill and continue'`, and clicks the real `installBtn`. No synthetic `.emit()` remains.
- **S2 (`origin/main` divergence) — CONFIRMED & RESOLVED:** Verified in `8995919a61:libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:110-124, 217-231` that `NativeModalComponent` on `origin/main` wraps its panel in `<ng-template #dialog>` and opens it via Angular CDK `Dialog` (`<cdk-dialog-container role="dialog" aria-labelledby="skill-consent-title">`) in `.cdk-overlay-container` only while `isOpen() === true`, explaining CI run 4's `<!--container-->` host DOM. Querying `document` by `aria-labelledby="skill-consent-title"` matches both the branch inline `<dialog>` and `origin/main`'s CDK portal container.
- **M1 (detached dialog on close) — RESOLVED (`team-builder-start.page.spec.ts:396-405, 457-459`):** `expectConsentClosed` requires any connected dialog to be an `HTMLDialogElement` with `!dialog.open && dialog.inert`, while accepting `null` or a detached node (`!dialog.isConnected`) when closed on the CDK portal implementation (and rejecting any still-connected non-`HTMLDialogElement` `[role="dialog"]`). After Install, lines `457-459` check both the previously opened `dialog` and `findConsentDialog()`, catching both a stuck inline dialog and a reopened portal dialog.
- **m1 (Enter keydown check) — RESOLVED (`team-builder-start.page.spec.ts:478-485`):** Dispatches `new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })` and asserts `expect(enterEvent.defaultPrevented).toBe(false)` before `cancelBtn.click()`.

### Strength Comparison vs. Pre-`23c3b702c9`

No behavioral assertion is weaker than before `23c3b702c9`:
- **Strictly stronger:** Checks `consentComponent.open()/busy()/allApproved()`, `modalComponent.isOpen()`, `page.viewStage() === 'installing'`, exact button text `'Install 1 skill and continue'` (was `.includes('Install 1 skill')`), `!installBtn.disabled`, `!dialog.closest('[inert]')` while open, inline `dialog.inert === true` already at `intent`, `backBtn.disabled === false` and `cancelBtn.disabled === false`, post-close re-query via `remainingDialog`, and cancelable Enter `defaultPrevented === false`.
- **Equivalent adaptation for CDK portal:** Removing `expect(root.contains(dialog)).toBe(true)` and allowing absence at `intent` are required by `origin/main`'s portal architecture (CDK mounts overlays under `document.body` only while open); scoping by `aria-labelledby="skill-consent-title"` preserves dialog identity without losing behavioral coverage.

### Non-blocking Minor Notes

- `team-builder-start.page.spec.ts:435`: `dialog.closest('[inert]')` checks the `inert` attribute; `dialog.inert || dialog.closest('[inert]')` would also catch a property-only `inert = true` if jsdom ever skips attribute reflection (inline `<dialog>` already guards via `dialog.open`).
- `team-builder-start.page.spec.ts:390-393, 458-459`: `document.querySelector` inspects only the first matching dialog in DOM order; iterating `document.querySelectorAll` in the closed check would also catch a hypothetical second open consent dialog rendered after a closed inline one.

### Verdict

- **Recommendation:** `APPROVED`
- **Confidence:** HIGH
- **Summary:** Commit `681f30b56d` cleanly resolves `S1`, `S2`, `M1`, and `m1` with no silent fallbacks, no weakened assertions, 0 TypeScript diagnostics in the spec, and 46/46 passing tests across both inline and CDK portal modal implementations.
