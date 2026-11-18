# Code Logic Review (Claude) - TASK_2026_2272_4859

Vendors: Codex wrote the implementation and the tests. Claude (this review) read the code and ran the specs.

## Verdict: FAIL - score 72/100

The logic is sound. Two new spec files do not compile (TS4111), so they do not run. Fix the tests first.
After the test fixes, the feature is safe for release, with the Medium findings below accepted or fixed.

## Test run evidence (focused jest, runInBand)

| Spec | Result |
| --- | --- |
| skill-ranking-caller.service.spec.ts | FAIL to compile: TS4111 at lines 65, 77 (`.angular`, `.next` read from an index signature) |
| skill-ranking.service.spec.ts | FAIL to compile: TS4111 at many lines (63-126+, `.angular`, `.next`) |
| skill-recommendation.service.spec.ts | PASS (38 tests across the passing suite) |
| harness-llm-runner.service.spec.ts | FAIL to start: `node_modules/marked/lib/marked.umd.js` is missing in this worktree (environment, not a code defect) |

## Key review points

1. Per-item fallback - PASS. `accept()` (skill-ranking.service.ts:99-116) parses each item alone. A bad item keeps `rankedBy: 'heuristic'`. The caller skips an item whose `answer.cause !== null` (skill-ranking-caller.service.ts:115).
2. Privacy and injection - PASS with notes (see F1, F2, F3). Evidence is never in the ranking request. Names, source, skillId and descriptions pass through `skillRankingText`, which strips tags, `javascript:`, URLs and absolute paths, and caps at 200 characters.
3. Timeouts - PASS. Both `Promise.race` calls always settle. Timers are cleared in `finally` (caller:148-150, service:43-45). The late rejection of the loser is handled by the race.
4. Per-item Zod validation - PASS. `skillRankingItemSchema(labels)` runs for each key (service:106-108). It rejects unknown labels and duplicate labels in the model order.
5. Session model - PASS. `toolAccess: 'none'`, `outputFormat: json_schema` with per-item label enums, `mcpServerRunning: false`, no tools, a scratch `cwd` removed in `finally`.
6. State after fallback - PARTIAL (F4). `rankedBy` and `rank` are always set (recommendation:279, 301-303). `reason` is absent for heuristic items.

## Security review points

| Point | Result | Evidence |
| --- | --- | --- |
| Decision model only for `system-one` or `structured` | PASS | caller:41-45 returns null for any other kind |
| No workspace path in the decision request | PASS | caller builds `questions` only from kind, name, candidates; `workspaceRoot` is not used |
| No descriptions/evidence/URLs/paths in session prompt | PARTIAL | Evidence is excluded. URLs and absolute paths are stripped. Descriptions ARE sent (sanitized, 200 characters). See F1 |
| Descriptions capped at 200 | PASS | types:33 `.slice(0, 200)` (applied in the service and again in the caller) |
| JSON output validated with Zod | PASS | envelope + per-item schema |
| Duplicate labels rejected | PASS for model output (schema.ts:16). NOT checked for input labels (F5) |
| Unknown labels cause per-item fallback | PASS | `refine` fails that item only |

## Findings

| # | File:line | Type | Severity | Evidence | Fix or acceptance |
| --- | --- | --- | --- | --- | --- |
| F0 | skill-ranking-caller.service.spec.ts:65,77; skill-ranking.service.spec.ts:63-126+ | Test compile error | High (blocks release gate) | TS4111, `noPropertyAccessFromIndexSignature` | Use `result.items['angular']` bracket access |
| F1 | skill-ranking.service.ts:158 | Policy gap | Medium | `prompt: JSON.stringify({ items: remaining })` includes `description` | Accept (descriptions are needed to rank, and they are sanitized and capped) and update the requirement text, or remove `description` from the prompt |
| F2 | skill-ranking-caller.types.ts:25-34 | Weak sanitizer | Low | Relative paths (`../x`, `~/x`, `src\a`), unclosed `<img onerror=` and HTML entities are kept | Accept: output is treated as data and is never rendered as HTML here. Optionally strip `~/`, `..` paths |
| F3 | skill-ranking.service.ts:158-160 | Residual injection risk | Low | Candidate text can contain instruction words. Mitigated by "untrusted data" wording, `toolAccess: 'none'` and enum-only output | Accept |
| F4 | skill-ranking.service.ts:80-91 | Missing field | Low | Heuristic items have no `reason` (the schema default only applies to model-ranked items). The recommendation code treats `reason` as optional | Accept, or add a fixed heuristic reason |
| F5 | skill-ranking.service.ts:87; caller.service.ts:56-70 | Input not checked | Low | Duplicate input labels are deduplicated silently by `new Set` | Accept: labels come from indexes in skill-recommendation.service.ts:226 |
| F6 | skill-ranking-caller.service.ts:82-86 | Questionable bound | Low | `Math.min(..., DECISION_RETURN_MARGIN_MS)` caps the system-one timeout to 250 ms, not about 2750 ms. Probably a typo for a larger bound | Confirm intent. Remove the third argument if 2750 ms was meant. If 250 ms is intended, add a comment |
| F7 | skill-ranking.service.ts:122-131 | Redundant timer | Info | The service deadline equals the caller deadline (3000 ms), so they tie. The result is the same on both paths (heuristic order) | Accept |
| F8 | skill-ranking.schema.ts:24-25 | Dead code | Info | `reason === undefined` is never true after `.default()` | Remove the conditional |
| F9 | service:122-131, 148-168 | Uncancelled work | Info | After a timeout, the model request keeps running until its own limit | Accept (bounded by provider timeouts) |

## DI wiring

- lane-routing `register.ts:81-89`: the caller is a cached factory with `DECISION_CALLER` and the logger. Correct.
- rpc-handlers `di/register.ts:31-32`: `SKILL_RANKING_SERVICE` uses `SkillRankingService`. Both model dependencies are `isOptional`, so a missing model gives heuristic output. Correct.
- Recommendation integration (recommendation:236-249, 250-283) catches ranker failures and works from `ranking?.items[...]`. Correct.

## Release safety

Not releasable until F0 is fixed and the four specs run green (run the harness spec in an environment with `node_modules` installed). After that, no blocker remains. Decide F1 and F6 before merge.
