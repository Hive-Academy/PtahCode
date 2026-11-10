# Final code-logic review — TASK_2026_894 (`git diff main...HEAD`)

Reviewer: code-logic-reviewer subagent (Claude family; decision 24). It stopped at its budget limit
before it wrote this file. The orchestrator wrote this file from its returned result and finished the
3 unchecked items.

## Verdict: APPROVED (no Blocking or Serious findings)

## Findings

| # | Severity | File | Finding | Action |
| --- | --- | --- | --- | --- |
| 1 | Minor | `ptah-ai/cli-lane-default-cell.component.ts` | Every card rendered a dialog with the same `id="cli-full-access-title"`, so `aria-labelledby` was ambiguous. | Fixed: unique `titleId` per instance. |
| 2 | Minor | `cli-orchestration-matrix.component.ts` `test()` | When one test runs, Test on another card does nothing and gives no feedback. | Recorded. Fix changes the card input contract (2 files). |
| 3 | Minor | `settings.component.ts` `openCodexSettings` | "Codex settings" only switches the tab on non-Electron hosts (drawer needs Electron accounts). | Recorded. Electron is the target host. |
| 4 | Minor | removed `codexAutoCompactTokens` / `codexToolOutputTokenLimit` | Saved values are ignored with no migration note. Codex uses 85% of `agentBudget.handoffContextTokens` and `compaction.toolOutputBudgetTokens`. | No change: the user asked to remove the keys and use the global values. Docs updated. |
| 5 | Minor | `RoutingDisplayNamesStore.route()` | A third `|` segment in a routing key is ignored. | Recorded. |

## Checked and correct

- No code, spec or doc outside the task folder reads the removed keys.
- Removed keys are gone from `KNOWN_CONFIG_KEYS` and `FILE_BASED_SETTINGS_KEYS`. `agent:setConfig` ignores them.
- `resolveCodexLaneBudgets` validates inputs with correct fallbacks (127500 default matches).
- `CLAUDE_ACCOUNTS_REQUEST` matches the widened `ProvidersSettingsDrawerRequest` union.
- Full-access dialog: cancel, Escape, confirm and reset are correct. Nothing is saved before confirm.
- Provider cards keep every capability of the old table (parity inventory).
- Codex caption: the RPC handler writes `cliLaneDefaults.codex` and `codexSandboxMode` in one call
  (`agent-rpc.handlers.ts:968-973`). The lane resolver uses the saved lane default first, then the
  legacy sandbox value (`cli-lane-policy-resolver.ts:79`). "Same setting" is correct.
- `state.open()` loads the CLI agents: the Electron QA rendered all cards from live data.
- Spec coverage: chat tests pass (353 suites; settings tests re-run after the fix).
