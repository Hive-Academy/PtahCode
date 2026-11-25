# Batch G3 Fix Round — Part B Report (Findings 2, 3, 4, 5)

Status: DONE

## Summary

Fixed review findings 2, 3, 4, and 5 from `code-logic-review-G3.md` within the assigned write set, added targeted unit and integration specs for each finding, and verified with Jest, `tsc --noEmit`, ESLint, and `ptah_get_diagnostics` (all passing with zero errors and zero warnings).

---

## Finding 2 (Serious): AM3 Named Subagent Override Ordering with Preference Boost

- **Changes**:
  - `libs/backend/lane-routing/src/lib/ranking/spread.ts:33-36, 131-158, 230-232`: Added optional `totalOverride?: { readonly target: number; readonly label: string }` to `RankedCandidate` (validated finite in `assertCandidates`). In `rankCandidates`, when `totalOverride` is present, applied the target total *after* `preference` is computed (`override = target - (preOverrideBase + preference)`, `total = target`) in both the main ranking pass and the unboosted counterfactual (`rankCandidates(eligible)`), keeping `prior + learned + preference + limit + override === target` while leaving carried fixed-delta `parts.override` inputs untouched.
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:257-286`: Removed pre-spread `applyBuiltinSubagentOverride` and passed `totalOverride: { target: SCORE_MAX, label: BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL }` to `spread(...)` for subagent candidates when `!constraint.pinAccepted && matchedRule === undefined && (phase.kind === 'visual-review' || phase.kind === 'design')`. Preserved AM3's rule and pin exceptions.
- **Tests**:
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:978-1025`: Extended the AM3 override spec with a `design` phase carrying `preferences: { prefer: ['subagent:design'] }` and a competitor lane at total `97`, asserting `total === 100`, `parts` sum `=== 100` (`preference: 12`, `override: 38`, `overrideLabel: BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL`), `preferenceChangedChoice === false`, and both `['subagent:design', 100]` and `['codex', 97]` staying in the five-point offer band.
  - `libs/backend/lane-routing/src/lib/ranking/spread.spec.ts:566-613`: Verified `totalOverride` after preference, parts sum invariant, counterfactual behavior, band rotation to a `97` competitor, and rejection of non-finite override targets.

---

## Finding 3 (Serious): Bound Diagnostic Text & Deduplicate Repeated Preference Diagnostics

- **Changes**:
  - `libs/backend/lane-routing/src/lib/routing-constants.ts:195-208`: Added named diagnostic cap constants: `DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS = 48`, `DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP = 3`, `DIAGNOSTIC_LINE_MAX_CHARS = 240`, `AGGREGATE_DIAGNOSTIC_MAX_CHARS = 4000`, and `EXPLANATION_PREFERENCE_DIAGNOSTICS_CAP = 8`.
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:505-544`: Truncated exclude-selector snippets to `DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS` and capped ambiguous exclude match lists to `DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP` samples plus `, and K more`.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:425-505, 738-785`:
    - Truncated preference selector snippets (`DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS`), capped ambiguous match ID lists (`DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP` + `and K more`), deduplicated repeated preference diagnostics via exported `preferenceDiagnosticKey`, and capped rendered per-explanation preference diagnostics (`EXPLANATION_PREFERENCE_DIAGNOSTICS_CAP` + `and K more`).
    - Added `boundAggregateDiagnostics` in `compileGateReasons` to cap each `extraReasons` line at `DIAGNOSTIC_LINE_MAX_CHARS` and cap total emitted aggregate diagnostic characters (including the omitted count line `and N more diagnostic entries omitted`) at `AGGREGATE_DIAGNOSTIC_MAX_CHARS` (4,000 <= 8,000 target), keeping `gathered.detailReasons` ahead of rule diagnostics and suppressing generic `models unknown` only when emitted per-lane status is present.
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:294, 324, 602, 623-628`: Tracked `seenPreferenceDiagnostics` across phases in `rosterFrom` / `chosenEntry` using `preferenceDiagnosticKey` so each repeated preference diagnostic is emitted once per distinct entry+match set instead of once per phase.
- **Tests**:
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts:703-853`:
    - Case A: 10 phases with 10 distinct matching rules, each with 32 unique 200-character unknown exclude selectors -> validates `GateResultSchema`, asserts `JSON.stringify(result).length < 64_000`, conservative token check `Math.ceil(json.length / 2.4) < 25_600`, aggregate diagnostics `<= 8_000` chars with omitted count line, and every phase retains its full candidate trace.
    - Case B: 10 phases with dense repeated preferences (32 entries including 200-char unknown selectors, 5-way ambiguous family, and a review phase where `codex` becomes `ineligible`) -> verifies single emission per distinct entry+match set, bounded ambiguous sample (`claude-lane/cursor/gemini and 2 more`), new distinct `ineligible` diagnostic emitted on the review phase, and serialized size well under 64,000 chars and 25,600 tokens.
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:1278-1324`: Verifies selector truncation and ambiguous sample cap in `resolveRuleExclusions`.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:1160-1210`: Verifies `compileChosenExplanation` snippet/ambiguous/count caps and `compileGateReasons` 4,000-char aggregate cap with omitted marker.

