# Batch 8 review B (badge adoption, read-only)

Scope: `git diff` in the worktree, brief `batch8-brief.md`, lane reports a, b, c.
No build, no spec run. Findings come from reading the diff and the owner
(`libs/frontend/ui/src/lib/badge/badge.directive.ts`, selector `span[ptahBadge]`).

## Findings

### HIGH-1: three skill-synthesis-ui specs still assert the old DaisyUI classes
Lane a did not update these specs. They fail after the adoption.
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-badge.component.spec.ts:117-119`
  asserts `badge-ghost` / `badge-success` / `badge-error` classes.
  Fix: assert `getAttribute('data-tone')` equals `neutral`, and not `ok` or `err`.
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-detail.component.spec.ts:83,93,94`
  asserts `badge-error` / `badge-success`.
  Fix: use `data-tone` `err`, `ok`, `neutral`.
- `libs/frontend/skill-synthesis-ui/src/lib/components/skills-pause-switch.component.spec.ts:93`
  asserts `badge-warning`.
  Fix: `expect(badge?.getAttribute('data-tone')).toBe('warn')`.
  Lines 258-261 (`text-xs`, parent `min-h-5`) stay valid: the `text-xs` class is kept.

Lane a report says it checked only `tasks-ui` specs for `.badge`. The brief
required `grep` of the specs of every changed component.

### MEDIUM-1: status group badge loses the backlog / cancelled distinction
`libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts` (`badgeTone`, about line 843).
Old map: `backlog: badge-ghost`, `cancelled: badge-neutral` (a filled, darker badge).
New code maps both to `neutral`. The owner has no filled-neutral tone, so the
look changes for `cancelled`. Fix: accept and name it in the lane report as a
known look change, or keep `cancelled` raw. Also, `TASK_STATUS_BADGE` is now
unused in this file. Check that the export in `task-presentation.ts` and
`index.ts` is still used elsewhere, or remove it with its spec.

### MEDIUM-2: estimate L / XL changes from filled neutral to soft neutral
`task-card.component.ts` (about line 389) and `task-list.component.ts` (about line 393).
Old: `badge-neutral` (filled). New: `appearance="soft"`. Colors differ and the
brief says each badge keeps its current colors. Contrast is probably equal or
better, but the lane report must state it. No Electron light-theme measurement
exists (lane a says so).

### LOW-1: dead helpers left behind
`taskTypeBadge`, `taskEstimateBadge` stay exported in
`libs/frontend/tasks-ui/src/lib/task-presentation.ts` and `src/index.ts`, with
tests in specs that import them. Confirm they have a remaining consumer. If
not, remove them in a follow-up (not blocking).

### LOW-2: formatting not applied
Prettier style is broken in several new lines, for example
`scorecard-detail.component.ts` import line (over 80 columns),
`scorecard-detail.component.ts` long ternary in `[tone]`,
`scorecard-badge.component.ts` ternary, `thoth-shell.component.ts` line with
`<span class="ptah-badge-text">{{ platform.platform }}</span></span`.
Fix: run `prettier --write` on the changed files (lint-staged will do it on commit).

### LOW-3: `ptah-badge-text` use is uneven
Used for the executor, type, stage, doc-state and gateway platform text.
Not used on `task-run-placeholder` (long text "Planned for Phase 2 · TASK_...")
or `skills-pause-switch` / scorecard badges. Those texts are short or fixed, so
this is acceptable. Check that `task-run-placeholder` text does not need to
truncate in a narrow layout.

## Checks that passed
- Every adopted badge host is a `span` (selector `span[ptahBadge]` requires it).
- `PtahBadgeDirective` is imported in the `imports` array of all 10 changed
  components, including the new `imports` array in `task-run-placeholder`.
- Tone maps keep the color meaning: success to `ok`, error to `err`,
  warning to `warn`, info to `info`, ghost to `neutral`, `badge-outline` to
  `appearance="outline"`. Gateway map (`badgeToneFor`) is typed
  `'ok' | 'info' | 'err' | 'neutral'`, a subset of the tone type.
- `task-list` `badgeTone` union is `'neutral' | 'info' | 'warn' | 'err' | 'ok'`,
  which matches the owner tone type. Strict types hold in the read code.
- Long text uses `ptah-badge-text` for the executor (with `max-w-[7rem]`).
- Remaining raw `badge` classes (`task-card` line about 488, `task-list` line
  about 405) are label chips with a hand-audited palette. Keeping them raw is
  correct.
- Specs updated: `task-card.component.spec.ts` (type badge count; label chip
  query at line 575 stays `.badge`, correct) and `thoth-shell.component.spec.ts`
  (`data-size="sm"`).
- Type `ThothGatewayBadge` mapping in `thoth-shell.component.ts` is complete.

## Not verified
- Light-theme contrast (no screenshot, no spec run, no node_modules).
- Whether the `task-card.component.spec.ts:134` type error that lane a
  reports is old. It is outside the badge lines.

## Verdict
**CHANGES REQUESTED.** Fix HIGH-1 (three specs would fail). Record MEDIUM-1
and MEDIUM-2 as accepted look changes or fix them. Run Prettier. Then ready.
