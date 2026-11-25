# G1 implementation report

`ptah_search_files` returned zero hits for the hidden task directory. A targeted `rg --files` lookup confirmed the supplied plan and RCA paths.

## B01

- Files changed under `libs/backend/lane-routing/src` include `index.ts`, `lib/routing-constants.ts`, `lib/contracts/route-decide-result.schema.ts`, `lib/contracts/contracts.spec.ts`, and `lib/route-candidate-source.port.ts`.
- New constants are `LEARNED_DELTA_CAP`, `EXPLORATION_BONUS`, `EXPLORATION_MIN_SAMPLES`, `PREFERENCE_BOOST`, `LIMIT_ADJUST`, `ROUTE_DEADLINE_MS`, `ROUTE_RETURN_RESERVE_MS`, and `DECISION_QUESTIONS_PER_CALL`. The barrel exposes both deadline constants and the question cap.
- New barrel types are `CandidateTrace`, `ScoreParts`, `LimitEvidence`, `ModelListStatus`, `PreferenceSource`, `PrunedCause`, and `UserRuleExclusion`. The candidate port now accepts optional `limitEvidence(rows)`.
- Added the following tests in `contracts.spec.ts`.
  - `round-trips legacy roster rows and exclusions without trace fields`
  - `round-trips signed totals, override parts and rule and pruning details`
  - `accepts the %s fallback on a chosen row and a pre-flight answer` for deadline, model-cold, model-busy, and question-cap
- Checks passed with Jest 52/52 tests in 1 suite, library TypeScript 0 errors, ESLint 0 errors across 5 files, and Ptah diagnostics 0 errors and 0 warnings. ESLint skipped `@nx/enforce-module-boundaries` because its project graph was unavailable.
- The amendments extend the result schema with four fallback causes, the override part, and preference-source metadata. Runtime deadline enforcement, the question cap, and model dispatch belong to downstream batches.
- No outside spec breakage identified in the scoped diagnostics. Outside suites were excluded from lane checks.

## B02

- Files changed under `libs/backend/lane-routing/src/lib` include `matrix/capability-matrix.store.ts`, `matrix/capability-matrix.store.spec.ts`, `ranking/score.ts`, and `ranking/score.spec.ts`.
- New module exports are `ScoreLayers`, `AdditiveCandidateScore`, `scoreResolvedCell`, and `preferenceBoost`. `scoreResolvedCell` supplies the shared calculation for downstream pins, live alternates, and the built-in override.
- Added the following tests.
  - `exposes independent score layers for the resolved profile without changing the effective cell`
  - `applies exploration to %i local runs with bonus %i` for 0, 2, and 3 runs
  - `suppresses learning and exploration for a user cell`
  - `caps negative legacy local learning and adds preference, limit and override points`
  - `promotes by additive total even when the effective cell scores order models differently`
- Extended `uses lane-default and the neutral score when the cell is unknown` to assert the neutral prior, exploration, and total.
- Final checks passed with Jest 45/45 tests in 2 suites, library TypeScript 0 errors, ESLint 0 errors across 4 files, and final Ptah diagnostics 0 errors and 0 warnings. ESLint skipped `@nx/enforce-module-boundaries` because its project graph was unavailable.
- The store always supplies layers and the scorer always supplies parts and total. The legacy structural types permit omission. An initial library check found the legacy fallback object in `pipeline/gather.ts` needed this compatibility, and the first Ptah diagnostics found the same issue in `pipeline/phase-plan.spec.ts`'s shared `plan()` fixture, used by `returns no decision options for an empty ranked list`, `offers only the five-point band to the decision model`, and `falls back to ranking when the band has one member`. The optional fields resolved both errors within G1.
- No remaining outside spec breakage identified. Outside suites were excluded from lane checks.

## B03

- Files changed under `libs/backend/lane-routing/src/lib/ranking` include `candidate.types.ts`, `preference-match.ts`, `preference-match.spec.ts`, `spread.ts`, and `spread.spec.ts`. Both preference-match files are new.
- New module exports are `candidateDisplayName`, `PreferenceMatch`, `resolvePreferences`, and `selectPreferences`. Spread results expose `preferenceSource`, `overriddenPreferenceSources`, and `preferenceMatches` along with the final ranking totals and preference ranks.
- Added the following tests in `preference-match.spec.ts`.
  - `gives an exact id priority over a colliding display name`
  - `trims and folds Kimi and Ollama display names before matching families`
  - `reports every id in an ambiguous family or CLI tier`
  - `keeps entry positions and reports unknown, duplicate and ineligible selectors`
  - `uses CLI, role and phase kind labels when there is no configured display name`
- Added the following tests in `spread.spec.ts`.
  - `rotates negative totals within five points of the actual maximum`
  - `breaks equal totals by preference rank, limit class, executor kind and ordinal id`
  - `compares the unboosted result from the original rotation cursor`
  - `reports the rule list and both overridden sources without stacking boosts`
  - `uses the full inventory to report ineligible preferences without falling through to configuration`
  - `replaces a carried preference part while retaining the override and legacy score`
- Updated existing spread assertions for total-ordered ranking, preference boosts across the previous band, mixed limit classes, and cursor behavior when the last lane becomes at-limit.
- Checks passed with Jest 40/40 tests in 2 suites, library TypeScript 0 errors, ESLint 0 errors across 5 files, and Ptah diagnostics 0 errors and 0 warnings.
- No outside spec breakage identified in the final diagnostics. Outside suites were excluded from lane checks.
- For pipeline integration, pass the full inventory as `inventory`, the matched rule list as `rulePrefer`, and scorer `total` with `parts` per ranked candidate. Use `pick` for rotation and `ranking` for descending totals. If a score already includes preference, pass its parts so spread can remove the carried preference and apply the single winning source. Preserve the built-in override as the numeric adjustment that raises the total to 100 where it applies, and render its label from the phase context. Keep the chosen model in-band and use the same scorer for pin and alternate cells in B07. Forward source, overrides, and match diagnostics to trace and explanation in B08.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Keep the legacy matrix and score input shapes assignable. | Required fields broke the gather fallback and a phase-plan fixture. Optional structural fields with producer guarantees satisfy the approved compatibility contract. | Yes, after downstream fixtures and callers all use the new shape. |
| Treat an explicitly supplied empty preference list as the selected source. | Falling through to a lower source would apply a list the caller or rule did not select. AM2 gives precedence to the presence of a higher source. | Yes, in `selectPreferences`. |
| Expose the sorted ranking and rotated selection separately. | Component 1 specifies ranking by total and rotation inside the band. The existing pipeline already reads `spread.pick` for the rotated selection. | Yes, through the spread result contract. |
| Use ordinal successor when the stored cursor candidate is absent or hard-excluded. | The rotation store retains an ID. A hard-excluded candidate has no eligible score or preference boost to place it in the current ordering. The ordinal fallback retains the existing cursor mechanism. | Yes, in the spread selector. |

## Open questions

None for G1. B06–B08 and the later service and model batches have their planned integration work.
