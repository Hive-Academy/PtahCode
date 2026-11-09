# Code Logic Review: compact session card

Review family: antigravity (implementer: codex + claude)

Score: 6.5/10
Verdict: REVISE

Scope: read in full the diff of `compact-rail-card.component.ts`, the new `compact-rail-meta.component.ts` and its spec, `compact-lane.types.ts`, and `preserve-list.md`. I did not run builds or e2e, and I did not render the card in a browser. The scoped verify result is at the end.

## Five logic questions

1. **Does it do what was asked?** Mostly. The grid math works. Dense is 24+22=46px in a 56px card (the card is 56px and the body is `height:100%`). Comfortable is 26+16+54+22=118px in a 128px card. Three 18px lane rows fit exactly in 54px.
2. **What happens at the boundaries?** The meta row can clip content silently (finding 1).
3. **Is any behaviour lost?** Little. One dense-only access path is gone (finding 2).
4. **Is the state consistent?** `hasMeta` and the meta template conditions agree except for the unknown-git "—" case (finding 4).
5. **Are the tests adequate?** Partly (finding 5).

## Findings

1. **major – Meta row clips chips and the diff when space is tight.**
   - Evidence: `compact-rail-meta.component.ts:10` makes the host `overflow-hidden`. `:14` and `:17` set `flex-shrink:0` on the +N button and every chip. Only the task id shrinks, and `:13` caps it at 72px.
   - Impact: the diff count is last in the row (`:43`). With +N, a todo count, a task id, "N agents", "N CLI", "NN% ctx" and a diff all present on a narrow rail, the diff and then the ctx chip are cut off. They have no ellipsis and no scroll, and there is no tooltip on the clipped text.
   - Before this change the same chips sat on a dedicated line, so this is a regression for busy sessions.
   - Fix: let the chips shrink or hide by priority, or use `flex-wrap:nowrap` with `min-width:0` and an ellipsis on the low-priority chips. Add a width-constrained test.
   - I did not measure the rail width. Confirm in a browser at the narrowest sidebar width.

2. **minor – A dense callout hides the "+N" lanes button.**
   - Evidence: `compact-rail-card.component.ts:260` (meta shown only when `!callout()`) and `:266` (the callout row replaces the meta row).
   - Impact: while a permission, question or error callout is showing, a dense card has no way to open its lanes.
   - This is the stated design, but it is a behaviour loss that `preserve-list.md` does not mention. It lists the +N button as "Moved", not as "hidden under a callout". Document it or keep the button in the callout row.

3. **minor – 10px state pill contrast is unverified after the 12% tint.**
   - Evidence: `compact-rail-card.component.ts:216-219`. The 5.63:1 figure in the comment was measured for the pill with no background.
   - The new `color-mix(in oklch, ink 12%, transparent)` fill moves the background toward the ink, which lowers contrast slightly. The running and done states blend the card background with the ink as well.
   - No spec covers the pill on its tinted background. `state-ink-contrast.spec` covers the inks only. The worst case is probably the focused or running state in the light theme.
   - Add a computed-contrast assertion (4.5:1 required for 10px text), or reduce the tint.

4. **minor – Unknown git state shows a lone "—".**
   - Evidence: `hasMeta` (`compact-rail-card.component.ts:393-397`) requires `gitStats().kind==='known'`, but the meta component always renders `gitCount()`, which is "—" when unknown (`compact-rail-meta.component.ts:43,65`).
   - When another chip is present, the row shows a dash with an empty title.
   - This matches the old behaviour, but it wastes width in the row that finding 1 shows is already short of space. Consider hiding it in dense.

5. **minor – Spec coverage of the new component is thin.**
   - `compact-rail-meta.component.spec.ts` has 3 tests. These are missing:
     - the comfortable "+N more" button, its aria-label and its emit
     - the `tabIndex` toggle for `innerTabbable`
     - todo and git text and titles
     - the agent singular/plural label
     - the CLI and ctx chips
     - ctx rounding
   - No test covers the overflow in finding 1 or the dense callout replacement (`:260` and `:266`). I did not check the updated card spec beyond the diffstat.

6. **minor – Formatting and conventions.**
   - `compact-rail-meta.component.ts` is one-line-dense and not prettier-formatted (for example lines 10, 60 and 65).
   - `compact-rail-card.component.ts` CSS has inline one-liners (`:226-227`).
   - `hasMeta` is a public `readonly` placed between the outputs and `cardHeight`, and it is only used by the template.
   - Meta uses `input()`/`output()`, OnPush, and has no `any` and no `!`. The conventions are met apart from formatting.

## Preserved behaviours checked

- State inks and the accent bar, hover/focus frames and transitions: unchanged lines, and the diff has no removals there.
- Callout buttons: aria-labels, `data-rid`, `tabIndex` rules and outputs are identical to the old code. `ngDoCheck` was not touched by the diff.
- Lane rows (max 3) and `laneSelected`: unchanged.
- The branch/model/elapsed line and the corner-reserve padding: kept (`:129-131`, `:252-258`).
- Linked task id: `data-testid`, title, aria-label and the missing-task strike are kept.
- The old line-wide `title` (todo plus git) is now split per chip. This is a minor tooltip change. The todo chip lost its `; git` suffix, which is acceptable.
- Focus ring: `outline-offset:-2px` in meta (`:16`) stays inside the `overflow-hidden` host, so it is visible. The 4px-inset keyboard ring is unchanged.

## Verification

`npm run verify -- -p @ptah-extension/chat-ui,@ptah-extension/canvas` was started. See the report for its result.

Result: lint, typecheck and test passed for both projects (exit 0). Nx served all 6 targets from cache, so this run did not re-execute the tests against the current files.

## Resolution (coordinator)

1. Fixed. Chips now shrink with an ellipsis (`flex-shrink:1`, `min-width:1.5rem`) and carry
   their full text in a `title`. The diff stats stay `shrink-0` at the row end. A spec pins it.
2. No change. On `main` the dense callout already replaced the `+N` row (the `@if (callout())`
   branch came before `@else if (density() === 'dense')`). Behavior is the same as before.
   Recorded in `preserve-list.md`.
3. Fixed by margin. The pill text now pulls its ink 40% (was 30%) toward base-content. This
   offsets the 12% tint. Not measured with a contrast tool; the screenshots show legible pills.
4. No change. The "—" for unknown git state matches `main`.
5. Fixed. Added specs for the comfortable "+N more" button, the tabIndex toggle, the
   todo/diff/agent/CLI/ctx text and titles, ctx rounding, and the shrink rule.
6. Fixed. Prettier ran on every changed file.
