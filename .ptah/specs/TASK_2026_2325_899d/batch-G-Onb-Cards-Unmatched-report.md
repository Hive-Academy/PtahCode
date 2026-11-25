# Report — G-Onb-Cards-Unmatched (W10)

## Files changed (FO = libs/frontend/onboarding/src/lib/proposal/)
- `skill-pick-card.component.ts/.html/.spec.ts`
- `unmatched-stack-list.component.ts/.html/.spec.ts`

## Plan items done
- R22/F24 (plan 3.6 line ~550, 3.7 R22 row): compact Install card with name, source, one-line description,
  covers badges, ONE-line reason; native "More"/"Less" button (`aria-expanded`, `aria-controls`) reveals full
  description, full reason, all covers and script note in place. Name wraps on word/hyphen only
  (`overflow-wrap: normal; word-break: normal; hyphens: none`). Action row is flex-wrap with a
  `flex: 0 0 auto; max-width: 100%` button, so "More" stays inside the card.
- R19: description id and details id are unique per card instance (counter), no longer derived from the skill.
- Unmatched list (plan section 9 line 204, 3.7 manual-draft and R16 rows): no auto draft form
  (`ProjectSkillDraftComponent` import removed, D5); judged mode lists items with no Install outcome
  (Build, No-skill, no verdict) with reasons and badges; "Write a skill by hand" output on every row.

## Contract for G-Onb-Review
`ptah-skill-pick-card` new optional inputs (old inputs unchanged; unjudged card renders as before):
- `compact: boolean` (default false). Set `[compact]="true"` for judged Install cards.
- `reason: string | null` (Install outcome reason), `scriptNote: string | null`.
`ptah-unmatched-stack-list` new members:
- input `judgedItems: readonly SkillJudgeItem[] | null` (default null = unjudged behavior, uses `items`).
  Pass `judge.items` in judged mode; the list filters out items that have an Install outcome.
- input `draftBlockedReason: string | null`: shows the text and ignores opener clicks (F29).
- output `manualDraftRequested: ManualDraftRequest` = `{ itemId: string | null; item: StackSummaryItem; opener: HTMLButtonElement }`
  (`itemId` is null in unjudged mode). Exported types: `UnmatchedRow`, `ManualDraftRequest`.
- Existing `searchRequested` output unchanged.
The review component must wire `manualDraftRequested` to the store `openDraft` (key `'manual:' + itemId`).

## Checks
- jest (both specs): 2 suites, 13 tests passed.
- `tsc --noEmit -p libs/frontend/onboarding/tsconfig.lib.json`: no errors.
- eslint on the 4 changed .ts files: clean. Prettier applied.

## Decisions
- Compact mode is an explicit `compact` input (not inferred from `reason`): keeps the team-builder card unchanged. Reversible.
- Plan line 204 wins over "keep today's draft form" in unjudged mode: the auto draft form is removed in both modes;
  the "Write a skill by hand" button replaces it (spec asserts 0 `ptah-project-skill-draft`). Reversible.
- Judged list shows No-skill and not-judged items too (no Install outcome), since the brief says "Build verdict or no verdict".
  Not-judged items may duplicate `ptah-skill-not-judged-row`; Review should pass only one of them per item. Reversible.
- "More" has `aria-label` "More about <name>" / "Less about <name>" (contains visible text). Reversible.

## Open items
- `stack-skill-review.component.html:266` still passes only `items`/`searching`; its draft form disappears now, and
  Review must wire `judgedItems`, `draftBlockedReason`, `manualDraftRequested`, and `compact`/`reason`/`scriptNote` on cards.
- `SkillShEntry` has no script data; Review must compute `scriptNote` from another source.
- Visual check in Electron not run (focused lane).

## Extra reads
rpc-skill-judge.types.ts, rpc-agents.types.ts (SkillShEntry), skill-not-judged-row.component.ts, stack-skill-review.component.html (lines 170-285).
