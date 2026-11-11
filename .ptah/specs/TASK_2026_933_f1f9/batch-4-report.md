# Batch 4 Report — Pure Deletion (`TASK_2026_933_f1f9`)

## Paths to delete

```
libs/frontend/harness-builder
libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts
libs/frontend/onboarding/src/lib/proposal/answer-dock.component.spec.ts
libs/frontend/onboarding/src/lib/proposal/apply-result.component.ts
libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts
libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.spec.ts
libs/frontend/onboarding/src/lib/proposal/proposal-item.component.ts
libs/frontend/onboarding/src/lib/proposal/proposal-panel.component.ts
libs/frontend/onboarding/src/lib/proposal/proposal-section.component.ts
libs/frontend/onboarding/src/lib/proposal/proposal-session-status.ts
libs/frontend/onboarding/src/lib/proposal/proposal-session-status.spec.ts
libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.ts
libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.spec.ts
libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts
libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.spec.ts
libs/frontend/onboarding/src/lib/proposal/proposal-workspace.render.spec.ts
libs/frontend/onboarding/src/lib/proposal/reply-composer.component.ts
libs/frontend/onboarding/src/lib/proposal/reply-composer.component.spec.ts
libs/frontend/onboarding/src/lib/proposal/reply-draft.store.ts
libs/frontend/onboarding/src/lib/proposal/reply-draft.store.spec.ts
libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts
libs/frontend/onboarding/src/lib/proposal/review-apply.page.spec.ts
libs/frontend/onboarding/src/lib/proposal/review-summary.component.ts
libs/frontend/onboarding/src/lib/proposal/revision-history.component.ts
libs/frontend/onboarding/src/lib/proposal/revision-history.component.spec.ts
```

## Edited files

- `libs/frontend/onboarding/src/lib/shared/builder-session-section.component.ts` — Created by relocating `BuilderSessionSectionComponent` (`ptah-builder-session-section`) unchanged from `libs/frontend/harness-builder/src/lib/components/sidebar/builder-session-section.component.ts` for its live `DetailsLogComponent` consumer in Analyze flow.
- `libs/frontend/onboarding/src/lib/shared/builder-session-section.component.spec.ts` — Created by relocating the unit spec unchanged from `libs/frontend/harness-builder/src/lib/components/sidebar/builder-session-section.component.spec.ts`.
- `libs/frontend/onboarding/src/lib/shared/details-log.component.ts` — Repointed `BuilderSessionSectionComponent` import from `@ptah-extension/harness-builder` to `./builder-session-section.component`.
- `libs/frontend/onboarding/src/lib/shared/details-log.component.spec.ts` — Repointed `BuilderSessionSectionComponent` import from `@ptah-extension/harness-builder` to `./builder-session-section.component`.
- `libs/frontend/core/src/lib/routing/onboarding-routes.ts` — Removed stale JSDoc comments naming the deleted `harness-builder` library while preserving runtime function signatures.
- `libs/frontend/core/src/lib/services/app-state.service.ts` — Removed stale comments referencing deleted `HarnessWorkflowMessageHandler` and `HarnessBuilderViewComponent`.
- `apps/ptah-electron-e2e/src/specs/tasks/message-handlers-eager.spec.ts` — Removed dead `HarnessWorkflowMessageHandler` (`harness:open-workflow` -> `ptah-proposal-workspace-page`) test and updated header comments + `test.describe` title while keeping both `TasksStore` tests intact.
- `apps/ptah-electron-e2e/src/specs/harness/new-project-question-routing.spec.ts` — Updated New Project question-routing E2E spec from `ptah-proposal-workspace-page` / `ptah-details-log` to the live `/onboarding/new-project` -> `HarnessChatLauncherService` -> `ptah-chat-view` `ptah-question-card` flow (mocking `harness:initialize` so the folder check enables `Continue`).
- `tsconfig.base.json` — Removed `@ptah-extension/harness-builder` and `@ptah-extension/harness-builder/services` compiler path aliases.
- `eslint.config.mjs` — Removed `'@ptah-extension/harness-builder/services'` from `checkDynamicDependenciesExceptions`.
- `nx.json` — Removed `"libs/frontend/harness-builder/**/*"` from the `@nx/eslint/plugin` and `@nx/jest/plugin` `include` lists.
- `.commitlintrc.json` — Removed `"harness-builder"` from `scope-enum`.
- `.github/ci/test-weights.json` — Removed `"@ptah-extension/harness-builder": 51.295` test shard weight entry.
- `tools/degradation-audit/baseline.json` — Removed stale `"libs/frontend/harness-builder": 3` baseline entry.
- `tools/ui-class-audit/baseline.json` — Removed 6 `libs/frontend/harness-builder/...` entries and 9 deleted `libs/frontend/onboarding/src/lib/proposal/...` component entries (retained `new-project-intake.page.ts` and `team-builder-start.page.ts`).

## Preserve list

