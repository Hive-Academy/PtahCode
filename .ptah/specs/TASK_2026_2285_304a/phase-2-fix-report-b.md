# Phase 2 fix round 1, lane B (TASK_2026_2285_304a)

Source: `phase-2-code-review.md`, Minor 2, and the `tsconfig.spec.json` error TS2322.

## Item 1: Agent behaviour row container (review Minor 2) — DONE

Files changed:

- `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts`
- `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts`

Changes:

- The four `ptah-setting-row` elements are now in one container:
  `<div class="flex flex-col" data-testid="agent-behaviour-rows">`. This is the same pattern
  as `membership-rows` in `license-status-card.component.ts:160`.
- The `@for` block of the load alerts stays before the container, as a direct child of the
  form section fields.
- The effort row is now the `:last-child` of its parent. Thus the `last:border-b-0` and
  `last:[&>div]:pb-0` selectors of `ptah-setting-row` apply to it. The prompt row is always the
  `:first-child`, also when a load alert shows.
- No other template or class change. The rows, test ids, inputs and bindings are the same.

Test added (`row layout (F3, F4, decision 29)`):

- `keeps the four rows in one container with the load alerts outside it (review minor 2)`.
  With a failed `enhancedPrompts:getStatus`, it makes sure that:
  - the container has exactly four children and each child is a `ptah-setting-row`,
  - the first child is `agent-behaviour-row-prompt`,
  - the last child is `agent-behaviour-row-effort`,
  - the load alert renders and is not in the container.

Side effect (visual check necessary in Electron):

- Before, each row was a direct child of the form section fields, which has
  `gap-[var(--ptah-gap-field)]`. That gap was between the rows. The container removes that gap
  between the rows, as in Membership. The gap stays between a load alert and the container.
- Examine the row spacing, the dividers (none below the effort row) and the top and bottom
  edges of the card, with glass on and off, with and without a load alert.

## Item 2: `system-prompt-drawer.component.spec.ts(594,33)` TS2322 — NOT CAUSED BY LANE B, NO CHANGE

Evidence:

- `git diff HEAD -U0` for the spec shows only two hunks from lane B: the import at line 5 and
  30 new lines at line 144.
- Line 594 is `releaseStatus = () => resolve(rpcSuccess(running));`. Its declaration is
  `let releaseStatus = () => undefined;` at line 592.
- `git show HEAD:<spec>` has the same declaration at line 562. The lane B insertion moved the
  lines by 30 (the reported line 594 is line 564 at HEAD). The code is identical at HEAD.
- Result: the error is in the committed base, not in the lane B change. The spec file is not
  changed in this round.

## Checks

| Command | Exit code |
| --- | --- |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts` | 0 (1 suite, 40 tests passed) |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 |
| `npx eslint <agent-behaviour-section.component.ts> <agent-behaviour-section.component.spec.ts>` | 0 (only the `No cached ProjectGraph` warning for `@nx/enforce-module-boundaries`) |

Not run: `tsc` on `tsconfig.spec.json` (not in the permitted checks of this round), the
`system-prompt-drawer` spec (file not changed), `npm run verify`, `nx`, visual review.

## Decisions

- Decision: same container markup as Membership (`div.flex.flex-col` with a test id).
  Options: a container with the field gap, or a container without a gap. Evidence: the review
  asks for the Membership pattern, and `license-status-card.component.ts:160` has no gap.
- Decision: no fix for TS2322. Options: change `() => undefined` to a `void` type in the spec,
  or leave it. Evidence: the instruction says to leave it if lane B did not cause it.

## Not done

- Nothing in the write set. The TS2322 error stays for the coordinator to assign.
