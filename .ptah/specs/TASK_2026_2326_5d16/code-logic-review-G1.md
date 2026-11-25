# Code Logic Review — Group G1 (`cceebaf9d`)

Verdict: REVISE
Review family: antigravity (implementer codex)

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 6/10                                 |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 3 (2 in G1 diff, 1 cross-batch caller impact) |
| Moderate issues     | 4                                    |
| Minor issues        | 1                                    |
| Failure modes found | 7                                    |

**Score rationale:** Core additive scoring arithmetic (`score.ts`), three-layer matrix resolution (`capability-matrix.store.ts`), 4-tier preference resolution on happy paths (`preference-match.ts`), closeness-band rotation offer ordering (`ranking` vs `rankingByTotal` in `spread.ts`), and legacy schema round-tripping (`route-decide-result.schema.ts`) are sound — separating this from the 3–4 band. Two genuine logic defects inside G1's write set (empty higher-precedence preference lists silencing lower-precedence sources in `preference-match.ts:77-86`; absent rotation cursor scanning a score-sorted band instead of ordinal ID order in `spread.ts:155`), plus strict schema / boundary gaps against AM3 and Component 7, keep it in the 5–6 ("real gaps") band rather than 7–8 ("sound").

## Scope & Verification Evidence

- **Commit reviewed (full files read):** `cceebaf9d` (`libs/backend/lane-routing/src/index.ts`, `lib/routing-constants.ts`, `lib/contracts/route-decide-result.schema.ts`, `lib/route-candidate-source.port.ts`, `lib/matrix/capability-matrix.store.ts`, `lib/ranking/candidate.types.ts`, `lib/ranking/preference-match.ts`, `lib/ranking/score.ts`, `lib/ranking/spread.ts`, and all 5 updated/added spec files).
- **External callers inspected:** `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts`, `phase-resolve.ts`, `model-refine.ts`, `assemble-gate.ts`, `gather.ts`, `route-decide.service.ts`, `reasons/compile-reasons.ts`, `ranking/hard-constraints.ts`, `ranking/closeness-band.ts`, `ranking/rotation.store.ts`, `matrix/local-derivation.ts`, `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts`, `routing-reminder.format.ts`, `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.ts`, `mcp-core/route-tool-handlers.ts`.
- **Tooling notes:**
  - `ptah_get_diagnostics` timed out at 45s twice ("TypeScript check still running after 45s").
  - `ptah_lsp_references` ran as a truncated text-scan against the parent repo tree (`/home/amun/ptah-extension/`), so read-only `git grep` in the worktree was used to verify all callers of changed exports.
  - Scoped Jest run (`npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath ...` across the 5 changed specs plus `rotation.store.spec.ts`, `phase-plan.spec.ts`, and `route-decide.gate.spec.ts`): 8 suites / 223 tests passed.

## Findings

### 1. [Serious] Empty higher-precedence preference list (`rulePrefer: []` or `preferences: { prefer: [] }`) silently shadows lower-precedence preference sources

- **File:** `libs/backend/lane-routing/src/lib/ranking/preference-match.ts:77-86` (called from `libs/backend/lane-routing/src/lib/ranking/spread.ts:75-80`; input allowed by `libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:89`)
- **Evidence:**
  ```ts
  const sources: PreferenceSource[] = [];
  if (rulePrefer !== undefined) sources.push('rule');
  if (callPrefer !== undefined) sources.push('call');
  if (configured.length > 0) sources.push('configured');

  const [source, ...overridden] = sources;
  const explicit = rulePrefer ?? callPrefer;
  ```
  `RouteDecideArgsSchema` permits `preferences: { prefer: [] }` (no `.min(1)`). When a caller passes `preferences: { prefer: [] }` (e.g. a default empty array) while lanes have configured `preferredRank > 0`, or when a routing rule carries `prefer: []` while the caller passed `preferences: { prefer: ['codex'] }`, `selectPreferences` selects `'call'` / `'rule'`, lists `'configured'` / `'call'` in `overridden`, resolves `explicit = []`, and returns `matches: []` with an empty `ranks` map — silently stripping all configured/call preference boosts with zero diagnostics in `preferenceMatches`. Notice line 80 already checks `configured.length > 0`, whereas lines 78–79 check `!== undefined`. This also regresses pre-G1 behavior (`spread.ts:183-189` prior to `cceebaf9d`), where `{ prefer: [] }` fell through to `preferredRank`. Note: a *non-empty* list whose selectors are all unknown/ineligible/ambiguous (such as `['hot']` in `spread.spec.ts:482-499`) should still win without falling through; only an empty array `[]` has no selectors at all.
