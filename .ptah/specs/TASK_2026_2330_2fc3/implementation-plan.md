# Implementation Plan - TASK_2026_2330_2fc3

Setup runs continue in the background from a Setup-owned run store.

All paths are relative to the worktree
`/home/amun/ptah-extension/.claude-worktrees/setup-background-runs`. Line numbers were read at
branch head `6803ce86c2` (stacked on `fix/setup-wizard-nav-skill-review`, TASK_2026_2329_dd5d).
Re-check them after the rebase onto `main`.

## Inputs and constraints

- Requirements used: `.ptah/specs/TASK_2026_2330_2fc3/context.md` (user request and the binding
  decision). There is no `task-description.md` or `research-report.md`. context.md holds the
  acceptance intent, so no decision was blocked by their absence.
- Corrections applied: none.
- Design handoff used: none. There is no design spec. The UI reuses the existing onboarding
  components (`ptah-resume-banner`, `run-status-chip`) and adds no new visual language.
- Predecessor work: the architect handoff notes in
  `/home/amun/ptah-extension/.ptah/subagent-handoffs/toolu_01BzNMmX52wRwFMMDasEeZ3A.md`. Its
  "Verified so far" items are reused here without re-reading them.
- Binding constraints:
  - context.md: a separate Setup-owned run store in `libs/frontend/setup-wizard`.
  - context.md: Setup runs must not appear as normal chat rail tabs and must not mix into chat
    session state.
  - CLAUDE.md: Electron first. Lanes run only focused jest/tsc/eslint.
  - Library rule: `setup-wizard` must never import `onboarding`
    (`libs/frontend/core/src/lib/routing/onboarding-routes.ts:12-14`).
  - Library rule: `setup-wizard` already imports `@ptah-extension/chat`, `chat-ui` and
    `chat-state` (import census of `libs/frontend/setup-wizard/src`). So `chat` and `chat-ui`
    must never import `setup-wizard`, because that would create a cycle.
