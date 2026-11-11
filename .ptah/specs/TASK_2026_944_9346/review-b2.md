# Review b2 (git-ui and tasks-ui button adoption)

**Verdict: no blocker. 2 major findings (ghost+border mapping, leftover title) must be fixed. 4 minor findings.**

Method: I compared every removed and added line of `b2.diff` by script and read the final files. No attribute was lost (see check 1). I did not run any test. The claim "git-ui 1129 of 1130 passed" is not provable from the code (see check 8).

Paths below are relative to `libs/frontend/`.

## Major

### M1. Ghost + border controls became `variant="ghost"` (rule 2 violated)
The rules say a ghost control with a border class must become `secondary`. These 11 elements lost the
border and now use `variant="ghost"`. The visible border is gone.

- `tasks-ui/src/lib/components/bulk/task-bulk-bar.component.ts:109,151,199,251,261`
- `tasks-ui/src/lib/components/bulk/task-bulk-summary.component.ts:87`
- `tasks-ui/src/lib/components/task-board-header.component.ts:103`
- `tasks-ui/src/lib/components/task-board-states.component.ts:84,158`
- `tasks-ui/src/lib/components/filter/task-view-menu.component.ts:382`
- `tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:393` (icon button, was
  `btn-ghost btn-square border border-surface-border font-mono`; add `variant="secondary"`)

Fix: remove `variant="ghost"` on the text buttons (secondary is the default). Add `variant="secondary"`
on the icon button.
Note: three raw buttons with the same old classes stay raw (`task-filter-bar.component.ts:127`,
`task-view-menu.component.ts:149`, `task-board-header.component.ts:125`). The set is now inconsistent.

### M2. Leftover `title` on `ptahIconButton` (rule 3 violated)
`label` is already the tooltip and the accessible name. The old `[title]` stays and gives a second tooltip.

- `git-ui/src/lib/git-dock/git-dock-header.component.ts:91` (`[title]` on `git-rail-toggle`)
- `git-ui/src/lib/history/history-stash-section.component.ts:215`
- `tasks-ui/src/lib/components/board/task-list.component.ts:219`
- `tasks-ui/src/lib/components/detail/task-relations.component.ts:254`
- `tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:396`

Fix: delete these `[title]` lines. Check that no spec reads `title` on these elements first
(`git-dock-header.component.spec.ts:118,125` read `aria-label`, which the directive still sets).

## Minor

### m1. Destructive confirm lost its danger cue
`git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts:145-148` (`confirm-discard`) was
`btn-outline border-error bg-error/10`. It is now plain secondary. The rule maps outline error to `danger`.
The spec (`branch-picker-dropdown.component.spec.ts:172-174`) asserts `not btn-error` for contrast (AA)
and `text-base-content`. So secondary is deliberate, but the line 174 assertion
(`text-base-content` class) now holds only by chance. Also, the comment at
`branch-picker-dropdown.component.ts:191-194` ("Outline, not ghost: anubis-light forces .btn-ghost...")
is stale for `discard-switch`, which is now `variant="danger"`. Decide on one: danger variant for both,
or document why not. Same pattern: `git-confirm-dialog.component.ts:136` keeps a raw confirm button with
`err-solid-text` next to ptahButton cancel buttons (the dynamic `[class]` skip is correct, but the
dialog now mixes two looks).

### m2. Glyph-only buttons kept as `ptahButton` + `aria-label`
`git-ui/src/lib/review-canvas/draft-comments-bar.component.ts:83` and
`git-ui/src/lib/review-canvas/hunk-toolbar.component.ts:173` have only a `✕` glyph. Rule 3 says an
icon-only control is `ptahIconButton` (accessible name is correct today). The filter-bar sort button
(`task-filter-bar.component.ts:391`) is `ptahIconButton` with a text glyph (`↑` / `↓`), so it lost `font-mono`.
Also `git-ui/src/lib/review-canvas/file-section-header.component.ts:171` is an icon-only raw
`btn btn-ghost btn-xs h-auto p-0.5` that is not in the skip list reasons (no wrapping text). It can move
to `ptahIconButton`.

### m3. `[busy]` changes behavior of the status trigger
`tasks-ui/src/lib/components/detail/task-detail-header.component.ts` (the trigger that had only
`[attr.aria-disabled]="busy() || null"`) now gets `aria-busy`, `opacity-60`, `cursor-wait`, and a
capture-phase click block. The spec (`task-detail-header.component.spec.ts:121,353,366`) still passes
by reading, because `aria-disabled` is `'true'`/absent. But the old comment "trigger stays focusable;
it is aria-disabled" at spec line 118 now hides the new click block. Also the leftover
`aria-disabled:opacity-50` utility is now doubled by `opacity-60`. Confirm this is wanted.
`draft-comments-bar.component.ts` (`[busy]="sending()"`) is correct.

