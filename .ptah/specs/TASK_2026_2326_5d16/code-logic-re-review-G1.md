# Code Logic Re-Review — Group G1 Fixes (`8e6f340a0`)

Verdict: APPROVED
Review family: antigravity (implementer codex)

## Scope & Verification

- **Fix commit reviewed:** `8e6f340a0` (`git show 8e6f340a0`) against prior findings in `.ptah/specs/TASK_2026_2326_5d16/code-logic-review-G1.md` and implementer notes in `.ptah/specs/TASK_2026_2326_5d16/batch-G1-review-fix-report.md`.
- **In-scope findings:** #1, #2, #4, #5, #6, #7, #8. Finding #3 (`pipeline/phase-plan.ts`) is assigned to B07 and excluded from this re-review.
- **Coordinator ruling applied:** For #1, an empty higher-precedence preference list counts as absent and falls through.
- **Checks run (read-only):**
  - `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath` across all 5 G1 spec files (`contracts.spec.ts`, `preference-match.spec.ts`, `score.spec.ts`, `spread.spec.ts`, `capability-matrix.store.spec.ts`): **5 suites passed, 150 tests passed, 0 failed**.
  - `git grep` across `libs/` for `preferenceMatches`, `PreferenceMatch`, `PreferenceDiagnostic`, `scoreResolvedCell`, `ROUTING_RULE_ID_PATTERN`, `overrideLabel`, and `TIE_BREAK_STEPS` confirmed no broken production callers (and G2's `scope/routing-rules-setting.ts:22,28` already shares `ROUTING_RULE_ID_PATTERN`).
  - Note: no source files were modified; `git` was used read-only.

## Finding-by-Finding Status

### #1 (Serious) — **FIXED**
- **Evidence:** `libs/backend/lane-routing/src/lib/ranking/preference-match.ts:87-109` and `libs/backend/lane-routing/src/lib/ranking/spread.ts:13,65,111`.
  - Empty `rulePrefer` (`length === 0`) and `callPrefer` (`length === 0`) are recorded in `ignored` with `{ source, status: 'empty, ignored' }` (`preference-match.ts:89-90`) and are NOT pushed to `sources` (`:91-92`), allowing precedence to fall through to the next non-empty source (`call` or `configured`).
  - Non-empty lists (`rulePrefer?.length` / `callPrefer?.length`) still take precedence without falling through even when no entries earn a boost.
  - `explicit` is derived from the winning `source` (`:96`), avoiding the prior `rulePrefer ?? callPrefer` bug when `rulePrefer` was `[]`.
  - Covered by `preference-match.spec.ts:81-109` and `spread.spec.ts:510-531`.

### #2 (Serious) — **FIXED**
- **Evidence:** `libs/backend/lane-routing/src/lib/ranking/spread.ts:145-160`.
  - `band` is freshly allocated by `ranking.filter(...)` (`:150`) and `first` (`ranking[0]`, the score leader) is captured beforehand (`:146`).
  - When `lastId` is neither in `band` (`:152-153`) nor below the band in `ranking` (`:156`), `band` is sorted by `compareOrdinal(left.candidate.id, right.candidate.id)` (`:158`) and searched for the first `entry.candidate.id > lastId`, wrapping to `first` when none is greater (`:159`).
  - `rankingByTotal` is unmutated; `ranking` starts at the rotated pick and wraps cleanly within the band.
  - Covered for both absent and hard-excluded (`at-limit`) cursors in a mixed-score band by `spread.spec.ts:396-408`.

### #3 (Serious — Cross-Batch Caller Impact) — **OUT OF SCOPE (Deferred to B07)**
- Assigned to B07 per re-review scope (`libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:172-245`).

### #4 (Moderate) — **FIXED**
- **Evidence:** `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:102-112` and `libs/backend/lane-routing/src/lib/ranking/spread.ts:134`.
  - `ScorePartsSchema` (`.strict()`) now accepts `overrideLabel: z.string().max(120).optional()` (`route-decide-result.schema.ts:111`), unblocking AM3's named override inside `parts`.
  - `spread.ts:134` spreads `...parts`, preserving `overrideLabel` through ranking.
  - Covered by `contracts.spec.ts:194, 235-248`.

### #5 (Moderate) — **FIXED**
- **Evidence:** `libs/backend/lane-routing/src/lib/routing-constants.ts:36` and `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:73-80`.
  - `ROUTING_RULE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/` is exported as a single source of truth (also consumed by G2's `scope/routing-rules-setting.ts:22,28`).
  - `ExclusionRuleSchema` validates the `user-rule:` suffix with `.refine((rule) => ROUTING_RULE_ID_PATTERN.test(rule.slice(USER_RULE_PREFIX.length)), 'Invalid routing rule id')`, rejecting empty IDs, whitespace, semicolons, newlines (including trailing `\n`), and IDs > 64 chars while preserving the `UserRuleExclusion` template-literal type.
  - Covered by `contracts.spec.ts:250-267`.

### #6 (Moderate) — **FIXED**
- **Evidence:** `libs/backend/lane-routing/src/lib/ranking/candidate.types.ts:55-64` and `libs/backend/lane-routing/src/lib/ranking/preference-match.ts:41-46`.
  - `candidateDisplayName` trims lane `displayName` and subagent `role`, falling back to `candidate.id` / `phaseKind` when blank (`candidate.types.ts:58, 60`).
  - `resolvePreferences` short-circuits when `entry.trim() === ''`, returning `{ entry, rank, ids: [], status: 'unknown', detail: 'blank selector, ignored' }` without entering the tier loop, preserving entry position ranks for subsequent selectors (`preference-match.ts:42-46`).
  - Covered by `preference-match.spec.ts:65-74`.

### #7 (Moderate) — **FIXED**
- **Evidence:**
  - Tied configured `preferredRank` ordering now breaks ties deterministically by ordinal `entry` (`candidate.id`) at `libs/backend/lane-routing/src/lib/ranking/preference-match.ts:85-86`, verified in `preference-match.spec.ts:93-109` across reversed inventory order.
  - `scoreResolvedCell` validates `!Object.hasOwn(LIMIT_ADJUST, limitState)` (blocking prototype keys such as `'constructor'`) and `override !== undefined && !Number.isFinite(override)` at `libs/backend/lane-routing/src/lib/ranking/score.ts:218-223`, verified in `score.spec.ts:164-171`.
  - `spread` validates lane `limitState` via `Object.hasOwn(LIMIT_ADJUST, candidate.limitState)` in `assertCandidates` (`libs/backend/lane-routing/src/lib/ranking/spread.ts:195-198`) and asserts `Number.isFinite(base)` in `rankCandidates` (`spread.ts:128-130`), verified in `spread.spec.ts:438-449`.

### #8 (Minor) — **FIXED**
- **Evidence:** `libs/backend/lane-routing/src/lib/routing-constants.ts:84-95`.
  - `TIE_BREAK_STEPS` and its doc comment now match `spread.ts:162-169`: `['total', 'preferenceRank', 'limitClass', 'executorKind', 'candidateId']`.
  - Asserted in `spread.spec.ts:464`.

## New Defects Introduced

None (no Blocking, Serious, or Moderate defects introduced by `8e6f340a0`).

### Non-blocking Minor Notes (no revision required)
1. **[Minor]** `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:111` — `overrideLabel: z.string().max(120).optional()` allows an empty string `""`; adding `.min(1)` (and optionally an `overrideLabel?: string` parameter on `scoreResolvedCell` in `libs/backend/lane-routing/src/lib/ranking/score.ts:199-236`) would tighten validation and ergonomics for B07, though B07 can already attach `overrideLabel` on `ScoreParts` directly without being blocked.
