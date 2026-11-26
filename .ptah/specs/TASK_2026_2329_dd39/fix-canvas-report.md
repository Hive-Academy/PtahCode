# Canvas and overlay consumer fix report

## Outcome

Finding 4 is corrected. The Canvas rail card suite passes with its action and keyboard assertions intact. The allowed consumer audit found and fixed the same stale host-local query pattern in chat-ui, tasks-ui, skill-synthesis-ui, marketplace, git-ui, dashboard, onboarding, and non-settings chat specs.

One unowned production defect remains: `NativeModalComponent` no longer traps Tab focus. The task-create-dialog assertion for this behavior remains active and failing. No test was deleted or skipped, and no `npm run verify`, Nx, build, serve, dev, end-to-end, commit, or push command was run.

## Finding 4: Canvas rail card

### Root causes

- `canvas-rail-card.component.spec.ts` queried the fixture host for menu and Rename content that now renders in the CDK overlay container.
- `CanvasRailCardComponent.menuItems()` also queried the actions host. This was a production keyboard-navigation regression, not only a test failure.
- The host class `[&>.popover-panel]:p-0` could not reach the portaled Rename panel. `NativePopoverComponent` has no `panelClass` input. It exposes the attached panel through `panel()`.

### Fixes

- Added host-or-`OverlayContainer` query helpers to the spec. Updated menu, Rename, action, focus, Escape, and backdrop queries without weakening their assertions.
- Changed `menuItems()` to query the referenced menu content in the portal.
- Removed the direct-child panel selector. `onRenameOpened()` now adds `p-0` to `renamePopover.panel().nativeElement`.
- The geometry test asserts `p-0` on the actual attached popover panel.

### Canvas verification

`npx jest --config libs/frontend/canvas/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts libs/frontend/canvas/src/lib/orchestra-canvas.component.spec.ts libs/frontend/canvas/src/lib/orchestra-canvas.rail.spec.ts`

Result: **3 suites passed, 102 tests passed**.

`npx tsc --noEmit --project libs/frontend/canvas/tsconfig.lib.json`

Result: **passed**.

`npx tsc --noEmit --project libs/frontend/canvas/tsconfig.spec.json`

Result: **failed on unrelated existing errors** in `canvas-rail-board.component.spec.ts`, `libs/frontend/core/src/testing/mock-rpc-service.ts`, shared BigInt targets, and `libs/worker-protocol/src/lib/pairing-code.ts`. No diagnostic named the changed Canvas rail card files.

## Other consumer fixes

| Consumer | Root cause and fix | Final focused Jest result |
| --- | --- | --- |
| `InspectorSessionStatsComponent` | Added overlay query helpers for the model breakdown. Escape now targets the open panel instead of the trigger. | 23 tests passed. |
| `DenyMessagePopoverComponent` through `PermissionRequestCardComponent` | Checked the parent spec. No change needed. | 7 tests passed. |
| `TaskCreateDialogComponent` | Added overlay queries and CDK dialog structure queries. Updated Escape and backdrop event targets while preserving busy, idle, submit, and focus assertions. | 9 tests passed, 1 focus-trap test failed; see the unowned defect below. |
| `TasksViewComponent` | Added overlay queries for the create dialog and exclusions drawer. Removed unused host and fixture variables after the query changes. | 72 tests passed. |
| `ReconcileGuardComponent` | Added overlay modal queries. Replaced the removed native `cancel` event with Escape and replaced `open`-attribute checks with attachment checks. | Shared run below. |
| `QuarantinedAgentsPanelComponent` | Added host-or-overlay test ID queries for restore and reconcile dialogs. | Shared run: 2 suites, 36 tests passed. |
| `HarnessHealthBadgeComponent` | Added overlay test ID queries and moved the panel error-text assertion to the overlay. | Shared run below. |
| `RemovalLockBadgeComponent` | Added overlay detail queries and scoped the heading query to the panel. The two-instance test selects the newest attached panel. | Shared run: 2 suites, 37 tests passed. |
| `ComparisonBarComponent` | Added the overlay fallback to `byTestId`. | Shared run below. |
| `DraftCommentsBarComponent` | Added the overlay fallback to the test ID helper. | Shared run: 2 suites, 25 tests passed. |
| `ProviderLimitCardComponent` | Moved the Details description-list query to the overlay. | 13 tests passed. |
| `InstallGuideModalComponent` through `ProviderPanelComponent` | Replaced native `<dialog>` queries with the CDK dialog container. Retained tab, Escape, backdrop, close, and re-check assertions. | 19 tests passed. |
| `StackSkillConsentComponent` through `StackSkillReviewComponent` | Checked the parent spec. No change needed. | 20 tests passed. |
| `McpStatusChipComponent` | Moved portaled connector-notice text assertions to the overlay. | Shared run below. |
| `SessionFilterBarComponent` | Added the overlay fallback to the test ID helper. | Shared run: these 2 suites passed with 44 tests. |
| `SendToMessagingComponent` | Uses a native-popover stub. No change needed. | Passed in the combined chat run. |
| `AppShellComponent` | Checked all five specs, including Previous sessions. No change needed. | Passed in the combined chat run. |
| `ReviewLanesSectionComponent` | No change needed. | 9 tests passed. |
| `OrchestraCanvasComponent` | No change needed beyond the Canvas card work. | Included in the 102-test Canvas run. |

