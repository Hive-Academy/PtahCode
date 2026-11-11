# Implementation Plan — TASK_2026_933_f1f9: Convert Setup Hub "New project" & "AI team builder" into Thin Chat Launchers

## Summary

Convert Setup Hub's **New project** (`/onboarding/new-project`, mode `new-project`) and **AI team builder** (`/onboarding/team-builder`, mode `configure-harness`) into thin launchers that run backend preparation (`harness:start-new-project` / `harness:workflow-prompt`), create a standard chat tab via `TabManagerService`, adopt it on the Orchestra Canvas via `AppStateManager.requestCanvasTab`, switch the active surface to `/chat/<tabId>` via `AppStateManager.setCurrentView('chat')`, and send the first message through `ChatStore.sendOrQueueMessage` with `firstMessagePreamble`.
Retire `ProposalWorkspacePage`, `ReviewApplyPage`, `ProposalFlowStore`, `HarnessSessionController`, and the custom `/onboarding/*/workspace` and `/onboarding/*/review` routes while keeping `/onboarding/analyze/**`, `/onboarding/guidance`, and `/onboarding/ready` intact.
Surface proposal approval directly inside `ChatViewComponent` via a compact **Proposal Apply Banner** in the `sessionControls` slot backed by the existing `harness:config-proposed` notification and `harness:apply` RPC.
Fix the four Codex `request_user_input_async` lifecycle defects (`RuntimeContext` turn-abort signal, post-turn answer re-stream, `CodexChatAdapter` session-token close, and `HostAttentionCoordinator` race) and make the harness seed prompts tool-name neutral across Claude and OpenAI Codex.

---

## Current flow

### Mode 1: "New project" (`new-project`)
1. **Hub Home entry**: `OnboardingHomeComponent` (`libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts:80-86, 281-289`) navigates to `/onboarding/new-project`, rendering `NewProjectIntakePage` (`libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts:36-423`, route at `libs/frontend/onboarding/src/lib/onboarding.routes.ts:43-47`).
2. **Folder check**: `NewProjectIntakePage.checkFolder()` (`new-project-intake.page.ts:326-347`) calls `ProposalFlowStore.checkFolderEmpty()` (`libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts:331-334`) → `HarnessRpcService.initialize()` (`libs/frontend/harness-builder/src/lib/services/harness-rpc.service.ts:43-59`) → RPC `harness:initialize` (`libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:125-182`) to verify `workspaceEffectivelyEmpty`.
3. **Submit intake**: `NewProjectIntakePage.submit()` (`new-project-intake.page.ts:349-388`) snapshots attachments via `ComposerAttachmentsService.snapshotForSend()` (`line 361`), formats `visibleMessage = formatIntakeSummary(intake)` (`line 362`, defined in `libs/frontend/harness-builder/src/lib/models/new-project-intake.ts:52-83`), and calls `ProposalFlowStore.startNewProject(intake, visibleMessage, snapshot.options)` (`proposal-flow.store.ts:199-227`).
4. **Backend preparation + custom session start**: `ProposalFlowStore.startNewProject` delegates to `HarnessSessionController.startNewProject()` (`libs/frontend/harness-builder/src/lib/services/harness-session.controller.ts:198-209`) → `HarnessWorkflowRequestService.prepareStartNewProject()` (`libs/frontend/harness-builder/src/lib/services/harness-workflow-request.service.ts:87-146`) → `HarnessRpcService.startNewProject(intake)` (`harness-rpc.service.ts:289-302`) → RPC `harness:start-new-project` (`harness-rpc.handlers.ts:844-938`).
5. **Custom session controller**: `HarnessSessionController.startInternal()` (`harness-session.controller.ts:365-442`) updates `HarnessBuilderStateService` (`libs/frontend/harness-builder/src/lib/services/harness-builder-state.service.ts:52-415`), persists a `HarnessSessionRecord` in `localStorage` via `HarnessBuilderRecordsService.saveSessionRecord()` (`libs/frontend/harness-builder/src/lib/services/harness-builder-records.service.ts:87-121`), creates a chat tab via `TabManagerService.createTab('New Project')` (`line 395`), tags `setWorkflow(tabId, 'harness-new-project')` (`line 396`), sets `setFirstMessagePreamble(tabId, prepared.seedPrompt)` (`line 397`), calls `ChatStore.sendOrQueueMessage(visibleText, { ...sendOptions, tabId })` (`line 402`), and registers the session in `WorkflowSessionClaimService` (`libs/frontend/chat-streaming/src/lib/workflow-session-claim.service.ts:10-29`).
6. **Custom workspace & review pages**: `NewProjectIntakePage.submit()` navigates to `/onboarding/new-project/workspace` (`new-project-intake.page.ts:380`, `ProposalWorkspacePage` at `libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts:38-410`), which mounts an embedded `ChatViewComponent` alongside `ProposalPanelComponent` (`libs/frontend/onboarding/src/lib/proposal/proposal-panel.component.ts:19-131`), `AnswerDockComponent` (`answer-dock.component.ts:19-106`), and `ReplyComposerComponent` (`reply-composer.component.ts:19-117`). Clicking **Review & apply** navigates to `/onboarding/new-project/review` (`ReviewApplyPage` at `libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts:27-389`), which calls `ProposalFlowStore.applyProposal()` (`proposal-flow.store.ts:278-307`) → `HarnessSessionController.applyProposal()` (`harness-session.controller.ts:327-357`) → `HarnessRpcService.apply()` (`harness-rpc.service.ts:127-149`) → RPC `harness:apply` (`harness-rpc.handlers.ts:507-635`).

