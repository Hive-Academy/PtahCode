# Batch report — G-Onb-Shell-Pill (TASK_2026_2325_899d)

Status: done.

## Files changed

- M `libs/frontend/onboarding/src/lib/shell/onboarding-run-pill.service.ts`
- M `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts`
- M `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.spec.ts`

## Plan items done

- Design-spec 3.1 (lines 63-76), F26 attribution + visible stage badges; plan
  `implementation-plan.md:191` (F26 single-owner row) and `:197` (badge contract) and
  `:570` (spec requirement name).
- `onboarding-run-pill.service.ts` now exposes
  `badges: Signal<ReadonlyArray<{ key; label; pair; status: 'used' | 'failed' }>>`
  derived ONLY from recorded snapshots:
  - `recordRun({ analysisPair, stages })` copies the immutable `analysisPair`
    (`ModelPair | null`, from `@ptah-extension/shared`) and the
    `SkillJudgeStageRecord[]` at run acceptance. A later Setup change or caller
    object mutation never rewrites them (snapshot copies of every pair).
  - Analysis badge: `Analysis: <provider> / <model>` when `analysisPair` is set.
  - Stage badges: a stage with status `used` shows `pairUsed` as
    `<Decision|Normal> stage: <provider> / <model>`; a failed stage shows
    `pairAttempted` as `... stage: attempted <provider> / <model>`
    (design-spec line 69). `skipped` stages and stages without a recorded
    pair show no badge (F26: a stage with no record shows no pair).
  - Decision + Normal collapse into one badge when pair and status are equal
    (design-spec line 71): `Decision + Normal stage: <pair>`.
  - No `any`; types `ModelPair` and `SkillJudgeStageRecord` imported from
    `@ptah-extension/shared` (re-exported through `rpc.types.ts:128`).
- `onboarding-shell.component.ts` (pill block at the former lines 68-76) renders
  each badge inside the pill container
  (`data-testid="onboarding-run-pill"`; each badge
  `data-testid="onboarding-run-pill-badge"`); failed badges carry the title
  "Provider and model attempted for this run". The plain-label
  `show`/`clear` behavior for runs without a pair is unchanged (acceptance:
  without a pair it keeps today's text).
- `onboarding-shell.component.spec.ts`: kept the existing label test; added
  `renders immutable analysisPair and deduplicated stage badges` (exact name
  from plan line 570, including post-record mutation of the caller's
  snapshots), the differing-pairs / failed-attempted / skipped-no-badge case,
  and the empty-pairs + label-replaces-badges + clear case.

## Check commands and results

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand
  --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.spec.ts`
  — PASS: 1 suite, 16/16 tests (36.8 s).
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
  — PASS: no errors.
- `npx eslint` on the 3 changed files — PASS: 0 errors, 5 warnings
  (`@typescript-eslint/explicit-member-accessibility` on the service members).
  The neighboring `onboarding-announcer.service.ts` uses the same
  no-modifier style, so the warnings match the folder's existing pattern.

## Decisions

- Merged-badge label text: when the Decision and Normal pairs are equal the
  spec (line 71) demands one badge but names no label. Options: "Stages",
  "Judging", "Decision + Normal stage". Chosen: "Decision + Normal stage" —
  it reuses the "Decision stage"/"Normal stage" vocabulary of design-spec
  line 69 and stays unambiguous with two stages. Reversible (one string in
  `onboarding-run-pill.service.ts`).
- Failed-stage text: "attempted <pair>" (design-spec line 69) with status
  `'failed'` on the badge; a used stage shows the bare pair (the pill text of
  line 69 shows no "used" prefix). Reversible.
- `show(label)` clears recorded pairs and `recordRun` clears the plain label:
  the pill shows exactly one of the two states. No spec text names the
  combination; exclusivity avoids two contradicting pills. Reversible.
- `recordRun` is the recording API for pages/stores; no production caller is
  wired in this group because the store/pages belong to other groups (G-Onb
  Store-Coverage, Review, Judge-Parts own those files). Their briefs do not
  name the pill, so the coordinator must wire `recordRun` (store with
  `analysisPair` + `judge.stages`) or amend. Reported under Open items.

## Open items and needed changes in other groups

- No lane currently calls `recordRun`. Whoever owns
  `proposal/stack-skill.store.ts` (G-Onb-Store-Coverage) or the analyze pages
  should call `OnboardingRunPillService.recordRun({ analysisPair, stages })`
  when a run with recorded pairs is accepted, and `clear()` when the run ends
  or the page is left. No file change is required in this group for that.
- The Decision badge appears only when a decision stage record exists
  ("Not configured" runs have `stage: 'decision', status: 'skipped'`, which
  renders no badge), per design-spec line 75.

## Extra reads

- `.ptah/specs/TASK_2026_2325_899d/implementation-plan.md` — searched lines for
  `run-pill`, `badges`, `analysisPair`, `pill` (rows 191, 197, 204, 286, 570)
  beyond the assigned range 175-206; read batch row 286 for the scoped specs.
- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts` (grep only, for
  `ModelPair` usage context).
- `libs/shared/src/index.ts`, `libs/shared/src/lib/types/rpc.types.ts` (grep
  only, to confirm `rpc-skill-judge.types.ts` is re-exported through
  `@ptah-extension/shared`).
- `libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts`
  (style reference for the accessibility-modifier lint warnings).
- `git log`/`git diff --stat` on the shell folder (read-only, to confirm no
  production caller of `show` exists today).
