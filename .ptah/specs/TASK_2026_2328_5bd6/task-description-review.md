# task-description review

- Author: claude CLI lane
- Reviewer: ollama-cloud family (model `glm-5.3:cloud`)
- Revision reviewed: 1
- Round: 1

## Verdict: APPROVED

No Blocking or Serious finding remains. One Moderate finding (a citation range that does not
exist) and two Minor findings. All requirements trace to the user's words or to a cited project
rule. Acceptance criteria are testable and cover normal, invalid and dependency-failure cases.
The one behavior removal stays a proposal for the user. The open questions are user-intent
questions.

## Findings

1. **Moderate — C4, `matrix/outcome-figures.ts:91-118`.** The cited range does not exist. The
   file has 45 lines. The claim itself is true: the figures are keyed by
   `[laneId, taskKind]` with `delivered` and `failed` counts only (lines 32-44), and the
   companion citation `decision-payload.ts:42-47` is exact. Required change: replace the range
   with `outcome-figures.ts:17-45` (or `:32-44`).
2. **Minor — C1/C2, `matrix/local-derivation.ts:147` and `:172-177`.** The claims are true, but
   the line ranges are slightly off. The key `JSON.stringify([summary.family, model, taskKind])`
   is line 148, not 147. The `lane-default`/`auto` to family profile `*` mapping
   (`matrixModelKey`) is lines 168-173, not 172-177. Required change: align both ranges. No
   behavior claim changes.
3. **Minor — FA6 and the in-scope row "Electron settings visibility".** The user words do not
   ask for a settings page, and no cited project rule requires one. The section is a reasonable
   extension (C6 documents the existing matrix page, and Q3 option A needs a turn-off setting),
   but the document does not mark it as author-introduced. Required change: mark the FA6 scope
   row and criteria as lane-proposed, as this review lists below.

No finding is Blocking or Serious, so the verdict is APPROVED.

## Citation spot-checks

| Citation | Result |
| --- | --- |
| C1 `ranking/score.ts:199-236` (additive `prior + learned + preference + limit (+ override)`) | Accurate (line 234) |
| C1 `ranking/score.ts:209` (prior `user` → `seed` → `NEUTRAL_SCORE`), `routing-constants.ts:21` (50) | Accurate |
| C1 `ranking/score.ts:214-215` (learned delta cap ±15), `routing-constants.ts:24` | Accurate |
| C1 `ranking/score.ts:211-213` (exploration bonus, < 3 samples), `routing-constants.ts:27-30` (5, 3) | Accurate |
| C1 `matrix/local-derivation.ts:24-44`, `routing-constants.ts:220-224` (blend weight 10, 90-day window) | Accurate |
| C1 `matrix/local-derivation.ts:147` (keyed `[family, model, taskKind]`) | Claim true; key is line 148 (Minor, finding 2) |
| C1 `matrix/local-derivation.ts:172-177` (`lane-default`/`auto` → family profile `*`) | Claim true; mapping is lines 168-173 (Minor, finding 2) |
| C1 `matrix/seed-matrix.ts` header (only `implement` kind, only `z-ai`/`glm-5`) | Accurate (comment lines 15-18, 32; data lines 63-64) |
| C2 `ranking/score.ts:8-12`, `:127-132`, `:156` (band 5, configured, else `lane-default`) | Accurate (band check line 156) |
| C2 `ranking/score.ts:129-131` (system CLI lane never promoted) + `candidate.types.ts:66-78` (`isSystemCliLane` = every lane except `ptah-cli` and `claude`) | Accurate |
| C2 `routing-constants.ts:169` (`MODEL_LISTING_BUDGET_MS` 2000), `pipeline/gather.ts:501-537` (per-row race) | Accurate |
| C2 `gather.ts:485-490` (`models unknown for <lane> (<status>)`), `contracts/route-decide-result.schema.ts:83` (status union) | Accurate |
| C2 `cli-agents/lane-completion-outcome.ts:62` (`model: info.model ?? lane-default`) | Accurate |
| C2 `lane-outcome.types.ts:65-68`, `:85-86` (model stored as spawned) | Accurate |
| C3 `claude-cli.adapter.ts:167-177` (native catalog, empty on failure) | Accurate |
| C3 codex row, `cli-model-list.service.ts:60-72` (CLI catalog → `~/.codex/auth.json` → adapter list) | Accurate |
| C3 copilot row, `cli-model-list.service.ts:74-79` (host → auth → adapter) | Accurate |
| C3 grok row, `grok-cli.adapter.ts:227-231` (`grok models` probe) | Accurate |
| C3 antigravity row, `antigravity-cli.adapter.ts:465-475` (`agy` probe, throws on timeout) | Accurate |
| C3 ptah-cli row, `lane-model-listing.adapter.ts:9-11`, `:119-127` (saved config + shared provider discovery) | Accurate (header comment + `list` dispatch) |
| C3 `lane-model-listing.port.ts` (`LaneModelListing.list(row, signal)`, provenance union) | Accurate |
| C3 `cli-adapters/cli-adapter.interface.ts:470-485` (`laneEfforts`, `stoppedLaneCatalog`) | Accurate |
| C3 `decision-model/decision-model.catalog.ts:1-27` (Ollama tags/show, ollama-cloud, no host text in results or logs) | Accurate |
| C4 `lane-outcome.schema.ts:42-80` (`LaneOutcomeRowSchema`, all listed fields) | Accurate |
| C4 `lane-outcome.schema.ts:15-39` (report kinds `deliverables`, `review`) | Accurate |
| C4 "no effort field; no file in `lane-outcomes/src` refers to effort" | Accurate (grep: zero matches) |
| C4 `CAPACITY_FAILURE_CLASSES` in `local-derivation.ts` (`usage-limit`, `auth`, `timeout`) | Accurate (line 49) |
| C4 `lane-outcome.types.ts:122-140` (`LaneOutcomeSummary`, "Holds no text") | Accurate |
| C4 `matrix/outcome-figures.ts:91-118` + `decision-payload.ts:42-47` | `outcome-figures.ts` range wrong: file has 45 lines (Moderate, finding 1). `decision-payload.ts:42-47` exact. Claim true |
| C4 `pipeline/prefill-rate.store.ts` (in-memory prefill rate per target only) | Accurate |
| C5 `pipeline/tier-effort-policy.ts:29-40` (rules R1-R5) | Accurate (ruleId union line 9, `policyForPhase` line 29) |
| C5 `contracts/route-decide-result.schema.ts:202`, `:237` (result carries `effort`) | Accurate (both lines are `effort: ModelEffortSchema`) |
| C6 `capability-matrix-setting.component.ts:58`, `decision-matrix-page.component.ts` | Accurate (component decorator at 57-58; page file exists) |
| FA1.7 `lane-model-listing.adapter.ts:136-139` (blank id not listed) | Accurate (`push` trims and rejects blank, lines 136-139) |
| FA4.5 `score.ts:217` (at-limit excluded before scoring) | Accurate (throw at line 217) |
| FA4.7 `score.ts:209` (user prior precedence) | Accurate (a defined `user` layer also zeroes the learned delta, line 214) |
| FA4.8 `score.ts:4` (pure score) | Accurate |
| FA7.1 `route-decide-result.schema.ts:66-72` (`modelProposal` with option + confidence) | Accurate (`ModelProposalSchema` lines 64-70) |

