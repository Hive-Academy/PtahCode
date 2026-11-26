# Batch 3 Report — Backend Skills API Client Download Ordering (`TASK_2026_2329_dd5d`)

## Summary
Implemented deterministic download-count descending ordering in `SkillsShApiClient.fetchRanked()` before and after description enrichment, ensuring all marketplace search, pagination (`search()`, `searchPage()`), and cached reads return `SkillShEntry[]` strictly ordered by `installs` descending and that the top-8 description enricher prioritizes the highest-download skills.

## Changed Files
1. `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts`
   - Added `normalizeInstalls()` (treats non-finite and negative values as `0`) and exported `compareSkillShEntriesByInstallsDesc()` (primary key: normalized `installs` descending; tie-breakers: `a.skillId.localeCompare(b.skillId) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name)`).
   - Sorted mapped `SkillShEntry[]` inside `SkillsShApiClient.fetchRanked()` **before** invoking `this.enricher.enrich(skills)`, and re-asserted `skills.sort(compareSkillShEntriesByInstallsDesc)` after enrichment before caching and returning.
   - Verified `search()`, `searchPage()`, and cached reads in `fetchRanked()` all flow through the sorted `fetchRanked()` list (`searchPage()` slices contiguous windows from the sorted list, preserving order).
2. `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de/libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.spec.ts`
   - Updated `rankedApi()` test helper to assign descending `installs` (`available - i`) so pagination fixtures reflect download-ranked upstream rows.
   - Added unit tests covering:
     - Unsorted upstream `search()` responses ordered by `installs` descending with negative/zero normalization and deterministic tie-breaking (`skillId`, `source`, `name`), including cached reads.
     - Pre-enrichment sorting proving the top-8 enricher cap probes and enriches the 8 highest-download skills first when upstream returns 12 skills in ascending download order, while preserving descending `installs` order after enrichment.
     - Unsorted upstream `searchPage()` responses returning strictly download-ordered page windows across offsets.
     - Direct `compareSkillShEntriesByInstallsDesc` coverage for `NaN`, `Infinity`, `-Infinity`, negative numbers, and all tie-breaker levels (`skillId`, `source`, `name`).

## Verification

| Check | Exact Command | Exit Code | Result |
| ----- | ------------- | --------- | ------ |
| Focused Jest | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.spec.ts` | `0` | `PASS` — 1 suite passed, 23 tests passed (0 failed) |
| TypeScript check | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | `0` | Clean (0 errors) |
| ESLint | `cd /home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de && npx eslint libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.spec.ts` | `0` | Clean (0 errors; standard standalone Nx warning about uncached ProjectGraph) |

## Verdict
PASS — All Batch 3 requirements implemented within the allowed write set and verified with Jest, TypeScript, and ESLint.