### Mode 2: "AI team builder" (`configure-harness`)
1. **Hub Home entry**: `OnboardingHomeComponent` (`onboarding-home.component.ts:94-100, 291-297`) navigates to `/onboarding/team-builder`, rendering `TeamBuilderStartPage` (`libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:25-205`, route at `onboarding.routes.ts:62-66`).
2. **Submit intent**: `TeamBuilderStartPage.submit()` (`team-builder-start.page.ts:144-169`) snapshots attachments (`line 148`) and calls `ProposalFlowStore.startConfigureHarness(intent, snapshot.options)` (`proposal-flow.store.ts:229-256`).
3. **Backend prompt composition**: `HarnessSessionController.startConfigureHarness()` (`harness-session.controller.ts:211-222`) → `HarnessWorkflowRequestService.prepareConfigureHarness()` (`harness-workflow-request.service.ts:148-219`) calls `HarnessRpcService.initialize()` (`harness-rpc.service.ts:43-59`) and `HarnessRpcService.composeWorkflowPrompt({ mode: 'configure-harness', userGoal })` (`harness-rpc.service.ts:307-326`) → RPC `harness:workflow-prompt` (`harness-rpc.handlers.ts:963-971` → `HarnessWorkflowPromptService.composePrompt()` at `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts:17-127`).
4. **Custom workspace & review pages**: `HarnessSessionController.startInternal()` creates the tab (`title = 'AI Team Builder'`, `workflow = 'harness-configure'`) and sends the message, while `TeamBuilderStartPage.submit()` navigates to `/onboarding/team-builder/workspace` (`team-builder-start.page.ts:161`) and then `/onboarding/team-builder/review` (`ReviewApplyPage`).

---

## Target flow

### Investigation Item A: Opening a normal chat tab and sending the first message
The smallest existing renderer API chain (matching `TaskPromptBridgeService.executeTaskInNewTab` at `libs/frontend/chat/src/lib/services/chat-store/task-prompt-bridge.service.ts:81-118`) is encapsulated in a thin launcher service `HarnessChatLauncherService` (`libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts`):
1. **Create tab**: `const tabId = this.tabs.createTab(title)` (`TabManagerService.createTab` at `libs/frontend/chat-state/src/lib/tab-manager.service.ts:1093-1137`), where `title` is `'New Project'` or `'AI Team Builder'`.
2. **Tag workflow**: `this.tabs.setWorkflow(tabId, workflow)` (`tab-manager.service.ts:997-1009`) with `'harness-new-project'` or `'harness-configure'`. `WorkflowBadgeComponent` (`libs/frontend/chat/src/lib/components/atoms/workflow-badge.component.ts:10-16`) and `SessionInspectorComponent` (`libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html:99-103`) already render badges for both workflow tags.
3. **Attach seed prompt preamble**: `this.tabs.setFirstMessagePreamble(tabId, seedPrompt)` (`tab-manager.service.ts:2252-2254`). `MessageSenderService.startNewConversation()` (`libs/frontend/chat/src/lib/services/message-sender.service.ts:621-626`) consumes and clears this one-shot preamble, prepending it to `backendPrompt` sent to `ClaudeRpcService.call('chat:start', ...)` (`lines 648-668`) while adding only `visibleMessage` as the user bubble in the transcript (`lines 587-605`).
4. **Adopt & focus tile on Orchestra Canvas**: `this.appState.requestCanvasTab(tabId, this.tabs.activeWorkspacePath, title, true)` (`AppStateManager.requestCanvasTab` at `libs/frontend/core/src/lib/services/app-state.service.ts:1341-1379`). When `/chat` renders `OrchestraCanvasComponent` (`libs/frontend/canvas/src/lib/orchestra-canvas.component.ts:410-442`), its `pendingCanvasTabRequest` effect calls `this.canvasStore.adoptTab(req.tabId)` and `this.canvasStore.focusTile(req.tabId)`, preventing the empty `"No sessions on canvas"` state (Defect F2 in `investigation.md:83-102`).
5. **Switch surface to `/chat/<tabId>`**: `this.appState.setCurrentView('chat')` (`app-state.service.ts:997-1008` → `SurfaceRouterService.navigateToSurface('chat')` at `libs/frontend/core/src/lib/routing/surface-router.service.ts:171-190`), which routes to `/chat/<tabId>` via `ChatTabRouteSync` (`apps/ptah-extension-webview/src/app/app.config.ts:304`).
6. **Send first message with attachments, provider, and model**:
   - **Call**: `await this.chatStore.sendOrQueueMessage(visibleMessage, { ...attachmentSnapshot.options, tabId })` (`ChatStore.sendOrQueueMessage` at `libs/frontend/chat/src/lib/services/chat.store.ts:283-288` → `MessageDispatchService.sendOrQueueMessage` at `libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.ts:72-150` → `MessageSenderService.startNewConversation` at `message-sender.service.ts:563-743`).
   - **Attachments**: `ComposerAttachmentsService.snapshotForSend()` (`new-project-intake.page.ts:361`, `team-builder-start.page.ts:148`) returns `{ options: { files, images }, removeSent, restore }`. Passing `{ ...snapshot.options, tabId }` forwards `files` and `images` to `chat:start` (`message-sender.service.ts:660-661`), after which the launcher calls `snapshot.removeSent()`.
   - **Provider & Model**: `GenerationModelPickerComponent` on `NewProjectIntakePage` (`new-project-intake.page.ts:212-238`) and `TeamBuilderStartPage` (`team-builder-start.page.ts:76-94`) writes directly to `PtahCliStateService.selectedAgentId`, `ModelStateService.currentModel`, and `EffortStateService.currentEffort`. `MessageSenderService.startNewConversation()` (`message-sender.service.ts:638-645`) reads those exact three stores and passes `ptahCliId`, `model`, and `effort` to `chat:start`.

