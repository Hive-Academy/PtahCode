# PR 1534 review fixes

Reviewed the three findings against head `4b6dfd958`. GitHub CLI required authentication, so I read the complete comments through the public GitHub REST API with PowerShell.

## Workspace-scoped prompt preview

**Valid.** The drawer reloaded status on a workspace switch while retaining its preview content and expansion. The earlier RPC could still update drawer state.

- `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts:498` resets content, expansion, and loading when the workspace changes. The read guard at line 660 checks the request ID and workspace generation before applying a result, error, or loading update. The generation also changes when a user switches away and back before Angular runs the effect.
- `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.spec.ts:232` covers cached previews, a pending response from a previous workspace, loading a preview in the new workspace, and switching away and back before the effect runs.

## Queued wizard state write

**Valid.** An unbound wizard could time out behind an existing state write after its last active check. The queued update would still persist the new prompt.

- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts:742` rechecks cancellation inside the queued update for unbound runs. Bound runs retain their existing commit behavior.
- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts:1911` blocks a preference write, lets the wizard time out in the queue, and verifies that the wizard updates neither global state nor the prompt cache.

## Orchestration fallback

**Valid.** The unverified capability branch returns `skills: []`, and the core prompt delegated the approval gate to the orchestration skill.

- `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts:110` adds one sentence requiring a plan and user approval before implementing Full-depth work when the skill is unavailable.
- `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts:15` covers the fallback and its scope. The existing character and token limits were kept.

## Verification

All commands ran from the requested worktree. The paths in the commands below are relative to that root.

- Prompt drawer: exit 0, 1 suite and 31 tests passed on the final workspace-generation regression.
  `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.spec.ts`
- Enhanced Prompts wizard: exit 0, 1 suite and 77 tests passed.
  `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts`
- Agent SDK: exit 0, 9 suites and 349 tests passed, including the 9,000-character and 2,261-estimated-token limits. Jest reported 0 snapshots across these content and integration suites.
  `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.spec.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-ui-hint.spec.ts libs/backend/agent-sdk/src/lib/helpers/assemble-system-prompt.output-style.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.capabilities.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ptah-ui-hint.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.mcp-delivery.spec.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts`
- Chat TypeScript: exit 0, no diagnostics.
  `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
- Agent-generation TypeScript: exit 0, no diagnostics.
  `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`
- Agent SDK TypeScript: exit 0, no diagnostics.
  `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`
- ESLint: exit 0, 0 errors and 12 pre-existing warnings in the agent-generation files (nine non-null assertions, two empty generators, and one file length warning).
  `npx eslint libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.spec.ts libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts`
- `git diff --check`: exit 0, no whitespace errors.

The drawer change affects behavior only. The drawer spec exercised the rendered preview states. Electron visuals were not checked.

CLI skill discovery was unavailable. I read the checked-in Angular frontend and orchestration skills through Ptah. Ptah's dependency graph omitted the drawer, so I used `git grep` to check its consumers. The requested scoped TypeScript commands supplied the compiler diagnostics.