| capability | old location | status |
| --- | --- | --- |
| Collapsible session context & cost summary (`BuilderSessionSectionComponent` / `ptah-builder-session-section`, consumed by `DetailsLogComponent` in Analyze flow) | `libs/frontend/harness-builder/src/lib/components/sidebar/builder-session-section.component.ts` | moved to `libs/frontend/onboarding/src/lib/shared/builder-session-section.component.ts` |
| New-project intake model, defaults, validation & summary formatter (`NewProjectIntake`, `EMPTY_NEW_PROJECT_INTAKE`, `isNewProjectIntakeValid`, `formatIntakeSummary`) | `libs/frontend/harness-builder/src/lib/services/new-project-intake.ts` | moved to `libs/frontend/onboarding/src/lib/proposal/new-project-intake.model.ts` |
| Launching `/onboarding/new-project` (`harness:initialize` folder check, `harness:start-new-project`, chat tab creation, `chat:start` seed prompt) | `libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts` & `libs/frontend/harness-builder/src/lib/services/harness-session.controller.ts` | replaced by `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts` |
| Launching `/onboarding/team-builder` (`harness:workflow-prompt`, chat tab creation, `chat:start` seed prompt) | `libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts` & `libs/frontend/harness-builder/src/lib/services/harness-session.controller.ts` | replaced by `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts` |
| Interactive harness session workspace (`ProposalWorkspacePage` — streaming turns, message transcript, stop/retry) | `libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts` | replaced by `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` |
| Clarifying-question card dock & reply composer (`AnswerDockComponent`, `ReplyComposerComponent`, `ReplyDraftStore`) | `libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts`, `libs/frontend/onboarding/src/lib/proposal/reply-composer.component.ts`, `libs/frontend/onboarding/src/lib/proposal/reply-draft.store.ts` | replaced by `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` |
| Session status derivation & banner (`proposal-session-status.ts`, `ProposalStatusCardComponent`) | `libs/frontend/onboarding/src/lib/proposal/proposal-session-status.ts`, `libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.ts` | replaced by `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` |
| Push ingestion & RPC hydration of `HARNESS_CONFIG_PROPOSED` / `harness:get-proposal` (`HarnessBuilderStateService.handleMessage`, `HarnessProposalHydrationService`, `HarnessRpcService.getProposal`) | `libs/frontend/harness-builder/src/lib/services/harness-builder-state.service.ts`, `libs/frontend/harness-builder/src/lib/services/harness-proposal-hydration.service.ts`, `libs/frontend/harness-builder/src/lib/services/harness-rpc.service.ts` | replaced by `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts` |
| Reviewing proposed agents/skills/MCPs/hooks/CLAUDE.md & applying via `harness:apply` (`ReviewApplyPage`, `ProposalPanelComponent`, `ProposalSectionComponent`, `ProposalItemComponent`, `ReviewSummaryComponent`, `ApplyResultComponent`) | `libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts`, `libs/frontend/onboarding/src/lib/proposal/proposal-panel.component.ts`, `libs/frontend/onboarding/src/lib/proposal/proposal-section.component.ts`, `libs/frontend/onboarding/src/lib/proposal/proposal-item.component.ts`, `libs/frontend/onboarding/src/lib/proposal/review-summary.component.ts`, `libs/frontend/onboarding/src/lib/proposal/apply-result.component.ts` | replaced by `libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.ts` |
| Proposal revision history switcher (`RevisionHistoryComponent`) | `libs/frontend/onboarding/src/lib/proposal/revision-history.component.ts` | removed, user approved |
| Host `HARNESS_OPEN_WORKFLOW` push handler & cross-surface workflow request queue (`HarnessWorkflowMessageHandler`, `HarnessWorkflowRequestService`, `harness-workflow-utils.ts`) | `libs/frontend/harness-builder/src/lib/services/harness-workflow-message.handler.ts`, `libs/frontend/harness-builder/src/lib/services/harness-workflow-request.service.ts`, `libs/frontend/harness-builder/src/lib/services/harness-workflow-utils.ts` | removed, user approved |
| LocalStorage harness session records (`HarnessBuilderRecordsService`) | `libs/frontend/harness-builder/src/lib/services/harness-builder-records.service.ts` | removed, user approved |
| Legacy harness builder sidebar, config preview, AI helpers, presets & leave dialog (`HarnessConfigPreviewComponent`, `HarnessBuilderLeaveDialogComponent`, `HarnessHelperService`, `sidebar/*` except `BuilderSessionSectionComponent`) | `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts`, `libs/frontend/harness-builder/src/lib/components/harness-builder-leave-dialog.component.ts`, `libs/frontend/harness-builder/src/lib/services/harness-helper.service.ts`, `libs/frontend/harness-builder/src/lib/components/sidebar/` | removed, user approved |

## Proposed Removals

None

## Remaining references