### Investigation Item B: Backend harness start RPCs (Keep vs Drop, and Who Starts the Session)
- **`harness:start-new-project` (`HarnessRpcHandlers.registerStartNewProject` at `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:844-938`) — KEEP ALL**:
  - Every step in `registerStartNewProject` is genuine workspace preparation: validating `StartNewProjectParamsSchema` (`line 849`), resolving `StackProfile` (`getStackProfile`, `line 868`), partitioning `requiredPlugins` into `bundled` and `missingExternal` (`partitionRequiredPlugins`, `line 871`), enabling bundled plugins in workspace config (`pluginLoader.saveWorkspacePluginConfig`, `lines 877-884`), running `reconcileHarness('harness:start-new-project')` (`line 886`), probing the local toolchain (`probeProfileToolchain`, `lines 891-893`), discovering `availableSkillIds` (`lines 898-902`), and building `seedPrompt` (`buildNewProjectSeedPrompt`, `lines 904-908`).
- **`harness:initialize` (`HarnessRpcHandlers.registerInitialize` at `harness-rpc.handlers.ts:125-182`) — KEEP**:
  - Used by `NewProjectIntakePage.checkFolder()` (`new-project-intake.page.ts:326-347`) to check `workspaceEffectivelyEmpty` before enabling **Continue**, and by `HarnessChatLauncherService` to pass `workspaceContext`/`availableAgents`/`availableSkills` into `harness:workflow-prompt`.
- **`harness:workflow-prompt` (`HarnessRpcHandlers.registerWorkflowPrompt` at `harness-rpc.handlers.ts:963-971` → `HarnessWorkflowPromptService.composePrompt` at `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts:17-127`) — KEEP**:
  - Composes the system/seed prompt for `configure-harness` using the workspace context, available agents, and available skills.
- **Custom-page plumbing — DROP**:
  - All custom session records, draft records, revision snapshots, proposal status derivations, and hydration loops live in the frontend (`HarnessBuilderRecordsService`, `HarnessSessionController`, `HarnessProposalHydrationService`, `HarnessBuilderStateService`, `ProposalFlowStore`, `ReplyDraftStore`, and the harness half of `OnboardingResumeStore`). None of these are stored by `harness:start-new-project` or `harness:workflow-prompt`.
- **Who starts the session (Renderer vs Backend)**:
  - **Recommendation**: **Renderer** starts the session via `ChatStore.sendOrQueueMessage` → `chat:start` (already how both modes start sessions today). Keeping session start in the renderer preserves optimistic tab creation in `TabManagerService`, `firstMessagePreamble` separation of `seedPrompt` vs `visibleMessage`, attachment forwarding from `ComposerAttachmentsService`, provider/model selection from `PtahCliStateService`/`ModelStateService`, and canvas tile adoption via `AppStateManager.requestCanvasTab`.

### Investigation Item C: Applying a Harness Proposal Inside a Normal Chat
- **How `ReviewApplyPage` & `harness:apply` work today**:
  1. During the chat turn, the agent calls MCP tool `ptah_harness_propose_config` (`libs/backend/vscode-lm-tools/src/lib/protocol-dispatcher.ts:2480-2517` → `buildHarnessNamespace.proposeConfig` at `libs/backend/vscode-lm-tools/src/lib/namespaces/harness-namespace.builder.ts:1158-1220`).
  2. `proposeConfig` validates `configUpdates` with `HarnessConfigUpdatesSchema`, persists `.ptah/harness-proposals/<sessionId>.json` via `HarnessProposalStore.saveProposal()` (`libs/backend/rpc-handlers/src/lib/harness/harness-proposal-store.service.ts:96-184`), and broadcasts `MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED` (`'harness:config-proposed'`). **It does not write any project or harness files (`CLAUDE.md`, `.claude/agents/*.md`, presets, MCP server installs, or junctions).**
  3. Only `ptah_harness_create_skill` (`harness-namespace.builder.ts:750-862`) and `ptah_harness_install_mcp_server` (`harness-namespace.builder.ts:1026-1156`) write directly when called.
  4. Full materialization only happens when `harness:apply` (`HarnessRpcHandlers.registerApply` at `harness-rpc.handlers.ts:507-635`) is called by the renderer (`ReviewApplyPage.apply()` → `ProposalFlowStore.applyProposal()` → `HarnessSessionController.applyProposal()`): it saves the preset to `~/.ptah/presets`, generates `CLAUDE.md`, writes `.claude/agents/*.md`, saves Ptah settings, installs MCP servers and `skills.sh` skills, materializes `createdSkills`, and runs `reconcileHarness` to fan out junctions to `.claude`, `.codex`, `.cursor`, and `.github/copilot`.
  5. Today, no MCP tool invokes `harness:apply`, and `ChatViewComponent` has no listener or UI for `HARNESS_CONFIG_PROPOSED`.
- **Minimal safe design in normal chat (Approved in Decision D1)**:
  - Render a compact **Proposal Apply Banner** (`HarnessProposalBannerComponent`) inside `ChatViewComponent`'s `sessionControls` slot (`libs/frontend/chat/src/lib/components/templates/chat-view.component.html:180`, immediately above `<ptah-question-card>`):
    - A lightweight `HarnessChatProposalStore` (in `libs/frontend/chat`) listens for `MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED` (`'harness:config-proposed'`) and, when a tab with workflow `'harness-new-project' | 'harness-configure'` binds or switches `resolvedSessionId()`, hydrates any persisted proposal via existing RPC `harness:get-proposal` (`harness-rpc.handlers.ts:976-995`).
    - When a proposal exists for the active chat tab's `resolvedSessionId()`, the banner displays the proposal name, item counts (enabled agents, skills, subagents, MCP servers, `CLAUDE.md`), and an explicit **"Apply to Workspace"** button (disabled while `isStreaming()` is true).
    - Clicking **"Apply to Workspace"** is the user's explicit approval gate: it merges `proposal.configUpdates` into a `HarnessConfig` and invokes the existing `ClaudeRpcService.call('harness:apply', { config, outputFormat: 'claude-md', workspaceRoot })`, then displays the applied file count (`appliedPaths.length`) and any `warnings`, and refreshes `HarnessHealthStore`.
  - Update both seed prompts (`buildNewProjectSeedPrompt` in `libs/backend/rpc-handlers/src/lib/harness/harness-constants.ts:249-256` and `HarnessWorkflowPromptService.composePrompt` in `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts:62-75`) to remove references to `"the live preview sidebar"` / `"Apply in the sidebar"` and instruct the agent to summarize the proposed harness in chat and call `ptah.harness.proposeConfig` so the user can click **Apply to Workspace** on the chat card.

