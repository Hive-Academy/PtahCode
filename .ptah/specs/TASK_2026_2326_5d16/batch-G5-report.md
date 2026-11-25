# Batch G5 report — router documentation and skills (B12)

Group G5 documents what the `ptah_route_decide` router now does. Every claim below
was read from the code before it was written. No Nx, no build, no git writes.

## Files changed

| File | Change |
| --- | --- |
| `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md` | New section `## How the router decides` with subsections `### Scoring`, `### Preferences`, `### Explanations and candidate traces`, `### Routing rules`, `### Deadline and fallback causes`, `### Capability matrix`. Inserted before `## CLI lanes and required skills`. Existing content kept. |
| `.claude/skills/orchestration/references/lane-assignment.md` | New paragraph inside `## Gate 0.1 outcome` (after the call paragraph, before "Each chosen roster row returns"): preference selectors, boost, explanation, candidate dispositions, `user-rule:<id>`, trace compaction. |
| `plugins/ptah-core/skills/orchestration/references/lane-assignment.md` | Same paragraph. Copy is byte-identical to the `.claude` copy. |
| `.claude/skills/agent-lanes/SKILL.md` | In `## 2. Address`, after "pass only the documented parameters" and before the `Routing:` reminder sentence: how to consume the chosen row (`explanation`, `candidates[]`, top-level `excluded`, `fallbackCause`). All existing spawn instructions preserved. |
| `plugins/ptah-core/skills/agent-lanes/SKILL.md` | Same insertion. Edited section identical to the `.claude` copy. |

Nothing outside this set was modified. The `libs/backend` modifications in the
worktree belong to other lanes.

## Claim → source

### Scoring (docs `### Scoring`)

| Claim | Source |
| --- | --- |
| `total = prior + learned + preference + limit` | `libs/backend/lane-routing/src/lib/ranking/score.ts:234` |
| `prior` = user cell, else seed cell, else 50 | `score.ts:209`; `NEUTRAL_SCORE = 50` at `routing-constants.ts:21` |
| `learned` = local minus prior, capped at ±15 | `score.ts:214-215`; `LEARNED_DELTA_CAP = 15` at `routing-constants.ts:24` |
| `exploration` +5 when no user value and fewer than 3 runs | `score.ts:211-213`; `EXPLORATION_BONUS = 5`, `EXPLORATION_MIN_SAMPLES = 3` at `routing-constants.ts:27,30` |
| preference boost 12, 8, 4, 2 for rank 1, 2, 3, 4+ | `routing-constants.ts:33`; `preferenceBoost` at `score.ts:238-241` |
| limit 0 / −5 / −10 for confirmed-room / unknown / near-limit; at-limit excluded before scoring | `routing-constants.ts:39-43,82`; `spread.ts:80-82`; `score.ts:216-217` |
| matrix cell scores are 0-100 integers | `routing-constants.ts:16-18`; `score.ts:249-253` |
| additive total not clamped | `score.ts:234` — no clamp on the sum (see Decisions) |
| listed model used only when its cell beats the family cell by more than 5 | `score.ts:156`; `CLOSENESS_BAND = 5` at `routing-constants.ts:67` |
| else configured model, else `lane-default` | `score.ts:167-184` |
| `visual-review`/`design` subagent gets an `override` part lifting total to 100 | `pipeline/phase-plan.ts:256-274` (`totalOverride` target `SCORE_MAX`); preserved-parts logic in `ranking/spread.ts:131-156` |

### Preferences (docs `### Preferences`)

| Claim | Source |
| --- | --- |
| selector matches id, display name, family, CLI | `ranking/preference-match.ts:34-38` |
| display names come from the lane row (`ptahCliName` or id) | `ranking/candidate.types.ts:55-64,124` |
| earlier entries rank higher, boost grows | `preference-match.ts:41-44` (rank = index + 1) |
| boost changes the total, never pins | `spread.ts:123-172`; pin handled separately at `pipeline/phase-resolve.ts:41-48` |
| diagnostics: blank, unknown, ambiguous, duplicate, ineligible | `preference-match.ts:12-19`; `reasons/compile-reasons.ts:464-486` |
| source order rule > call > configured | `preference-match.ts:91-96` |

### Explanations and traces (docs `### Explanations and candidate traces`)