- **Concrete fix:** Treat empty arrays as absent in `selectPreferences`:
  ```ts
  const hasRule = (rulePrefer?.length ?? 0) > 0;
  const hasCall = (callPrefer?.length ?? 0) > 0;
  if (hasRule) sources.push('rule');
  if (hasCall) sources.push('call');
  if (configured.length > 0) sources.push('configured');
  const explicit = hasRule ? rulePrefer : hasCall ? callPrefer : undefined;
  ```
  Add tests in `preference-match.spec.ts` and `spread.spec.ts` verifying `rulePrefer: []` falls through to `callPrefer`, `callPrefer: []` falls through to `configured`, and non-empty unmatched lists (`['hot']`) still do not fall through.

### 2. [Serious] Absent or hard-excluded rotation cursor scans a score-ordered band with `id > lastId`, picking the wrong candidate instead of the ordinal ID successor

- **File:** `libs/backend/lane-routing/src/lib/ranking/spread.ts:154-155`
- **Evidence:**
  ```ts
  // The rotation store retains only the id once a candidate is ineligible or absent.
  return band.find((entry) => entry.candidate.id > lastId) ?? first;
  ```
  `band` is filtered from `ranking`, which is ordered by `compare` (`total` descending, `preferenceRank` ascending, `limitRank`, `executorKind`, `id`) — **not** by `candidate.id`. When `lastId` is absent or hard-excluded (e.g. went `at-limit`) and `band` contains multiple candidates with different totals or preference ranks:
  - Example: `band = [{ id: 'a', total: 80 }, { id: 'z', total: 78 }, { id: 'm', total: 77 }]` (all within 5 points of 80) and `lastId = 'b'`.
  - The ordinal ID successor of `'b'` in `band` is `'m'` (`'a' < 'b' < 'm' < 'z'`).
  - `band.find((entry) => entry.candidate.id > 'b')` tests `'a'` (false), then `'z'` (true) and returns `'z'`, skipping `'m'`.
  - `spread.spec.ts:382-394` missed this because its two candidates `a` (total 62) and `z` (total 58) were already in alphabetical order.
- **Concrete fix:** Sort a copy of `band` by `compareOrdinal` before searching for the ordinal successor:
  ```ts
  const byId = [...band].sort((left, right) =>
    compareOrdinal(left.candidate.id, right.candidate.id),
  );
  return byId.find((entry) => compareOrdinal(entry.candidate.id, lastId) > 0) ?? first;
  ```
  Add a regression test in `spread.spec.ts` with an out-of-alphabetical-order band (e.g. `a=80, z=78, m=77` and `lastId = 'b'`, asserting `pick` is `'m'`).

### 3. [Serious — Cross-Batch Caller Impact] Unupdated `pipeline/phase-plan.ts` computes model-offer band and AM3 override on raw `score`, silently dropping `spread.pick` when preference or limit changes the leader

- **File:** `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:172-187, 229-245` (invoking `libs/backend/lane-routing/src/lib/ranking/spread.ts:69-140`)
- **Evidence:**
  1. `planRoutePhases` (`phase-plan.ts:175-181`) passes only `{ candidate, score }` to `spread()`, which now ranks by `score + LIMIT_ADJUST + preferenceBoost`. Meanwhile `laneQuestion` (`phase-plan.ts:230-231`) still computes `top = Math.max(...plan.ranked.map((row) => row.scored.score))` and filters `primaries` by `insideClosenessBand(top, row.scored.score)`.
     - If candidate `A` has `score: 80`, `C` has `score: 78`, and preferred candidate `B` has `score: 70` (+12 -> total `82`), `spread.pick` is `B` and `plan.ranked = [B, A, C]`. `laneQuestion` computes `top = 80`, drops `B` (`80 - 70 = 10 > 5`), and sends `[A, C]` to the decision model — silently dropping the spread pick (`B`) and reversing user preference.
     - Same failure for limit adjustments: `A` (`score: 80, near-limit` -> total `70`) and `C` (`score: 79, near-limit` -> total `69`) vs `B` (`score: 74, confirmed-room` -> total `74` -> `spread.pick = B`). `laneQuestion` computes `top = 80`, drops `confirmed-room` `B`, and offers only the two `near-limit` lanes `[A, C]`!
  2. For `design`/`visual-review` phases (`phase-plan.ts:177-180`), `phase-plan.ts` passes `score: SCORE_MAX (100)` for the built-in subagent without `parts`/`override`. `spread.ts:125` applies `legacyLimitAdjustment` (`-5` for non-lane `unknown`), dropping the subagent's total to `95`. A `confirmed-room` lane with `score >= 90` now enters the 5-point rotation band, and a preferred lane with `score >= 84` (`84 + 12 = 96 > 95`) beats the built-in override outright.