### Target Call Chain per Mode
- **Mode 1 (`new-project`)**:
  `NewProjectIntakePage.submit()` → `HarnessChatLauncherService.launchNewProject(intake, attachmentSnapshot)` → `ClaudeRpcService.call('harness:start-new-project', intake)` → `TabManagerService.createTab('New Project')` + `setWorkflow(tabId, 'harness-new-project')` + `setFirstMessagePreamble(tabId, res.seedPrompt)` → `AppStateManager.requestCanvasTab(tabId, workspacePath, 'New Project', true)` → `AppStateManager.setCurrentView('chat')` → `ChatStore.sendOrQueueMessage(formatIntakeSummary(intake), { ...attachmentSnapshot.options, tabId })` → `attachmentSnapshot.removeSent()`.
- **Mode 2 (`configure-harness`)**:
  `TeamBuilderStartPage.submit()` → `HarnessChatLauncherService.launchTeamBuilder(intent, attachmentSnapshot)` → `ClaudeRpcService.call('harness:initialize', { workspaceRoot })` + `ClaudeRpcService.call('harness:workflow-prompt', { mode: 'configure-harness', userGoal: intent, ... })` → `TabManagerService.createTab('AI Team Builder')` + `setWorkflow(tabId, 'harness-configure')` + `setFirstMessagePreamble(tabId, promptRes.prompt)` → `AppStateManager.requestCanvasTab(tabId, workspacePath, 'AI Team Builder', true)` → `AppStateManager.setCurrentView('chat')` → `ChatStore.sendOrQueueMessage(intent.trim(), { ...attachmentSnapshot.options, tabId })` → `attachmentSnapshot.removeSent()`.

---

## Investigation Item D: Dead Code & Consumer Audit