| Claim | Source |
| --- | --- |
| one-sentence explanation: selected, model, total + parts, runner-up + gap, deciding factor, preferences, policy, limit | `reasons/compile-reasons.ts:568-579` (`compileChosenExplanation`), parts format at `:388-404` |
| `reason` ends with the policy clause | `pipeline/assemble-gate.ts:334-341` |
| reason clause order (phase, executor, model, score, provenance, limit, rotation, preference, probability, fallback) | `compile-reasons.ts:601-621` with `:290-303,316-342,344-347` |
| dispositions chosen / ranked / excluded | `contracts/route-decide-result.schema.ts:119` |
| built-in exclusion rules list | `route-decide-result.schema.ts:33-42` |
| `user-rule:<id>` | `route-decide-result.schema.ts:73-80`; `pipeline/phase-plan.ts:512` |
| pruned causes below-band / option-cap / payload-fit | `route-decide-result.schema.ts:81` |
| top-level `excluded` rows carry candidate + rule | `route-decide-result.schema.ts:134-141` |

### Routing rules (docs `### Routing rules`)

| Claim | Source |
| --- | --- |
| setting key `agentOrchestration.routingRules` | `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:315`; reader at `scope/routing-rules-setting.ts:319-344` |
| rule shape `id` / `match` / `set` | `routing-rules-setting.ts:60-85` |
| AND across fields, OR inside a field, empty match matches all | `routing-rules-setting.ts:298-316` |
| at most 64 rules, 32 selectors per list | `routing-rules-setting.ts:24-25,49-51` |
| selector 1-200 chars, id `[A-Za-z0-9._-]{1,64}` | `routing-rules-setting.ts:49-51,81`; `routing-constants.ts:36` |
| `set` needs at least one field; minTier not above maxTier | `routing-rules-setting.ts:144-152,230-241` (tier order :31-35) |
| invalid rule dropped with diagnostic, valid rules keep order | `routing-rules-setting.ts:208-256` |
| `decisionModelPrefillTokensPerSecond` sets the rate used for the cost estimate | `decision-model/decision-caller.ts:137-147`; wiring at `di/register.ts:222-224` |
| `decisionModelTimeoutMs` is an upper bound, 1000-60000 ms | `rpc-agents.types.ts:306-309`; `Math.min` with the remaining deadline at `decision-caller.ts:119` |

### Deadline and fallbacks (docs `### Deadline and fallback causes`)

| Claim | Source |
| --- | --- |
| gate 8 s, pre-flight 4 s, deadline set at tool entry | `routing-constants.ts:46`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts:203-210` |
| 250 ms return reserve | `routing-constants.ts:49`; `route-decide.service.ts:178-179` |
| deterministic ranking decides when time runs out | `pipeline/phase-resolve.ts:65-77` (`fallback(...)` keeps the ranking pick); `route-decide.service.ts:396,416` |
| System One call takes at most 2 questions, rest ranked `question-cap` | `routing-constants.ts:52` (`DECISION_QUESTIONS_PER_CALL = 2`); `pipeline/model-refine.ts:178-181,230-233`; `phase-resolve.ts:75` |
| cost estimate `promptTokens * 1000 / rate + 250 ms` | `pipeline/model-call.ts:107-117`; `DECISION_RETURN_MARGIN_MS = 250` at `routing-constants.ts:149` (see Decisions) |
| rate = configured setting else measured EWMA (alpha 0.3) | `decision-caller.ts:130-133,137-147`; `pipeline/prefill-rate.store.ts:1,22-35` |
| one in-flight request per target → `model-busy` | `model-call.ts:106`; `prefill-rate.store.ts:12-16` |
| `model-cold` only after a residency probe of a local daemon target | `route-decide.service.ts:397-408` (locality `local` + probe `daemon`, `GET /api/ps`) |
| fallback cause list (12 entries) | `route-decide-result.schema.ts:19-32` |
| low-confidence threshold 0.5 | `routing-constants.ts:190` |
| byte cap (payload-too-large), shrink stops at 2 options | `routing-constants.ts:127,193`; `model-refine.ts:175-184` |

### Capability matrix (docs `### Capability matrix`)

| Claim | Source |
| --- | --- |
| `~/.ptah/routing/capability-matrix.json` user file, `capability-matrix.view.json` generated view | `matrix/capability-matrix.store.ts:45-51,70-76` |
| user file written once as empty template, never rewritten | `capability-matrix.store.ts:47-48,62-66` |
| precedence user > local > seed > unknown | `capability-matrix.store.ts:36-38`; `matrix/matrix.types.ts:20` |
| family-level profile model `*` | `matrix/matrix.types.ts:14`; `score.ts:68-72` |
| one cell per task kind, six kinds | `matrix/matrix.schema.ts:87-96` |
| value cell: 0-100 score, source, asOf, stale; seed needs sourceRef + note; local needs sampleCount, no sourceRef | `matrix.schema.ts:28-79` |
| stale after 180 days | `routing-constants.ts:211-212` |

### Skill additions

