# G2 Review Fix Report — TASK_2026_2326_5d16

Base commit: `e528f9632`  
Review source: `.ptah/specs/TASK_2026_2326_5d16/code-logic-review-G2.md`  
Scope modified:
- `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts`
- `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts`

## Findings Addressed

### 1. Throwing entry isolation (Moderate)
- **Change**: Guarded top-level `Array.isArray(raw)` and `raw.length` inspection in `readRoutingRules` (plus non-negative integer length validation) with a `try`/`catch` returning `routing rules setting could not be read`. Wrapped each indexed entry's read (`rawArray[index]`), Zod `safeParse`, `ruleLabel`, semantic validation, and duplicate check inside its own per-entry `try`/`catch` so any throwing getter, array slot, proxy trap, or throwing `id` label read drops only that entry with `routing rule <index>: unreadable entry` and keeps valid siblings in order.
- **File:Line**:
  - `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:162-191` (top-level inspection guard)
  - `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:206-254` (per-entry `try`/`catch` isolation)
- **Tests**:
  - `readRoutingRules > drops and reports a throwing entry getter while keeping valid siblings on both sides` (`routing-rules-setting.spec.ts:202-256`)
  - `readRoutingRules > isolates a throwing array slot getter and a throwing top-level proxy without aborting or throwing` (`routing-rules-setting.spec.ts:258-298`)

### 2. Consistent role normalization in reader and matcher (Moderate)
- **Change**: Introduced shared `normalizeRole(role: string): string` (trims leading and trailing whitespace while preserving case-sensitive comparison; documented on `normalizeRole` and `matchRoutingRule`). Wired `RoleValueSchema` in the reader through `.transform(normalizeRole).pipe(z.string().min(1).max(64))` and added `matchesRole` in `matchRoutingRule` so both configured `match.role` (single string or array) and `phase.role` are normalized identically without mutating `phase`. Blank/whitespace-only phase roles do not match role-scoped rules.
- **File:Line**:
  - `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:37-48` (`normalizeRole` and `RoleValueSchema`)
  - `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:274-314` (`matchesRole` and `matchRoutingRule`)
- **Tests**:
  - `matchRoutingRule > trims padded phase and rule roles case-sensitively without mutating the phase` (`routing-rules-setting.spec.ts:415-483`)

### 3. Diagnostic sanitization before leaving the reader (Moderate)
- **Change**: Replaced partial `sanitizeReason` with `isUnsafeDiagnosticChar` + `sanitizeDiagnostic`, which replaces every control character (`U+0000`–`U+001F`, including CR/LF/TAB/ESC, and `U+007F`) and `;` (`0x3B`) with a space, collapses whitespace runs with `.replace(/\s+/g, ' ').trim()`, and caps the entire diagnostic at `MAX_DIAGNOSTIC_REASON_CHARS` (`160`, truncating with `...`). Routed every diagnostic emitted by `readRoutingRules` and `RoutingRulesSetting.read()` through `sanitizeDiagnostic`.
- **File:Line**:
  - `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:112-140` (`isUnsafeDiagnosticChar`, `sanitizeDiagnostic`, `formatZodFailure`)
  - `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:169,179,188,200,212,222,234,242,251,338` (all diagnostic exit paths sanitized)
- **Tests**:
  - `readRoutingRules > sanitizes control characters, semicolons, line breaks, and length in diagnostics for unknown properties` (`routing-rules-setting.spec.ts:300-338`)

## Verification Results

- **Jest**: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts`
  - Result: **PASS** — `1 passed, 1 total` test suite; `20 passed, 20 total` tests (0 failed, 0 skipped).
- **ESLint**: `npx eslint libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts`
  - Result: **PASS** — `0` errors, `0` warnings.
- **TypeScript (`tsc`)**: `npx tsc --noEmit -p libs/backend/lane-routing/tsconfig.lib.json`
  - Result: **PASS** — exit code `0`, `0` errors (no G3 in-flight errors observed).
- **Ptah Diagnostics**: `ptah_get_diagnostics` scoped to both modified files
  - Result: **PASS** — `0` errors, `0` warnings (`typescript-compiler`, coverage clean).

## Notes & Decisions

- **Role comparison policy**: Chose trim + case-sensitive comparison in both reader and matcher (preserving existing case semantics while fixing whitespace mismatch) and documented it on `normalizeRole` and `matchRoutingRule`.
- **Skills**: `nx-workspace-architect` was not listed among available skills in this environment.
- **Git / Scope**: Only `routing-rules-setting.ts` and `routing-rules-setting.spec.ts` were modified; no git write operations were run and no G3 files (`pipeline/*`, `reasons/*`) were touched.