| Artifact / File | Action | Reason / Remaining Consumers |
| --- | --- | --- |
| `libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts` (+ `.spec.ts`) | **DELETE** | Replaced by normal chat (`ChatViewComponent` / `OrchestraCanvasComponent`). |
| `libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts` (+ `.spec.ts`) | **DELETE** | Replaced by `HarnessProposalBannerComponent` in `ChatViewComponent`. |
| `libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts` (+ `.spec.ts`) | **DELETE** | Replaced by `HarnessChatLauncherService` (`libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts`). |
| `libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts` (+ `.spec.ts`), `apply-result.component.ts` (+ `.spec.ts`), `proposal-item.component.ts` (+ `.spec.ts`), `proposal-panel.component.ts` (+ `.spec.ts`), `proposal-section.component.ts`, `proposal-session-status.ts` (+ `.spec.ts`), `proposal-status-card.component.ts` (+ `.spec.ts`), `reply-composer.component.ts` (+ `.spec.ts`), `reply-draft.store.ts` (+ `.spec.ts`), `review-summary.component.ts`, `revision-history.component.ts` (+ `.spec.ts`) | **DELETE** | Only consumed by `ProposalWorkspacePage`, `ReviewApplyPage`, and `ProposalFlowStore`. |
| `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts` (+ `.spec.ts`) | **KEEP (edit)** | Launcher form for `/onboarding/new-project`; rewire from `ProposalFlowStore` to `HarnessChatLauncherService`. |
| `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` (+ `.spec.ts`) | **KEEP (edit)** | Launcher form for `/onboarding/team-builder`; rewire from `ProposalFlowStore` to `HarnessChatLauncherService`. |
| `libs/frontend/onboarding/src/lib/onboarding.routes.ts` & `onboarding.routes.spec.ts` | **KEEP (edit)** | Remove `new-project/workspace`, `new-project/review`, `team-builder/workspace`, `team-builder/review`, and legacy redirect `harness-builder`. Keep `new-project`, `team-builder`, `analyze/**`, `guidance`, `ready`. |
| `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.ts` (+ `.spec.ts`) & `onboarding-shell.component.ts` (+ `.spec.ts`) | **KEEP (edit)** | Remove `'new-project'` and `'team-builder'` multi-step arrays (`NEW_PROJECT_STEPS`, `TEAM_BUILDER_STEPS`, `leaveConfirmationNeeded`); stepper stays active for `'analyze'`. |
| `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` (+ `.spec.ts`) & `onboarding-home.component.ts` (+ `.spec.ts`) | **KEEP (edit)** | Remove `HarnessBuilderRecordsService` / `HarnessSessionRecord` resume logic from `OnboardingResumeStore`; keep `OnboardingRunStore` resume banner for interrupted `analyze` runs. |
| `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts` (+ `.spec.ts`) | **KEEP (edit)** | Remove `'harness-new-project'` and `'harness-configure'` cases (lines 57–68) so `NotificationFocusCoordinatorService` (`libs/frontend/chat/src/lib/services/notification-focus-coordinator.service.ts:47-68`) routes attention clicks for harness sessions to the normal chat tab (`focusSessionTab`). Keep `'onboarding-analyze'` case. |
| `libs/frontend/harness-builder/**` (entire library: `harness-session.controller.ts`, `harness-workflow-request.service.ts`, `harness-builder-state.service.ts`, `harness-builder-records.service.ts`, `harness-proposal-hydration.service.ts`, `harness-rpc.service.ts`, `harness-workflow-message.handler.ts`, `harness-helper.service.ts`, `harness-workflow-utils.ts`, `new-project-intake.ts`, `harness-builder-leave-dialog.component.ts`, `harness-config-preview.component.ts`, `sidebar/**`, `project.json`, `tsconfig*.json`, `src/index.ts`, `src/services.ts`) | **DELETE** | Zero consumers outside `libs/frontend/onboarding` and `apps/ptah-extension-webview/src/app/app.config.ts`. Move pure helper `new-project-intake.ts` (`EMPTY_NEW_PROJECT_INTAKE`, `isNewProjectIntakeValid`, `formatIntakeSummary`) into `libs/frontend/onboarding/src/lib/proposal/new-project-intake.model.ts`. Remove `@ptah-extension/harness-builder` path aliases from `tsconfig.base.json`. |
| `libs/frontend/core/src/lib/routing/onboarding-routes.ts` (+ `.spec.ts`) | **KEEP (edit)** | Remove `ONBOARDING_NEW_PROJECT_WORKSPACE_ROUTE`, `ONBOARDING_NEW_PROJECT_REVIEW_ROUTE`, `ONBOARDING_TEAM_BUILDER_WORKSPACE_ROUTE`, `ONBOARDING_TEAM_BUILDER_REVIEW_ROUTE`, `LEGACY_HARNESS_BUILDER_ROUTE`, and `workflowToOnboardingRoute` mappings for `'harness-new-project'` and `'harness-configure'`. |
| `libs/frontend/chat-streaming/src/lib/workflow-session-claim.service.ts` & `stream-router.service.ts:688-733` | **KEEP** | Still used to suppress toast notifications for background `'onboarding-analyze'` runs (`stream-router.setup-surfaces.spec.ts`). Update `stream-router.setup-surfaces.spec.ts` and `surface-vs-tab-parity.spec.ts` to verify that `'harness-new-project'` and `'harness-configure'` run as unclaimed normal chat tabs. |
| `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts` (`harness:initialize`, `harness:start-new-project`, `harness:workflow-prompt`, `harness:get-proposal`, `harness:apply`, `harness:save-preset`, `harness:delete-preset`, `harness:export-config`, `harness:import-config`, `harness:generate-claude-md`, `harness:install-mcp`, `harness:search-skills`, `harness:install-skill`, `harness:reconcile`) | **KEEP** | Used by `HarnessChatLauncherService`, `HarnessProposalBannerComponent`, `GenerateAgentsPage` (`generate-agents.page.ts:390` calls `harness:reconcile`), `AnalyzeDonePage`, and guarded by `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `apps/ptah-electron/src/di/surface-composition.spec.ts`, `apps/ptah-electron/src/di/expected-resolvable.ts`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`, and `libs/backend/cli-engine/src/lib/rpc/surface-composition.spec.ts`. |
| `libs/shared/src/lib/types/rpc-harness*.ts` (`rpc-harness.types.ts`, `rpc-harness.schemas.ts`, `rpc-harness-proposal.types.ts`) | **KEEP** | Used by `harness-rpc.handlers.ts`, `harness-namespace.builder.ts`, `HarnessChatLauncherService`, and `HarnessProposalBannerComponent`. |
| `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts` & `onboarding-proposal.fixtures.ts` | **KEEP (edit)** | Update scenarios to assert that submitting `/onboarding/new-project` and `/onboarding/team-builder` opens `/chat/<tabId>` with the seeded user message and Proposal Apply Banner instead of `/onboarding/*/workspace` and `/onboarding/*/review`. |

---

## Investigation Item F: Provider Neutrality (Claude vs OpenAI Codex)

1. **Defect F4-A — `RuntimeContext.askAsyncUserInput` aborted on `turn/completed` (`libs/backend/codex-runtime/src/lib/codex-context.ts:687, 913`)**:
   - `RuntimeContext.askAsyncUserInput` passes `this.turnController.signal` to `this.dependencies.userInput.requestUserInput(...)` (`line 913`). When Codex emits `turn/completed`, `this.turnController.abort()` runs (`line 687`), immediately rejecting the pending `request_user_input_async` promise and dismissing the question card in the UI.
   - **Fix**: Introduce a context-lifetime `AbortController` (`private readonly contextController = new AbortController()`) aborted only in `RuntimeContext.close()` (`lines 535-559`), and pass `this.contextController.signal` at `line 913`.
2. **Defect F4-B & F4-C — Post-turn answer delivery drops stream & `CodexChatAdapter` closes session token after Turn 1 (`codex-context.ts:981-991`, `codex-chat-adapter.ts:313-325, 634-682`, `chat-stream-broadcaster.service.ts:459-468`)**:
   - When the user answers a `request_user_input_async` card after Turn 1 ends, `RuntimeContext.deliverAnswer` (`codex-context.ts:988`) calls `await this.start({ text: formatted })`, which returns an unconsumed `AsyncIterable<StreamChunk>` that is never published to `ChatStreamBroadcaster`. Furthermore, `ChatStreamBroadcaster.streamEventsToWebview` (`libs/backend/rpc-handlers/src/lib/services/chat-stream-broadcaster.service.ts:459-468`) calls `chatService.close(sessionId, sessionToken)` in its `finally` block; because `CodexChatAdapter.getSessionToken()` (`libs/backend/codex-runtime/src/lib/codex-chat-adapter.ts:321-323`) returns `session.token`, the `TrackedSession` is closed at the end of Turn 1.
   - **Fix**: In `RuntimeContext.deliverAnswer` (`codex-context.ts:981-991`), invoke an optional callback `onFollowUpTurn?: (text: string) => Promise<void>` wired by `CodexChatAdapter` (`codex-chat-adapter.ts:634-682`) so post-turn answers route through `this.publish(session, { text })` and broadcast to `ChatStreamBroadcaster`. In `CodexChatAdapter.getSessionToken()` (`codex-chat-adapter.ts:321-323`), return `undefined` (matching `ClaudeService`, which keeps multi-turn sessions alive until explicit `chat:stop` / `close()`).
