# Fix brief — P2 review slice A, fix F-A2 (TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
P = libs/frontend/onboarding/src/lib/proposal/
Review: TF/code-logic-review-p2-A.md (read findings 2 and 5 in full).

## Fix these findings
1. **Finding 2 (Major).** `P skill-selection-rail.component.html:31` hides the selected list in
   `bar` layout with `responsive` off (the judged review uses that). Restore a compact,
   keyboard-accessible selected list or a disclosure (button with aria-expanded) in bar mode that
   lists every selected skill with the existing remove action. Keep the bar compact by default
   (R22) and the rail layout unchanged. Change the spec at
   `P skill-selection-rail.component.spec.ts:108`: assert a retained selection stays removable in
   bar mode.
2. **Finding 5 (Minor).** `P stack-coverage-strip.component.ts:257,272`: the overflow control can
   wrap onto a third line. Allow zero visible item chips when needed and measure the real overflow
   control width (not a fixed estimate). Update the geometry mock at
   `P stack-coverage-strip.component.spec.ts:277` to give the control a real rectangle, and assert
   the control's line as well as the chip count (R22: at most two lines by default).

## Write files (only these)
P skill-selection-rail.component.ts, .html, .css, .spec.ts;
P stack-coverage-strip.component.ts, .html, .spec.ts.
Other lanes edit the store, coverage, filter, review and the analyze pages now: do not touch them.

## Checks (focused only)
- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts`
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` (errors in files of
  other lanes: report them, do not fix them)
- `npx eslint <changed .ts files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

**Deliverable**: TF/batch-fix-p2-A2-report.md (skeleton first; per finding: change, file:line,
test). Reply `WROTE: <absolute path>` plus one headline line.
