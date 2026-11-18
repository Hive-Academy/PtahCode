# L14 review report

Implemented findings A-G. No commit, push, stash or revert. Existing unrelated status.md and earlier untracked evidence were left alone.

## Findings and fixes

All source paths below are relative to libs/frontend/chat/src/lib/settings/.

| Finding | Cause | Fix |
| --- | --- | --- |
| A | A single 950px table collapse boundary gave the 742px pane the same columns as the 358px pane. | ptah-ai/lanes-table.component.ts:90, :217 observes actual host content width with ResizeObserver and disconnects on destroy. At 640px the Model moves into a separate column; Permission/Network remain in detail below 950px. ptah-ai/lanes-table.component.html:16, :41, :101, :256, :357, :397 keeps exactly one model trigger in each row and adjusts detail colspan to six. ptah-ai/lanes-table.component.css:399 onward places name/chip together in the middle tier. |
| B | Compact identity used a growing middle grid track, sending the info icon to the cell edge. | ptah-ai/lane-row-identity.component.ts:105 uses intrinsic tracks and start alignment; middle-tier flex keeps info adjacent to name/chip. |
| C | Compact status deliberately allowed wrapping and reserved menu space even above the recovery action. | ptah-ai/lanes-table.component.css:372 onward keeps status nowrap, gives it its full cell width, and positions narrow recovery/menu below the label. Middle-tier Status is 208px with status and recovery on one line. |
| D | Compact padding and a 40px Order column made the headings meet. | ptah-ai/lanes-table.component.css:353 onward reserves 48px for Order and applies 8px inline padding to both header and body first cells. |
| E | Provenance was confined to the name column and clamped, while inline separators could separate from following text. | providers/provider-connection-card.component.ts:85 onward uses a two-row grid: provenance spans name plus status columns, with normal wrapping and visible text. The separator preceding usage explicitly renders space, middle dot, nonbreaking space, only with usage. The separator before Used for remains conditional on nonempty labels. Row gap is zero; inline action uses the existing 24px control token to preserve the 80px card bound with two provenance lines. All DOM identifiers and accessible names are retained. |
| F | Unset detail effort was a bare default ghost label. | ptah-ai/lanes-table.component.html:322, :341 uses an outline trigger labelled Effort: default in detail; row effort remains ghost and appears only when set. Existing Effort default for + row.name aria-label and data-popover-kind remain. ptah-ai/lanes-table.component.css:450 adds compact border/padding for the detail control. |
| G | Narrow names allowed word-space wrapping, and Lane had insufficient width. | ptah-ai/lane-row-identity.component.ts:119 keeps names nowrap with visible overflow, normal word breaking and no ellipsis. Compact column budget leaves 126px for Lane at 358px. Synthetic Lane measures 96px and fits beside the mark. |

## Width decisions and rendered evidence

Inspected the current Electron references for lanes at 1168/784 and instance detail at 1824, plus rev2b-providers-lanes-dark-1168.jpg. Compared column use, name/chip alignment, status wrapping, Order spacing, provenance clipping and the effort affordance.

Navigated the in-workspace L14-layout-evidence.html file URL with Ptah browser tools. Inspected screenshots at table widths 742 and 358. This is a static fixture using earlier captured component DOM and shared CSS plus current component styles; it is not a newly built Electron application. The fixture adapts the captured row markup to the middle-tier column arrangement. Native rg/file reads supplemented Ptah workspace/dependent inspection; repository frontend-design and angular-developer SKILL.md instructions were read (no dedicated CLI skill-loading tool was exposed).

Measured with browser DOM geometry:

- Table 742px: Order 48, Lane 254, Status 208, Model 160, Enabled 32, expander 40. Representative Antigravity, Claude and Synthetic Lane rows are each 49px high, with name/chip together and a separate Model column. The blank Lane/Status band is removed.
- Adding two readable selects needs at least another 256px (shared minimum 8rem per select), so they stay in detail at 742px. The existing full tier remains at 950px. Middle tier starts at 640px, leaving 152px for Lane; chip may use a second line there.
- Table 358px: Order 48, Lane 126, Status 112, Enabled 32, expander 40. Synthetic Lane occupies x94-190 within a cell ending x198; name height is 16px. Antigravity also stays on one line. Needs API key stays whole with Sign in below. Compact model remains in normal flow below identity.
- Card fixture with three consumers (Main agent, Memory curator, Enhancement), after applying current compact action CSS and resetting fixture-only default paragraph margins: 456px wide => 76px high; 598/742px => 64px high. Provenance uses two lines at 456px and one at 598/742px. The product retains full text and no clamp. Fixture utility coverage is partial, so these measurements supplement rather than replace the actual CI height gate.
- Later card screenshot requests stalled/timed out; card dimensions were checked with browser evaluation. The two table screenshots were successfully returned and inspected. The fixture is included for repeat inspection; no new full-application Electron screenshots were generated.

## Tests and compatibility

Read the relevant settings-orchestration and settings-visual e2e scenes before changing tiers, including the 1024px viewport, row model/effort locators, detail model locator, 48px policy bar and 80px card gates. No e2e spec changed. Both row and detail model triggers remain reachable: below 640px the row model is in identity; from 640px it is in the Model cell. Detail Permission/Network remain under the original 950px collapsed rule. Detail model stays available whenever expanded, independent of row model placement. Policy bar code is unchanged. No ids, data-testids or aria-labels were removed or renamed.

Changed source/test files:

- providers/provider-connection-card.component.ts
- ptah-ai/lane-row-identity.component.ts
- ptah-ai/lanes-table.component.ts
- ptah-ai/lanes-table.component.html
- ptah-ai/lanes-table.component.css
- ptah-ai/lanes-table.visual.component.spec.ts

The visual unit spec expects the new Effort: default text and adds middle-tier assertions for exactly one row model in the Model cell, six columns, correct detail colspan, and a separate reachable detail model. Existing e2e assertions are unchanged.

## Check results

- Focused Jest: table, visual, detail suites passed (60 tests); connection card suite final rerun passed (48 tests): 108 focused tests passed across four suites. Initial failures identified the intentionally changed effort label and a PowerShell text-encoding issue in a separator; both were corrected.
- Chat tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json: passed.
- ESLint on four changed TS/spec files: passed; final card-only pass also passed.
- Prettier on all six changed source/test files: applied; final check passed.
- ui-class-audit: 0 token counts over baseline, including raw spacing; baseline unchanged.
- git diff --check: passed.

No Playwright, npm run verify, nx, build, serve or e2e commands were run. Actual Electron/e2e behavior remains for the authorized CI workflow to confirm.