3. **Defect F4-D — `HostAttentionCoordinator.issueRequest` async metadata race (`libs/backend/agent-sdk/src/lib/permission/host-attention-coordinator.ts:257-297`)**:
   - `issueRequest` `await`s `this.metadata.get(input.sessionId)` (`line 258`) before calling `this.active.set(key, record)` (`line 277`). If `resolve()` runs during that `await`, it misses the entry and `issueRequest` subsequently stores and emits a stale `upsert`.
   - **Fix**: Track a synchronous `pendingRegistrations` map/set keyed by `makeKey(input.sessionId, input.kind, input.requestId)` before `await this.metadata.get(...)`; if `resolve()` or `clearSession()` removes the key before the `await` resumes, abort registration and do not emit `upsert`.
4. **Claude-specific tool name in harness seed prompts (`libs/backend/rpc-handlers/src/lib/harness/harness-constants.ts:218` & `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts:68`)**:
   - Both prompts instruct the agent to `"Use AskUserQuestion for every clarifying question"`. On OpenAI Codex, the tool is named `request_user_input` (or `request_user_input_async`).
   - **Fix**: Update both prompts to name `"AskUserQuestion (or request_user_input / request_user_input_async when available)"` and remove references to `"the live preview sidebar"`.

---

## Changes

### Batch 1: Provider Neutrality & Codex Question Lifecycle Fixes (Backend)
- **Files to edit**:
  - `libs/backend/codex-runtime/src/lib/codex-context.ts`
  - `libs/backend/codex-runtime/src/lib/codex-context.spec.ts`
  - `libs/backend/codex-runtime/src/lib/codex-chat-adapter.ts`
  - `libs/backend/codex-runtime/src/lib/codex-chat-adapter.spec.ts`
  - `libs/backend/agent-sdk/src/lib/permission/host-attention-coordinator.ts`
  - `libs/backend/agent-sdk/src/lib/permission/host-attention-coordinator.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/harness/harness-constants.ts`
  - `libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.spec.ts`
- **Change**:
  - Use a context-lifetime `AbortController` for `askAsyncUserInput` in `RuntimeContext` (`codex-context.ts:535-559, 687, 913`).
  - Route post-turn `deliverAnswer` (`codex-context.ts:981-991`) through `CodexChatAdapter` so follow-up turns publish chunks to `ChatStreamBroadcaster`, and keep `TrackedSession` open across turns (`codex-chat-adapter.ts:321-323`).
  - Guard `HostAttentionCoordinator.issueRequest` (`host-attention-coordinator.ts:257-297`) against `resolve()` / `clearSession()` called while `await this.metadata.get(...)` is in flight.
  - Update `buildNewProjectSeedPrompt` (`harness-constants.ts:218, 249-256`) and `HarnessWorkflowPromptService.composePrompt` (`harness-workflow-prompt.service.ts:62-75`) to reference both `AskUserQuestion` and `request_user_input` / `request_user_input_async` and describe the in-chat **Apply to Workspace** card instead of the retired preview sidebar.
- **Tests to add/change**:
  - Unit tests in `codex-context.spec.ts` verifying `askAsyncUserInput` survives `turn/completed` and aborts on `close()`.
  - Unit tests in `codex-chat-adapter.spec.ts` verifying post-turn `deliver()` publishes the new turn's stream chunks and `getSessionToken` does not prematurely close the session.
  - Unit test in `host-attention-coordinator.spec.ts` verifying `resolve()` before `metadata.get()` resolves suppresses the `upsert` event.
  - Update prompt snapshot/assertions in `harness-rpc.handlers.spec.ts`.
- **Nx projects affected**: `codex-runtime`, `agent-sdk`, `rpc-handlers`
- **Verify command**: `npm run verify -- -p codex-runtime,agent-sdk,rpc-handlers`

### Batch 2: In-Chat Proposal Apply Banner (`libs/frontend/chat`)
- **Files to create/edit**:
  - Create `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts` (+ `.spec.ts`)
  - Create `libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts`
  - Edit `libs/frontend/chat/src/lib/components/templates/chat-view.component.html`
  - Edit `libs/frontend/chat/src/services.ts` & `libs/frontend/chat/src/index.ts`
- **Change**:
  - Implement `HarnessChatProposalStore` (using `ClaudeRpcService`, `MessageRouterService`, and `HarnessHealthStore`):
    - Registers a `MESSAGE_HANDLERS` handler for `MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED` (`'harness:config-proposed'`), storing the latest `HarnessProposalRecord` by `sessionId`.
    - Provides `hydrateForSession(sessionId, workspaceRoot)` calling `ClaudeRpcService.call('harness:get-proposal', { sessionId, workspaceRoot })` when a `'harness-new-project' | 'harness-configure'` chat tab binds a `resolvedSessionId`.
    - Provides `applyProposal(sessionId, workspaceRoot)` calling `ClaudeRpcService.call('harness:apply', { config, outputFormat: 'claude-md', workspaceRoot })`, storing `{ appliedCount, warnings }` per `sessionId`, and calling `HarnessHealthStore.refresh(workspaceRoot)`.
  - Create `HarnessProposalBannerComponent` (`ChangeDetectionStrategy.OnPush`, signals/inputs/outputs) and mount it inside `chat-view.component.html` in the `sessionControls` projection (`line 180`, above `<ptah-question-card>`) when the active tab has a proposal.
