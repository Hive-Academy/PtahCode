# Batch 2 Report: In-Chat Proposal Apply Banner

## Changed files

- Created `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts` — pure domain types and helpers (`HarnessProposalRecord`, `HarnessProposalApplyState`, `HarnessProposalSummary`, `hasMeaningfulHarnessProposal`, `summarizeHarnessProposal`, `mergeParsedHarnessUpdates`, `buildFullHarnessConfig`, `fingerprintHarnessConfig`, `extractReadableErrorMessage`).
- Created `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.ts` — `HarnessChatProposalStore` (`@Injectable({ providedIn: 'root' })`, `MessageHandler`) and `provideHarnessChatProposalStore(): Provider[]` (`MESSAGE_HANDLERS` multi-provider).
- Created `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.spec.ts` — Jest unit tests covering push validation/merging, `harness:get-proposal` hydration (including in-flight race preservation), `harness:apply` lifecycle, error handling, `HarnessHealthStore.refresh`, and pure helper counts.
- Created `libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.ts` — standalone `ChangeDetectionStrategy.OnPush` presentational banner (`ptah-harness-proposal-banner`) using `input()`, `output()`, and `computed()`.
- Created `libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.spec.ts` — Jest component + store-integration tests covering empty/null hiding, item counts, streaming/busy disabling, applied confirmation + warnings, `role="alert"` errors, and session switching + `harness:apply` invocation.
- Edited `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` (`lines 57-58`, `217`, `1160-1189`, `1546-1565`) — wired `HarnessChatProposalStore` and `HarnessProposalBannerComponent`, session-scoped proposal/apply-state `computed()` selectors, workflow-scoped `hydrateForSession` `effect()`, and `onApplyHarnessProposal()`.
- Edited `libs/frontend/chat/src/lib/components/templates/chat-view.component.html` (`lines 181-194`) — mounted `<ptah-harness-proposal-banner />` inside the `sessionControls` slot immediately above `<ptah-question-card>`.
- Edited `libs/frontend/chat/src/lib/services/index.ts` (`lines 140-151`), `libs/frontend/chat/src/lib/components/index.ts` (`line 157`), and `libs/frontend/chat/src/index.ts` (`lines 104-116`) — exported `HarnessChatProposalStore`, `provideHarnessChatProposalStore`, `HarnessProposalBannerComponent`, and public helper/state types from `@ptah-extension/chat`.

## Behaviour

- **Live proposal pushes (`harness:config-proposed`)**: `HarnessChatProposalStore` registers for `MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED` via `provideHarnessChatProposalStore()` (`MESSAGE_HANDLERS`). Incoming payloads are serialized in arrival order and validated at the boundary with `HarnessSessionIdSchema` and `HarnessConfigUpdatesSchema` dynamically imported from `@ptah-extension/shared/schemas` (zero casts, zero eager `zod` bundle impact). Incremental updates for the same `sessionId` merge onto prior updates without dropping omitted sections.
- **Session hydration (`harness:get-proposal`)**: When `ChatViewComponent` displays a `'harness-new-project'` or `'harness-configure'` workflow tab with a bound `resolvedSessionId()`, it calls `HarnessChatProposalStore.hydrateForSession(sessionId, workspaceRoot)`. Returned proposals are validated with `HarnessProposalSchema` (`@ptah-extension/shared/schemas`); concurrent hydrations per `(sessionId, workspaceRoot)` are deduplicated, and any live `harness:config-proposed` push arriving during an in-flight hydration takes precedence over older disk state.
- **In-chat banner & workspace apply (`harness:apply`)**: When `resolvedHarnessProposal()` is non-null (and the view is not `readOnly`), `HarnessProposalBannerComponent` renders in `sessionControls` above `<ptah-question-card>`, displaying the proposal name (plus `Draft` hint when `isConfigComplete` is `false`) and item counts (enabled agents, subagents, deduplicated selected/created skills, enabled MCP servers, `CLAUDE.md`, system prompt). Clicking **Apply to Workspace** calls `ClaudeRpcService.call('harness:apply', { config, outputFormat: 'claude-md', workspaceRoot }, { timeout: 60_000 })`.
- **Busy, confirmation, warning, error, and health refresh states**: **Apply to Workspace** is disabled while `resolvedIsStreaming()` is `true` or while `applyState.status === 'applying'` (`aria-busy="true"` + spinner). On success, a `role="status"` (`aria-live="polite"`) region shows `Applied · N file(s) written` plus any `warnings` list, and `HarnessHealthStore.refresh({ refresh: true })` is triggered. Subsequent config revisions reset the session's apply state back to `idle` so updated drafts can be applied. Failures log a real `Error` via `LoggingService` and render safe user-readable text inside `role="alert"`.

## Differences from the plan