- **Concrete fix:** `implementation-plan.md:155-160, 203` assigns `phase-plan.ts` to B07 as part of the coordinated B02–B09 merge. Do **not** ship G1 standalone before B07 lands. In B07, pass `total`/`parts`/`inventory` into `spread()`, express the AM3 override via `parts.override` (accounting for the `-5` non-lane limit part so total reaches 100), and compute `laneQuestion` and `alternateOptions` bands on `total` rather than raw `score`.

### 4. [Moderate] `ScorePartsSchema` is `.strict()` with numeric-only `override?: number` and no label field, blocking AM3's named override in `parts`

- **File:** `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:97-106` (and `libs/backend/lane-routing/src/lib/ranking/score.ts:218-227`)
- **Evidence:** Orchestrator amendment AM3 (`implementation-plan.md:245-248`) requires: *"Keep the score=100 spread override at `phase-plan.ts:175-181`; render it as a named part `override: builtin design/visual-review subagent` in parts and explanation."* `ScorePartsSchema` is `.strict()` and defines only `override: z.number().optional()`. Because of `.strict()`, downstream B07/B08 cannot attach a name/label for the override inside `parts` without failing `GateResultSchema.safeParse()` (`route-decide.service.ts:308`).
- **Concrete fix:** Add an optional `overrideReason: z.string().min(1).optional()` (or `overrideLabel`) to `ScorePartsSchema` (and accept/pass it through `scoreResolvedCell` in `score.ts:199-230`) so `parts` preserves both the numeric delta and AM3's named override description.

### 5. [Moderate] `ExclusionRuleSchema` allows whitespace, semicolons, newlines, and unbounded strings after `user-rule:`

- **File:** `libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:72-75`
- **Evidence:**
  ```ts
  const ExclusionRuleSchema = z.union([
    z.enum(EXCLUSION_RULES),
    z.templateLiteral(['user-rule:', z.string().min(1)]),
  ]);
  ```
  This accepts `'user-rule:   '`, `'user-rule:foo;bar\nbaz'`, and arbitrarily long strings. Component 7 (`implementation-plan.md:49`) restricts rule IDs to `[A-Za-z0-9_-]{1,64}`, and `compile-reasons.ts:5-6, 182-192` relies on rule tokens containing no whitespace, `;`, or line breaks (`'; '` is the reason clause delimiter).
- **Concrete fix:** Constrain the `user-rule:` branch to match `/^user-rule:[A-Za-z0-9_-]{1,64}$/` (e.g. `z.string().regex(/^user-rule:[A-Za-z0-9_-]{1,64}$/) as z.ZodType<UserRuleExclusion>` or a refined template literal) and add negative cases (`'user-rule: '`, `'user-rule:a;b'`, `'user-rule:a\nb'`) in `contracts.spec.ts`.

### 6. [Moderate] Whitespace/empty preference selector can match a candidate with blank `displayName`, and `candidateDisplayName` does not trim blank names

- **File:** `libs/backend/lane-routing/src/lib/ranking/preference-match.ts:35-53` and `libs/backend/lane-routing/src/lib/ranking/candidate.types.ts:55-64`
- **Evidence:**
  - `candidateDisplayName` (`candidate.types.ts:58`) returns `candidate.displayName ?? candidate.id`. If a `LaneCandidate` is constructed with `displayName: ''` or `'  Kimi Code  '` (without going through `toLaneCandidate`), `??` preserves `''` instead of falling back to `candidate.id`, and untrimmed whitespace prevents matching `'kimi code'`.
  - In `resolvePreferences` (`preference-match.ts:36-44`), an empty/whitespace entry (`'   '`) trims to `selector = ''` and runs all four match tiers instead of immediately returning `status: 'unknown'`. Against a candidate with `displayName: ''`, a whitespace-only preference entry matches and awards a boost.