- **Tests to add/change**:
  - `harness-chat-proposal.store.spec.ts`: tests `harness:config-proposed` push handling, `harness:get-proposal` hydration, and `harness:apply` invocation.
  - `harness-proposal-banner.component.spec.ts`: tests rendering item counts, disabling **Apply to Workspace** while streaming, and displaying applied confirmation/warnings.
- **Nx projects affected**: `chat`
- **Verify command**: `npm run verify -- -p chat`

### Batch 3: Thin Chat Launchers, Route Updates & Resume/Focus Rewiring (`libs/frontend/onboarding`, `libs/frontend/core`, `apps/ptah-extension-webview`, `libs/frontend/webview-e2e-harness`)
- **Files to create/edit**:
  - Create `libs/frontend/onboarding/src/lib/proposal/new-project-intake.model.ts` (moved from `libs/frontend/harness-builder/src/lib/models/new-project-intake.ts`)
  - Create `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/onboarding.routes.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/shell/onboarding-step-link.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts` (+ `.spec.ts`)
  - Edit `libs/frontend/onboarding/src/index.ts` & `libs/frontend/onboarding/src/services.ts`
  - Edit `libs/frontend/core/src/lib/routing/onboarding-routes.ts` (+ `.spec.ts`)
  - Edit `apps/ptah-extension-webview/src/app/app.config.ts`
  - Edit `apps/ptah-extension-webview/src/app/app.routes.spec.ts`
  - Edit `apps/ptah-extension-webview/src/app/webview-routing.spec.ts`
  - Edit `apps/ptah-extension-webview/src/app/unit5-message-routing.spec.ts`
  - Edit `libs/frontend/chat-streaming/src/lib/stream-router.setup-surfaces.spec.ts`
  - Edit `libs/frontend/chat-streaming/src/lib/surface-vs-tab-parity.spec.ts`
  - Edit `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal.fixtures.ts`
  - Edit `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-proposal-visual.e2e.spec.ts`
- **Change**:
  - Implement `HarnessChatLauncherService` with `checkFolderEmpty()`, `launchNewProject(intake, attachmentSnapshot)`, and `launchTeamBuilder(intent, attachmentSnapshot)` following the exact 6-step Target Flow (`createTab` → `setWorkflow` → `setFirstMessagePreamble` → `requestCanvasTab` → `setCurrentView('chat')` → `chatStore.sendOrQueueMessage`).
  - Rewire `NewProjectIntakePage` and `TeamBuilderStartPage` to inject `HarnessChatLauncherService` instead of `ProposalFlowStore` and `Router.navigate(['/onboarding/*/workspace'])`.
  - Remove `new-project/workspace`, `new-project/review`, `team-builder/workspace`, `team-builder/review`, and `harness-builder` routes from `onboarding.routes.ts` and `libs/frontend/core/src/lib/routing/onboarding-routes.ts`.
  - Simplify `onboarding-step-link.ts` and `onboarding-shell.component.ts` so only `'analyze'` shows the multi-step header and leave confirmation.
  - Simplify `OnboardingResumeStore` to only track interrupted `OnboardingRunStore` (`analyze`) runs, and `OnboardingFocusRouter` to only route `'onboarding-analyze'` to `/onboarding/analyze/progress` (returning `false` for `'harness-new-project'` and `'harness-configure'` so `NotificationFocusCoordinatorService` focuses the chat tab).
  - Remove `provideHarnessWorkflowMessageHandler()` from `apps/ptah-extension-webview/src/app/app.config.ts` and add `provideHarnessChatProposalStore()`.
- **Tests to add/change**:
  - Add `harness-chat-launcher.service.spec.ts`.
  - Update `new-project-intake.page.spec.ts`, `team-builder-start.page.spec.ts`, `onboarding.routes.spec.ts`, `onboarding-routes.spec.ts` (`core`), `onboarding-step-link.spec.ts`, `onboarding-shell.component.spec.ts`, `onboarding-resume.store.spec.ts`, `onboarding-home.component.spec.ts`, `onboarding-focus-router.service.spec.ts`, `app.routes.spec.ts`, `webview-routing.spec.ts`, `unit5-message-routing.spec.ts`, `stream-router.setup-surfaces.spec.ts`, `surface-vs-tab-parity.spec.ts`, and `onboarding-proposal-visual.e2e.spec.ts`.
- **Nx projects affected**: `onboarding`, `core`, `chat-streaming`, `ptah-extension-webview`, `webview-e2e-harness`
- **Verify command**: `npm run verify -- -p onboarding,core,chat-streaming,ptah-extension-webview,webview-e2e-harness`

### Batch 4: Pure Deletion of Dead Proposal Pages & `libs/frontend/harness-builder`
- **Files to delete**:
  - `libs/frontend/onboarding/src/lib/proposal/proposal-workspace.page.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/review-apply.page.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/proposal-flow.store.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/apply-result.component.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/proposal-item.component.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/proposal-panel.component.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/proposal-section.component.ts`
  - `libs/frontend/onboarding/src/lib/proposal/proposal-session-status.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/reply-composer.component.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/reply-draft.store.ts` (+ `.spec.ts`)
  - `libs/frontend/onboarding/src/lib/proposal/review-summary.component.ts`
  - `libs/frontend/onboarding/src/lib/proposal/revision-history.component.ts` (+ `.spec.ts`)
  - All 40 files under `libs/frontend/harness-builder/**`
- **Files to edit**:
  - `tsconfig.base.json` (remove `@ptah-extension/harness-builder` and `@ptah-extension/harness-builder/services` path mappings)