| Claim | Source |
| --- | --- |
| lane-assignment: selectors, boost 12/8/4/2, no pin, explanation contents, dispositions, `user-rule:<id>` | as above (`preference-match.ts:34-44`, `compile-reasons.ts:568-579`, `route-decide-result.schema.ts:33-42,73-80`) |
| trace compaction: chosen + best alternative kept first, then explanations shortened to 96 chars, then dropped | `route-tool-handlers.ts:100-182` (`shortlistTrace` :100-121, `maxExplanationChars = 96` at :164, counts-only and bare passes :173-181) |
| agent-lanes: consume `explanation`, `candidates[]`, top-level `excluded`, `fallbackCause`; a cause on a chosen row means ranking decided | `route-decide-result.schema.ts:19-32,114-141`; `phase-resolve.ts:65-77` |

## Examples checked

All four JSON examples in the docs were parsed with the repo's own validators
(`.ptah/tmp/g5/validate-examples.ts`, run with `ts-node --transpile-only -r
tsconfig-paths/register`):

| Example | Validator | Result |
| --- | --- | --- |
| chosen phase row (with `candidates[]`, `reason`, `explanation`) | `ChosenEntrySchema`, `contracts/route-decide-result.schema.ts:195` | VALID |
| capability-matrix profile | `CapabilityMatrixSchema`, `matrix/matrix.schema.ts:106` | VALID |
| `routingRules` array (as the setting value) | `readRoutingRules`, `scope/routing-rules-setting.ts:159` | VALID (1 rule, 0 diagnostics) |
| gate call with `preferences.prefer: ["kimi code"]` | `RouteDecideArgsSchema`, `contracts/route-decide-args.schema.ts:67` | VALID |

The `reason` and `explanation` strings in the example match the real formats:
clause order from `compileChosenReason` (`compile-reasons.ts:601-621`), policy
suffix from `withPolicyReason` (`assemble-gate.ts:334-341`), explanation sentence
from `compileChosenExplanation` (`compile-reasons.ts:568-579`), score-parts format
from `formatScoreParts` (`compile-reasons.ts:388-404`, `signed` at :262-264).

## Skill copy diff results

- `orchestration/references/lane-assignment.md`: `.claude` and `plugins/ptah-core`
  copies are byte-identical after the edit (`diff` empty).
- `agent-lanes/SKILL.md`: the edited section (§2 spawn-args paragraph) is
  identical in both copies. A pre-existing divergence is untouched: the `.claude`
  copy has one extra paragraph (lines 125-127, `ptah_grep` / `ptah_read_symbol`)
  that the plugin copy lacks. It existed before this batch and is outside the
  edited section.

## Prettier

- `npx prettier --check` passes for the docs file and the `plugins/ptah-core`
  `agent-lanes` copy.
- The `plugins/ptah-core` `lane-assignment.md` copy fails `--check`. It also
  fails at HEAD (verified: `git show HEAD:<file> | prettier --check` exits 1) —
  pre-existing table padding. Restoring byte-identity with the `.claude` copy
  (which `.prettierignore:21` excludes) keeps the failure identical to HEAD
  instead of reformatting pre-existing tables in both copies.
- `prettier --write` normalized one pre-existing table in the docs file
  ("Skeleton and packs" step table). Content is unchanged, padding only.

## Decisions

1. **Total is not clamped to 0-100.** The task background said "total 0-100".
   The code sums parts without a clamp (`score.ts:234`); only the matrix cell
   score is a 0-100 integer (`routing-constants.ts:16-18`). The docs state the
   code behavior. Reversible: one sentence.
2. **Cost formula.** The background said `costMs = promptTokens / prefillRate +
   margin`. The code computes `promptTokens * 1000 / rate + 250`
   (`model-call.ts:109`). The docs state the code behavior (tokens per second
   scaled to milliseconds). No text quotes the arithmetic anyway.
3. **Two-question cap scope.** The cap of 2 applies to System One calls
   (`model-refine.ts:178-181`); structured output keeps 32
   (`QUESTIONS_PER_REQUEST`, `routing-constants.ts:139`). The docs sentence
   names System One explicitly.
4. **Prettier normalization scope.** For the skill copies, byte-identity with
   the pre-existing formatting won over prettier cleanliness, because the task
   requires identical copies and the plugin copy was already prettier-dirty at
   HEAD. The docs file, a single source, is left prettier-clean.
5. **Kept `question-limit` in the fallback table.** The background named
   deadline, question-cap, model-cold, model-busy. The schema also carries
   `question-limit` (structured question budget, `phase-resolve.ts:65-67`), so
   the table lists all 12 `FALLBACK_CAUSES`.

## Not done

Nothing from the write set is missing. The temporary validation script stays in
`.ptah/tmp/g5/` (git-ignored scratch area) as reproducible evidence.
