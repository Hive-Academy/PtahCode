# Batch 1a review fixes

## Findings

| Finding | Resolution | File |
|---|---|---|
| 1 | Shared defaultButtonType called by both directives; icon type cases added. | button-host.ts, button.directive.ts, icon-button.directive.ts, icon-button.directive.spec.ts |
| 2 | Overlay Escape handling and hover grace timer permit dismissal and panel hover. | tooltip.directive.ts, tooltip.directive.spec.ts |
| 3 | CDK popover overlay with inline connected position. | tooltip.directive.ts |
| 4 | Removed pointer-events-none so the panel can hold hover. | tooltip-panel.component.ts |
| 5 | Skip duplicate description when accessible name equals tooltip text. | tooltip.directive.ts, icon-button.directive.spec.ts |
| 6 | Signal effect updates open panel and closes for empty text. | tooltip.directive.ts, tooltip.directive.spec.ts |
| 7 | Focus-visible check, focus-open tracking, and touch exclusion. | tooltip.directive.ts |
| 8 | Exported PtahButtonVariant/Size; removed panel export; host handlers protected. | button.types.ts, index.ts, directives |
| 9 | Exact class sets and interaction cases in co-located specs. | button.directive.spec.ts, icon-button.directive.spec.ts, tooltip.directive.spec.ts |
| 10 | Constant host object spread replaces decorator function call. | button-host.ts, button.directive.ts, icon-button.directive.ts |
| 11 | Named delays, busy auxclick blocking, bound type JSDoc, whitespace cleanup. | tooltip.directive.ts, button-host.ts, button.directive.ts, foundation files, ptah-tokens.spec.ts |

## CDK top-layer evidence

Installed `node_modules/@angular/cdk/types/_overlay-module-chunk.d.ts:297` declares `OverlayConfig.usePopover`; line 619 declares `FlexibleConnectedPositionStrategy.withPopoverLocation`. The tooltip uses `usePopover: true` and `withPopoverLocation('inline')`. CDK implementation at `node_modules/@angular/cdk/fesm2022/_overlay-module-chunk.mjs:2065-2078` disables popovers when the browser lacks `showPopover`; the spec stubs that browser API to test CDK's popover path.

## Verification

Command: `npm run verify -- -p ui 2>&1 | Select-Object -Last 60` (three permitted runs). First: lint and test failed; second: lint/typecheck passed, one jsdom popover test failed; third, final:

```
[verify 2026-11-10T20:00:20.364Z] starting verify lint,typecheck (ui)
NX   2 tasks: 2 succeeded
[verify 2026-11-10T20:00:55.849Z] starting verify test (ui)
NX   1 task: 1 succeeded
[verify 2026-11-10T20:01:55.935Z] lock released after 95.6s, exit code 0
```

## Open risks

A browser render of a tooltip inside a native dialog remains outside this batch's permitted checks. A host binding that overwrites aria-describedby while a tooltip is open may remove the appended id. Skill invocation was unavailable in this lane; only skill search was exposed.