- **Concrete fix:**
  1. In `preference-match.ts:36`, short-circuit: `if (selector === '') return { entry, rank, ids: [], status: 'unknown' };`.
  2. In `candidate.types.ts:58`, trim and fall back: `return candidate.displayName?.trim() || candidate.id;`.

### 7. [Moderate] Nondeterministic `preferenceMatches` ordering for tied configured `preferredRank` values, and unvalidated `limitState` / `parts` / `override` at internal boundaries

- **File:** `libs/backend/lane-routing/src/lib/ranking/preference-match.ts:76`, `libs/backend/lane-routing/src/lib/ranking/spread.ts:137-140, 167-170, 178-191`, and `libs/backend/lane-routing/src/lib/ranking/score.ts:199-230`
- **Evidence:**
  - `preference-match.ts:76` sorts `configured` by `left.rank - right.rank` with no secondary tie-break on `entry` (`candidate.id`), so `SpreadResult.preferenceMatches` depends on `inventory` input order when two lanes share a `preferredRank`.
  - `spread.ts:167-170` computes `INSIDE_BAND_LIMIT_ORDER.findIndex(...)`: an unexpected runtime `limitState` string returns `-1` (sorting *better* than `'confirmed-room'` at index `0`), and `LIMIT_ADJUST[state]` at `spread.ts:139` / `score.ts:225` evaluates to `undefined`, turning `total` into `NaN` and corrupting `compare()` sort order.
  - `spread.ts:178-191` (`assertCandidates`) validates `Number.isFinite(entry.total)`, but does not validate finite values in `entry.parts` (used when `entry.total === undefined` at line 126) or `scoreResolvedCell`'s `override` argument (`score.ts:203, 228`).
- **Concrete fix:**
  - Add an ordinal ID tie-break in `preference-match.ts:76`: `left.rank - right.rank || (left.entry < right.entry ? -1 : left.entry > right.entry ? 1 : 0)`.
  - Guard `LIMIT_ADJUST` / `limitRank` against unrecognised runtime states (throw or fall back to `'unknown'`), and assert `Number.isFinite` on `override` in `scoreResolvedCell` and computed `base` in `spread.ts`.

### 8. [Minor] `TIE_BREAK_STEPS` constant is stale relative to the new additive tie-break order

- **File:** `libs/backend/lane-routing/src/lib/routing-constants.ts:87-92`
- **Evidence:** `TIE_BREAK_STEPS` remains `['prefer', 'preferredRank', 'executorKind', 'candidateId']`, omitting `limitClass` and keeping separate `prefer`/`preferredRank` entries, whereas `spread.ts:158-165` orders equal totals by `preferenceRank`, `limitClass`, `executorKind`, `candidateId`. Not imported in production code (confirmed via `git grep`), so no runtime defect today, but a documentation/contract mismatch.
- **Concrete fix:** Update `TIE_BREAK_STEPS` and its doc comment to `['preferenceRank', 'limitClass', 'executorKind', 'candidateId']`.

## Five Logic Questions

### 1. How does this fail silently?
- `preference-match.ts:77-86`: Passing `preferences: { prefer: [] }` or `rulePrefer: []` silently shadows lower-precedence call/configured preferences, returning `preferenceMatches: []` and zero boosts without error.
- `phase-plan.ts:172-187, 229-245`: Until B07 lands, a preference boost or limit penalty that promotes a candidate with raw `score < max(score) - 5` causes `laneQuestion` to silently drop `spread.pick` from the model offer list and offer lower-total lanes instead.
- `spread.ts:139, 169` and `score.ts:225`: An unexpected runtime `limitState` produces `undefined` from `LIMIT_ADJUST[state]` -> `NaN` total and `-1` from `findIndex` (outranking `confirmed-room`), corrupting sorting without throwing.

### 2. What user action produces unexpected behaviour?
- Passing `preferences: { prefer: [] }` in `ptah_route_decide` (valid per `RouteDecideArgsSchema`) unexpectedly cancels the user's configured preferred agent order (`preferredRank`) (`preference-match.ts:79-86`).
- Having a previously rotated lane hit `at-limit` while 3+ lanes with different scores remain inside the 5-point band causes rotation to jump to the highest-scoring lane whose ID is lexicographically greater than `lastId`, rather than the true ordinal successor (`spread.ts:155`).