### m4. Dropped height utilities
`h-9 min-h-9` was removed on 5 primary buttons (`task-bulk-bar`, `task-board-header`, `task-board-states`,
`task-create-dialog`, `task-maintenance-dialog`). The spec check `h-9` was deleted
(`task-board-header.component.spec.ts`). This follows the rules, but the 36 px target size is now owned
by size `sm`. Confirm the token height is not smaller.

## Checks

1. **Attributes kept: pass.** A script compared all removed lines with added lines per file. No
   `data-testid`, `(click)`, `[disabled]`, `type`, `@if`, or other attribute was lost. The only
   unmatched removals were `class`, `aria-label`, `title`, `[attr.aria-busy]` / `[attr.aria-disabled]`
   (all intended) and prettier reflow. No broken tag found. Whole-file prettier reflow in
   `review-shell.component.ts` and the `worktree-scope-bar` indentation of the second button are formatting only.
2. **Variants: M1, m1.** Other mappings are right: outline -> secondary, `btn-error` -> danger
   (`stash-popover`, `task-view-menu`, `task-maintenance-dialog`, `conflict-banner`, `discard-switch`).
3. **Icon buttons: M2, m2.** All `ptahIconButton` have a non-empty `label` or `[label]`; no `aria-label`
   is left on any of them. Every `[label]` I read is a real expression.
4. **Imports: pass.** A count check per file found no missing and no unused directive import. No import
   inside another import block, none between JSDoc and decorator.
5. **Skipped elements: pass.** No dynamic `[class]`, `join-item`, `btn-warning|success|info`, red ghost
   (`stash-popover.component.ts:154`), `summary`, or `btn-active` element was converted.
   Raw `btn` elements left: `open-in-button` (join-item), `spot-editor.component.ts:176,187` (join-item),
   `task-card.component.ts:632,643` (join-item), `comparison-bar.component.ts:135,147` (menu rows),
   `comparison-bar.component.ts:215,230` (`btn-active` toggles), `hunk-toolbar.component.ts:63`
   (`btn-success`), `git-confirm-dialog.component.ts:136`, `stash-popover.component.ts:79` (`h-auto`),
   `task-filter-bar.component.ts:347` (join-item). All are correct skips.
6. **Busy / aria: pass.** Only two elements had `[attr.aria-busy]` or `[attr.aria-disabled]`
   (`draft-comments-bar`, `task-detail-header`). Both use `[busy]` now. No `[attr.aria-*]` of this kind
   is left on a `ptahButton`. See m3.
7. **Layout utilities: pass.** `w-full`, `justify-start`, `ml-auto`, `shrink-0`, `flex-shrink-0`,
   `min-w-0`, `max-w-*`, `flex-1`, `mr-2` are all kept (for example
   `git-dock-header.component.ts` branch trigger keeps `min-w-0 max-w-[14rem] shrink flex-nowrap`, which
   `git-dock-header.component.spec.ts:150-152` asserts).
8. **Spec edits: legitimate.**
   - `branch-picker-dropdown.component.spec.ts`: follows `variant="danger"`. See m1 for the stale
     `text-base-content` assertion at line 174.
   - `conflict-banner.component.spec.ts`: `err-solid-text` -> `btn-error`. Follows the change, but the
     solid-text contrast guard (`err-solid-text`) is no longer tested on this button (minor).
   - `git-confirm-dialog.a11y.spec.ts`: `btn btn-sm` -> `btn btn-secondary btn-sm`. Correct.
   - `task-board-header.component.spec.ts`: `h-9` check removed. See m4. Does not hide a regression.

   Specs that still read converted-element classes and should still pass by reading: `btn-primary` /
   `btn-ghost` / `btn-sm` (`draft-comments-bar.spec:88`, `task-bulk-summary.spec:675-678`,
   `task-document-reader.spec:134`, `task-board-header.spec:73-75`, `branch-picker spec:129`),
   `aria-disabled` / `aria-busy` of a busy button (`draft-comments-bar.spec:168-169`,
   `task-detail-header.spec:121,353,366`), `aria-label` of icon buttons (`git-dock-header.spec:118,125,419`,
   `history-timeline.spec:602`). I found no spec that reads a removed `btn-*` class, `h-*` utility, or
   `aria-busy` of a converted element. Specs that read `h-8`/`w-8`
   (`task-filter-bar.spec:127`, `task-view-menu.spec:541`) target raw controls. `task-filter-bar.spec:89`
   (`btn-active` on `summary`) targets a skipped element. I could not run tests, so the "1129 of 1130"
   claim stays unverified. The one failing test is not named in the claim: ask for its name.
