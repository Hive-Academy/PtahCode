# Batch 3 Report — Thin Chat Launchers, Route Updates & Resume/Focus Rewiring (`TASK_2026_933_f1f9`)

## Changed files

### Created
- `libs/frontend/onboarding/src/lib/proposal/new-project-intake.model.ts` — Pure intake model, option tables (`NEW_PROJECT_AUDIENCE_OPTIONS`, `NEW_PROJECT_PLATFORM_OPTIONS`), `EMPTY_NEW_PROJECT_INTAKE`, `platformLabel`, `isNewProjectIntakeValid` (`isNewProjectIntake`), and `formatIntakeSummary`, relocated out of `@ptah-extension/harness-builder` using only `@ptah-extension/shared`.
- `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts` — `HarnessChatLauncherService` (`checkFolderEmpty`, `launchNewProject`, `launchTeamBuilder`, `workspaceRoot`) orchestrating backend preparation RPCs, tab creation, workflow tagging, `firstMessagePreamble`, Orchestra Canvas adoption, view switch to `'chat'`, and visible first-message dispatch with attachments.
- `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.spec.ts` — Unit tests covering `checkFolderEmpty`, exact 6-step launch call order (`createTab` -> `setWorkflow` -> `setFirstMessagePreamble` -> `requestCanvasTab` -> `setCurrentView('chat')` -> `sendOrQueueMessage` -> `removeSent`), attachment forwarding, preparation RPC error handling (no tab created, attachments preserved), `sendOrQueueMessage` failure handling, and missing-workspace rejection.