### 3. What input data produces a wrong answer?
- `rulePrefer: []` with `callPrefer: ['codex']` -> returns `ranks = Map(0)`, `source = 'rule'`, `overridden = ['call']` (`preference-match.ts:78-86`).
- `band = [a(80), z(78), m(77)]`, `lastId = 'b'` -> returns `z` instead of `m` (`spread.ts:155`).
- `entry = '   '` against a `LaneCandidate` with `displayName: ''` -> returns `status: 'matched'` instead of `'unknown'` (`preference-match.ts:36-44`, `candidate.types.ts:58`).
- `rule: 'user-rule:foo;bar\nbaz'` -> passes `GateResultSchema` despite violating rule ID syntax and reason clause delimiters (`route-decide-result.schema.ts:74`).

### 4. What happens when a dependency fails?
- `CapabilityMatrixStore.load()` (`capability-matrix.store.ts:236-355`): Missing/corrupt user file keeps `lastValidUser` and reports `matrix-invalid:` reasons; failing/non-persistent outcome reader yields empty local matrix and reports `OUTCOMES_UNAVAILABLE_REASON` / `NO_OUTCOME_HISTORY_REASON`; `resolveIndexed` still produces valid `layers` (possibly `{}`) and falls back cleanly to `NEUTRAL_SCORE` (50) + exploration (+5).
- `RouteCandidateSource.limitEvidence` (`route-candidate-source.port.ts:14-16`): Optional; existing callers (`route-namespace.builder.ts`, `host-routing.coordinator.ts`) omit it and continue working with `limits()`.
- `host-routing.coordinator.ts` & `routing-reminder.format.ts:65-67`: Handle all 4 new `FALLBACK_CAUSES` (`deadline`, `model-cold`, `model-busy`, `question-cap`) safely via `fallbackCause !== null`.

### 5. What is missing that the requirements never mentioned?
- Validation of finite numeric values on `ScoreParts` / `override` at the `scoreResolvedCell` and `spread` boundaries (`score.ts:199-230`, `spread.ts:178-191`), since B07 will call `scoreResolvedCell` directly for pins, alternates, and overrides bypassing `score()`'s `assertCell`.
- Explicit behavior for empty preference lists (`[]`) vs absent (`undefined`) vs non-empty unmatched lists (`['missing']`).
- Handling duplicate candidate IDs inside `SpreadInput.inventory` (`assertCandidates` validates `input.candidates` only, not `input.inventory`, so duplicate IDs in `inventory` would falsely flag an exact ID as `ambiguous` in `resolvePreferences`).

## Data Flow

1. `CapabilityMatrixStore.load()` -> `resolveIndexed` (`capability-matrix.store.ts:477-509`): Resolves `user`, `local`, `seed` for the resolved `(family, profileModel, taskKind)` and returns `{ layers, cell, score, noProfile }`. **OK.**
2. `toLaneCandidate` (`candidate.types.ts:113-137`): Copies `ptahCliName?.trim() || id` into `displayName`, maps `limitEvidence?.state ?? limitStateForCandidate(...)`, preserves `preferredRank`. **OK** (minor gap in `candidateDisplayName` for direct constructors with blank `displayName`).
3. `score` / `scoreResolvedCell` (`score.ts:110-235`): Computes `prior`, `delta`, clamped `learned` + `exploration` (`< 3` runs, zeroed when `user` present), `preferenceBoost`, `LIMIT_ADJUST`, optional `override`, and `total`; promotes models by `total - baseline.total > 5`; keeps legacy `score` unchanged. **OK** (missing `overrideReason` for AM3, missing finiteness guard on `override`).
4. `selectPreferences` / `resolvePreferences` (`preference-match.ts:23-92`): Resolves selectors in order `id` -> folded `displayName` -> folded `family` -> folded `cli`; marks `unknown`/`ambiguous`/`duplicate`/`ineligible`. **GAP:** empty higher-precedence list (`[]`) shadows lower sources (`:77-86`); blank selector not short-circuited (`:36`); tied `preferredRank` lacks ID tie-break (`:76`).
5. `spread` (`spread.ts:69-176`): Filters out `at-limit`, calls `selectPreferences`, ranks by `compare`, selects pick inside 5-point band, builds rotated `ranking` + additive `rankingByTotal`, runs unboosted counterfactual from same `lastId`. **GAP:** absent/excluded cursor scans score-ordered band instead of ordinal ID order (`:155`).
6. Downstream `phase-plan.ts:172-245`: **GAP (scheduled for B07):** still cuts model-offer band on raw `score` instead of `total`, which can drop `spread.pick`.
7. `RouteDecideResultSchema` (`route-decide-result.schema.ts:72-340`): Parses legacy fixtures and new optional trace fields / fallback causes. **GAP:** `ExclusionRuleSchema` allows arbitrary chars after `user-rule:` (`:74`); `ScorePartsSchema` lacks optional AM3 override label (`:97-106`).