The check covered 20 files and more than 30 citations. One citation range is wrong (finding 1).
Two ranges are off by a few lines while the claims hold (finding 2).

## Lane-introduced constraints

Requirements the author introduced without direct user words. Each is defensible, but the
document should label them:

1. **FA6 and the in-scope row "Electron settings visibility of catalog, funnel and choice
   reasons."** The user did not ask for a settings page. Basis is indirect: C6 shows the
   existing matrix page, and Q3 option A needs a turn-off setting (finding 3).
2. **FA1.3: the failure reason names the catalog age.** Catalog age is a new surface the author
   chose. Reasonable, but not in the user words.
3. **FA3.7: the funnel window must equal the score window.** A consistency choice by the author.
   Defensible.
4. **FA2.3: an explicit unknown value when a lane does not report the resolved model or
   effort.** The author chose "explicit unknown, not a guess". Defensible and safe.
5. **FA4.9: the reason names model, effort, sample count and evidence source.** An extension of
   today's explanation surface. Defensible.

Everything else traces to the user request ("automatically grasp each provider and thier
different model", "not always the same model", "any model effort", "real world data and
funnels"), to the context.md interpretation, or to a cited project rule (CLAUDE.md
Electron-first, the privacy rules in `decision-model.catalog.ts` and `lane-outcome.types.ts`,
the verification rules).

## Checks against the review list

1. **Tracing.** All in-scope items and FA1-FA7 trace to the user words, the context.md
   interpretation, or a cited project rule. The five lane-introduced items are listed above.
2. **Testability.** Each criterion states a condition and an observable behavior (route result
   fields, row fields, reason strings, settings page state). FA1, FA2, FA3, FA5, FA6 and FA7
   cover invalid and dependency-failure cases explicitly; FA4 covers zero-sample, at-limit and
   model-gone cases. FA3 has no dependency-failure criterion, but its reader has no external
   dependency, so none applies.
3. **Citations.** Checked in the table above. One wrong range (finding 1); two small offsets
   (finding 2); the rest exact.
4. **Scope consistency.** In-scope and out-of-scope do not overlap. The out-of-scope row for
   the main model's explicit spawn matches the user statement that the main model can already do
   it. The document fixes requirements and observable behavior, and hands the snapshot design,
   the exploration bound, the funnel stage list and the key layout to the architecture phase.
   No implementation is prescribed.
5. **Thresholds and removals.** Every number in the document is an existing constant, verified
   in `routing-constants.ts` and `tier-effort-policy.ts`. The document states that the
   architecture phase sets any new number. The only behavior removal (the system CLI promotion
   block, `score.ts:129-131`) stays in Proposed Removals as a proposal, and Q3 asks the user
   for the authority of the automatic choice.
6. **Open questions.** Q1 (merge stage in the funnel), Q2 (effort as a scored dimension),
   Q3 (automatic choice vs suggestion) and Q4 (System One inclusion) are user-intent questions.
   None is code-answerable, and each has a recommendation.