1. **Public barrel path (`libs/frontend/chat/src/services.ts` does not exist)**:
   - Plan (`implementation-plan.md:150`) listed `Edit libs/frontend/chat/src/services.ts & libs/frontend/chat/src/index.ts`.
   - Evidence: `tsconfig.base.json:37-40` defines `@ptah-extension/chat` (`./libs/frontend/chat/src/index.ts`), `@ptah-extension/chat/inspector`, and `@ptah-extension/chat/settings-embed` — there is no `libs/frontend/chat/src/services.ts` entry point, and `apps/ptah-extension-webview/src/app/app.config.ts:72-95` imports chat `MESSAGE_HANDLERS` and `provideModelRefreshControl` directly from `@ptah-extension/chat`.
   - Resolution: Exported `HarnessChatProposalStore`, `provideHarnessChatProposalStore` (matching Batch 3's `implementation-plan.md:191`), `HarnessProposalBannerComponent`, and public types/helpers from `libs/frontend/chat/src/lib/services/index.ts`, `libs/frontend/chat/src/lib/components/index.ts`, and `libs/frontend/chat/src/index.ts` without touching `tsconfig.base.json`.
2. **`HarnessHealthStore.refresh` parameter signature**:
   - Plan (`implementation-plan.md:155`) wrote `calling HarnessHealthStore.refresh(workspaceRoot)`.
   - Evidence: `libs/frontend/marketplace/src/lib/harness/harness-health.store.ts:105` defines `public async refresh(options?: { refresh?: boolean }): Promise<void>` (it takes `{ refresh?: boolean }`, not a `workspaceRoot: string`, which fails `strict` TypeScript compilation).
   - Resolution: Called `void this.healthStore.refresh({ refresh: true })` (`harness-chat-proposal.store.ts:182`) to force a fresh health pass after `harness:apply`.
3. **Helper file split for SOLID / file-size discipline**:
   - Extracted pure config normalization, counting, full-config construction, and error-formatting functions into `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts` and re-exported the public symbols from `harness-chat-proposal.store.ts`.

## Projects and specs to verify

- **Nx project (`libs/frontend/chat/project.json:2`)**: `@ptah-extension/chat`
  - Typecheck: `npx nx run @ptah-extension/chat:typecheck --parallel=1`
  - Lint: `npx nx run @ptah-extension/chat:lint --parallel=1`
- **Changed/added Jest specs**:
  - `libs/frontend/chat/src/lib/services/harness-chat-proposal.store.spec.ts`
  - `libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.spec.ts`
  - `libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts`
  - Targeted command: `npx jest libs/frontend/chat/src/lib/services/harness-chat-proposal.store.spec.ts libs/frontend/chat/src/lib/components/molecules/harness-proposal-banner/harness-proposal-banner.component.spec.ts libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts --coverage=false --maxWorkers=2`

## Decisions

- **Decision D1 (Option C1)**: Implemented explicit user-triggered `harness:apply` from `HarnessProposalBannerComponent` (**Apply to Workspace**) inside `ChatViewComponent`'s `sessionControls` slot, keeping `ptah_harness_propose_config` purely staging-only and independent of `libs/frontend/harness-builder`.
- **Lazy Zod boundary validation**: Loaded `HarnessSessionIdSchema`, `HarnessConfigUpdatesSchema`, and `HarnessProposalSchema` via `await import('@ptah-extension/shared/schemas')` (matching `ArtifactMessageHandler` in `libs/frontend/chat/src/lib/services/artifact-message-handler.service.ts:29-30` and `eslint.config.mjs:274-278`) so `@ptah-extension/chat` keeps `zod` out of the eager initial bundle and satisfies `@nx/enforce-module-boundaries`.
- **Skill & tool availability disclosure**: Repo skills `.claude/skills/angular-frontend-patterns/SKILL.md` and `.claude/skills/ui-ux-designer/SKILL.md` were read via `read_file` and applied (`.claude/skills/impeccable/SKILL.md` is not present in the workspace, and repo `.claude/skills` were not listed in the CLI native `<skills>` block). Per lane execution rules for this batch, shell execution (`run_command`) and MCP calls (`call_mcp_tool`) were not invoked.

## Not done

- Shell/CLI verification (`nx typecheck`, `nx lint`, `jest`) and live browser screenshot inspection (`ptah_browser_navigate` / `ptah_browser_screenshot`) were not executed in this lane because running shell commands and MCP tools was explicitly prohibited by the lane instructions; static manual review against `tsconfig.lib.json`, `tsconfig.spec.json`, `eslint.config.mjs`, `libs/frontend/chat/eslint.config.mjs`, and `tools/degradation-audit/check-degradation.ts` was performed instead.
- App bootstrap wiring (`provideHarnessChatProposalStore()` in `apps/ptah-extension-webview/src/app/app.config.ts`) belongs to Batch 3 and was left untouched per scope boundaries.