The final combined chat consumer state is **8 suites and 116 tests passed**: MCP status, session filters, Send to messaging, and all five App shell specs.

## Consumers checked

Static consumer search covered `NativePopoverComponent`, `NativeModalComponent`, `ptah-native-popover`, `ptah-native-modal`, `ptah-popover`, and `ptah-dropdown` outside the excluded UI, Settings, composer, provider-picker, and provider-consumer ownership areas.

- Canvas: `CanvasRailCardComponent`, `OrchestraCanvasComponent`.
- Chat UI: `InspectorSessionStatsComponent`, `DenyMessagePopoverComponent` through its permission-card parent.
- Chat, excluding composer and other assigned areas: `McpStatusChipComponent`, `SessionFilterBarComponent`, `SendToMessagingComponent`, `AppShellComponent`.
- Tasks UI: `TaskCreateDialogComponent`, plus its `TasksViewComponent` parent and the exclusions drawer.
- Skill synthesis UI: `ReconcileGuardComponent`, `QuarantinedAgentsPanelComponent`.
- Review runs UI: `ReviewLanesSectionComponent`.
- Onboarding: `InstallGuideModalComponent`, `StackSkillConsentComponent` through their parent specs.
- Marketplace: `HarnessHealthBadgeComponent`, `RemovalLockBadgeComponent`.
- Git UI: `ComparisonBarComponent`, `DraftCommentsBarComponent`.
- Dashboard: `ProviderLimitCardComponent`.
- Webview end-to-end harness: `lock-popover-stacking.e2e.spec.ts` already uses `closest('.popover-panel')`, which is portal-compatible. It was not run because the permitted checks exclude end-to-end targets.

The direct-child CSS search found no remaining consumer selector for `> .popover-panel`, `> .dropdown-panel`, or a direct-child native overlay host after the Canvas fix.

## Unowned production findings

### NativeModalComponent lost Tab trapping

`libs/frontend/ui/src/lib/native/modal/native-modal.component.ts` imports `CdkScrollable` but not `CdkTrapFocus`. The migration removed the former `onKeydown` implementation that wrapped Tab and Shift+Tab. The task-create-dialog test `wraps Tab from the last control back to the first` now receives `event.defaultPrevented === false`.

Required owner action: restore focus trapping in `NativeModalComponent`, preferably with `CdkTrapFocus` on the attached panel, and retain the existing forward and backward keyboard coverage. I did not edit this file and did not weaken the failing assertion.

Focused command:

`npx jest --config libs/frontend/tasks-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.spec.ts`

Result: **1 suite failed; 9 tests passed, 1 test failed**.

### TaskCreateDialogComponent retains obsolete native-dialog hooks

`libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.ts:229` queries the host for a native `<dialog>`, and `:269` checks for the old `.modal-backdrop` in a host click handler. Those elements no longer implement the CDK modal contract. The busy and idle cancellation tests pass because `cancelIfIdle()` still guards the output, so this is stale production code rather than the remaining test blocker. The component owner should remove or adapt these hooks during the modal follow-up.

## Files changed

- `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts`
- `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts`
- `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/mcp-status-chip.component.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.spec.ts`
- `libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.spec.ts`
- `libs/frontend/tasks-ui/src/lib/components/tasks-view.component.spec.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.spec.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/reconcile-guard.spec.ts`
- `libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.spec.ts`
- `libs/frontend/marketplace/src/lib/ui/removal-lock-badge.component.spec.ts`
- `libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.spec.ts`
- `libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.spec.ts`
- `libs/frontend/dashboard/src/lib/components/plan-limits/provider-limit-card.component.spec.ts`
- `libs/frontend/onboarding/src/lib/ready/provider-panel.component.spec.ts`
- `.ptah/specs/TASK_2026_2329_dd39/fix-canvas-report.md`

## Lint

The final `npx eslint` run covered every changed TypeScript file above.

Result: **0 errors, 19 pre-existing warnings**. The warnings are non-null assertions in the Canvas spec and the Canvas component's existing `max-lines` warning.