## Requirements Fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Additive score `total = prior + learned + preference + limit (+ override)` | COMPLETE | — |
| Learned clamp `[-15, 15]` + exploration `+5` below 3 runs; user cell zeros learned/exploration | COMPLETE | — |
| Preference boost `12/8/4/2` from one source (`rule > call > configured`, AM2) | PARTIAL | Empty `[]` higher-precedence list suppresses lower sources (`preference-match.ts:77-86`) |
| 4-tier preference matching (`id`, folded `displayName`, `family`, `cli`), ambiguous/ineligible no boost | PARTIAL | Blank selector not short-circuited (`preference-match.ts:36`), `candidateDisplayName` doesn't trim blank `displayName` (`candidate.types.ts:58`) |
| Limit adjustment (`0/-5/-10`, `at-limit` excluded) | COMPLETE | Missing defensive guard for unexpected runtime limit states |
| Sort order (`total`, `preferenceRank`, `limitClass`, `executorKind`, `id`) & 5-point rotation (`ranking` vs `rankingByTotal`) | PARTIAL | Absent-cursor fallback scans score-ordered band instead of ordinal ID order (`spread.ts:155`) |
| AM3 named override in `parts` | PARTIAL | `ScorePartsSchema` (`.strict()`) has numeric `override` only, no label field (`route-decide-result.schema.ts:97-106`) |
| Legacy 0–100 `score` unchanged & legacy fixtures parse | COMPLETE | — |
| `user-rule:<id>` exclusion schema | PARTIAL | Suffix unconstrained (`z.string().min(1)`) allows `;`, `\n`, whitespace (`route-decide-result.schema.ts:74`) |

## Edge Cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| `sampleCount` = 0, 2, 3 | YES | `sampleCount < 3` gives +5, 3 gives 0 (`score.ts:211`) | None |
| User cell + local + seed all present | YES | `user` sets `prior`, zeros `learned` and `exploration` (`score.ts:209-215`) | None |
| Negative additive totals in band | YES | `insideClosenessBand(top, total)` uses `top - total <= 5` | None |
| `at-limit` candidate passed to `spread` | YES | Filtered before ranking/selection (`spread.ts:72-74`) | None |
| `at-limit` candidate passed to `scoreResolvedCell` | YES | Throws fail-fast error (`score.ts:217`) | None |
| `rulePrefer: []` or `callPrefer: []` | NO | Treated as present source (`preference-match.ts:78-79`) | Silently drops lower-precedence preferences |
| Absent rotation cursor with non-alphabetical band | NO | `band.find(e => e.candidate.id > lastId)` (`spread.ts:155`) | Skips true ordinal successor |
| Non-empty unmatched preference (`['hot']`) | YES | Does not fall through to configured order (`spread.spec.ts:482`) | Preserve when fixing empty `[]` |
| Duplicate aliases in preference list | YES | First occurrence wins, later marked `duplicate` (`preference-match.ts:47`) | None |
| Legacy `GateResult` / `PreflightResult` fixtures | YES | New fields optional; 52/52 contract tests pass | None |

## Verdict

- **Recommendation:** REVISE
- **Confidence:** HIGH
- **Top risk:** Empty preference arrays (`rulePrefer: []` / `preferences: { prefer: [] }`) silently suppressing configured/call preferences, and absent-cursor rotation skipping candidates in score-ordered bands; additionally, G1 must remain paired with B07 so `phase-plan.ts` does not drop boosted `spread.pick` candidates when building decision-model offers.
- **What a robust implementation would add:** Fix Findings 1, 2, 4, 5, 6, and 7 (plus Minor Finding 8) before accepting G1, and track Finding 3 as a mandatory B07 verification gate before release.