- Missing decision-critical input: none. The team-builder exception (Decision D3) is a judgment
  call settled from evidence. It is recorded as reversible.

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| Closing a tab aborts only chat streaming controllers registered by MessageSender | `libs/frontend/chat-state/src/lib/tab-manager.service.ts:430-441, 1550-1556` | Closing a generation tab never cancels the backend generation or guidance run. The run continues with no frontend owner. |
| The event adapter drops owned and pending events for tabs that no longer exist | `libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts:76-82` | After a tab closes, the progress and completion of a live run are lost silently. Removing the tab coupling fixes this. |
| The guidance hand-off is skipped when the agent tab disappears. `tabClosed()` has no production caller (only its spec) | `libs/frontend/setup-wizard/src/lib/services/generation-handoff.store.ts:40-50, 85-87` | The chained agent-to-guidance step depends on a chat tab. Re-key it to the Setup run id. Delete `tabClosed`. |
| The hand-off store opens tabs through `GenerationWorkflowLauncherService` | `generation-handoff.store.ts:6, 22, 113-120` | The hand-off store must move to the Setup run store. |
| The launcher creates or finds a chat tab per workflow and navigates with `?tab=` | `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts:57-99` | This is the main source of generation chat tabs. Rewrite it to delegate to the Setup entry port. |
| `SetupStatusStore.launchGeneration` calls the launcher | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts:303-330` | Chat-side entry points (chat empty state, workspace vitals) must reach Setup through a port in core, not through setup-wizard. |
| The analysis runner is a root service with a run token. `reset()` and `cancel()` invalidate the run and clear state | `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:132-197, 598-627` | The analysis run already outlives the view. The store wraps it and does not replace it. |
| `run()` writes the result only while the token matches | `wizard-analysis-runner.service.ts:629-688` | A `reset()` during a live run discards the backend result. Re-run must never reset a live run. |
| `startFresh()` calls `wizardState.reset()` and `runner.reset()` before starting | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:1018-1034` | `?rerun=1` drops the in-memory finished result and generation buffers. The saved analysis on disk remains (`loadSaved`). |
| `?rerun=1` is consumed by `startPendingRerun` and `consumePendingRerun` | `analyze-workspace.page.ts:764-785, 1000-1017` | Re-run is a page flag on the URL. Move the rule to the store (`SetupRunStore.rerun`). |
| The team builder page aborts the launch and resets state on destroy | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:114-121` | Leaving Setup during install or launch loses progress. The install RPC itself still completes on the backend (`:385`). |
| The team builder ends by creating a `harness-configure` chat tab and sending the first message | `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:130-168, 180-240` | The configure conversation is an interactive chat (composer, approvals, canvas adoption). See Decision D3. |
| Team builder stages: intent, review, consent, installing, launching | `team-builder-start.page.ts:138, 344, 372, 448, 524` | These are the team-builder step identifiers. |
| `OnboardingResumeStore` reads one tab per workflow and refreshes only when Home mounts | `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:114-243 (tab lookup :178)`, `onboarding-home.component.ts:442` | Replace it with the run store's derived list. |
| Home renders `ptah-analysis-found-card` and the resume banners | `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts:111, 121-132` | The duplicate surfaces to remove. Only one list remains. |
| `OnboardingRunPillService` is a root top-bar pill set by pages | `libs/frontend/onboarding/src/lib/shell/onboarding-run-pill.service.ts:53-95` | This is model provenance, not run status. Keep it. It is not the Setup runs surface. |
| The Setup nav calls `openSetupHub()` and then `setCurrentView('onboarding')` (bare Home) | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:785-787`, menu item `:360-368` | The shell lives in `chat`, which cannot import setup-wizard. A badge and "open on the active run" need a core port. |
| `navigateToSurface(id, subPath, {queryParams})` exists | `libs/frontend/core/src/lib/routing/surface-router.service.ts:144-179` | The navigation primitive for opening a run's step. |
| Restored generation URLs that carry `tab` are validated through an injected validator token | `surface-router.service.ts:205-221`, token `surface-routes.ts:36-44`, provided `apps/ptah-extension-webview/src/app/app.config.ts:265-270` | The precedent for a core token implemented in the app config. Switch the validator from TabManager to the Setup run store. |
| Onboarding identity values reject `/`, `\` and `:` | `libs/frontend/core/src/lib/routing/onboarding-routes.ts:94-101` | Setup run ids must be `setup-<uuid>`, with no colon. |
| `onboardingGenerationTarget` builds `analyze/skills?tab=` or `guidance?tab=` | `onboarding-routes.ts:103-118` | Replace it with a store-driven step target (section 3). |
| Onboarding child routes | `libs/frontend/onboarding/src/lib/onboarding.routes.ts:44-109` (`analyze`, `analyze/skills`, `analyze/agents`, `analyze/generate`, `analyze/guidance`, `analyze/done`, `guidance`, `team-builder`) | These are the step routes for the step tables. |
| The backend generation binding schema accepts any string id | handoff: `wizard-generation-rpc.schema.ts:24-25`, `authorizeTabWorkspace` in `wizard-generation-binding.ts` | A Setup run id can be the binding `tabId` without changing any backend contract. |
| The generation checkpoint stores `tabBinding` and is looked up by it | handoff: `wizard-generation-checkpoint.service.ts:193-194, 316-318` | Generation state survives restart and is found by the Setup run id. |
| The guidance supervisor is in memory only | handoff: `guidance-generation-run.supervisor.ts` | After a restart the guidance status is derived from `enhancedPrompts:getStatus` (`generatedAt`), or it is `interrupted`. |
| `wizard:recommend-analysis-skills` is request/response and loads the analysis by `runId` | `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:987-1080`; types `libs/shared/src/lib/types/rpc/rpc-setup.types.ts:234-248` | No persisted review exists, so every visit re-runs the review. Persist the review next to the analysis run. |
| `AnalysisStorageService` is "the single owner of `.ptah/analysis` I/O". It has `loadByRunId` and `listValidRuns`, which yields `slugDir` | `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts:2-4, 692-696, 773-778` | The owner for the new `skill-review.json` read and write. |
| The registry and allowlist entries for wizard methods | `libs/shared/src/lib/types/rpc.types.ts:1602, 3893`; `apps/ptah-electron/src/di/rpc-surface.spec.ts:57`; prefix `wizard:` allowed (`libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts:70`) | The new `wizard:get-skill-review` method needs these three edits and no new prefix. |
| localStorage index precedent (`ptah.workflow-sessions.v1`) | `libs/frontend/chat-state/src/lib/workflow-session-index.service.ts:8, 106, 131` | The precedent for a small persisted frontend index. |
| Generation run state shape and lifecycle | `rpc-setup.types.ts:22-55, 122-131` | Maps onto the Setup run status (section 1.3). |

## Architecture decision

- **Chosen approach.**
  - Add one root `SetupRunStore` in `libs/frontend/setup-wizard`. It is the only owner of Setup
    run records. Its records are a persisted per-workspace index. The backend remains the
    source of truth for run status and results, and the store reconciles with it.
  - Generation and guidance runs bind to the backend with the Setup run id in place of a chat
    tab id. No chat tab is created for them.
  - Generation and guidance transcripts render from the buffers that already exist in
    `SetupWizardStateService`.
  - The skill review result is persisted on the backend next to its analysis run.
  - The shell and chat-side entry points reach Setup through one injection token in
    `libs/frontend/core`, which the store implements.
- **Rationale.**
  - context.md requires a Setup-owned store and no chat-tab mixing.
  - The backend contracts already accept arbitrary binding ids, so the change is frontend-heavy
    with one small backend addition.
  - All five defects in context.md trace to run identity being a chat tab or page-local state.
- **Rejected alternatives.**
  1. A backend Setup run registry (a new `setupRuns:*` file per workspace). It duplicates the
     status that the analysis manifest, the generation checkpoint and the guidance output
     already own. Two sources of truth would drift, and it adds an RPC prefix and allowlist
     work for no new information.
  2. Keep generation tabs but hide them from the rail. That is still chat session state: tab
     persistence (`tab-persistence.ts:122,289`), the workflow index, and `closeTab` lifecycle
     coupling. It violates the context.md decision.
  3. A frontend-only skill review cache. It is lost if localStorage is cleared, and the review
     costs a 75 s judged call. Persisting with the analysis artifact is durable and costs one
     file.
- **Assumptions.**
  - A1: Electron renderer localStorage survives app restart (default persistent session). The
    precedent `workflow-session-index.service.ts` relies on the same thing. Check: confirm that
    `apps/ptah-electron` does not use an in-memory partition (grep `partition:` in
    `apps/ptah-electron/src`).
  - A2: `GenerationRunEventAdapter` only needs the binding id to route a payload. The backend
    payload carries `tabBinding` (handoff: completion broadcast carries `tabBinding` +
    `result`). Check: read the adapter at `:100-215` before rewriting.
  - A3: `analyze/agents` is the agent selection and preview step, and `analyze/generate` is the
    progress step. Check: read `onboarding.routes.ts:71-94` components.
- **Effect on existing code.**
  - Generation and guidance no longer touch `TabManagerService`.
  - `OnboardingResumeStore`, `AnalysisFoundCardComponent`, `SetupGenerationOpenHandler`'s tab
    creation, `findBoundGenerationTab` and `onboardingGenerationTarget` are deleted or replaced.
  - `WizardAnalysisRunner`, the backend supervisors, the checkpoints and
    `OnboardingRunPillService` stay.
  - The team builder keeps its chat hand-off (D3).

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | The store is a persisted frontend index. The backend is the source of truth for status and results. | backend registry / frontend index / memory only | Status already persists in the manifest, checkpoint and guidance output (handoff). A reload needs only the ids, and the precedent is `workflow-session-index.service.ts:8`. | Yes |
| D2 | The Setup run id is the backend binding `tabId`. Keep the URL query key `tab` (the binding id). The validator switches to the store. | rename to `setupRun` / keep `tab` | Schema `z.string().min(1).max(200)` (handoff). `navigateToUrl` validation `surface-router.service.ts:205-221` keeps working unchanged. | Yes (a rename is mechanical) |
| D3 | The AI team builder is a Setup run up to and including the hand-off. The configure conversation stays a normal chat tab, recorded on the run as `handoffTabId`. | hidden Setup-owned session / minimal exception | See the justification below. | Yes |
| D4 | The skill review is persisted to `<analysis slugDir>/skill-review.json` by the existing recommend handler. A new `wizard:get-skill-review` reads it. | frontend cache / backend file | `AnalysisStorageService` owns `.ptah/analysis` (`analysis-storage.service.ts:2-4`). The call costs up to 75 s (handoff). | Yes |
| D5 | The shell and chat-side launchers reach Setup through the core token `SETUP_RUN_ENTRY`, provided in `app.config.ts`. | import setup-wizard from chat (cycle) / an event / a token | Import census: setup-wizard imports chat and chat-ui. Precedent token at `surface-routes.ts:44`, `app.config.ts:265-270`. | Yes |
| D6 | Existing persisted tabs with `setup-agent-generation` or `setup-project-prompt` workflow are dropped on restore. Their bindings are adopted once into Setup records. | keep / drop / migrate | `tab-persistence.ts:122,289` persist the workflow kind (handoff). | One-way for old tabs (they hold only adapter-written progress messages) |

**D3 justification.** The configure conversation is a multi-turn chat. It needs the composer,
tool approvals, attachments and canvas adoption (`harness-chat-launcher.service.ts:188-238`).
A hidden Setup-owned session would have to rebuild that chat surface inside Setup, which is far
beyond this task. Setup's own work ends at "conversation opened": skills reviewed, consented,
installed, guidance recorded, launch sent. The run record covers all of it and survives leaving
Setup. The chat it opens is ordinary user chat, the same as any "open in chat" action. It is not
a Setup run shown as a chat. Setup stores only `handoffTabId` and never reads or writes that
tab's state.

## Component specifications

### 1. Setup run model and store (`SetupRunStore`)

- **Purpose.** The single owner of Setup run records for every workspace: create, attach,
  reconcile, persist, and derive lists and targets.
- **Responsibilities.**
  - **1.1 Record shape.** A frontend-only type in `setup-run.types.ts`. It does not cross RPC, so
    it does not go in `libs/shared`.
    ```
    type SetupRunWorkflow = 'analysis' | 'skill-review' | 'agent-generation'
                          | 'project-guidance' | 'team-builder';
    type SetupRunStatus = 'running' | 'needs-input' | 'completed' | 'failed'
                        | 'cancelled' | 'interrupted';
    interface SetupRunRecord {
      id: string;                   // 'setup-' + crypto.randomUUID(); valid onboarding identity
      workspacePath: string;        // normalized (trailing separators trimmed)
      workflow: SetupRunWorkflow;
      status: SetupRunStatus;
      step: SetupRunStep;           // per-workflow step id, section 3
      backendRunId: string | null;  // analysis runId | generation runId | guidance runId
      analysisRunId: string | null; // the analysis this run uses (skill-review, generation)
      parentId: string | null;      // chain: analysis -> skill-review -> generation -> guidance
      selection?: { skillIds: string[] };                    // skill-review only
      teamBuilder?: { intent: string; installed: string[] }; // team-builder only
      handoffTabId?: string;        // team-builder only (D3)
      error?: string;               // user-facing text only; never a stack or a path
      unseen: boolean;              // terminal and not yet opened -> badge
      createdAt: number; updatedAt: number;
    }
    ```
  - **1.2 Persistence.**
    - Store under the localStorage key `ptah.setup-runs.v1` as
      `{ version: 1, byWorkspace: Record<path, SetupRunRecord[]> }`.
    - Write on every record change, debounced to one write per microtask.
    - Keep at most 20 records per workspace. Drop the oldest terminal records first. Never drop a
      non-terminal record.
    - Validate on read: unknown fields are dropped, and invalid records are discarded with
      `console.warn`.
    - Transcript buffers are not persisted. They stay in `SetupWizardStateService`, in memory.
  - **1.3 Reconcile.**
    - Run once per workspace activation, on `refresh()`, and on each relevant push message.
    - analysis: `wizard:get-resumable-run` (`analysisActive`, `analysis.manifest.lifecycle`) plus
      the `WizardAnalysisRunner` signals.
    - agent-generation: `wizard:get-generation-run-state` with binding `{tabId: record.id, workflow:
      'setup-agent-generation', workspacePath}`. Mapping:
      - `starting`, `running`, `cancelling` become `running`.
      - `completed` becomes `completed`.
      - `failed` and `timed-out` become `failed`.
      - `cancelled` becomes `cancelled`.
      - `interrupted:true` (or the orphan grace) becomes `interrupted`.
    - project-guidance: `enhancedPrompts:getRunState`. When it returns null after a restart,
      check `enhancedPrompts:getStatus.generatedAt`. If it is newer than `createdAt` the run is
      `completed`, otherwise `interrupted`.
    - skill-review: `wizard:get-skill-review` (component 6). A stored review means the run is at
      least `needs-input` (selection).
    - team-builder: no backend run. A record found in `installing` or `launching` after a reload
      becomes `interrupted`. The install RPC result is idempotent to re-check by re-running the
      preview.
  - **1.4 Adoption.** When the index is empty or missing a record, `wizard:get-resumable-run` may
    report an unfinished `generation` (runId) or `analysis`. The store adopts each into one
    record. This also covers D6: restored tabs of a setup kind hand their binding to the store
    once.
  - **1.5 Derived signals.**
    - `runsFor(workspace)`: newest first.
    - `activeRun(workspace)`: the newest record that is `running` or `needs-input`.
    - `attentionCount`: records that are `needs-input`, or `unseen` and terminal.
    - `runningCount`.
    - `targetOf(record)`: an `OnboardingTarget` from section 3.
  - **1.6 Commands.**
    - `start(workflow, workspace, {parentId, analysisRunId})`.
    - `attach(id)`.
    - `cancel(id)`.
    - `retry(id)`.
    - `rerun(id)`.
    - `markSeen(id)`.
    - `dismiss(id)`: terminal records only.
    - `setStep(id, step)`.
    - `setSelection(id, ids)`.
- **Verified contracts and entry points.**
  - `WizardRpcService.getBoundRunState` and `cancelBoundRun`
    (`libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:142-170`).
  - `getResumableRun` (`:395-416`).
  - `cancelAnalysis` (`:345-354`).
  - `WizardAnalysisRunner` public API (`wizard-analysis-runner.service.ts:204-627`).
  - `SetupGenerationRunState` (`rpc-setup.types.ts:122-131`).
- **Dependencies.**
  - `WizardRpcService`, `WizardAnalysisRunner`, `SetupWizardStateService` and `VSCodeService`
    (`@ptah-extension/core`) for the workspace.
  - It must not depend on `TabManagerService` for run identity. TabManager may be read only to
    learn the active workspace path, as `onboarding-resume.store.ts:76-81` does today.
  - Direction: setup-wizard depends on core and shared only.
- **Integration points.**
  - Read by onboarding pages, the Setup runs list (component 4), the `SETUP_RUN_ENTRY` adapter
    (component 5), `OnboardingFocusRouter`, and the `GenerationRunEventAdapter` rewrite
    (component 2).
- **Failure behaviour.**
  - An RPC failure during reconcile leaves the last known status and sets no error, following
    the existing degradation-audit pattern at `onboarding-resume.store.ts:130-131, 217-218`.
    Mark each such catch with a `degradation-audit:` comment.
  - Corrupt storage discards the whole store and continues with an empty index plus adoption
    (1.4).
- **Quality requirements.**
  - No per-record timer. One shared poll exists only while a record is `running` and the
    backend gives no push (guidance after a reload). Interval 2.5 s, matching
    `BACKEND_POLL_INTERVAL_MS` (`wizard-analysis-runner.service.ts:126`). It stops when no record
    is running, or on workspace switch, and is released on destroy.
  - The persisted record never contains model output, file contents or credentials.
- **Verification seam.** A unit spec with `TestBed`, a fake `WizardRpcService` and a fake runner.
  It covers status mapping, adoption, the cap and eviction, the corrupt-storage path, and that a
  workspace switch pauses polling.
- **Files.**
  - CREATE `libs/frontend/setup-wizard/src/lib/services/setup-run.types.ts`.
  - CREATE `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts`.
  - CREATE `setup-run.store.spec.ts`.
  - CREATE `setup-run-persistence.ts` (read, validate and write; pure functions) and its spec.
  - MODIFY `libs/frontend/setup-wizard/src/index.ts` and `src/app.ts` to export the store and
    types.

### 2. Tab-free generation and guidance runs

- **Purpose.** Run agent generation and project guidance bound to a Setup run id, with the
  transcript rendered in Setup, and remove every chat-tab creation path for them.
- **Responsibilities.**
  - `GenerationWorkflowStore` and `GuidanceGenerationStore` take a `SetupRunRecord` binding in
    place of a tab binding. The binding becomes `{tabId: record.id, workflow, workspacePath}`.
  - Remove the TabManager and QueuedFollowUpStore dependencies and the `canStartInChat` check.
  - `GenerationRunEventAdapter` routes `setup-wizard:generation-stream`, `enhance-stream`,
    `generation-complete` and `error` (`generation-run-event-adapter.ts:40-45`) by binding id to
    the store and to `SetupWizardStateService`. It stops calling
    `StreamingHandlerService.processStreamEvent(tabId)` and `MessageFinalizationService`.
  - A payload whose binding id has no record is adopted (1.4) and not dropped.
  - `GenerationStepStore.bind()` (`libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts:89-101`)
    validates against `SetupRunStore.get(id)` and no longer checks for a chat tab.
  - `GenerationHandoffStore` re-keys `agentTabId` to `agentRunId`. It starts guidance through
    `SetupRunStore.start('project-guidance', …, {parentId})` and not through the launcher.
  - The 5 s timer stays. The "agent tab gone" effect is replaced by "agent run record cancelled
    or dismissed". Delete `tabClosed`.
  - Delete `bound-generation-tab.ts` (`findBoundGenerationTab`) once it has no caller.
  - `SetupGenerationOpenHandler` handles the backend `setup-generation:open` message (sent from
    `apps/ptah-electron/src/services/electron-setup-wizard.service.ts:94-103`). It now calls
    `SETUP_RUN_ENTRY.openWorkflow(workflow, 'host')` and creates no tab.
  - `analyze-skills.page.ts:1099-1110`: remove `tabs.createTab('Project guidance')`,
    `setWorkflow` and `pendingGuidanceTab`. Guidance comes from the store, so at most one
    non-terminal guidance run exists per workspace.
  - Transcript: Setup pages render `SetupWizardStateService.generationStream()` and
    `enhanceStream()` (`setup-wizard-state.service.ts:139-142, 189-190`) with the same tree
    builder as `AnalysisTranscriptComponent`. Reuse that component, or extract its inner
    renderer if it is analysis-specific. Check this when implementing.
  - D6 migration: on tab restore, drop tabs whose workflow is `setup-agent-generation` or
    `setup-project-prompt`, after handing `{id, workflow, workspacePath}` to the store. The hook
    point is in `tab-persistence.ts` restore (`:289`, per the handoff).
    - The migration lives in chat-state, which cannot import setup-wizard. So chat-state exposes
      a one-shot `consumeLegacySetupTabs(): ReadonlyArray<{tabId, workflow, workspacePath}>`.
      `SetupRunStore` calls it on init.
- **Verified contracts and entry points.**
  - Generation methods: `wizard-generation-rpc.handlers.ts:181-185` (handoff).
  - enhancedPrompts methods: `enhanced-prompts-rpc.handlers.ts:103-110` (handoff).
  - Binding types: `rpc-setup.types.ts:25-33`.
  - Launcher: `generation-workflow-launcher.service.ts:43-100`.
- **Dependencies.** setup-wizard to core and shared. No backend change.
- **Integration points.**
  - The backend push messages, unchanged.
  - `MESSAGE_HANDLERS` registration at `app.config.ts:272-281` stays (same classes).
- **Failure behaviour.**
  - Backend `blocked` with `ownerTabId` (another binding owns the run): the store looks up
    `ownerTabId` as a record id and attaches to it, or adopts it. It never starts a second run.
  - `invalid-binding` or `workspace-mismatch`: the record becomes `failed` with
    `error: 'This run belongs to another workspace.'`.
  - Completion with no live view: the record becomes `completed` and `unseen`.
- **Quality requirements.**
  - No chat tab, no workflow index entry and no rail card for these runs.
  - Assert in a spec that `TabManagerService.createTab` and `createWorkflowTabForWorkspace` are
    never called.
- **Verification seam.**
  - Adapter spec: a push for binding id X updates record X and the stream buffer, with no
    TabManager.
  - Hand-off store spec: re-keyed on the run id.
  - `GenerationStepStore` spec.
  - A chat-state spec for the legacy-tab migration.
- **Files.**
  - REWRITE `libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts` and
    its spec.
  - MODIFY `generation-workflow.store.ts` (and spec), `guidance-generation.store.ts` (and spec),
    `generation-handoff.store.ts` (and spec), and `setup-generation-open.handler.ts` (and spec),
    all under `libs/frontend/setup-wizard/src/lib/services/`. Assumption: exact filenames.
    Resolve them with `ptah_search_files libs/frontend/setup-wizard/src/lib/**/*generation*`.
  - DELETE `libs/frontend/setup-wizard/src/lib/services/bound-generation-tab.ts` and its spec,
    if one exists.
  - MODIFY `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts` and its spec.
  - MODIFY `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` (guidance creation
    only; skill review is in component 6) and `project-guidance.page.ts`.
  - MODIFY `libs/frontend/chat-state/src/lib/tab-persistence.ts` and its spec (legacy setup-tab
    hand-off).
  - MODIFY `libs/frontend/chat-state/src/index.ts` (export `consumeLegacySetupTabs`).

### 3. Deterministic step model (`setup-run-steps.ts`)

- **Purpose.** One pure table from `(workflow, status, step)` to the route that Setup opens.
  Every entry point uses it: Home list, nav badge, notification, launcher, restored URL.
- **Responsibilities.**
  - Export `stepTarget(record): OnboardingTarget` and `nextStep(workflow, step)`.
  - The query always carries `tab=<record.id>` (D2). For analysis-derived steps it also carries
    `analysis=<analysisRunId>` when known, because `analyze-skills.page.ts:558-570` reads
    `analysis` and `run`.
  - Replace `onboardingGenerationTarget` (`onboarding-routes.ts:103-118`). Delete it and migrate
    its consumers:
    - `onboarding-focus-router.service.ts:50-60`.
    - `onboarding-step-link.ts:33-35`.
    - The launcher (component 5).
    - The resume store, which is deleted.
- **The step tables.** Routes are under `/onboarding`. In every table, "Re-entry" is the step
  that Setup opens for each status.
  - **Analysis** (entry `analyze`, final `analyze/skills`):

    | Status | Re-entry | Notes |
    | --- | --- | --- |
    | running | `analyze` (live transcript, attach) | Never restarts. `ensureStarted` joins `inFlight` (`wizard-analysis-runner.service.ts:139-140`). |
    | needs-input | `analyze` (model or setup not ready) | Shown when `setupReady()` is false. |
    | completed | `analyze/skills?analysis=<id>` | Hands off to a skill-review record (child). |
    | failed | `analyze` with the error and Retry | |
    | cancelled | `analyze` with Start again | |
    | interrupted | `analyze` with Continue (resume) and Start fresh | Continue is `resumeAnalysis`. |

  - **Skill review and selection** (entry `analyze/skills`, final `analyze/agents`). One record
    covers both, with steps `reviewing` and then `selecting`:

    | Status | Re-entry | Notes |
    | --- | --- | --- |
    | running (`reviewing`) | `analyze/skills` with a progress state | The page attaches to the in-flight store promise. It does not call RPC again. |
    | needs-input (`selecting`) | `analyze/skills` showing the persisted review and the saved `selection` | No re-review on visit. Fixes `:519-541`. |
    | completed | `analyze/agents` | Completed means the selection was confirmed and skills were installed, or the install was skipped. |
    | failed | `analyze/skills` with the error and "Review again" | |
    | cancelled | `analyze/skills` with "Review again" | |
    | interrupted | `analyze/skills`: a stored review becomes `selecting`, otherwise "Review again" | |

  - **Agent generation** (entry `analyze/agents`, steps `preview` and `generating`, final
    `analyze/done`):

    | Status | Re-entry | Notes |
    | --- | --- | --- |
    | running | `analyze/generate` (live progress from the buffers) | |
    | needs-input | `analyze/agents` (preview or selection pending, `preview-required`) | |
    | completed | `analyze/done`, then the guidance hand-off (5 s countdown, or Skip) | Creates a project-guidance child. |
    | failed | `analyze/generate` with the result counts and "Retry failed items" (`wizard:retry-item`) | |
    | cancelled | `analyze/agents` with "Generate again" | |
    | interrupted | `analyze/generate` with "Resume" (`WizardAnalysisRunner.resumeGeneration`, `:489-515`) | |

  - **Project guidance** (entry `analyze/guidance` when chained, or `guidance` when standalone;
    final `analyze/done` when chained, or `guidance` showing the result):

    | Status | Re-entry |
    | --- | --- |
    | running | the entry route, with the live enhance stream |
    | needs-input | not used (guidance takes no input after start) |
    | completed | the final route with the guidance summary and "Regenerate" |
    | failed | the entry route with the error and Retry |
    | cancelled | the entry route with "Generate again" |
    | interrupted | the entry route with Retry |

  - **AI team builder** (entry `team-builder`, steps `intent`, `review`, `consent`, `installing`,
    `launching`, `handed-off`; final `handed-off`):

    | Status | Re-entry | Notes |
    | --- | --- | --- |
    | running (`installing`, `launching`) | `team-builder` with progress | Leaving no longer aborts or resets. Remove `team-builder-start.page.ts:114-121` reset and abort on destroy. Keep the reset on workspace change. |
    | needs-input (`intent`, `review`, `consent`) | `team-builder` at that stage, with the intent restored from the record | |
    | completed (`handed-off`) | `team-builder` with "Conversation opened" and an "Open conversation" button | The button switches to `handoffTabId` only if that tab still exists. Otherwise the text reads "The conversation was closed". |
    | failed | `team-builder` at `review` with the error. Keep `installed` so Continue skips re-install. | |
    | cancelled | `team-builder` at `intent` | |
    | interrupted | `team-builder` at `review` with "Continue" | Re-checks with preview. |

- **Verified contracts.**
  - The route list in `onboarding.routes.ts:44-109`.
  - `ONBOARDING_QUERY` (`onboarding-routes.ts:27-35`).
  - Team-builder stages (`team-builder-start.page.ts:138-546`).
- **Dependencies.** Pure. It imports only types from `setup-run.types.ts` and `OnboardingTarget`
  from core.
- **Failure behaviour.** An unknown step falls back to the workflow entry route and logs
  `console.warn`.
- **Verification seam.** A table-driven unit spec covering every (workflow, status) cell above.
- **Files.**
  - CREATE `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts` and its spec.
  - MODIFY `libs/frontend/core/src/lib/routing/onboarding-routes.ts` (remove
    `onboardingGenerationTarget`) and its spec.
  - MODIFY `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts` and its
    spec.
  - MODIFY `libs/frontend/onboarding/src/lib/shared/onboarding-step-link.ts` and its spec.
    Assumption: the path. Resolve it with search.

### 4. Setup runs surface (Home list) and removals

- **Purpose.** One Setup-side list of runs for the active workspace on Setup Home. It replaces
  the resume banners and the "Analysis found" card.
- **Responsibilities.**
  - `SetupRunsListComponent` (onboarding Home) renders `SetupRunStore.runsFor(activeWorkspace)`.
  - Each row shows the title, a status chip (reuse `run-status-chip.component` states) and one
    primary action. The action navigates to `stepTarget(record)` and calls `markSeen`.
  - Terminal rows show Dismiss.
  - A completed analysis with no child run shows "Review skills" (the old "Analysis found"
    intent).
  - Show at most 5 rows plus "Show all". The list is reactive and needs no Home-mount refresh.
  - Removals:
    - DELETE `onboarding-resume.store.ts` and its spec.
    - DELETE `analysis-found-card.component.ts` and its spec.
    - In `onboarding-home.component.ts`, remove `<ptah-analysis-found-card />`, the resume
      banners block and the refresh effect (`:111, :121-132, :339, :442`).
    - Delete every `?tab=` link builder pointing at `analyze/skills` (component 3).
    - Remove the per-visit guidance tab creation (component 2).
  - `ResumeBannerComponent` stays only if the list rows reuse it. Otherwise delete it once it
    has no consumer.
- **Verified contracts.** `onboarding-home.component.ts:111-132, 446-450` (`resumeItem`
  navigation, replaced by the store's target).
- **Dependencies.** onboarding to setup-wizard (allowed direction).
- **Failure behaviour.**
  - No workspace: the list is hidden, and the existing `onboarding-no-workspace` block shows
    (`:134-140`).
  - Reconcile errors keep the last status (component 1).
- **Quality requirements.**
  - Accessibility: the list is a `<ul>` with an `aria-label`.
  - The status chip text is readable without color.
  - The primary action is a button whose name includes the run title.
  - The list updates live through signals.
- **Verification seam.**
  - A component spec with a fake store: rows, actions and the dismiss flow.
  - Update `onboarding-home.component.spec.ts` to drop the resume store.
- **Files.**
  - CREATE `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts` and its spec.
  - MODIFY `onboarding-home.component.ts` and its spec.
  - DELETE `onboarding-resume.store.ts` and its spec, and `analysis-found-card.component.ts` and
    its spec.
  - MODIFY `libs/frontend/onboarding/src/index.ts` if it exports the deleted symbols.

### 5. Setup entry port, nav badge and chat-side launchers (`SETUP_RUN_ENTRY`)

- **Purpose.** Let code that cannot import setup-wizard (`chat` shell, `chat-ui` launchers,
  backend open messages) open Setup on the right run and show a badge.
- **Responsibilities.**
  - Core declares the token and interface in `libs/frontend/core/src/lib/routing/setup-run-entry.ts`:
    ```
    interface SetupRunEntry {
      readonly attentionCount: Signal<number>;   // needs-input + unseen terminal
      readonly runningCount: Signal<number>;
      openSetup(): Promise<SurfaceNavigationResult>;   // active run's step, else Home
      openWorkflow(workflow: SetupGenerationWorkflow, origin: string): Promise<SurfaceNavigationResult>;
    }
    export const SETUP_RUN_ENTRY = new InjectionToken<SetupRunEntry>('SETUP_RUN_ENTRY');
    ```
  - Export it from `@ptah-extension/core`.
  - `SetupRunEntryService` (setup-wizard) implements it on `SetupRunStore`, `setup-run-steps`
    and `SurfaceRouterService.navigateToSurface` (`surface-router.service.ts:144-179`).
  - `openWorkflow` attaches to an existing non-terminal record of that workflow, or starts at the
    workflow entry step. It never creates a second run (section 4 rules).
  - `app.config.ts`: `{ provide: SETUP_RUN_ENTRY, useExisting: SetupRunEntryService }`. Replace
    the factory of `SurfaceRouterService.generationRouteTabValidatorToken` (`:265-270`) so it
    validates against `SetupRunStore.get(id)?.workflow` and not against TabManager.
  - `electron-shell.component.ts`:
    - `openSetupHub()` (`:785-787`) calls `inject(SETUP_RUN_ENTRY, {optional: true})?.openSetup()`,
      falling back to `setCurrentView('onboarding')`.
    - The Setup menu item (`:360-368`) shows a count badge from `attentionCount()`. While a run is
      running it shows a small spinner dot, using opacity or transform only.
  - `GenerationWorkflowLauncherService.open` (`generation-workflow-launcher.service.ts:43-100`)
    becomes a thin delegate to `SETUP_RUN_ENTRY.openWorkflow`. It loses `consumeOrigin` and tab
    logic. The origin travels in the record (`origin` field optional on start).
    - If nothing else uses the launcher after this, delete it. Have `SetupStatusStore` inject
      the token directly. Check with `ptah_lsp_references` on the class.
- **Verified contracts.**
  - The token precedent (`surface-routes.ts:36-44`, `app.config.ts:265-270`).
  - `openSetupHub` (`electron-shell.component.ts:785-787`).
  - `SetupStatusStore.launchGeneration` (`setup-status.store.ts:303-330`).
- **Dependencies.** core is the lowest layer. setup-wizard implements the port, and chat and
  chat-ui consume it. This preserves the existing direction.
- **Failure behaviour.**
  - Token absent (VS Code webview, or a test): fall back to bare `/onboarding`.
  - Navigation `failed`: `SetupStatusStore.launchError` keeps its existing text (`:324`).
- **Quality requirements.**
  - The badge has an `aria-label` such as "Setup: 2 runs need attention".
  - No polling in the shell. The badge is a pure signal read.
- **Verification seam.**
  - A `SetupRunEntryService` spec for the target choice: active run, else Home.
  - An electron-shell spec for the badge render and `openSetupHub` delegation.
  - An `app.routes.spec` or `surface-router` spec for the validator with a Setup id.
  - Typecheck-templates for the shell template change.
- **Files.**
  - CREATE `libs/frontend/core/src/lib/routing/setup-run-entry.ts`.
  - MODIFY `libs/frontend/core/src/index.ts`.
  - CREATE `libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts` and its spec.
  - MODIFY `apps/ptah-extension-webview/src/app/app.config.ts`.
  - MODIFY `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts` and its
    spec.
  - REWRITE or DELETE `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts`
    and its spec.
  - MODIFY `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts` and its
    spec.
  - MODIFY the generation route validator implementation (the `generationRouteTabValidator`
    factory referenced at `app.config.ts:269`). Locate it with `ptah_code_search_symbols
    generationRouteTabValidator`.

### 6. Persisted skill review (backend)

- **Purpose.** Persist the judged skill review per analysis run so that a revisit shows it
  without re-running the 75 s judged call.
- **Responsibilities.**
  - `AnalysisStorageService` gets `writeSkillReview(workspacePath, runId, review)` and
    `readSkillReview(workspacePath, runId)`. Both resolve `slugDir` through the same private
    `listValidRuns` lookup as `loadByRunId` (`analysis-storage.service.ts:692-696, 773-778`).
  - The file is `skill-review.json`, holding `{ version: 1, reviewedAt: ISO, analysisRunId,
    review: WizardRecommendAnalysisSkillsResult }`.
  - Write atomically through the service's existing write path. Check that `writeManifest`
    (`:339-345`) uses temp-and-rename, and use the same mechanism.
  - `wizard:recommend-analysis-skills` (`setup-rpc.handlers.ts:987-1080`) writes the result after
    a successful `recommendAnalysis`. It does not write `empty(...)` warnings. A write failure
    logs `logger.warn` and still returns the result.
  - New method `wizard:get-skill-review` with params `{ runId: string }`, validated by a zod
    `strictObject` in `setup-rpc.schema.ts` next to `WizardRecommendAnalysisSkillsParamsSchema`
    (`:32`). It returns `{ review: WizardRecommendAnalysisSkillsResult | null; reviewedAt: string
    | null }`.
  - The read is schema-checked. An unreadable or invalid file returns `{review: null}`.
  - New shared types `WizardGetSkillReviewParams` and `WizardGetSkillReviewResult` in
    `rpc-setup.types.ts` next to `:234-248`.
  - Registry entries in `rpc.types.ts` next to `:1602` and `:3893`.
  - Register in the setup handler's method list (`setup-rpc.handlers.ts:257-271`).
  - Add the method to `apps/ptah-electron/src/di/rpc-surface.spec.ts` (`:57`). The `wizard:`
    prefix is already allowed (`rpc-allowlist.spec.ts:70`).
  - Frontend: `WizardRpcService.getSkillReview(runId)`. `AnalyzeSkillsPage` and `StackSkillStore`
    (`analyze-skills.page.ts:176, 519-541, 730`) load through the skill-review record:
    - Attach to the in-flight review promise held by `SetupRunStore`. The promise lives in the
      root store, so leaving the page does not discard it.
    - Otherwise read `wizard:get-skill-review`.
    - Call `wizard:recommend-analysis-skills` only when no review exists, or on "Review again".
- **Verified contracts.** As cited above. `RpcUserError` usage in the handler (`:1026-1029`,
  `:1072-1077`).
- **Dependencies.** rpc-handlers to agent-generation (existing `AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE`
  resolve at `:1035-1037`). No new DI token.
- **Failure behaviour.**
  - A missing run returns `{review:null}`.
  - The workspace path comes from `workspaceProvider.getWorkspaceRoot()`, as the existing
    handler does (`:1018-1020`). It is never taken from params.
  - The `runId` is matched against valid run manifests only, so no path traversal is possible.
- **Quality requirements.** The file stays under `<workspace>/.ptah/analysis/<slug>/`. It holds no
  secrets (the review contains skill names, sources and judge notes).
- **Verification seam.**
  - `analysis-storage.service.spec.ts`: write and read round-trip, invalid file, unknown runId.
  - `setup-rpc.handlers.spec.ts`: persist on success, no persist on empty, get returns the
    stored review, schema rejection.
  - `rpc-surface.spec.ts`.
- **Files.**
  - MODIFY `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts` and its
    spec.
  - MODIFY `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`, its spec and
    `setup-rpc.schema.ts`.
  - MODIFY `libs/shared/src/lib/types/rpc/rpc-setup.types.ts` and
    `libs/shared/src/lib/types/rpc.types.ts`.
  - MODIFY `apps/ptah-electron/src/di/rpc-surface.spec.ts`.
  - MODIFY (frontend) `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` and its
    spec, and `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` and its spec,
    plus the `StackSkillStore` file it provides.

### 7. Analysis and team-builder page adoption

- **Purpose.** Make the analysis page and the team-builder page record-driven, so that re-run
  and leave never lose work.
- **Responsibilities.**
  - Analysis:
    - `AnalyzeWorkspacePage` reads or creates the analysis record through `SetupRunStore`.
    - `?rerun=1` handling (`analyze-workspace.page.ts:764-785, 1000-1034`) moves to
      `SetupRunStore.rerun(id)` (section 4 rules). The page keeps the query only as a trigger,
      and the store consumes it.
    - `startFresh` must not call `wizardState.reset()` or `runner.reset()` while a run is active.
      A new analysis creates a new record. The old completed record and its saved analysis stay
      in the list.
  - Team builder:
    - `TeamBuilderStartPage` stores the stage, the intent and the installed skills on its
      record.
    - On destroy it no longer aborts the launch or resets state (`:114-121`). It keeps the
      workspace-change reset (`:99-113`).
    - The launch's `isActive()` (`:453-457`) drops the `!this.destroyRef.destroyed` condition and
      checks the record instead.
    - The launch moves into the store: `SetupRunStore.launchTeamBuilder(id)` calls
      `HarnessChatLauncherService`. That service is in onboarding, so the store cannot import it.
      Instead, a small root `TeamBuilderRunCoordinator` in onboarding owns the
      install-then-launch sequence and updates the record through store commands.
    - The coordinator sets `handoffTabId` from `launchTeamBuilder`'s `{tabId}` (`:239`) and the
      status `completed` (step `handed-off`).
  - `HarnessChatLauncherService` is unchanged.
- **Verified contracts.**
  - `launchTeamBuilder` returns `{tabId}` (`harness-chat-launcher.service.ts:130-168, 239`).
  - `wizard:install-skills-with-consent` (`team-builder-start.page.ts:385-388`).
  - `wizard:get-project-guidance` (`:463-466`).
- **Dependencies.** onboarding to setup-wizard. The coordinator lives in onboarding, so no
  reverse import is needed.
- **Failure behaviour.**
  - A launch that fails after install becomes `failed` at step `review` with `installed` kept.
    The error text matches today's (`:500-504`).
  - `HarnessChatLaunchCancelledError` comes only from an explicit Cancel. The record becomes
    `cancelled`.
- **Verification seam.**
  - A coordinator spec: leave mid-install, then the install completes and the record advances.
  - Update `team-builder-start.page.spec.ts` (destroy no longer aborts).
  - `analyze-workspace.page.spec`: rerun with an active run attaches, and rerun after completion
    creates a new record and keeps the old one.
- **Files.**
  - MODIFY `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` and its spec.
  - MODIFY `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts` and its spec.
  - CREATE `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts` and its
    spec.
  - MODIFY `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` only
    if `reset()` needs an "only when idle" guard. Prefer guarding in the store.

## Cancel, retry and re-run rules (normative)

1. **One live run per workflow per workspace.** `start()` returns the existing record when one
   is `running` or `needs-input` for the same workflow and workspace. Backend `blocked` replies
   attach (component 2). The analysis runner's `inFlight` join is kept.
2. **Cancel.**
   - Cancel is allowed only on `running` or `needs-input`. It calls the backend cancel:
     - analysis: `cancelAnalysis`.
     - generation and guidance: `cancelBoundRun` with `{tabId: id}`.
     - team builder: abort the coordinator's AbortController.
   - The status becomes `cancelled` only after the backend confirms, or after reconcile shows
     the run is not active. Until then the chip shows `cancelling`.
   - Cancel never deletes files that are already written. Generation checkpoint statuses
     `written`, `unchanged` and `kept` stay settled (`wizard-analysis-runner.service.ts:40-41`).
3. **Retry.**
   - Retry is allowed on `failed` and `interrupted`. It reuses the same record id.
   - Generation resumes from the checkpoint (`resumeGeneration`) and does not restart.
     Per-item retry uses `wizard:retry-item`.
   - Analysis retry uses `resumeAnalysis` when the manifest is resumable, otherwise
     `startFreshAnalysis`.
4. **Re-run.**
   - Re-run is allowed on `completed` and `cancelled`. It creates a new record with
     `parentId = old.parentId`.
   - The old record stays `completed` with its result. The saved analysis, the persisted skill
     review and the written agents remain until a new result replaces them on success.
   - A skill "Review again" overwrites `skill-review.json` only after the new review succeeds.
   - Re-run on a `running` record is refused. The UI attaches instead.
   - This replaces the `?rerun=1` reset of live state.
5. **Leave Setup.** Leaving never cancels, aborts or resets any record. Only an explicit Cancel or
   a workspace switch (team builder pre-launch stages only) stops work.
6. **Dismiss.** Dismiss is allowed on terminal records only. It removes the record from the
   index and never touches backend artifacts.
7. **Finished results are never lost silently.** A completion that arrives without a view sets
   `unseen: true`, which raises the nav badge and shows in the Home list until opened.

## Integration architecture

- **Data flow.**
  1. An entry point calls `SetupRunStore.start` or `attach`: a Setup page, the
     `SETUP_RUN_ENTRY.openWorkflow` launcher, or the backend `setup-generation:open`.
  2. The store creates a `setup-<uuid>` record, persists the index and navigates to `stepTarget`.
  3. The page or service calls the existing RPC, with binding `tabId = record.id` for
     generation and guidance.
  4. Backend push messages go to `GenerationRunEventAdapter` and `SetupWizardStateService`, then
     to the stream buffers and record status.
  5. Completion updates the record. A chained child (guidance) is scheduled by
     `GenerationHandoffStore` keyed by run id.
  6. The Home list and the shell badge read the store signals.
- **State or persistence.**
  - Record index: localStorage `ptah.setup-runs.v1`, per workspace, at most 20 records.
  - Stream buffers: in memory, root `SetupWizardStateService`.
  - Backend:
    - analysis manifest and saved analysis (`.ptah/analysis/<slug>/`);
    - generation checkpoint manifest (keyed by binding id);
    - guidance output (`enhancedPrompts:getStatus`);
    - new `skill-review.json`.
- **External boundaries.**
  - New `wizard:get-skill-review` params are zod `strictObject`-validated.
  - The workspace path is taken from the host provider, never from params.
  - The localStorage payload is validated on read (component 1).
  - Route query `tab` values pass `isOnboardingIdentityValue` (`onboarding-routes.ts:94-101`) and
    the store validator.
- **Failure and rollback.**
  - Reconcile failures keep the last status.
  - A corrupt index resets to empty and adopts from the backend.
  - A skill-review write failure still returns the review (only the cache is lost).
  - Revert path: each component is behind no flag. The whole change reverts by commit. The D6
    migration drops old setup tabs, which carry only adapter-generated messages.
- **Observability.**
  - `console.warn` on invalid stored records and on unknown steps.
  - Backend `logger.warn` on a skill-review write failure.
  - Mark each swallowed RPC failure with a `degradation-audit:` comment, following the existing
    convention (`onboarding-resume.store.ts:131`).

## Architecture-level quality requirements

- **Functional.**
  - Start any Setup workflow, leave Setup and return. The run is still running, or it is finished
    with its result, and the Setup nav opens on that run's step.
  - No chat rail tab, session-list entry or workflow-index entry is created for analysis, skill
    review, generation or guidance.
  - Revisiting skills shows the persisted review without a new `wizard:recommend-analysis-skills`
    call.
  - Guidance is never duplicated per visit.
  - Home shows exactly one runs list. The "Analysis found" card and the resume banners are gone.
- **Performance.**
  - At most one shared 2.5 s poll, only while a guidance record is `running` without push.
  - No timers per record.
  - Index writes are batched.
- **Security.**
  - No secrets, file contents or model output in localStorage.
  - Backend input is zod-validated, and the workspace comes from the host.
- **Maintainability.**
  - setup-wizard never imports onboarding.
  - chat and chat-ui never import setup-wizard. They use only the `SETUP_RUN_ENTRY` port.
  - Both new projects' tags are unchanged (no new project).
  - No `V2` copies. The deleted files are removed, not shimmed.
- **Testability.** Each behaviour is pinned by a spec:
  - status mapping per workflow;
  - leave-then-return keeps the run;
  - a completion without a view sets the badge;
  - re-run keeps the old result;
  - duplicate start attaches;
  - cancel waits for confirmation;
  - the skill review is persisted and re-read;
  - the legacy setup tab migration.

## Team-leader handoff

- **Recommended executors.**
  - Component 6 (backend and shared) goes to backend-developer, because it covers the rpc
    handler, the storage service, the shared types and the Electron surface spec.
  - Components 1, 2, 3, 4, 5 and 7 go to frontend-developer, because they are Angular root
    services, pages and the shell template.
- **Complexity.** HIGH:
  - Five workflows move to a new identity model.
  - Six frontend libraries are touched (setup-wizard, onboarding, core, chat, chat-ui,
    chat-state), plus the app config.
  - Persisted-state migration (D6).
- **Dependencies and ordering (component level only).**
  - Component 1 and component 3 come before 2, 4, 5 and 7.
  - Component 6 types (shared) come before the component 6 frontend part.
  - Component 5's core token comes before the chat and chat-ui edits.
  - Component 2's chat-state `consumeLegacySetupTabs` comes before the store calls it.
- **Parallel-safe work.**
  - The component 6 backend files (agent-generation, rpc-handlers, shared, electron spec) are
    disjoint from all frontend files.
  - Within the frontend, component 4 (onboarding/home) and component 5 shell edits
    (`libs/frontend/chat`) are file-disjoint once 1 and 3 land.
- **Files affected.**
  - CREATE:
    - `libs/frontend/setup-wizard/src/lib/services/setup-run.types.ts`
    - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts` and its spec
    - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts` and its spec
    - `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts` and its spec
    - `libs/frontend/setup-wizard/src/lib/services/setup-run-entry.service.ts` and its spec
    - `libs/frontend/core/src/lib/routing/setup-run-entry.ts`
    - `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts` and its spec
    - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts` and its spec
  - MODIFY:
    - `libs/frontend/setup-wizard/src/index.ts` and `src/app.ts`
    - in `libs/frontend/setup-wizard/src/lib/services/`: `generation-workflow.store.ts`,
      `guidance-generation.store.ts`, `generation-handoff.store.ts`,
      `setup-generation-open.handler.ts`, `wizard-rpc.service.ts` (and their specs)
    - `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts`
    - `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
    - `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts`
    - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
    - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
    - `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts`
    - `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts`
    - the onboarding step-link file
    - `libs/frontend/onboarding/src/index.ts` (if it exports deleted symbols)
    - the specs of all the onboarding files above
    - `libs/frontend/core/src/lib/routing/onboarding-routes.ts` and `libs/frontend/core/src/index.ts`
    - `libs/frontend/chat-state/src/lib/tab-persistence.ts` and `libs/frontend/chat-state/src/index.ts`
    - `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`
    - `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts`
    - `apps/ptah-extension-webview/src/app/app.config.ts` and the `generationRouteTabValidator`
      source
    - `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
    - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` and `setup-rpc.schema.ts`
    - `libs/shared/src/lib/types/rpc/rpc-setup.types.ts` and `libs/shared/src/lib/types/rpc.types.ts`
    - `apps/ptah-electron/src/di/rpc-surface.spec.ts`
  - REWRITE:
    - `libs/frontend/setup-wizard/src/lib/services/generation-run-event-adapter.ts`
    - `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts` (or
      DELETE it if it has no remaining caller)
  - DELETE:
    - `libs/frontend/setup-wizard/src/lib/services/bound-generation-tab.ts`
    - `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` and its spec
    - `libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts` and its spec
    - `ResumeBannerComponent`, if it is left with no consumer
- **Verification points.**
  - Resolve Assumptions A1 to A3 and the "Assumption: path" notes before editing.
  - Confirm that the `WorkflowKind` setup members (`libs/frontend/chat-types/src/lib/chat-types.ts:853-868`)
    are still needed after the migration. `chat-view.component.ts:1584` and
    `workflow-badge.component.ts:12` reference them. Keep the type members for `harness-*`.
    Remove the setup members only if no reader remains.
  - Grep after the change: there must be no `createWorkflowTabForWorkspace` or `findWorkflowTab`
    caller for setup workflows, no `onboardingGenerationTarget`, no `OnboardingResumeStore` and
    no `tabClosed(`.
  - Inner loop (the coordinator runs it):
    - `npm run verify -- --related -p setup-wizard,onboarding,core,chat,chat-ui,chat-state,shared,rpc-handlers,agent-generation,ptah-extension-webview,ptah-electron`.
    - `npm run verify -- -t lint,typecheck -p <same>`. Use the exact Nx project names from each
      `project.json`.
  - Full gate before push:
    - `npm run verify -- -p <same>`.
    - `npm run verify -- -t typecheck-templates -p ptah-extension-webview` (shell, Home list and
      page templates change).
  - Lanes run only focused `npx jest --config <project>/jest.config.ts --runInBand
    --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>` and
    `npx eslint <changed files>`. Repeat this rule in each lane brief.
  - Visual check in Electron only:
    - Setup nav badge.
    - Home runs list.
    - Leave during generation, return through the nav, land on `analyze/generate`.
  - Risks:
    - R1: the backend `blocked` `ownerTabId` may reference an old chat tab id during migration.
      The store adopts it (1.4), which must be tested.
    - R2: after a restart, guidance is in-memory only, so the result is `interrupted` unless
      `generatedAt` proves completion. The UI copy must say "Retry", not imply data loss.
    - R3: the D3 exception is a product judgment. If the user wants the configure conversation
      hidden from chat, that is a follow-up that needs a Setup chat surface.
    - R4: localStorage cleared. Recovery covers generation and analysis through adoption, and the
      skill review through the backend file. Team-builder pre-launch stages are lost (low cost:
      the intent only).
    - R5: the stacked branch. Re-cite line numbers after rebasing onto `main`.
