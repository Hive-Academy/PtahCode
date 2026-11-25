# Batch G-Onb-Consent-Parity Report (TASK_2026_2325_899d)

## Files Changed
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts` — added per-skill consent-inspection assertions closing `parity-inventory.md:60`.
- `.ptah/specs/TASK_2026_2325_899d/batch-G-Onb-Consent-Parity-report.md` — this report.

No production files and no other spec files were modified.

## Plan Items Done
- **`implementation-plan.md:288`, `:344`, `:578`, `:653` & `parity-inventory.md:60` (TD 6.1–6.2 conditional consent-inspection GAP & team-builder parity run):**
  - Added test `'renders per-skill content hash, script file list, hook notice, and all-files disclosure'` in `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts`, asserting all four clauses of `libs/frontend/onboarding/src/lib/proposal/stack-skill-consent.component.html` across three concurrent previewed skills (`owner/repo/with-scripts`, `owner/repo/hooks-only`, `owner/repo/docs-only`), scoped per skill via `section[aria-label="<skillName>"]`:
    - **Line 25 (per-skill content hash):** asserts `Content hash: sha256-scripts-111`, `Content hash: sha256-hooks-222`, and `Content hash: sha256-docs-333` render in their respective skill sections.
    - **Line 31 (script file list when present):** asserts `<details>` with `<summary>Scripts (2)</summary>` and `<li>` entries `['scripts/setup.sh', 'hooks/post-install.mjs']` when `scriptFiles` is non-empty, confirms no `Scripts (` disclosure is rendered when `scriptFiles` is empty (`hooks-only` and `docs-only`), and confirms the hook/executable notice is omitted when `scriptFiles` is non-empty.
    - **Line 42 (hook/executable notice when scripts exist without a file list):** asserts `'Contains scripts'` and `'Also contains hooks or executable files. Review all files.'` render in `hooks-only` (`hasScripts: true`, `scriptFiles: []`) with no `Scripts (` disclosure, and asserts `'No scripts detected'` with neither notice nor `Scripts (` disclosure in `docs-only` (`hasScripts: false`, `scriptFiles: []`).
    - **Line 47 (all-files disclosure):** asserts `<details>` with `<summary>All files (N)</summary>` and exact `<li>` lists for every skill (`All files (3)` for `with-scripts`, `All files (2)` for `hooks-only`, `All files (2)` for `docs-only`).
  - Retained all existing tests in `team-builder-skill-consent.component.spec.ts` unchanged.
  - Ran the three team-builder parity suites (`team-builder-skill-consent.component.spec.ts`, `team-builder-start.page.spec.ts`, `team-builder-skill-review.component.spec.ts`) without editing the other two specs.

## GAP Status
- **`parity-inventory.md:60` (Consent inspection): CLOSED.**
  - Production template `stack-skill-consent.component.html:25,31,42,47` already implemented all four behaviors; no production changes were needed. All assertions pass.

## Check Commands & Results

### 1. Scoped Jest Run (3 team-builder parity suites)
```bash
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts
```
- **Exit code:** `0`
- **Suites:** `3 passed, 3 total`
  - `PASS onboarding libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts`
  - `PASS onboarding libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts (7.122 s)`
  - `PASS onboarding libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts`
- **Tests:** `47 passed, 47 total` (`0` failing, `0` snapshots, `15.233 s`)

### 2. Onboarding Library TypeScript Check
```bash
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
```
- **Exit code:** `0` (no errors)

### 3. ESLint on Changed File
```bash
npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts
```
- **Exit code:** `0` (no errors or warnings)

### 4. `ptah_get_diagnostics` (scoped to changed file)
- **Requested file (`team-builder-skill-consent.component.spec.ts`):** `0` errors, `0` warnings (clean).
- **Sibling files (out of scope for this lane; reported below):** `15` TypeScript errors in other spec/shared files.

## Decisions
1. **Multi-skill per-skill inspection test structure**
   - **Decision:** Keep the 4 existing tests in `team-builder-skill-consent.component.spec.ts` untouched and add one focused multi-skill test verifying all three preview shapes (`with-scripts`, `hooks-only`, `docs-only`) scoped to each `section[aria-label="<skillName>"]`.
   - **Options:** (a) Edit existing tests to append assertions; (b) Add separate single-skill tests per HTML line; (c) Add one multi-skill test checking all 4 clauses plus branch mutual exclusion per section.
   - **Evidence:** `implementation-plan.md:578` requires per-skill assertions for lines 25, 31, 42, and 47; rendering all three shapes together proves per-skill isolation and `@if`/`@else if` mutual exclusion while keeping existing tests intact.
   - **Reversible:** Yes (test-only addition in a single spec file).
2. **Tooling and skill availability**
   - **Decision:** Used `ptah_search_files` (located `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`) and `ptah_get_diagnostics` after edits; fell back to `grep -nE` after `rg` returned `command not found` when checking plan references. No host-listed skill matched this Jest test-only lane (`angular-frontend-patterns` is not in the host skill catalogue and no UI/component code was authored).
   - **Options:** (a) Document unavailable optional skill and `rg` fallback and proceed with permitted test work; (b) Block.
   - **Evidence:** Senior-tester role instructions allow continuing independent permitted work when no required skill is missing and require naming tool fallbacks.
   - **Reversible:** Yes.

## Open Items & Needed Changes in Other Groups
- **None for `G-Onb-Consent-Parity` or `StackSkillConsentComponent`.**
- **Out-of-scope sibling TypeScript errors observed via `ptah_get_diagnostics` (not edited; belong to other lanes / shared tsconfig):**
  - `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:1613,1649,1924,1960` — TS2322 (`kind: "tool"` not assignable to `StackItemKind`).
  - `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts:133` — TS2345 (`WizardGenerateSkillDraftResult` missing required `content` property).
  - `libs/frontend/onboarding/src/lib/ready/onboarding-ready-host.guard.spec.ts:13` — TS2554 (`Expected 3 arguments, but got 2`).
  - `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.spec.ts:86` — TS2349 (`This expression is not callable. Type 'never' has no call signatures.`).
  - `libs/shared/src/lib/types/capability-id-codec.ts:288-289`, `libs/shared/src/lib/types/messages/attention-identity.ts:19,21,23`, `libs/worker-protocol/src/lib/pairing-code.ts:54,56,60` — TS2737 (`BigInt literals are not available when targeting lower than ES2020`).

## Extra Reads
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-consent.component.ts` — inspected component inputs/types alongside `stack-skill-consent.component.html` to verify `WizardSkillConsentPreview` contract.
- `grep -nE` on `.ptah/specs/TASK_2026_2325_899d/implementation-plan.md` for `G-Onb-Consent-Parity|team-builder-skill-consent|stack-skill-consent|Coordinator amendment C1` (matched lines 26, 247, 288, 344, 578, 653, 671; plan was never read in full).