- **Change**:
  - Pure deletion of all unreferenced proposal workspace/review components, stores, and the `harness-builder` frontend library once Batch 3 is green.
- **Tests to add/change**:
  - None (dead specs deleted alongside dead implementation files).
- **Nx projects affected**: `onboarding`, `ptah-extension-webview`
- **Verify command**: `npm run verify -- -p onboarding,ptah-extension-webview`

---

## Lost features

| Feature in Custom Proposal Flow | Disposition | Replacement in Normal Chat |
| --- | --- | --- |
| **Live Proposal Panel (`ProposalPanelComponent`)** | **Replace** | The agent summarizes proposed agents, skills, MCP servers, and `CLAUDE.md` in its markdown chat response, and `HarnessProposalBannerComponent` in `ChatViewComponent` (`sessionControls`) displays item counts + the **Apply to Workspace** action. |
| **Revision History (`RevisionHistoryComponent`)** | **Drop** | Users iterate conversationally in chat (each `ptah.harness.proposeConfig` call updates the active proposal on disk and in `HarnessProposalBannerComponent`) or use standard chat message branching/rewind. |
| **Saved Draft (`HarnessDraftRecord` / "Save draft")** | **Drop** | Once launched, the session is a standard chat tab persisted by `TabManagerService` and `SessionMetadataStore` (**Previous sessions**) and `.ptah/harness-proposals/<sessionId>.json` on disk. |
| **Leave Confirmation Dialog (`HarnessBuilderLeaveDialogComponent`)** | **Drop** | Leaving `/onboarding/new-project` or `/onboarding/team-builder` before clicking **Continue**/**Start** only discards an unsent form. After launch, the session lives in `/chat/<tabId>` and is unaffected by route changes. |
| **Setup Hub Home Resume Banner for Harness Runs (`OnboardingResumeStore` harness half)** | **Drop** | Active and historical harness sessions appear in the Orchestra Canvas Rail and **Previous sessions** drawer with their `New Project` / `AI Team Builder` workflow badge (`WorkflowBadgeComponent`). The Hub Home resume banner remains for interrupted **Analyze workspace** runs. |

---

## Risks

1. **Proposal hydration before `resolvedSessionId` is bound**: When `TabManagerService.createTab()` creates an optimistic tab (`tab-*`), `resolvedSessionId` is bound asynchronously when `chat:started` arrives. `HarnessChatProposalStore` must key proposals by `sessionId` (matched against `tabManager.resolvedSessionId()`) so proposals emitted during Turn 1 or hydrated on session switch always match the active tab.
2. **Stale `localStorage` keys from previous builds**: Existing workspaces may have `ptah.harness.builder.v1.*` entries in `localStorage`. Removing `HarnessBuilderRecordsService` leaves those keys inert; no migration is required.
3. **`CodexChatAdapter.getSessionToken()` behavior change**: Returning `undefined` from `CodexChatAdapter.getSessionToken()` keeps `TrackedSession` alive across turns (matching `ClaudeService`). Verify in `codex-chat-adapter.spec.ts` that explicit `close(sessionId)` (`chat:stop` / tab close) still disposes the `RuntimeContext` and child app-server process cleanly.

---

## Decisions

### Decision D1: How the user approves and applies a harness proposal in normal chat
- **Options**:
  - **Option C1 (Recommended)**: Keep `ptah_harness_propose_config` as a pure proposal-staging tool (`HarnessProposalStore.saveProposal` + `HARNESS_CONFIG_PROPOSED` broadcast) and render a compact `HarnessProposalBannerComponent` in `ChatViewComponent`'s `sessionControls` slot with an explicit **"Apply to Workspace"** button calling existing RPC `harness:apply`.
  - **Option C2 (Alternative — requires [NEW WORK] MCP tool)**: Add a new MCP tool `ptah_harness_apply_config` in `tool-description.builder.ts`, `protocol-dispatcher.ts`, and `harness-namespace.builder.ts` so the agent asks for confirmation via `AskUserQuestion` / `request_user_input` and then calls `ptah_harness_apply_config` itself.
- **Evidence**: `HarnessRpcHandlers.registerApply` (`libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:507-635`) and `HARNESS_CONFIG_PROPOSED` (`libs/backend/vscode-lm-tools/src/lib/namespaces/harness-namespace.builder.ts:1203-1210`) already exist and are covered by Electron/CLI RPC surface guards (`rpc-surface.spec.ts`). Option C1 requires zero new MCP tools and enforces a deterministic UI click before writing `CLAUDE.md`, `.claude/agents/*.md`, presets, or junctions.
- **Recommendation**: **Option C1**.
- **Reversible**: Yes (purely additive in `libs/frontend/chat`).

### Decision D2: Session creation ownership (Renderer vs Backend)
- **Options**:
  - **Option B1 (Recommended)**: Renderer creates the tab and calls `ChatStore.sendOrQueueMessage` (`chat:start`) after `harness:start-new-project` / `harness:workflow-prompt` returns the prepared `seedPrompt`.
  - **Option B2**: Backend `harness:start-new-project` / `harness:workflow-prompt` starts the chat session directly and returns a `sessionId` for the renderer to attach.
- **Evidence**: `TabManagerService` (optimistic tab creation + `firstMessagePreamble`), `ComposerAttachmentsService` (`files`/`images`), `PtahCliStateService`/`ModelStateService`/`EffortStateService`, and `AppStateManager.requestCanvasTab` all execute in the renderer before `chat:start` (`libs/frontend/chat/src/lib/services/message-sender.service.ts:563-668`).
- **Recommendation**: **Option B1** (renderer starts the session).
- **Reversible**: Yes.

---

## Unknowns

None. All six investigation areas (A–F), backend RPC contracts, guard specs, and Codex lifecycle root causes have been verified against the workspace source.