### Modified
- `libs/frontend/onboarding/src/index.ts` — Exported `HarnessChatLauncherService`, `HarnessChatLaunchResult`, `LauncherAttachmentSnapshot`, and `new-project-intake.model` helpers from the lazy `@ptah-extension/onboarding` barrel (`@ptah-extension/onboarding/services` kept narrow for eager bootstrap bundle isolation).
- `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts` — Converted `/onboarding/new-project` into a thin launcher backed by `HarnessChatLauncherService` and `./new-project-intake.model`; removed `ProposalFlowStore`, `HarnessRpcService`, stepper (`NEW_PROJECT_STEPS`), "Continue your draft" banner, and `HarnessBuilderLeaveDialogComponent`; preserved folder-emptiness check, non-empty folder confirmation, validation, and composer attachments; added `actionError` alert on launch failure.
- `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.spec.ts` — Rewrote unit tests around `HarnessChatLauncherService` covering validation, non-empty folder confirmation, folder check retry, chat launch with attachments, failure alert + Continue re-enable + attachment preservation, pending attachment preservation, and absence of stepper/draft/leave-dialog DOM.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` — Converted `/onboarding/team-builder` into a thin launcher backed by `HarnessChatLauncherService`; removed `ProposalFlowStore`, stepper (`TEAM_STEPS`), "Load saved draft" button, and `HarnessBuilderLeaveDialogComponent`; preserved composer attachments and added `actionError` alert on launch failure.
- `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` — Rewrote unit tests around `HarnessChatLauncherService` covering intent validation, chat launch with attachments, failure alert + button re-enable + attachment preservation, pending attachment preservation, and absence of stepper/"Load saved draft"/leave-dialog DOM.
- `libs/frontend/onboarding/src/lib/onboarding.routes.ts` — Flattened `new-project` (`NewProjectIntakePage`) and `team-builder` (`TeamBuilderStartPage`) routes, removing `ProposalFlowStore`, `HARNESS_FLOW_MODE`, `ProposalWorkspacePage`, `ReviewApplyPage`, and child routes `workspace` and `review`; kept `/onboarding/ready`, `/onboarding/analyze/**`, `/onboarding/guidance`, and trailing `**` fallback intact.
- `libs/frontend/onboarding/src/lib/onboarding.routes.spec.ts` — Asserted flat `new-project` and `team-builder` routes have no `providers` or `children`, resolve directly before `**`, and redirect legacy `/onboarding/*/workspace` and `/onboarding/*/review` URLs to `/onboarding` while preserving `ready`, `analyze/**`, and `guidance` checks.
- `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts` — Updated `onEntryPage` (`line 112`) from `(path === 'new-project' || path === 'team-builder') && child?.firstChild?.routeConfig?.path === ''` to `path === 'new-project' || path === 'team-builder'` so `<ptah-workspace-header>` is not rendered twice now that both routes are flat.
- `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.spec.ts` — Added coverage verifying `<ptah-workspace-header>` is omitted by the shell on flat `/onboarding/new-project` and `/onboarding/team-builder` routes (while showing crumbs `'New project'` / `'AI team builder'`) and rendered on `/onboarding/analyze`.
- `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.ts` — Removed `'new-project-workspace'`, `'new-project-review'`, `'team-builder-workspace'`, `'team-builder-review'`, and proposal entries from `STEP_OWNERS` and `OWNER_KEYS`; retained standalone `'new-project'` and `'team-builder'` step targets alongside Analyze/Guidance step links.
- `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.spec.ts` — Updated unit tests for standalone `'new-project'` and `'team-builder'` launcher links and Analyze/Guidance identity transitions.
- `libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts` — Replaced 2 dead `onboardingStepLink` calls with direct `router.navigate` arrays so `@ptah-extension/onboarding` compiles cleanly prior to Batch 4 deleting dead proposal pages.
- `libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts` — Replaced 2 dead `onboardingStepLink` calls with direct `router.navigate` arrays so `@ptah-extension/onboarding` and `review-apply.page.spec.ts` compile and pass prior to Batch 4 deleting dead proposal pages.
- `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` — Removed `HarnessBuilderRecordsService`, `canonicalHarnessRoot`, `onboardingHarnessTarget`, and `harness-new-project` / `harness-configure` draft/session discovery; added `// degradation-audit: optional-capability` annotations on the two existing RPC catch blocks; preserved `analysis`, `setup-agent-generation`, and `setup-project-prompt` resume discovery.
- `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts` — Updated unit tests to verify `harness-new-project` and `harness-configure` tabs produce zero Home resume banners while `analysis`, `setup-agent-generation`, and `setup-project-prompt` resume items continue working.
- `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts` — Updated `New project` and `AI team builder` tile descriptions (`lines 274, 285`) to describe launching a guided chat session.
- `libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts` — Asserted `/onboarding/new-project` and `/onboarding/team-builder` tile links and updated chat-session descriptions.
- `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts` — Removed `onboardingHarnessTarget` and the `'harness-new-project' | 'harness-configure'` branch from `targetFor()` so harness chat sessions fall through to standard chat tab notification focus while `'setup-agent-generation'` and `'setup-project-prompt'` remain handled.
- `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.spec.ts` — Verified `'setup-agent-generation'` and `'setup-project-prompt'` still focus onboarding while `'harness-new-project'` and `'harness-configure'` return `canFocus(...) === false` and `{ success: false, outcome: 'missing' }`.
- `libs/frontend/core/src/lib/routing/onboarding-routes.ts` — Simplified `onboardingHarnessTarget` to return only flat `{ subPath: ['new-project' | 'team-builder'], queryParams: {} }` (never `'workspace'` or `'review'`), keeping ignored optional legacy parameters so `harness-builder` compiles until Batch 4 deletes it.
- `libs/frontend/core/src/lib/routing/onboarding-routes.spec.ts` — Updated `onboardingHarnessTarget` tests to assert flat launcher targets and confirm optional legacy step args never append `'workspace'` or `'review'`.
- `apps/ptah-extension-webview/src/app/app.config.ts` — Removed `HarnessWorkflowMessageHandler` (`@ptah-extension/harness-builder/services`) from `app.config.ts` and registered `...provideHarnessChatProposalStore()` (`@ptah-extension/chat`) in `appConfig.providers`.
- `apps/ptah-extension-webview/src/app/unit5-message-routing.spec.ts` — Replaced `HarnessWorkflowMessageHandler` tests with `provideHarnessChatProposalStore()` / `HarnessChatProposalStore` push-delivery checks (`harness:config-proposed`), and asserted `app.config.ts` and `app.routes.ts` have zero `@ptah-extension/harness-builder` imports.
- `apps/ptah-extension-webview/src/app/app.routes.spec.ts` — Added assertion confirming `ONBOARDING_ROUTES` declares flat `new-project` and `team-builder` routes with no `children`.
- `apps/ptah-extension-webview/src/app/webview-routing.spec.ts` — Added boot-restore tests confirming legacy `/onboarding/new-project/workspace` and `/onboarding/team-builder/review` routes redirect inside onboarding to `/onboarding`, plus source gate assertions for `provideHarnessChatProposalStore()` and removal of `HarnessWorkflowMessageHandler`.
- `libs/frontend/chat-routing/src/lib/stream-router.setup-surfaces.spec.ts` — Updated `New Project` (`harness-new-project`) and `AI Team Builder` (`harness-configure`) prompt-routing tests to verify unclaimed standard chat tabs (`TabId` via `router.onTabCreated`) receive questions and permissions before and after `session:id-resolved` without leaking across tabs, while `Workspace Analysis` background surface auto-answer/auto-deny behavior remains intact.
- `libs/frontend/chat-routing/src/lib/__tests__/surface-vs-tab-parity.spec.ts` — Added parity assertion confirming a workflow-tagged harness chat tab (`router.onTabCreated` + `router.routeStreamEvent`) accumulates `StreamingState` via `StreamingAccumulatorCore` with zero `StreamingSurfaceRegistry` adapters registered.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal.fixtures.ts` — Added `'chat:start'`, `'chat:continue'`, and `'chat:stop'` RPC fixtures and removed obsolete `ptah.harness.builder.v1.*` `localStorage` seeding.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts` — Kept `new-project-intake`, `new-project-intake-errors`, and `team-builder-start` captures (verifying `[aria-label="Progress"]` stepper count is 0), replaced deleted `/workspace` and `/review` scenarios with `new-project-launches-chat`, `team-builder-launches-chat`, and `legacy-workspace-route-redirects-home`.

## Behaviour
- Submitting **New project** (`/onboarding/new-project`) validates the intake, checks folder emptiness via `harness:initialize`, calls `harness:start-new-project` via `ClaudeRpcService`, creates a `'New Project'` tab tagged `'harness-new-project'`, stores `seedPrompt` on `firstMessagePreamble`, requests Orchestra Canvas adoption (`requestCanvasTab(tabId, workspacePath, 'New Project', true)`), switches view to `'chat'`, dispatches `formatIntakeSummary(intake)` with composer attachments via `ChatStore.sendOrQueueMessage`, and clears sent attachments via `removeSent()`.
- Submitting **AI team builder** (`/onboarding/team-builder`) validates the intent, calls `harness:workflow-prompt` (`{ mode: 'configure-harness', contextOnly: true }`) via `ClaudeRpcService`, creates an `'AI Team Builder'` tab tagged `'harness-configure'`, stores `prompt` on `firstMessagePreamble`, requests Orchestra Canvas adoption (`requestCanvasTab(tabId, workspacePath, 'AI Team Builder', true)`), switches view to `'chat'`, dispatches the user's trimmed `intent` with composer attachments via `ChatStore.sendOrQueueMessage`, and clears sent attachments via `removeSent()`.
- If preparation RPC fails (or no workspace is open), no chat tab is created, the user stays on the form with a readable `role="alert"` error message, the submit button re-enables, and attachments are preserved.
- Both launcher pages render as single-step entry forms with no false multi-step progress bar, no draft banner/"Load saved draft" button, and no leave-confirmation dialog.
- Legacy `/onboarding/new-project/workspace`, `/onboarding/new-project/review`, `/onboarding/team-builder/workspace`, and `/onboarding/team-builder/review` URLs hit the trailing `**` fallback in `ONBOARDING_ROUTES` and redirect cleanly to `/onboarding`.
- `OnboardingResumeStore` and `OnboardingFocusRouter` no longer intercept `harness-new-project` or `harness-configure` tabs; those sessions live in the normal chat tab strip / Orchestra Canvas and focus via standard chat tab routing, while `analysis`, `setup-agent-generation`, and `setup-project-prompt` onboarding resume/focus behavior is unchanged.
- `app.config.ts` registers `provideHarnessChatProposalStore()` at bootstrap in place of `HarnessWorkflowMessageHandler` so `harness:config-proposed` push messages are captured even before a chat component mounts.

## Differences from the plan
1. **`harness:workflow-prompt` RPC payload (`libs/shared/src/lib/types/rpc/rpc-harness.types.ts:534-547`, `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:963-971`, `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts:17-25, 85-89`)**:
   - The plan's Target Call Chain (`implementation-plan.md:74`) sketched `harness:initialize` + `harness:workflow-prompt` with `{ mode: 'configure-harness', userGoal: intent, ... }`.
   - In the actual shared contract and backend Zod schema (`HarnessWorkflowPromptParamsSchema`), `userGoal` does not exist; `HarnessWorkflowPromptParams` is `{ mode: 'configure-harness'; intent: string; contextOnly?: never } | { mode: 'configure-harness'; contextOnly: true; intent?: never }`, and `HarnessWorkflowPromptService.composePrompt` resolves `workspaceContext`, `availableAgents`, and `availableSkills` on the backend itself. `HarnessChatLauncherService.launchTeamBuilder` calls `ClaudeRpcService.call('harness:workflow-prompt', { mode: 'configure-harness', contextOnly: true })` (matching `libs/frontend/harness-builder/src/lib/services/harness-session.controller.ts:355-359`) so the hidden preamble does not duplicate `intent` before `ChatStore.sendOrQueueMessage(trimmedIntent, ...)` appends it.
2. **Source path of `new-project-intake.model.ts` (`libs/frontend/harness-builder/src/lib/services/new-project-intake.ts:1-69`, `libs/frontend/harness-builder/src/lib/services/harness-workflow-utils.ts:19-57`)**:
   - The plan (`implementation-plan.md:201`) cited `libs/frontend/harness-builder/src/lib/models/new-project-intake.ts`; in the workspace those pure symbols lived in `libs/frontend/harness-builder/src/lib/services/new-project-intake.ts` and `harness-workflow-utils.ts`. Both were consolidated cleanly into `libs/frontend/onboarding/src/lib/proposal/new-project-intake.model.ts`.
3. **Actual project and paths of stream-router specs (`libs/frontend/chat-routing/project.json:2`, `libs/frontend/chat-routing/src/lib/stream-router.setup-surfaces.spec.ts:1`, `libs/frontend/chat-routing/src/lib/__tests__/surface-vs-tab-parity.spec.ts:1`)**:
   - The plan (`implementation-plan.md:266-267, 281`) listed `libs/frontend/chat-streaming/src/lib/stream-router.setup-surfaces.spec.ts` and `libs/frontend/chat-streaming/src/lib/surface-vs-tab-parity.spec.ts` under `chat-streaming`; in the workspace both specs live in `@ptah-extension/chat-routing`.
4. **Stepper & leave-dialog location vs `OnboardingShellComponent` (`libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts:74-76, 112`)**:
   - The plan (`implementation-plan.md:235-237`) mentioned `NEW_PROJECT_STEPS`, `TEAM_BUILDER_STEPS`, and `leaveConfirmationNeeded` on `onboarding-shell.component.ts`. In the workspace, steppers and `HarnessBuilderLeaveDialogComponent` lived on `NewProjectIntakePage` and `TeamBuilderStartPage` (removed there), while `onboarding-shell.component.ts:112` had `onEntryPage` gated on `child?.firstChild?.routeConfig?.path === ''` to suppress a duplicate `<ptah-workspace-header>` — updated to `path === 'new-project' || path === 'team-builder'` for the flattened routes.
5. **Core route helper & focus/resume workflow identifiers (`libs/frontend/core/src/lib/routing/onboarding-routes.ts:123-139`, `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts:50-61`, `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:49-115`)**:
   - `onboarding-routes.ts` exposes `onboardingHarnessTarget` rather than `ONBOARDING_NEW_PROJECT_WORKSPACE_ROUTE` constants; `OnboardingFocusRouter` routes `'setup-agent-generation'` and `'setup-project-prompt'` (rather than `'onboarding-analyze'`); `OnboardingResumeStore` queries `WizardRpcService` (`getResumableRun` + `getBoundRunState`) rather than `OnboardingRunStore`.
6. **Barrel export placement (`libs/frontend/onboarding/src/index.ts:11-25`, `libs/frontend/onboarding/src/services.ts:1-12`, `eslint.config.mjs:258-265`)**:
   - Exported `HarnessChatLauncherService` and `new-project-intake.model` helpers from `@ptah-extension/onboarding` (`src/index.ts`) rather than `@ptah-extension/onboarding/services` (`src/services.ts`), preserving the strict eager-bootstrap dynamic-dependency boundary enforced by `eslint.config.mjs` and `app.routes.spec.ts:169-173`.
7. **`provideHarnessChatProposalStore` import specifier (`libs/frontend/chat/src/index.ts:105-106`, `tsconfig.base.json:37-40`)**:
   - Imported `provideHarnessChatProposalStore` in `apps/ptah-extension-webview/src/app/app.config.ts:94` from `@ptah-extension/chat` (which `app.config.ts` already imports eagerly and where Batch 2 exported it; no `@ptah-extension/chat/services` path alias exists in `tsconfig.base.json`).
8. **Skill loading note**:
   - The CLI `<skills>` registry did not expose `angular-frontend-patterns`, `nx-workspace-architect`, `impeccable`, or `ui-ux-designer`; workspace skill files `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/nx-workspace-architect/SKILL.md` were read directly via `read_file` and applied. Also, per mandatory tool restrictions in this lane, no shell or MCP tools (`ptah_*` / Playwright screenshot runner) were invoked.

## Still imported from harness-builder
Zero active routes, launchers, stores, focus routers, or app bootstrap files import from `@ptah-extension/harness-builder`. Only the unrouted dead proposal files inside `libs/frontend/onboarding/src/lib/proposal/` (scheduled for deletion in Batch 4) and `libs/frontend/harness-builder/**` itself still reference `@ptah-extension/harness-builder`:
- `libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts` (`HarnessBuilderRecordsService`, `HarnessProposalHydrationService`, `HarnessSessionController`, `canonicalHarnessRoot`)
- `libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.spec.ts` (`HarnessBuilderRecordsService`, `HarnessProposalHydrationService`, `HarnessSessionController`)
- `libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts` (`BuilderAiHelpersSectionComponent`, `BuilderPresetsSectionComponent`, `HarnessBuilderLeaveDialogComponent`, `formatIntakeSummary`)
- `libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts` (`BuilderApplySectionComponent`)
- `libs/frontend/onboarding/src/lib/proposal/proposal-panel.component.ts` (`BuilderStackProfileSectionComponent`)
- `libs/frontend/onboarding/src/lib/proposal/apply-result.component.ts` (`HarnessSessionController`)
- `libs/frontend/onboarding/src/lib/proposal/revision-history.component.ts` (`HarnessProposalHydrationService`)

## Projects and specs to verify
Exact Nx project `name` values from each `project.json`:
1. `@ptah-extension/onboarding` (`libs/frontend/onboarding/project.json`)
   - `npx nx typecheck @ptah-extension/onboarding --parallel=1`
   - `npx nx lint @ptah-extension/onboarding --parallel=1`
   - Changed specs:
     - `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.spec.ts`
     - `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.spec.ts`
     - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
     - `libs/frontend/onboarding/src/lib/onboarding.routes.spec.ts`
     - `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.spec.ts`
     - `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.spec.ts`
     - `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.spec.ts`
     - `libs/frontend/onboarding/src/lib/home/onboarding-home.component.spec.ts`
     - `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.spec.ts`
2. `@ptah-extension/core` (`libs/frontend/core/project.json`)
   - `npx nx typecheck @ptah-extension/core --parallel=1`
   - `npx nx lint @ptah-extension/core --parallel=1`
   - Changed spec:
     - `libs/frontend/core/src/lib/routing/onboarding-routes.spec.ts`
3. `@ptah-extension/chat-routing` (`libs/frontend/chat-routing/project.json`)
   - `npx nx typecheck @ptah-extension/chat-routing --parallel=1`
   - `npx nx lint @ptah-extension/chat-routing --parallel=1`
   - Changed specs:
     - `libs/frontend/chat-routing/src/lib/stream-router.setup-surfaces.spec.ts`
     - `libs/frontend/chat-routing/src/lib/__tests__/surface-vs-tab-parity.spec.ts`
4. `ptah-extension-webview` (`apps/ptah-extension-webview/project.json`)
   - `npx nx typecheck ptah-extension-webview --parallel=1`
   - `npx nx lint ptah-extension-webview --parallel=1`
   - Changed specs:
     - `apps/ptah-extension-webview/src/app/unit5-message-routing.spec.ts`
     - `apps/ptah-extension-webview/src/app/app.routes.spec.ts`
     - `apps/ptah-extension-webview/src/app/webview-routing.spec.ts`
5. `@ptah-extension/webview-e2e-harness` (`libs/frontend/webview-e2e-harness/project.json`)
   - `npx nx typecheck @ptah-extension/webview-e2e-harness --parallel=1`
   - `npx nx lint @ptah-extension/webview-e2e-harness --parallel=1`
   - Changed e2e files:
     - `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal.fixtures.ts`
     - `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts`

## Decisions
- **Synchronous `void this.appState.requestCanvasTab(...)` before `setCurrentView('chat')`**: `AppStateManager.requestCanvasTab` (`libs/frontend/core/src/lib/services/app-state.service.ts:1336-1379`) returns a `Promise<boolean>` that resolves only when `OrchestraCanvasComponent`'s `effect()` drains `canvasTabRequests()` (which never resolves in VS Code webview or when the canvas is not mounted). Matching `WorkflowTabLauncherService` (`libs/frontend/chat/src/lib/services/workflow-tab-launcher.service.ts:45-49`) and `requestCanvasTab`'s own doc contract, `HarnessChatLauncherService` queues the canvas adoption synchronously with `void` and immediately switches view and sends the initial message.
- **Pre-Batch-4 compile compatibility guards**:
  1. Replaced the 4 dead `onboardingStepLink(...)` calls in `proposal-workspace.page.ts` and `review-apply.page.ts` with direct `this.router.navigate(...)` commands so `@ptah-extension/onboarding` compiles and `review-apply.page.spec.ts` passes before Batch 4 deletes those files.
  2. Kept optional ignored parameters `(_tabId?: string, _step?: 'workspace' | 'review')` on `onboardingHarnessTarget` (always returning flat `{ subPath: [flow], queryParams: {} }`) so `libs/frontend/harness-builder/src/lib/services/harness-workflow-request.service.ts:265` compiles until Batch 4 deletes `harness-builder`.

## Not done
- Test/typecheck/lint execution and live UI screenshot capture were not run in this lane because shell execution (`run_command`) and MCP tool calls (`call_mcp_tool`) were disallowed by the lane's mandatory tool constraints; the coordinator should run the verification targets listed under `## Projects and specs to verify`.
- Deletion of unrouted dead proposal files (`proposal-workspace.page.ts`, `review-apply.page.ts`, `proposal-flow.store.ts`, etc.) and `libs/frontend/harness-builder/**` was intentionally left to Batch 4 per scope boundaries.
