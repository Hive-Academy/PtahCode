# Removal report

## Step 1: runtime evidence

Before edits, `git grep -n closeSourceAfterAutoHandoff -- ':!.ptah'` found production occurrences only in `libs/shared/src/lib/types/session-budget.types.ts:98,121,235-239` (types and setting registry), `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-config.provider.ts:37,133-136` (default and configuration read), `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts:128,537,571` (excluded from measurement key and copied into state), and `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:33,114,121-122,399,475-476` (settings UI and its disabled state). No production close behavior branches on the value. All other matches were tests or documentation.

`auto-handoff-source-closer.service.ts` checks the predecessor tab and SDK identity, requires a loaded tab, and blocks closing for unsent input, queued messages, background tasks, a pending permission prompt, or a Command Center tab. The file settings manager's `loadSync` and `processCrossProcessChange` parse and flatten JSON without a strict key schema; the removed key may remain in stored JSON but the budget provider no longer reads it. The registry derives its keys from the shared settings table. A search for the literal in JSON under apps/ and libs/ found no entries. After removal, the original git grep returns no matches outside `.ptah`.

## Changed files

- `README.md`
- `apps/ptah-docs/src/content/docs/sessions/cost-summary.md`
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-config.provider.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-config.provider.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts`
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/wiring/sdk-callbacks.spec.ts`
- `libs/backend/platform-core/src/file-settings-keys.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-budget.spec.ts`
- `libs/frontend/chat-state/src/lib/tab-manager.intent-mutators.spec.ts`
- `libs/frontend/chat-state/src/lib/tab-manager.service.spec.ts`
- `libs/frontend/chat-ui/src/lib/molecules/session/session-budget-format.spec.ts`
- `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-summary.component.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/notifications/session-budget-banner.component.spec.ts`
- `libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts`
- `libs/frontend/chat/src/lib/services/chat-store/session-loader.service.spec.ts`
- `libs/frontend/chat/src/lib/services/chat-store/session-stats-aggregator.service.spec.ts`
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts`
- `libs/frontend/chat/src/lib/services/session-budget-actions.auto-handoff.spec.ts`
- `libs/frontend/chat/src/lib/services/session-budget-actions.queue.spec.ts`
- `libs/frontend/chat/src/lib/services/session-budget-actions.service.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts`
- `libs/shared/src/lib/types/session-budget.types.spec.ts`
- `libs/shared/src/lib/types/session-budget.types.ts`
- `.ptah/specs/TASK_2026_899_7e2b/removal-report.md` (this report)

## Documentation wording

README and the session budget guide now say: ?After an automatic handoff, the previous tab closes when the successor acknowledges the handoff and the source tab passes the safety checks.? The obsolete settings row was removed.

## Verification

`npm run verify -- -p shared,agent-sdk,platform-core,chat,chat-state,chat-ui,rpc-handlers,cli-agent-runtime,ptah-electron,ptah-extension-webview`: **blocked, exit code 1**. Both lint/typecheck and test phases failed before project execution: Nx daemon socket connection `EPERM` and Nx plugin subprocesses `spawn EPERM`. No project tests ran, so test counts are unavailable for each of: shared, agent-sdk, platform-core, chat, chat-state, chat-ui, rpc-handlers, cli-agent-runtime, ptah-electron, and ptah-extension-webview. No sandbox workaround was attempted.

- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; scanned 4,193 files, 216 unsuppressed sites, all directory totals within baseline. Baseline unchanged.
- `npx ts-node --transpile-only tools/di-lint/check-injects.ts`: exit 0; 2,169 injection sites resolve to 991 registered tokens; dependency checks passed. Baseline unchanged.
- `git diff --check`: passed.
