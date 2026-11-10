# Code Logic Re-review — TASK_2026_896_9339

**Verdict: APPROVED.** Findings 1-11 are fixed or validly dispositioned. No Blocking or Serious
new defect. Two Minor new defects are listed below. Tests were read only and were not run.

## Findings 1-11

| # | Status | Evidence |
|---|--------|----------|
| 1 | Fixed | `ranking/score.ts:100-104`: `isSystemCliLane` (`candidate.types.ts:46-55`, excludes `ptah-cli` and `claude`) skips `promotedModel`. `fallbackModel` (`score.ts:139-159`) returns only the configured model or `lane-default`. A reported id reaches the row only through `resolution.selectedScore` (`phase-resolve.ts:70-81`), which comes from a valid `oN` label and an `alternates` entry. `assemble-gate.ts:130-133,339,354-358` read `selectedScore ?? row.scored` at all three places. |
| 2 | Fixed | `model-refine.ts:269-296`: per width, the full slice is tried first, then primaries only. Alternates never reduce primaries before width reduction. `offered` is the map that was sent (`sent` is derived from it, `figures`, `questions` and `payload` use `sent`). `sliceOptions` leaves out a phase with fewer than `MIN_OPTIONS_PER_PHASE` options (`:322-330`). `askedFromLane` filters by `offered` (`model-call.ts:51`). |
| 3 | Dispositioned | Decision 16. The `spawnFromSdkHandle` path has an explicit comment (`agent-process-manager.service.ts:1273`). Scope is system CLI lanes. Valid. |
| 4 | Fixed | `phase-resolve.ts:39-43`: `alternatesOnly` sets `fallback` to `cause: null`, `proposal: null` for question limit, blocked mode, request cause, a missing answer and a bad label. A valid answer still gives `source: model` (`:60-81`). Phases with at least 2 primaries keep the old cause behavior (`alternatesOnly` is false). |
| 5 | Fixed | `phase-plan.ts:262-288`: band filter (`insideClosenessBand`), then `sort` descending (stable on current Node, ties keep catalog order), then `slice(0, LANE_MODEL_ALTERNATES_CAP)`. The cap is per lane. |
| 6 | Fixed | New manager test `agent-process-manager.service.spec.ts:2377-2419`. Read against the real types: the telemetry object matches `agentTurnTelemetrySchema` (`shared/.../agent-turn-usage.types.ts:20-47`, strict, `source: 'sdk'` valid). `onSegment` is added to the same handle object. The two `await Promise.resolve()` ticks match the sibling test at `:2420-2440`. `completedAt` is set in `handleExit` before `signalLaneCompletion` (`agent-process-manager.service.ts:3347-3359`). No likely CI failure found. |
| 7 | Not in scope of this round | Test gap for R1 items. Decisions 13-15 add `live-model-options.spec.ts` and spec changes. Not examined in depth. |
| 8 | Fixed (see N1) | `.claude/skills/agent-lanes/SKILL.md` paragraph and `route-tools.ts:122-128` separate `claude` and `ptah-cli` rows (use `tier` as `modelTier`) from other system CLI rows, and say that pins win. The `.claude` and `plugins/ptah-core` copies carry the same change (`git diff --stat`: 10 lines each). Their other differences are older. |
| 9 | Dispositioned | Decision 17. The text now says row `effort` overrides the per-CLI effort setting. This matches the existing `resolveLaneEffort` order. |
| 10 | Fixed | `lane-model-log.ts:35-45`: `observedModelFrom` caps the id at 128 characters, rejects `pi`, `unreported` turns, `/unknown` and `/multi-model`. `requestedModelForLog` also caps at 128. |
| 11 | Fixed | `cli-model-list.service.ts:47-49`: an OpenCode id is a real model only when it has the `provider/model` shape. Other rows get `isFallback: true`. Cursor rows are no longer all marked fallback. |

## Answers to the five focus points

1. Finding 1 holds. `claude` and `ptah-cli` rows keep tier-based selection and promotion, as intended.
2. Findings 2 and 5: no off-by-one found. `sendable.sort` runs on a new array from `filter`
   (`route-decide.service.ts:346-350`), so no shared array changes. Phases left out of the request
   have `offered` without the phase, so `resolvePhase` returns `cause: null` (`phase-resolve.ts:56`).
   A phase with 2 or more primaries is never left out, because the width is at least 2.
3. Finding 4 holds (see table).
4. `takeOutcomeLog` logs once for each `completedAt` and returns `undefined` when `completedAt`
   is missing (`agent-process-manager.service.ts:3624-3631`).
5. Text and code agree, except for N1.

## New defects

1. **Minor — contract text says the deterministic row `model` is `lane-default`, but it can be the
   configured model.** `score.ts:146-152` returns the configured model id when the per-CLI setting
   is an own model id. Scenario: the user sets `agentOrchestration.codexModel` to a concrete id.
   The row shows that id, and the skill and tool text say `lane-default`. The effect is harmless
   (passing that id as `model` equals the setting), but the text is not exact. Fix: write
   "`lane-default` or the configured model" in `SKILL.md` and `route-tools.ts:122-128`.
2. **Minor — `fitLane` repeats an identical attempt when no phase has alternates.**
   `model-refine.ts:270` tries `primariesOnly: false`, then `true` at the same width. With no
   alternates, both give the same slice and the same byte size, so the second attempt cannot
   succeed if the first failed. This costs build time for payload, prompt and schema at each width.
   Fix: skip the `true` pass when `phases.every(p => p.options.length === p.primaryCount)`.

## Not verified

No test or typecheck ran (read-only rule). `live-model-options.spec.ts`, `lane-model-log.spec.ts`
and the R1 spec changes were not read line by line.
