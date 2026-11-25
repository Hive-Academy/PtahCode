# Batch report — G-Onb-Judge-Parts (W9, TASK_2026_2325_899d)

Status: done. All six files created; focused checks pass.

## Files changed

- `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.ts` (CREATE)
- `libs/frontend/onboarding/src/lib/proposal/skill-method-banner.component.spec.ts` (CREATE)
- `libs/frontend/onboarding/src/lib/proposal/skill-verdict-filter.component.ts` (CREATE)
- `libs/frontend/onboarding/src/lib/proposal/skill-verdict-filter.component.spec.ts` (CREATE)
- `libs/frontend/onboarding/src/lib/proposal/skill-not-judged-row.component.ts` (CREATE)
- `libs/frontend/onboarding/src/lib/proposal/skill-not-judged-row.component.spec.ts` (CREATE)

No other file was edited.

## Plan items done

- Plan line 203 and batch row line 281: created the three presentational components with colocated
  specs (6 files).
- Plan line 188 (F23) and lines 569-570 (row 570): `skill-method-banner.component.ts` renders the
  one-line collapsed summaries — `"Judged by AI (decision model)"`, `"Judged by AI (normal model)"`,
  `"Judged by AI — X by decision, Y by normal"`, `"AI review is unavailable — showing registry
  order (N not judged)"` — with `detailsExpanded = false` by default, a disclosure button
  (`aria-expanded` + `aria-controls`), `"N not judged"` in the collapsed line for partial and none
  states, and expanded details (status badge, category, pair, items judged) sourced only from
  `SkillJudgeStageRecord` fields (`pairAttempted ?? pairConfigured`, `pairUsed`).
- Plan line 193 (F28) and lines 573: `skill-verdict-filter.component.ts` renders options with item
  counts (`All (12 items)` per design-spec 3.6 counting unit) and the `"N more candidates - Show
  all"` line (distinct hidden pool candidates given as `hiddenCandidateCount` input), which emits
  `filterChange('all')`.
- Plan lines 567 and 571: `skill-not-judged-row.component.ts` renders the Not-judged row with the
  failed-search disclosure (both-failed status: recorded `registryFailure` kind and reason, generic
  fallback without one) and the native `"Write a skill by hand"` recovery button as the
  `manualDraftRequested` output, with an accessible name that includes the item name.

## Check commands and results

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <the 3 new specs>` — 3 suites, 14 tests, all passed (7.2 s).
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` — no output, clean
  (including files of concurrent lanes at run time).
- `npx eslint <the 6 new files>` — no output, clean.

## Decisions

- Skill load denied. The brief assigns `angular-frontend-patterns`; the host reports it is "disabled
  for model invocation in skillOverrides settings". I followed the neighbor
  `skill-pick-card.component` patterns instead: standalone, `OnPush`, signal `input`/`output`,
  Tailwind utility classes with ptah tokens, `ptahBadge`/`ptahButton`. Reversible: relabel if the
  skill load is the gate for acceptance.
- Banner `none` summary with `notJudged === 0` omits the `(N not judged)` parenthetical; the plan
  string assumes N > 0 and `(0 not judged)` reads wrong. Reversible one-line change.
- Decision and normal summaries append `", N not judged"` when `notJudged > 0` (F23: "collapsed
  partial/none banner shows the count"). Row 570 spells this out only for mixed.
- Expanded details list ALL stage records, not only failed/skipped: design-spec 3.1 wants
  `"used <pair>"` for a stage that returned, so used stages show their `pairUsed`. Superset of row
  570's minimum.
- Stage category labels are the category with hyphens turned into spaces ("provider error",
  "timed out", "invalid output", "unavailable"). Design-spec section 8's four exact category
  strings are covered; the other categories stay truthful rather than guessed.
- The details region stays in the DOM with `[hidden]`, so `aria-controls` always resolves.
- `@for` in the banner uses `track $index`: the record list is parent-supplied and the plan does
  not forbid repeated stage records in synthetic input.
- The filter takes `options: { value, count }[]` from the parent and owns the labels. The value
  union is `all | install | build | no-skill | not-judged` (brief's "..." read as the
  design-spec 3.2 "No skill needed" verdict); the parent renders only the options it wants.
- The F28 line renders only when `active !== 'all' && hiddenCandidateCount > 0` (under All nothing
  is hidden); clicking it emits `filterChange('all')`, the same output as the option buttons.
- The not-judged row exposes only the `"Write a skill by hand"` output. Row 567 assigns this
  component that button; the per-item `"Search for <name>"` action stays with G-Onb-Review's row
  chrome.

## Open items and needed changes in other groups

- Needed export (brief asked to report it): `libs/frontend/onboarding/src/index.ts` does not need
  to change — the review page imports proposal components by relative path. But
  `G-Onb-Store-Coverage` needs the `SkillVerdictFilterValue` type for its `verdictFilter` state
  (plan line 177). It can import it from `./skill-verdict-filter.component`; if the coordinator
  prefers the type in the store file instead, move it there (reversible, no other consumers yet).
- G-Onb-Review wiring contracts:
  - Banner: inputs `method`, `counts` (from `SkillJudgeResult`), `stages`.
  - Filter: inputs `active`, `options` (value + item count), `hiddenCandidateCount`; output
    `filterChange` feeds the store's `verdictFilter`.
  - Not-judged row: input `item` (`SkillJudgeItem`); output `manualDraftRequested` must run the
    row 567 chain (F29 consent guard, R18 dirty-draft confirmation, then the store's `openDraft`).
- The `not-judged` filter count must count items with no decisive outcome (`judgedBy === 'none'`
  or empty `outcomes`); the store/review computes it, not this component.

## Extra reads

Beyond the brief's read set:

- `proposal/stack-skill-review.component.html` (lines 40-60) and `.ts` (filter wiring grep) —
  confirmed no existing verdict filter; the chip `filterChanged` there is the coverage-item filter.
- `libs/frontend/onboarding/src/index.ts` (head) — export conventions.
- `libs/frontend/ui/src/lib/badge/badge.types.ts`, `button/button.types.ts`,
  `button/button.directive.ts` — verified tone/variant/`selected` (aria-pressed) API.
- `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` — gap and space token names.
- `libs/shared/src/index.ts` and `lib/types/rpc.types.ts` — confirmed judge types are exported
  through `@ptah-extension/shared`.
- `tsconfig.base.json`, `tsconfig.lib.json` — strictness flags.
