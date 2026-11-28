# Batch B5b Report — System Prompt Mode Settings Toggle (Renderer)

Status: COMPLETE

## RPC Contract Reuse
- Reused existing `enhancedPrompts:getStatus` (`EnhancedPromptsGetStatusParams` / `EnhancedPromptsGetStatusResponse` in `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`) and `enhancedPrompts:setEnabled`, matching `batch-B5a-report.md`.
- `enhancedPrompts:getStatus` already returns `hasGeneratedPrompt: boolean` and `enabled: boolean`. `AgentBehaviourSectionComponent` calls `ClaudeRpcService` directly; no new RPC method, renderer service, or `libs/shared` type changes were needed.

## Files Changed
- `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts`
- `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts`

(No files in `libs/backend` or `libs/shared` were modified.)

## States Implemented
1. **No enhanced prompt content (`hasGeneratedPrompt: false`, regardless of `enabled`)**:
   - Toggle is forced off (`promptEnabled() === false`, unchecked) and disabled (`promptToggleDisabled() === true`, `aria-disabled="true"`).
   - Defensive guard in `onPromptModeChange` prevents any `enhancedPrompts:setEnabled` call when disabled.
   - Hint (`#agent-behaviour-prompt-note`): `"Run Setup to generate the project prompt first."`
2. **Enhanced prompt exists — On (`hasGeneratedPrompt: true, enabled: true`)**:
   - Toggle is checked and enabled (backend sets `enabled: true` by default when generating a prompt).
   - User can toggle it off via `enhancedPrompts:setEnabled` with saved toast + Undo.
   - Hint (`#agent-behaviour-prompt-note`): `"Ptah's own system prompt replaces the Claude Code preset. Applies to new sessions."`
3. **Enhanced prompt exists — Off (`hasGeneratedPrompt: true, enabled: false`)**:
   - Toggle is unchecked and enabled.
   - User can toggle it on via `enhancedPrompts:setEnabled` with saved toast + Undo.
   - Hint (`#agent-behaviour-prompt-note`): `"Claude Code preset with Ptah additions. Applies to new sessions."`
4. **Loading (`promptStatus() === null && promptLoading() === true`, or status reload in flight)**:
   - Toggle is off (on initial load) and disabled (`promptToggleDisabled() === true`, `aria-disabled="true"`).
   - Hint (`#agent-behaviour-prompt-note`) on initial load: `"Loading system prompt status…"`
5. **RPC error (`enhancedPrompts:getStatus` error result, thrown exception, or host-reported `{ error }` inside a successful RPC)**:
   - Inline `<ptah-alert tone="error" role="alert" live="assertive">` shows fixed copy `"Could not load the system prompt status."` with a Retry button (never leaks host error details).
   - When initial load failed (`promptStatus() === null`): toggle stays off and disabled (`aria-disabled="true"`), and hint (`#agent-behaviour-prompt-note`) shows `"The system prompt status is not loaded yet."` (never falsely claims there is no prompt).
   - When post-write status re-read fails (Moderate 8 / FM-3): keeps the written `enabled` state and matching on/off hint while displaying the inline load-error alert.
   - Write failures (`enhancedPrompts:setEnabled` RPC error, `{ success: false }`, or throw): revert the checkbox and show alert toast `"Could not save the system prompt mode."` without host detail.

## Accessibility Notes
- **Role & name**: `<input id="agent-behaviour-prompt-toggle" type="checkbox" ptahToggle>` exposes `role="switch"` (from `PtahToggleDirective`) with `aria-label="Toggle Enhanced System Prompt"` and `<label for="agent-behaviour-prompt-toggle">System prompt mode</label>` in `<ptah-setting-row>`.
- **Disabled state announced**: Bound via `[ptahBusyDisabled]="promptToggleDisabled() || saving()"` (which sets `aria-disabled="true"`, applies the disabled switch look via `:where(ptah-settings) :is(input, select, textarea)[aria-disabled='true']`, and blocks click/mousedown/keydown/change/input in capture phase while keeping the switch focusable so keyboard and screen-reader users can still reach it and read why it is disabled). `<ptah-setting-row>` also receives `[disabled]="promptToggleDisabled()"` (`data-disabled="true"` without making the row inert or lowering text contrast).
- **Hint linked with `aria-describedby`**: The toggle carries `aria-describedby="agent-behaviour-prompt-note"`, matching `<p id="agent-behaviour-prompt-note">` rendered by `<ptah-setting-row hintElementId="agent-behaviour-prompt-note" [hint]="promptNote()">` across all 5 states.
- **Error announcements**: Load errors render inside `role="alert"` (`live="assertive"`); save/write errors announce via `SettingsSaveFeedbackService` alert toast.

## Focused Checks
- **Jest** (`node D:\projects\PtahCode\node_modules\jest\bin\jest.js --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts`): **PASS — 1/1 suite, 44/44 tests passed, 0 failed** (exit code 0).
- **TypeScript** (`node D:\projects\PtahCode\node_modules\typescript\bin\tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`): **PASS — 0 errors** (exit code 0).
  - Note: Running `tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` hits pre-existing unrelated `es2016` BigInt/mock errors in `libs/shared` and `libs/frontend/core/src/testing/mock-rpc-service.ts`, with 0 errors in `agent-behaviour-section.component.*`. `libs/frontend/chat/project.json` typechecks `tsconfig.lib.json`.
  - Note: Angular template typecheck (`typecheck-templates`) is deferred to the coordinator per lane rules.
- **ESLint** (`node D:\projects\PtahCode\node_modules\eslint\bin\eslint.js libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts`): **PASS — 0 errors, 0 warnings** (exit code 0).

## Decisions
- **Hint copy when no project prompt exists**: Used `"Run Setup to generate the project prompt first."` — concise, directly tells the user to generate the project prompt first, and preserves the `"Run Setup"` phrase asserted by existing E2E harness entry `ADV-8` (`libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-advanced.entries.ts`).
- **Force off + disabled when `hasGeneratedPrompt` is false**: Tightened `promptEnabled` to require `status.hasGeneratedPrompt && status.enabled` and `promptToggleDisabled` to `!this.hasGeneratedPrompt() || this.promptLoading()`, removing the prior `&& !this.promptEnabled()` loophole so a stale `enabled: true` flag without a generated prompt still renders off and disabled.
- **Keep `ptahBusyDisabled` (`aria-disabled="true"`) over native `[disabled]`**: Matches the Settings accessibility convention (`SettingsBusyDisabledDirective` and `apps/ptah-extension-webview/src/styles.css`) so screen-reader and keyboard users can focus the disabled switch and hear its `aria-describedby` hint, while Playwright's `toBeDisabled()` and `isDisabledControl()` both treat it as disabled.
- **Skill loading**: `angular-frontend-patterns` was not in the CLI built-in skill registry, so `.claude/skills/angular-frontend-patterns/SKILL.md` was read directly from the workspace and applied (standalone OnPush component, signals + `computed()` derived state).

## Unknown
- **Angular template check (`typecheck-templates`) and Electron visual inspection**: Not executed in this lane per lane rules prohibiting `nx`, `build`, `serve`, and `dev`; coordinator should run `typecheck-templates` for `ptah-extension-webview` and any Electron visual check once B5a and B5b are integrated.
- **Backend default-on verification**: Verified in `enhanced-prompts.service.ts` that newly generated prompts persist `enabled: true`, and `batch-B5a-report.md` confirms `enhancedPrompts:getStatus` returns `hasGeneratedPrompt` and `enabled`; full end-to-end integration with B5a's final backend changes was not run in this lane.
