# Phase 3 CI fix report (PR #1454, webview-e2e)

Status: both failures fixed in the product. No test was weakened. Nothing is committed. The e2e suite was not run
(lane rules), so the fix of failure 2 is not yet confirmed in Playwright. See "Confidence" below.
Paths are relative to `libs/frontend/chat/src/lib/settings/ptah-ai/`.

## Failure 1: order control target size (`settings-visual.e2e.spec.ts:803-816`)

**Root cause.** CI logs "18 controls; smallest target 20px" in all four combinations. Two rules made 20px targets:
- The Move up / Move down buttons had `density="compact"` with `size="xs"`. In
  `libs/frontend/ui/src/lib/button/ptah-button.css:155-172`,
  `.btn[data-ptah-button][data-density='compact'].btn-xs.btn-square` sets `width` and `height` to `1.25rem` (20px).
- The grip `.lane-order-grip` had `width: 1.25rem` (20px) and `height: 1.5rem`.

**Fix.**
- `lanes-table.component.html`: `density="compact"` removed from the `data-order-up` and `data-order-down` buttons.
  The default `xs` footprint is `--ptah-control-h-xs` = 1.5rem (24px) square (`ptah-button.css:51-53`, `:130-132`).
- `lanes-table.component.css:490`: `.lane-order-grip` width and height are `var(--ptah-control-h-xs)` (24px), with
  `flex-shrink: 0`.
- `lanes-table.component.css:476`: in Reorder mode the order cell padding is `var(--ptah-space-1)` (0.25rem) on each
  side. The 5.25rem (84px) order column then leaves 76px for the three 24px targets (72px). Specificity is above the
  collapsed-tier cell padding rule.
- Row height: the targets are 24px high, which fits the 3.5rem (56px) row. No row-height rule changed.

## Failure 2: Copilot detail overflow (`noOverflow('#lane-detail-copilot')`, 192px)

**Root cause (most probable).** The overflow is the same 192px in all four combinations, at two different host
widths. So it comes from an element with a fixed text width, not from the layout width. In the e2e fixture
(`settings.fixtures.ts:138-146`), Copilot has no `manifest`. In the collapsed tier the detail renders the Permission
and Network fact cells (`ptah-cli-lane-default-cell`, `lanes-table.component.html` `laneFacts` block). With no
manifest, each of these renders
`Unavailable<span class="sr-only">No verified mode is available.</span>` (`cli-lane-default-cell.component.ts`, both
"Unavailable" branches). `sr-only` is a 1px box with `white-space: nowrap` and `overflow: hidden`, so its
`scrollWidth - clientWidth` is the width of the hidden line. About 30 characters at the 0.875rem detail size
(`.lane-default-value`, `lanes-table.component.css:25`) is about 192px. The check includes every `span`, so this
hidden span reads as overflow.

**Fix.**
- `cli-lane-default-cell.component.ts:465` new input `showReason` (default `false`). When it is set, both
  "Unavailable" branches (`:361`, `:406`) render the reason as visible text, `<span class="defaults-reason"> — reason</span>`,
  in place of the `sr-only` span. The visible inline text wraps in the cell (the compact host already has
  `white-space: normal`). The tooltip (`title`) is unchanged.
- `lanes-table.component.html:485`, `:512`: the two detail fact cells (Permission, Network) pass `[showReason]="true"`.
  The table-row cells keep the hidden reason, because a narrow column has no room for it.
- Test: `cli-lane-default-cell.component.spec.ts`: "shows the reason as visible wrapping text, not hidden text, when
  showReason is set (lane detail)". It checks the `sr-only` span by default, and checks that `showReason` replaces it
  with the visible `— No verified mode is available.`.

**Other candidates checked (no change needed).**
- `copilot-auto-approve-toggle.component.ts`: the label span is a flex item in a `1fr` value column, and it wraps.
- `lane-model-effort-cell.component.ts`: its `sr-only` span (`lanes-effort-na`) is empty (0px). The model label
  spans are inline in a button (inline boxes report 0).
- Disclosure body ("All capabilities"): closed, with `[hidden]`, so no boxes.
- The reset popover's `sr-only` "More default actions" renders only with a saved default. Copilot has none in the
  fixture.

**Confidence.** I could not run Playwright. The match (fixed 192px in every host, no manifest, `sr-only` reason of
about 192px) is strong. If CI still fails, read the e2e output for the offending node. Its first candidate is any
other `.sr-only` span in `#lane-detail-copilot`.

## Checks
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  `lanes-table.component.spec.ts lanes-table.visual.component.spec.ts lanes-table-detail.component.spec.ts`
  `cli-orchestration-matrix.component.spec.ts cli-orchestration-matrix.writes.spec.ts cli-lane-default-cell.component.spec.ts`:
  6 suites passed, 169 tests passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0, 0 errors.
- `npx eslint` on the 4 changed `.ts` / `.html` files: exit 0, 0 errors, 2 warnings (old patterns).
- Not run: `npm run verify`, `nx`, `typecheck-templates`, Playwright, build. The coordinator must run
  `typecheck-templates` (template changes in `lanes-table.component.html` and the inline template of
  `cli-lane-default-cell.component.ts`) and then the `webview-e2e` CI job.

## Files changed
- `lanes-table.component.html`, `lanes-table.component.css`, `cli-lane-default-cell.component.ts`,
  `cli-lane-default-cell.component.spec.ts`. No `libs/frontend/ui` file changed.
- `.ptah/specs/TASK_2026_2285_304a/decisions.md` shows as modified in `git status`. I did not change it.

## Class audit
`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0. "TOTAL 533 blocked token(s) across
37 file(s); 0 token count(s) over baseline". No baseline update. The CSS uses `--ptah-control-h-xs` and
`--ptah-space-1` tokens only. The new `defaults-reason` class is a component class, not a Tailwind or DaisyUI class.