---

## Finding 4 (Moderate): Decisive Factor Accuracy in Per-Phase Explanations & Preference Loss Text

- **Changes**:
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:127-128, 287-300, 319, 546-588`: Added `ruleExclusionChangedChoice?: boolean` to `PhasePlan` and `computeRuleExclusionChangedChoice`, which restores candidates excluded by `user-rule:<id>` (already proven hard-eligible by `hard-constraints.ts:250-269`) and runs `spread(...)` under the exact same ranking inputs and incoming rotation `cursor`, setting `true` only if removing the exclusion would pick a different executor.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts:50-58, 506-516`: Extended `DecidingFactor` with `'call preference' | 'configured preference'`. Updated `formatPreferenceClause` preference-loss text so when `decidingFactor` is `'pin'` or `'rotation'`, it reports `lost under pin` / `lost under rotation` regardless of the sign of `deficit` (`candidateTotal - total`).
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:489-516`: Updated `decidingFactorOf` to:
    1. Credit `'model refinement'` only when `resolution.source === 'model' && resolution.modelRefined === true` (confirming models retain legacy `source: 'model'` and `confidence` while falling through to the true ranking deciding factor).
    2. Credit `` `rule ${plan.matchedRule.id}` `` only when `plan.ruleExclusionChangedChoice === true` or the rule's `prefer` list changed the choice (non-decisive exclusion rules remain visible in policy context via `matchedRuleId`).
    3. Credit `'call preference'` / `'configured preference'` when `plan.spread?.preferenceChangedChoice` is true for that source.
- **Tests**:
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts:259-270, 464-654`: Updated the model-confirmation assertion (`source: 'model'`, `confidence: 0.9`, `decided by rule ui-review`, not `decided by model refinement`) and added assertions covering `modelRefined: true`, `configured preference`, `call preference`, non-decisive exclusion rule (stays in policy context), decisive exclusion rule, and pin preference loss with negative deficit.
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:1278-1324`: Tested `ruleExclusionChangedChoice` as `false` for a non-decisive exclusion and `true` when removing the exclusion changes the rotated pick under the incoming cursor.
  - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:1212-1246`: Verified `lost under pin` and `lost under rotation` with negative deficit (`77` vs `90`), while `'score'` retains `lost to total 90 (gap -13)`.

---

## Finding 5 (Moderate): Preserve `question-limit` Skip Reason Through Alternates-Only Suppression

- **Changes**:
  - `libs/backend/lane-routing/src/lib/pipeline/phase-resolve.ts:41-42`: Updated `suppressCause` to preserve `'question-limit'` alongside `'deadline'` (`alternatesOnly && cause !== 'deadline' && cause !== 'question-limit'`).
