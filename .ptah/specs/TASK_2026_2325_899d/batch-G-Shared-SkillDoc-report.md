# Batch G-Shared-SkillDoc report

## Files changed

- Created `libs/shared/src/lib/utils/skill-document.ts`.
- Created `libs/shared/src/lib/utils/skill-document.spec.ts`.
- Modified `libs/shared/src/index.ts` to export the new module.
- Did not modify `libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.ts`.

## Plan items done

- Implemented the exact slug normalization from plan lines 55 and 457 and `harness-fs.service.ts:81-85`.
- Implemented verbatim `serializeSkillDocument` from binding amendment lines 458-459. Its content matches the current writer at `harness-fs.service.ts:103-122`, including escaping, `source: custom`, tool sanitization, the blank line, and the trailing newline.
- Implemented `normalizeDraftBody` from lines 460-462. It converts CRLF to LF and removes at most one leading YAML block with a key/value line. The serializer never calls it.
- Implemented boolean `validateSkillDocument` from line 463. It rejects an empty slug and a blank body.
- Exported the module from the shared barrel as assigned at lines 345-347.
- Added the required coverage from lines 469-471 and the lane acceptance criteria: byte equality with and without tools, verbatim delimiter-prefixed bodies, one-block normalization, second-block and horizontal-rule preservation, CRLF handling, slug cases, and validation rejection.

## Checks

- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/utils/skill-document.spec.ts` — PASS, 1 suite and 16 tests.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` — PASS, no output.
- `npx eslint libs/shared/src/lib/utils/skill-document.ts libs/shared/src/lib/utils/skill-document.spec.ts libs/shared/src/index.ts` — PASS, no output.
- `ptah_get_diagnostics` on the three changed source files — PASS, 0 errors and 0 warnings, clean coverage.
- Jest printed its existing ES-module configuration warning, but the focused suite passed.

## Decisions

1. **Validation returns a boolean.** Options were a boolean guard, a thrown error, or a structured result. The plan defines rejection conditions but no result contract. The design-spec Create guard needs a boolean condition. This is reversible before downstream consumers settle on another contract.
2. **YAML detection requires a top-level key and a nonblank value.** Options were stripping every delimiter block or requiring a `key: value` line. Amendment 3.5 requires the latter and protects plain horizontal rules. The expression accepts letters, digits, underscores, and hyphens in keys after an initial letter or underscore. This is reversible in one function.
3. **Tool-section presence follows the original `allowedTools.length` check.** Options were checking the input array or omitting entries after sanitization. Binding byte equality with `harness-fs.service.ts:108-111` requires the input-array check. This preserves the current writer behavior.
4. **CRLF normalization covers the complete draft body.** Options were normalizing only frontmatter or the complete body. Amendment 3.5 says `normalizeDraftBody` normalizes CRLF to LF without limiting the scope. Serialization remains byte-preserving. This is reversible in one function.

## Open items and needed changes in other groups

- None for this batch.
- `G-Skills-Draft-And-Fs` retains the planned migration of `HarnessFsService.createSkillPlugin` to this serializer. This batch did not edit that file.

## Extra reads

- `libs/shared/src/lib/utils/agent-budget-policy.ts` — neighboring utility style.
- `libs/shared/src/lib/utils/test-command-matcher.spec.ts` — neighboring spec style.
- `libs/shared/jest.config.ts` — focused test configuration.
- `libs/shared/tsconfig.lib.json` — scoped type-check configuration.
- Searched task documents for validation semantics. Results included `parity-inventory.md`, `design-spec-review.md`, `design-spec.md`, `implementation-plan-review.md`, and `task-description.md`.