- **Host `HARNESS_OPEN_WORKFLOW` / `'harness:open-workflow'` sender check**: Verified zero senders exist anywhere in `apps/ptah-electron/src` or `libs/backend` (`apps/ptah-extension-vscode` is not present in `apps/`). The shared message constant and payload contract (`libs/shared/src/lib/types/messages/message-types.ts`, `libs/shared/src/lib/types/messages/payload-map.ts:245, 490`) remain untouched per `libs/shared` boundary rules.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts:36, 187-200` — Intentional negative redirect guard (`LEGACY_WORKSPACE_ROUTE = '/onboarding/new-project/workspace?tab=...'`) asserting removed `/workspace` routes redirect cleanly to `onboarding-home`.
- `libs/frontend/onboarding/src/lib/onboarding.routes.spec.ts` & `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:359, 486` — Intentional negative routing specs asserting legacy `initialView: 'harness-builder'`, persisted `'/harness-builder/configure-harness/old-tab'`, and removed `new-project/workspace`, `new-project/review`, `team-builder/workspace`, `team-builder/review` URLs redirect to `/onboarding`.
- `libs/shared/src/lib/types/webview-surface.types.ts:58, 100, 106, 115` — Load-bearing legacy wire alias (`ViewType`, `LegacySurfaceAlias`, `LEGACY_SURFACE_ALIASES`, `LEGACY_SURFACE_TARGETS`) mapping host-supplied `'harness-builder'` views onto `'onboarding'`.
- `libs/shared/src/lib/types/webview-surface.types.spec.ts:53` — Contract spec verifying `LEGACY_SURFACE_TARGETS['harness-builder'] === 'onboarding'`.
- `libs/frontend/core/src/lib/services/app-state.service.spec.ts:224, 267` — Specs verifying `normalizeInitialView('harness-builder')` and `SWITCH_VIEW` with `'harness-builder'` navigate to `/onboarding`.
- `apps/ptah-extension-webview/src/app/app.routes.spec.ts:164` — Regression guard asserting `'harness-builder'` is not a top-level route in `appRoutes`.
- `apps/ptah-extension-webview/src/app/unit5-message-routing.spec.ts:7, 11, 132, 144, 145` — Bundle-boundary regression guard asserting `app.routes.ts` and `app.config.ts` never import `@ptah-extension/harness-builder` (plus historical Unit 5 header comment).
- `eslint.config.mjs:243` — Historical `TASK_2026_187` Unit 5 bundle-size measurement comment (`-40,694 B (harness-builder)`), preserved per documentation-integrity rules.
- `.ptah/specs/TASK_2026_933_f1f9/context.md`, `investigation.md`, `implementation-plan.md`, `batch-2-report.md`, `batch-3-report.md`, `batch-4-report.md` — Task specification and batch reports documenting this deletion.

## Nx projects to verify

- `@ptah-extension/onboarding`
- `@ptah-extension/core`
- `degradation-audit`
- `ui-class-audit`
- `ptah-electron-e2e` (edited, not run)
- `ptah-extension-webview` (downstream consumer of `@ptah-extension/onboarding` and `@ptah-extension/core`)

## Decisions

1. **Relocated `BuilderSessionSectionComponent` into `@ptah-extension/onboarding`**: Moved `builder-session-section.component.ts` and `builder-session-section.component.spec.ts` unchanged into `libs/frontend/onboarding/src/lib/shared/` and repointed `details-log.component.ts` and `details-log.component.spec.ts` to `./builder-session-section.component`, preserving Analyze flow's `DetailsLogComponent` session summary while decoupling `@ptah-extension/onboarding` from `@ptah-extension/harness-builder`.
2. **Full `libs/frontend/harness-builder` directory + 24 dead `proposal/*` files scheduled for deletion**: Added `proposal-workspace.render.spec.ts` alongside the 23 dead `proposal/*` files, while retaining the 5 live launcher files (`new-project-intake.page.ts`, `new-project-intake.page.spec.ts`, `team-builder-start.page.ts`, `team-builder-start.page.spec.ts`, `new-project-intake.model.ts`) and their 2 `ui-class-audit` baseline entries.
3. **Updated Electron E2E specs for the chat-launched New Project flow**: Removed the obsolete `HarnessWorkflowMessageHandler` (`harness:open-workflow` -> `ptah-proposal-workspace-page`) test from `tasks/message-handlers-eager.spec.ts` while retaining both `TasksStore` R4 tests, and updated `harness/new-project-question-routing.spec.ts` to mock `harness:initialize`, submit `/onboarding/new-project`, verify transition to `ptah-chat-view`, and answer `ptah-question-card` in the normal chat session.
4. **Cleaned CI test weights & audit baselines**: Removed `@ptah-extension/harness-builder` from `.github/ci/test-weights.json`, `tsconfig.base.json`, `eslint.config.mjs`, `nx.json`, `.commitlintrc.json`, `tools/degradation-audit/baseline.json`, and `tools/ui-class-audit/baseline.json`.
5. **Preserved backend `harness:*` RPC handlers, shared wire contracts, and `onboardingHarnessTarget` signature**: Left `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts`, `libs/shared` message/RPC/surface-alias contracts, and `onboardingHarnessTarget` optional `_tabId` / `_step` parameters untouched.