- **Tests**:
  - `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:329-340, 1265-1276`: Updated the alternates-only limited check to expect `cause: 'question-limit'` and added an explicit B07 test on an alternates-only limited phase (`primaryCount === 1`, `isSendable === true`).
  - `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts:656-701`: Verified an alternates-only limited phase retains ranked alternatives in `row.candidates`, reports `fallbackCause: 'question-limit'`, and includes `fallback cause question-limit` in `row.reason`.

---

## Check Results

1. **Scoped Jest**:
   ```bash
   npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath \
     libs/backend/lane-routing/src/lib/ranking/spread.spec.ts \
     libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts \
     libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts \
     libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts
   ```
   Result: **PASS** — 4 passed / 4 total test suites, 151 passed / 151 total tests (exit code 0).

2. **TypeScript**:
   ```bash
   npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json
   ```
   Result: **PASS** — 0 errors (exit code 0).

3. **ESLint**:
   ```bash
   npx eslint \
     libs/backend/lane-routing/src/lib/routing-constants.ts \
     libs/backend/lane-routing/src/lib/ranking/spread.ts \
     libs/backend/lane-routing/src/lib/ranking/spread.spec.ts \
     libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts \
     libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts \
     libs/backend/lane-routing/src/lib/pipeline/phase-resolve.ts \
     libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts \
     libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts \
     libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts \
     libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts
   ```
   Result: **PASS** — 0 errors, 0 warnings (exit code 0).

4. **Ptah Diagnostics (`ptah_get_diagnostics`)**:
   Scoped to all 10 changed files.
   Result: **PASS** — `Errors: 0 | Warnings: 0`, `coverage: clean`.

---

## Decisions

| Decision | Options Considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Represent AM3 post-preference override via optional `RankedCandidate.totalOverride` in `spread.ts` | (A) Add `totalOverride` to `RankedCandidate` so `spread` computes `override` after preference in both main pass and counterfactual; (B) Special-case `parts.overrideLabel` inside `spread.ts` | Preserves existing carried-override behavior tested in `spread.spec.ts:552` while keeping AM3 policy in `phase-plan.ts` and keeping `spread.ts` generic. | Yes |
| Set `AGGREGATE_DIAGNOSTIC_MAX_CHARS = 4000`, `DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS = 48`, `DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP = 3`, `DIAGNOSTIC_LINE_MAX_CHARS = 240`, `EXPLANATION_PREFERENCE_DIAGNOSTICS_CAP = 8` | Higher cap (e.g., 8,000) vs 4,000 | Prompt targets diagnostics `<= 8,000` chars and full JSON well under `64,000` chars / `25,600` tokens (`tool-result-budget.ts:98`); 4,000 leaves generous headroom for dense multi-phase traces while showing ~40 distinct diagnostic lines before summarizing omitted count. | Yes |
| Compute exclusion-rule decisiveness in `phase-plan.ts` via a same-cursor `spread` counterfactual | (A) Counterfactual in `phase-plan.ts` with incoming cursor; (B) Heuristic in `assemble-gate.ts` | `hard-constraints.ts:250-269` guarantees every `user-rule:*` excluded candidate already passed hard constraints; only `phase-plan.ts` holds the incoming rotation cursor before `spread` advances it. | Yes |
| Keep `rotation` ahead of `rule <id>` in `decidingFactorOf` | (A) `pin > model refinement > rotation > rule > call/configured preference > tie-break > score`; (B) `rule` ahead of `rotation` | Matches existing precedence in `assemble-gate.ts:505-525` and keeps preference-loss attribution consistent when rotation moves the pick inside the band; non-decisive or contextual rules remain visible in the policy clause. | Yes |

---

## Left Undone

None. All four assigned findings (2, 3, 4, 5) are fixed, tested, and verified within the allowed write set. No files outside the write set were modified.
